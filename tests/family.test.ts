import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLearnerInvitation, isInstallationOwner, linkedLearner, listManagedFamilies, listParentProfiles } from "../lib/family.ts";
import { acceptInvitation, childAccess, closeInvitation, issueInvitation, recipientInvitations, revokeGuardian } from "../lib/invitations.ts";
import {
  buildCodexAttemptReviewBrief,
  buildCodexBankBrief,
  buildCodexMaterialBrief,
  getMaterialForCodex,
  listMaterialAnalyses,
  listMaterialsForCodexBank,
  parseCodexAnalysisInput,
  saveCodexMaterialAnalysis,
} from "../lib/material-analysis.ts";
import {
  countUnusedPracticeQuestions,
  latestPracticeSession,
  listPracticeEvidence,
  startPracticeSession,
  submitPracticeAttempt,
} from "../lib/practice.ts";
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

  const material = await getMaterialForCodex(db, "p1", "notes", "owner");
  assert.ok(material);
  const brief = buildCodexMaterialBrief(material, "p1", "owner");
  assert.match(brief, /material_analyses/);
  assert.match(brief, /gritroom-db/);
  assert.match(brief, /learning_evidence/);
  const bankShelf = await listMaterialsForCodexBank(db, "p1", "selective", "owner");
  assert.ok(bankShelf);
  assert.equal(bankShelf.materials.length, 2);
  const bankBrief = buildCodexBankBrief({
    profileId: "p1",
    goal: "selective",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    materials: bankShelf.materials,
  });
  assert.match(bankBrief, /practice_questions/);
  assert.match(bankBrief, /Practice questions from miscellaneous sources/);
  assert.match(bankBrief, /CRITICAL style models/);
  assert.match(bankBrief, /at least half/);
  assert.match(bankBrief, /at least 60 active items/);
  assert.match(bankBrief, /40 for a standard timed paper/);
  assert.match(bankBrief, /20 for focused/);
  assert.match(bankBrief, /learning_evidence/);
  assert.match(bankBrief, /practice_attempts/);
  assert.match(bankBrief, /shelf_feedback/);
  assert.match(bankBrief, /explanation_en/);
  const reviewBrief = buildCodexAttemptReviewBrief({
    profileId: "p1",
    goal: "selective",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    pendingCount: 3,
  });
  assert.match(reviewBrief, /attempt_review_en/);
  assert.match(reviewBrief, /incorrect/);
  assert.equal("error" in parseCodexAnalysisInput({ json: "{" }), true);
  const parsed = parseCodexAnalysisInput({
    json: JSON.stringify({
      summary_en: "Focus on necessary vs sufficient conditions.",
      parent_zh: "注意必要与充分条件。",
      training_directions: ["Contrast requirement with guarantee."],
      evidence_limits: "Single coaching note; not a full diagnostic.",
    }),
  });
  assert.equal("error" in parsed, false);
  if ("error" in parsed) return;
  const saved = await saveCodexMaterialAnalysis(db, "p1", "notes", "owner", parsed);
  assert.equal(saved.ok, true);
  assert.equal((await listMaterialAnalyses(db, "p1", "selective", "owner"))[0]?.summaryEn, parsed.summaryEn);
  assert.equal(await saveCodexMaterialAnalysis(db, "p1", "notes", "other", parsed).then((result) => result.ok), false);

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
  const deleteBucket = { delete: async (key: string) => { deletedKeys.push(key); } } as Pick<R2Bucket, "delete"> as R2Bucket;
  assert.equal(await deleteMaterial(db, deleteBucket, "p1", "report", "other"), false);
  assert.equal(await deleteMaterial(db, deleteBucket, "p2", "report", "owner"), false);
  assert.deepEqual(deletedKeys, []);
  sql.exec(`
    INSERT INTO material_analyses(
      id, material_id, profile_id, exam_goal, status, summary_en, evidence_limits,
      source_excerpt, created_by_user_id, created_at, completed_at
    ) VALUES (
      'an1', 'report', 'p1', 'selective', 'succeeded', 'Needs necessary vs sufficient practice.',
      'Notes only.', 'Child mixes necessary and sufficient conditions.', 'owner', datetime('now'), datetime('now')
    );
    INSERT INTO learning_evidence(id, profile_id, exam_goal, kind, ref_id, summary, created_at)
    VALUES ('ev-an1', 'p1', 'selective', 'material_analysis', 'an1', 'Needs necessary vs sufficient practice.', datetime('now'));
  `);
  assert.equal(await deleteMaterial(db, deleteBucket, "p1", "report", "guardian"), true);
  assert.deepEqual(deletedKeys, ["private/report"]);
  assert.equal(sql.prepare("SELECT id FROM material_analyses WHERE material_id = 'report'").get(), undefined);
  assert.equal(sql.prepare("SELECT id FROM learning_evidence WHERE id = 'ev-an1'").get(), undefined);
  assert.equal((await readShelf(db, "p1", "selective", "owner")).materials.map((item) => item.id).join(","), "notes");
  assert.equal(await findMaterialFile(db, "p1", "report", "owner"), null);
  assert.equal(await withdrawShelfFeedback(db, "p1", feedbackId, "other"), false);
  sql.exec("UPDATE guardian_grants SET revoked_at = datetime('now') WHERE id = 'g2'");
  assert.equal(await canOpenShelf(db, "p1", "guardian"), null);
  assert.equal(await withdrawShelfFeedback(db, "p1", feedbackId, "owner"), true);
  assert.equal((await readShelf(db, "p1", "oc", "owner")).feedback.length, 0);
  assert.equal(sql.prepare("SELECT body FROM shelf_feedback WHERE id = ?").get(feedbackId)?.body, "Use longer passages.");
});
test("linked learners can practise and parents see attempt evidence", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_practice_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0008_practice_explanations.sql", import.meta.url), "utf8"));
  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, true);

  assert.equal((await startPracticeSession(db, "other", "daily")).ok, false);
  const started = await startPracticeSession(db, "learner", "daily");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.session.status, "active");
  assert.ok(started.session.attempts.length >= 1 && started.session.attempts.length <= 5);
  assert.equal(started.session.attempts[0]?.correctOption, null);
  assert.equal(started.session.attempts[0]?.explanationEn, null);

  const resumed = await startPracticeSession(db, "learner", "diagnostic");
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.session.id, started.session.id);

  const first = started.session.attempts[0];
  assert.ok(first);
  const bank = sql.prepare(
    "SELECT correct_option AS correctOption, explanation_en AS explanationEn FROM practice_questions WHERE prompt = ? AND status = 'active'",
  ).get(first.prompt) as { correctOption: string; explanationEn: string } | undefined;
  assert.ok(bank);
  assert.ok(bank.explanationEn);
  assert.equal(
    sql.prepare("SELECT explanation_en AS explanationEn FROM practice_attempts WHERE id = ?").get(first.id)?.explanationEn,
    bank.explanationEn,
  );
  const saved = await submitPracticeAttempt(db, "learner", started.session.id, {
    attemptId: first.id,
    selectedOption: bank.correctOption,
    confidence: 4,
    timeMs: 12_000,
    draftNotes: "Checked the rule direction.",
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.attempt.isCorrect, true);
  assert.equal(saved.attempt.correctOption, bank.correctOption);
  assert.equal(saved.attempt.explanationEn, bank.explanationEn);
  assert.equal(
    sql.prepare("SELECT kind FROM learning_evidence WHERE ref_id = ?").get(first.id)?.kind,
    "attempt",
  );
  assert.equal((await listPracticeEvidence(db, "p1", "selective", "other")).length, 0);
  const evidence = await listPracticeEvidence(db, "p1", "selective", "owner");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.attempts[0]?.draftNotes, "Checked the rule direction.");
  assert.equal(evidence[0]?.attempts[0]?.isCorrect, true);
  assert.equal(evidence[0]?.correct, 1);
  assert.equal((await listPracticeEvidence(db, "p1", "oc", "owner")).length, 0);

  // Finish remaining open attempts so the session completes, then latest should still surface it.
  let current = saved.session;
  while (current.status === "active") {
    const open = current.attempts.find((item) => !item.finalizedAt);
    assert.ok(open);
    const answer = sql.prepare(
      "SELECT correct_option AS correctOption FROM practice_questions WHERE prompt = ? AND status = 'active'",
    ).get(open.prompt) as { correctOption: string } | undefined;
    assert.ok(answer);
    const next = await submitPracticeAttempt(db, "learner", current.id, {
      attemptId: open.id,
      selectedOption: answer.correctOption,
      confidence: 3,
      timeMs: 1_000,
      draftNotes: "",
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    current = next.session;
  }
  const latest = await latestPracticeSession(db, "p1", "selective");
  assert.equal(latest?.id, current.id);
  const remainingAfterDaily = await countUnusedPracticeQuestions(db, "p1", "selective");
  assert.ok(remainingAfterDaily > 0);

  const nextRound = await startPracticeSession(db, "learner", "daily");
  assert.equal(nextRound.ok, true);
  if (!nextRound.ok) return;
  assert.notEqual(nextRound.session.id, current.id);
  for (const attempt of nextRound.session.attempts) {
    assert.equal(
      current.attempts.some((item) => item.prompt === attempt.prompt),
      false,
    );
  }

  // Finish every remaining unused question via a full starting-point check.
  let sweep = nextRound.session;
  while (sweep.status === "active") {
    const open = sweep.attempts.find((item) => !item.finalizedAt);
    assert.ok(open);
    const answer = sql.prepare(
      "SELECT correct_option AS correctOption FROM practice_questions WHERE prompt = ? AND status = 'active'",
    ).get(open.prompt) as { correctOption: string } | undefined;
    assert.ok(answer);
    const next = await submitPracticeAttempt(db, "learner", sweep.id, {
      attemptId: open.id,
      selectedOption: answer.correctOption,
      confidence: 3,
      timeMs: 500,
      draftNotes: "",
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    sweep = next.session;
  }
  while ((await countUnusedPracticeQuestions(db, "p1", "selective")) > 0) {
    const more = await startPracticeSession(db, "learner", "diagnostic");
    assert.equal(more.ok, true);
    if (!more.ok) return;
    let run = more.session;
    while (run.status === "active") {
      const open = run.attempts.find((item) => !item.finalizedAt);
      assert.ok(open);
      const answer = sql.prepare(
        "SELECT correct_option AS correctOption FROM practice_questions WHERE prompt = ? AND status = 'active'",
      ).get(open.prompt) as { correctOption: string } | undefined;
      assert.ok(answer);
      const next = await submitPracticeAttempt(db, "learner", run.id, {
        attemptId: open.id,
        selectedOption: answer.correctOption,
        confidence: 3,
        timeMs: 500,
        draftNotes: "",
      });
      assert.equal(next.ok, true);
      if (!next.ok) return;
      run = next.session;
    }
  }
  assert.equal(await countUnusedPracticeQuestions(db, "p1", "selective"), 0);
  const blocked = await startPracticeSession(db, "learner", "daily");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.status, 409);
});

test("timed papers need a full unused bank before they start", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_practice_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0008_practice_explanations.sql", import.meta.url), "utf8"));
  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, true);

  const remaining = await countUnusedPracticeQuestions(db, "p1", "selective");
  assert.ok(remaining > 0 && remaining < 40);
  const timed = await startPracticeSession(db, "learner", "timed");
  assert.equal(timed.ok, false);
  if (!timed.ok) {
    assert.equal(timed.status, 409);
    assert.match(timed.error, /40 unused questions/);
  }

  const blueprint = sql.prepare(
    "SELECT id, version FROM thinking_blueprints WHERE id = 'necessary-vs-sufficient' LIMIT 1",
  ).get() as { id: string; version: number };
  for (let index = 0; index < 40; index += 1) {
    sql.prepare(
      `INSERT INTO practice_questions
         (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, status, created_at)
       VALUES (?, 1, ?, ?, ?, '{"A":"A","B":"B","C":"C","D":"D"}', 'A', 'active', ?)`,
    ).run(
      `q-timed-extra-${index}`,
      blueprint.id,
      blueprint.version,
      `Timed filler prompt ${index} for paper sizing.`,
      `2026-11-08T01:${String(index).padStart(2, "0")}:00.000Z`,
    );
  }
  const ready = await startPracticeSession(db, "learner", "timed");
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.session.mode, "timed");
  assert.equal(ready.session.attempts.length, 40);
});
