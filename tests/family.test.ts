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
  listSucceededMaterialEvidence,
  parseCodexAnalysisInput,
  saveCodexMaterialAnalysis,
} from "../lib/material-analysis.ts";
import {
  countUnusedPracticeQuestions,
  latestPracticeSession,
  countUnusedWeakPracticeQuestions,
  listPracticeEvidence,
  listPracticeEvidenceSummaries,
  listWeakBlueprintIds,
  saveTimedDraft,
  startPracticeSession,
  submitPracticeAttempt,
  submitTimedPaper,
} from "../lib/practice.ts";
import {
  countUnusedReadingQuestions,
  readingRemediationAvailability,
  startReadingPracticeSession,
} from "../lib/reading-practice.ts";
import { canOpenShelf, deleteMaterial, findMaterialFile, readShelf, saveShelfFeedback, withdrawShelfFeedback } from "../lib/resource-shelf.ts";
import { readingKnowledge } from "../lib/reading-knowledge.ts";
import { composeReadingPassageNotes } from "../lib/shelf-fields.ts";
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
  sql.exec(readFileSync(new URL("../migrations/0012_practice_subjects.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0014_reading_knowledge.sql", import.meta.url), "utf8"));
  const readingFormat = await readingKnowledge(db, "selective");
  assert.equal(readingFormat.format?.minutes, 45);
  assert.equal(readingFormat.format?.answerCount, 38);
  assert.ok(readingFormat.blueprints.length >= 5);
  sql.exec(`
    INSERT INTO shelf_materials(id,profile_id,exam_goal,kind,title,file_key,file_name,file_type,created_by_user_id,created_at)
    VALUES('report','p1','selective','coaching_report','Report','private/report','report.pdf','application/pdf','owner',datetime('now'));
    INSERT INTO shelf_materials(id,profile_id,exam_goal,kind,title,notes,created_by_user_id,created_at)
    VALUES('notes','p1','selective','coaching_report','Notes only','Child mixes necessary and sufficient conditions.','owner',datetime('now'));
    INSERT INTO shelf_materials(id,profile_id,exam_goal,subject,kind,title,notes,created_by_user_id,created_at)
    VALUES('reading-notes','p1','selective','reading','coaching_report','Reading coach note','Inference from short passages.','owner',datetime('now'));
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
  const readingMaterial = await getMaterialForCodex(db, "p1", "reading-notes", "owner");
  assert.ok(readingMaterial);
  const readingMaterialBrief = buildCodexMaterialBrief(readingMaterial, "p1", "owner");
  assert.match(readingMaterialBrief, /Multi-page Reading passages/);
  assert.match(readingMaterialBrief, /ONE continuous source unit/);
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
  assert.match(bankBrief, /ADD about 60 new active Thinking Skills questions/);
  assert.match(bankBrief, /25–30 on the learner’s weak-spot blueprints/);
  assert.match(bankBrief, /30–35 spread across other blueprints/);
  assert.match(bankBrief, /40-question timed paper/);
  assert.match(bankBrief, /Weak-spot blueprints for this learner/);
  assert.match(bankBrief, /subject = 'thinking'/);
  assert.match(bankBrief, /learning_evidence/);
  assert.match(bankBrief, /practice_attempts/);
  assert.match(bankBrief, /shelf_feedback/);
  assert.match(bankBrief, /explanation_en/);
  const readingShelf = await listMaterialsForCodexBank(db, "p1", "selective", "owner", "reading");
  assert.ok(readingShelf);
  assert.equal(readingShelf.materials.length, 1);
  const readingBrief = buildCodexBankBrief({
    profileId: "p1",
    goal: "selective",
    subject: "reading",
    nickname: readingShelf.nickname,
    actorUserId: "owner",
    materials: readingShelf.materials,
  });
  assert.match(readingBrief, /Reading practice generation/);
  assert.match(readingBrief, /subject: reading/);
  assert.match(readingBrief, /reading_blueprints/);
  assert.match(readingBrief, /PRIMARY STYLE MODELS/);
  assert.match(readingBrief, /reading_practice_pack/);
  assert.match(readingBrief, /INSERT INTO reading_questions/);
  assert.match(readingBrief, /Learner room → Reading/);
  assert.match(readingBrief, /Weak-spot Reading skills/);
  assert.match(readingBrief, /about half of the new stems/);
  assert.match(readingBrief, /reading_questions q ON q.id = a.question_id/);
  assert.match(readingBrief, /ALWAYS set blueprint_id/);
  assert.match(readingBrief, /Never copy or lightly paraphrase/);
  assert.match(readingBrief, /Passage authenticity/);
  assert.match(readingBrief, /genuine-feeling/);
  assert.match(readingBrief, /cartoonish/);
  const remediationBrief = buildCodexBankBrief({
    profileId: "p1",
    goal: "selective",
    subject: "reading",
    readingTask: "remediation",
    nickname: readingShelf.nickname,
    actorUserId: "owner",
    materials: readingShelf.materials,
  });
  assert.match(remediationBrief, /Reading remediation & language drill/);
  assert.match(remediationBrief, /Copywork drill/);
  assert.match(remediationBrief, /Handwriting ·/);
  assert.match(remediationBrief, /reading_remediation/);
  assert.match(readingBrief, /Do NOT insert Thinking Skills practice_questions/);
  assert.match(
    composeReadingPassageNotes({
      passageSet: "River Otters",
      page: "2",
      pageCount: "4",
      sourceQuestions: "3",
      notes: "Extra",
    }),
    /Passage set: River Otters\nPage: 2 of 4\nSource questions in this article: 3\nExtra/,
  );
  assert.equal((await readShelf(db, "p1", "selective", "owner", "reading")).materials[0]?.id, "reading-notes");
  assert.equal((await listSucceededMaterialEvidence(db, "p1", "selective", "owner", "reading")).length, 0);
  const readingParsed = parseCodexAnalysisInput({
    json: JSON.stringify({
      summary_en: "Practise inference from short informational passages.",
      parent_zh: "",
      training_directions: ["Ask what the author implies, not only what is stated."],
      evidence_limits: "One coaching note; not a full Reading diagnostic.",
    }),
  });
  assert.equal("error" in readingParsed, false);
  if (!("error" in readingParsed)) {
    const readingSaved = await saveCodexMaterialAnalysis(db, "p1", "reading-notes", "owner", readingParsed);
    assert.equal(readingSaved.ok, true);
    const readingEvidence = await listSucceededMaterialEvidence(db, "p1", "selective", "owner", "reading");
    assert.equal(readingEvidence.length, 1);
    assert.equal(readingEvidence[0]?.materialTitle, "Reading coach note");
    assert.match(readingEvidence[0]?.summaryEn || "", /inference/);
  }
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
  sql.exec(readFileSync(new URL("../migrations/0010_timed_draft_answers.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_focus_practice_mode.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0012_practice_subjects.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0013_practice_subject_sessions.sql", import.meta.url), "utf8"));
  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, true);

  assert.equal((await startPracticeSession(db, "learner", "focus")).ok, false);
  assert.equal((await startPracticeSession(db, "other", "daily")).ok, false);
  const started = await startPracticeSession(db, "learner", "daily");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.session.status, "active");
  assert.ok(started.session.attempts.length >= 1 && started.session.attempts.length <= 10);
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
  assert.ok(evidence[0]?.attempts[0]?.options.A);
  assert.equal(evidence[0]?.correct, 1);
  assert.equal((await listPracticeEvidence(db, "p1", "oc", "owner")).length, 0);
  const summaries = await listPracticeEvidenceSummaries(db, "p1", "selective", "owner");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.correct, 1);
  assert.equal(summaries[0]?.total, 1);

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

test("timed papers need a full unused bank and allow review before submit", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_practice_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0008_practice_explanations.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0010_timed_draft_answers.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_focus_practice_mode.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0012_practice_subjects.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0013_practice_subject_sessions.sql", import.meta.url), "utf8"));
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

  const first = ready.session.attempts[0];
  const second = ready.session.attempts[1];
  assert.ok(first && second);
  const draft = await saveTimedDraft(db, "learner", ready.session.id, {
    attemptId: first.id,
    selectedOption: "B",
    timeMs: 1_000,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.equal(draft.attempt.selectedOption, "B");
  assert.equal(draft.attempt.finalizedAt, null);
  assert.equal(draft.attempt.correctOption, null);
  assert.equal(draft.session.status, "active");

  const changed = await saveTimedDraft(db, "learner", ready.session.id, {
    attemptId: first.id,
    selectedOption: "A",
    timeMs: 500,
  });
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.equal(changed.attempt.selectedOption, "A");

  const early = await submitTimedPaper(db, "learner", ready.session.id);
  assert.equal(early.ok, false);
  if (!early.ok) assert.match(early.error, /unanswered/);

  // Fillers use correct option A; force a miss on one of those so weak-spot logic is stable.
  const missTarget = changed.session.attempts.find((item) => item.questionId?.startsWith("q-timed-extra-"))
    ?? second;
  for (const attempt of changed.session.attempts) {
    const saved = await saveTimedDraft(db, "learner", ready.session.id, {
      attemptId: attempt.id,
      selectedOption: attempt.id === missTarget.id ? "B" : "A",
      timeMs: 100,
    });
    assert.equal(saved.ok, true);
  }
  const submitted = await submitTimedPaper(db, "learner", ready.session.id);
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal(submitted.session.status, "completed");
  assert.equal(submitted.session.attempts.every((item) => Boolean(item.finalizedAt)), true);
  const missAttempt = submitted.session.attempts.find((item) => item.id === missTarget.id);
  assert.equal(missAttempt?.selectedOption, "B");
  assert.equal(missAttempt?.isCorrect, false);

  const weakIds = await listWeakBlueprintIds(db, "p1", "selective");
  assert.ok(weakIds.length >= 1);
  const weakBlueprintId = weakIds[0]!;
  const weakBlueprint = sql.prepare(
    "SELECT id, version FROM thinking_blueprints WHERE id = ? LIMIT 1",
  ).get(weakBlueprintId) as { id: string; version: number };
  // Bank refresh leaves unused items on weak blueprints after a timed paper has used many.
  for (let index = 0; index < 12; index += 1) {
    sql.prepare(
      `INSERT INTO practice_questions
         (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, status, created_at)
       VALUES (?, 1, ?, ?, ?, '{"A":"A","B":"B","C":"C","D":"D"}', 'A', 'active', ?)`,
    ).run(
      `q-weak-extra-${index}`,
      weakBlueprint.id,
      weakBlueprint.version,
      `Weak-spot refresh prompt ${index}.`,
      `2026-11-08T02:${String(index).padStart(2, "0")}:00.000Z`,
    );
  }
  assert.ok((await countUnusedWeakPracticeQuestions(db, "p1", "selective")) > 0);
  const focused = await startPracticeSession(db, "learner", "focus");
  assert.equal(focused.ok, true);
  if (!focused.ok) return;
  assert.equal(focused.session.mode, "focus");
  assert.ok(focused.session.attempts.length >= 1 && focused.session.attempts.length <= 10);
  for (const attempt of focused.session.attempts) {
    assert.ok(attempt.blueprintId);
    assert.equal(weakIds.includes(attempt.blueprintId!), true);
  }
});

test("learners can practise from the Reading question bank", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_practice_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0008_practice_explanations.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0010_timed_draft_answers.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_focus_practice_mode.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0012_practice_subjects.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0013_practice_subject_sessions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0014_reading_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0015_reading_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0016_reading_evidence_kinds.sql", import.meta.url), "utf8"));

  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, true);

  assert.equal(await countUnusedReadingQuestions(db, "p1", "selective"), 0);
  assert.equal((await startReadingPracticeSession(db, "learner", "daily")).ok, false);
  assert.equal((await startReadingPracticeSession(db, "learner", "focus")).ok, false);
  const remediationBefore = await readingRemediationAvailability(db, "p1", "selective");
  assert.equal(remediationBefore.enabled, false);
  assert.match(remediationBefore.reason, /No Reading mistakes yet/);

  const stamp = "2026-11-12T03:00:00.000Z";
  for (let index = 0; index < 4; index += 1) {
    sql.prepare(
      `INSERT INTO reading_questions
         (id, version, exam_goal, blueprint_id, passage_group, passage_title, passage_text,
          prompt, options_json, correct_option, explanation_en, status, created_at)
       VALUES (?, 1, 'selective', NULL, 'pg-otters', 'River Otters',
               'Otters live near clean rivers and hunt for fish.',
               ?, '{"A":"Fish","B":"Cars","C":"Clouds","D":"Shoes"}', 'A',
               'The passage says otters hunt for fish.', 'active', ?)`,
    ).run(`rq-otter-${index}`, `What do the otters hunt for? (${index})`, stamp);
  }
  assert.equal(await countUnusedReadingQuestions(db, "p1", "selective"), 4);

  const started = await startReadingPracticeSession(db, "learner", "daily");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.session.subject, "reading");
  assert.equal(started.session.status, "active");
  assert.equal(started.session.attempts.length, 4);
  assert.match(started.session.attempts[0]?.prompt || "", /River Otters/);
  assert.match(started.session.attempts[0]?.prompt || "", /What do the otters hunt for/);
  assert.equal(started.session.attempts[0]?.correctOption, null);

  const resumed = await startReadingPracticeSession(db, "learner", "timed");
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.session.id, started.session.id);

  const first = started.session.attempts[0]!;
  const bank = sql.prepare(
    "SELECT correct_option AS correctOption FROM reading_questions WHERE id = ? AND version = ?",
  ).get(first.questionId, first.questionVersion) as { correctOption: string };
  const answered = await submitPracticeAttempt(db, "learner", started.session.id, {
    attemptId: first.id,
    selectedOption: bank.correctOption as "A" | "B" | "C" | "D",
    confidence: 4,
    timeMs: 1200,
    draftNotes: "",
  });
  assert.equal(answered.ok, true);
  if (!answered.ok) return;
  assert.equal(answered.attempt.isCorrect, true);
  assert.equal(answered.session.subject, "reading");
  assert.equal(await countUnusedReadingQuestions(db, "p1", "selective"), 3);

  for (const attempt of answered.session.attempts.filter((item) => !item.finalizedAt)) {
    const key = sql.prepare(
      "SELECT correct_option AS correctOption FROM reading_questions WHERE id = ? AND version = ?",
    ).get(attempt.questionId, attempt.questionVersion) as { correctOption: string };
    const next = await submitPracticeAttempt(db, "learner", started.session.id, {
      attemptId: attempt.id,
      selectedOption: key.correctOption as "A" | "B" | "C" | "D",
      confidence: 3,
      timeMs: 900,
      draftNotes: "",
    });
    assert.equal(next.ok, true);
  }
  assert.equal(await countUnusedReadingQuestions(db, "p1", "selective"), 0);
  assert.equal((await startReadingPracticeSession(db, "learner", "daily")).ok, false);

  // All answers above were correct — still no remediation unlock.
  assert.equal((await readingRemediationAvailability(db, "p1", "selective")).enabled, false);

  sql.exec(`
    INSERT INTO practice_sessions(id, profile_id, exam_goal, mode, status, started_at, completed_at, is_focus, subject)
    VALUES('psn-read-miss','p1','selective','daily','completed','2026-11-12T04:00:00.000Z','2026-11-12T04:05:00.000Z',0,'reading');
    INSERT INTO practice_attempts
      (id, session_id, profile_id, exam_goal, subject, question_id, question_version,
       question_prompt, options_json, correct_option, selected_option, is_correct, finalized_at, created_at)
    VALUES('pat-read-miss','psn-read-miss','p1','selective','reading','rq-otter-0',1,
           'miss prompt','{"A":"Fish","B":"Cars"}','A','B',0,'2026-11-12T04:01:00.000Z','2026-11-12T04:00:30.000Z');
  `);
  const remediationReady = await readingRemediationAvailability(db, "p1", "selective");
  assert.equal(remediationReady.enabled, true);
  assert.match(remediationReady.reason, /incorrect Reading attempt/);

  sql.exec(`
    INSERT INTO learning_evidence(id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at)
    VALUES('evd-remediation','p1','selective','reading','reading_remediation','rrd1','Plan done.','2026-11-12T05:00:00.000Z');
  `);
  const remediationDone = await readingRemediationAvailability(db, "p1", "selective");
  assert.equal(remediationDone.enabled, false);
  assert.match(remediationDone.reason, /already on file/);
});
