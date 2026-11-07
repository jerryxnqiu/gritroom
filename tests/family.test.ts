import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLearnerInvitation, isInstallationOwner, linkedLearner, listManagedFamilies, listParentProfiles } from "../lib/family.ts";
import { acceptInvitation, childAccess, closeInvitation, issueInvitation, recipientInvitations, revokeGuardian } from "../lib/invitations.ts";
import { analyseMaterial, listMaterialAnalyses } from "../lib/material-analysis.ts";
import { canOpenShelf, deleteMaterial, findMaterialFile, readShelf, saveShelfFeedback, withdrawShelfFeedback } from "../lib/resource-shelf.ts";
import { youtubeVideoId } from "../lib/youtube-transcript.ts";

const core = readFileSync(new URL("../migrations/0002_core_schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0003_family_invitations.sql", import.meta.url), "utf8");
const actor = (id: string) => ({ user_id: id, email: id + "@example.invalid" });
const accepted = async () => true;

function fixture(migrate = true) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(core);
  sql.exec(`
    INSERT INTO users(id,email) VALUES
      ('owner','owner@example.invalid'), ('guardian','guardian@example.invalid'),
      ('other','other@example.invalid'), ('learner','learner@example.invalid'),
      ('learner2','learner2@example.invalid'), ('adult','adult@example.invalid');
    INSERT INTO families(id,name,installation_owner_user_id) VALUES
      ('f1','First family','owner'), ('f2','Other family','other');
    INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES
      ('p1','f1','First child','selective'), ('p2','f1','Second child','oc'),
      ('p3','f2','Other child','selective');
    INSERT INTO guardian_grants(id,family_id,user_id,profile_id,role) VALUES
      ('g1','f1','owner',NULL,'owner'), ('g2','f1','guardian','p1','guardian'),
      ('g3','f2','other',NULL,'owner'), ('g4','f2','guardian',NULL,'guardian');
  `);
  if (migrate) sql.exec(migration);

  const db = {
    prepare(query: string) {
      return {
        bind(...values: SQLInputValue[]) {
          const statement = sql.prepare(query);
          return {
            all: async () => ({ results: statement.all(...values) }),
            first: async () => statement.get(...values) ?? null,
            run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sql, db };
}

test("a per-child guardian grant does not extend to siblings or another family", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  assert.deepEqual((await listParentProfiles(db, "owner")).map((profile) => profile.id), ["p1", "p2"]);
  assert.deepEqual((await listParentProfiles(db, "guardian")).map((profile) => [profile.id, profile.canManage]), [["p1", 0]]);
  assert.deepEqual(await listManagedFamilies(db, "guardian"), []);
  assert.equal(await childAccess(db, "p1", "guardian"), null);
  sql.exec("UPDATE guardian_grants SET revoked_at = datetime('now') WHERE id = 'g2'");
  assert.deepEqual(await listParentProfiles(db, "guardian"), []);
});

test("only an exact verified recipient can accept, and an accepted email cannot link another profile", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  const learner = actor("learner");
  const first = await issueInvitation(db, actor("owner"), { profileId: "p1", email: learner.email, role: "learner" }, accepted);
  assert.ok(first.ok);
  const competing = await issueInvitation(db, actor("other"), { profileId: "p3", email: learner.email, role: "learner" }, accepted);
  assert.ok(competing.ok);
  assert.equal(await hasLearnerInvitation(db, learner.email), true);
  assert.equal(await linkedLearner(db, learner.user_id), null);
  assert.deepEqual(await recipientInvitations(db, actor("adult")), []);
  assert.equal((await acceptInvitation(db, { user_id: "adult", email: learner.email }, first.id)).ok, false);
  assert.equal((await acceptInvitation(db, learner, first.id)).ok, true);
  assert.equal((await linkedLearner(db, learner.user_id))?.id, "p1");
  assert.equal((await childAccess(db, "p1", "owner"))?.learnerEmail, learner.email);
  assert.equal((await acceptInvitation(db, learner, first.id)).ok, false);
  assert.equal((await acceptInvitation(db, learner, competing.id)).ok, false);
  assert.equal((await issueInvitation(db, actor("owner"), { profileId: "p1", email: actor("learner2").email, role: "learner" }, accepted)).ok, false);
  assert.throws(() => sql.exec("UPDATE learner_links SET profile_id = 'p3' WHERE profile_id = 'p1'"), /immutable/);
});

test("an existing accepted learner link survives the additive migration and invitation expiry", async (t) => {
  const { sql, db } = fixture(false);
  t.after(() => sql.close());
  sql.exec(`
    INSERT INTO family_invites(id,family_id,email,role,profile_id,token_hash,expires_at,accepted_at,created_by_user_id)
    VALUES('original','f1','learner@example.invalid','learner','p1','fixture',
      datetime('now','-1 day'),datetime('now','-2 days'),'owner');
  `);
  sql.exec(migration);
  assert.equal((await linkedLearner(db, "learner"))?.id, "p1");
  assert.equal((await childAccess(db, "p1", "owner"))?.learnerEmail, actor("learner").email);
});

test("non-managers cannot send, and failed, cancelled, expired and declined invitations cannot be accepted", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  const child = { profileId: "p1", email: actor("learner").email, role: "learner" as const };
  const denied = await issueInvitation(db, actor("guardian"), child, async () => assert.fail("unauthorised mail"));
  assert.equal(denied.ok, false);
  const failed = await issueInvitation(db, actor("owner"), child, async () => false);
  assert.ok(!failed.ok && failed.status === 502);
  assert.deepEqual(await recipientInvitations(db, actor("learner")), []);
  const cancelled = await issueInvitation(db, actor("owner"), child, accepted);
  assert.ok(cancelled.ok);
  assert.equal((await closeInvitation(db, actor("other"), cancelled.id, "cancel")).ok, false);
  assert.equal((await closeInvitation(db, actor("owner"), cancelled.id, "cancel")).ok, true);
  assert.equal((await acceptInvitation(db, actor("learner"), cancelled.id)).ok, false);
  const expired = await issueInvitation(db, actor("owner"), child, accepted);
  assert.ok(expired.ok);
  sql.prepare("UPDATE family_invites SET expires_at = datetime('now','-1 day') WHERE id = ?").run(expired.id);
  assert.equal((await acceptInvitation(db, actor("learner"), expired.id)).ok, false);
  const declined = await issueInvitation(db, actor("owner"), child, accepted);
  assert.ok(declined.ok);
  assert.equal((await closeInvitation(db, actor("other"), declined.id, "decline")).ok, false);
  assert.equal((await closeInvitation(db, actor("learner"), declined.id, "decline")).ok, true);
  assert.equal((await acceptInvitation(db, actor("learner"), declined.id)).ok, false);
});

test("guardian invitations grant and revoke access to the selected child only", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  for (const profileId of ["p1", "p2"]) {
    const invite = await issueInvitation(db, actor("owner"), { profileId, email: actor("adult").email, role: "guardian" }, accepted);
    assert.ok(invite.ok);
    assert.equal((await acceptInvitation(db, actor("adult"), invite.id)).ok, true);
  }
  assert.deepEqual((await listParentProfiles(db, "adult")).map((profile) => profile.id), ["p1", "p2"]);
  const grant = (await childAccess(db, "p1", "owner"))?.guardians.find((item) => item.email === actor("adult").email);
  assert.ok(grant);
  assert.equal((await revokeGuardian(db, actor("other"), grant.id)).ok, false);
  assert.equal((await revokeGuardian(db, actor("owner"), "g1")).ok, false);
  assert.equal((await revokeGuardian(db, actor("owner"), grant.id)).ok, true);
  assert.deepEqual((await listParentProfiles(db, "adult")).map((profile) => profile.id), ["p2"]);
});

test("an invitation cannot be accepted after the sender loses management access", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  const invite = await issueInvitation(db, actor("owner"), { profileId: "p1", email: actor("learner").email, role: "learner" }, accepted);
  assert.ok(invite.ok);
  sql.exec("UPDATE guardian_grants SET revoked_at = datetime('now') WHERE id = 'g1'");
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, false);
});

test("creating another family does not grant access to installation mail tools", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  assert.equal(await isInstallationOwner(db, "owner"), false);
  sql.exec(`INSERT INTO settings(key, value_json) VALUES ('installation_owner_user_id','"owner"')`);
  assert.equal(await isInstallationOwner(db, "owner"), true);
  assert.equal(await isInstallationOwner(db, "other"), false);
});

test("youtube video ids are parsed from common watch urls", () => {
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=12"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

test("shelf evidence is limited to the authorised child and chosen exam archive", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(`
    INSERT INTO shelf_materials(id,profile_id,exam_goal,kind,title,file_key,file_name,file_type,created_by_user_id,created_at)
    VALUES('report','p1','selective','coaching_report','Report','private/report','report.pdf','application/pdf','owner',datetime('now'));
    INSERT INTO shelf_materials(id,profile_id,exam_goal,kind,title,notes,created_by_user_id,created_at)
    VALUES('notes','p1','selective','coaching_report','Notes only','Child mixes necessary and sufficient conditions.','owner',datetime('now'));
  `);
  const feedbackId = await saveShelfFeedback(db, "p1", "oc", "guardian", "Use longer passages.");
  assert.ok(feedbackId);
  assert.equal(
    sql.prepare("SELECT kind FROM learning_evidence WHERE ref_id = ?").get(feedbackId)?.kind,
    "parent_feedback",
  );
  const blocked = await analyseMaterial(db, "p1", "report", "owner", "test-key");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.status, 400);
  assert.equal((await listMaterialAnalyses(db, "p1", "selective", "owner")).length, 0);
  assert.equal(await saveShelfFeedback(db, "p2", "oc", "guardian", "Out of scope."), null);
  assert.equal(await saveShelfFeedback(db, "p1", "oc", "other", "Out of scope."), null);
  assert.equal((await readShelf(db, "p1", "selective", "owner")).materials.length, 2);
  assert.equal((await readShelf(db, "p1", "selective", "guardian")).feedback.length, 0);
  assert.equal((await readShelf(db, "p1", "oc", "guardian")).feedback[0]?.id, feedbackId);
  assert.equal((await readShelf(db, "p1", "oc", "other")).feedback.length, 0);
  assert.equal((await readShelf(db, "p2", "oc", "owner")).feedback.length, 0);
  assert.equal((await findMaterialFile(db, "p1", "report", "guardian"))?.name, "report.pdf");
  assert.equal(await findMaterialFile(db, "p1", "report", "other"), null);
  assert.equal(await findMaterialFile(db, "p2", "report", "owner"), null);
  const deletedKeys: string[] = [];
  const bucket = { delete: async (key: string) => { deletedKeys.push(key); } } as Pick<R2Bucket, "delete"> as R2Bucket;
  assert.equal(await deleteMaterial(db, bucket, "p1", "report", "other"), false);
  assert.equal(await deleteMaterial(db, bucket, "p2", "report", "owner"), false);
  assert.deepEqual(deletedKeys, []);
  assert.equal(await deleteMaterial(db, bucket, "p1", "report", "guardian"), true);
  assert.deepEqual(deletedKeys, ["private/report"]);
  assert.equal((await readShelf(db, "p1", "selective", "owner")).materials.map((item) => item.id).join(","), "notes");
  assert.equal(await findMaterialFile(db, "p1", "report", "owner"), null);
  assert.equal(await withdrawShelfFeedback(db, "p1", feedbackId, "other"), false);
  sql.exec("UPDATE guardian_grants SET revoked_at = datetime('now') WHERE id = 'g2'");
  assert.equal(await canOpenShelf(db, "p1", "guardian"), null);
  assert.equal(await withdrawShelfFeedback(db, "p1", feedbackId, "owner"), true);
  assert.equal((await readShelf(db, "p1", "oc", "owner")).feedback.length, 0);
  assert.equal(sql.prepare("SELECT body FROM shelf_feedback WHERE id = ?").get(feedbackId)?.body, "Use longer passages.");
});
