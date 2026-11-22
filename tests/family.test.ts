import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasLearnerInvitation,
  isInstallationOwner,
  linkedCoach,
  linkedLearner,
  listCoachedProfiles,
  listManagedFamilies,
  listParentProfiles,
} from "../lib/family.ts";
import { acceptInvitation, childAccess, closeInvitation, issueInvitation, recipientInvitations, revokeCoach, revokeGuardian } from "../lib/invitations.ts";
import {
  buildCodexAttemptReviewBrief,
  buildCodexBankBrief,
  buildCodexMaterialBrief,
  getMaterialForCodex,
  listMaterialAnalyses,
  listMaterialsForCodexBank,
  listLearnerCoachTips,
  listReadingRemediationPlans,
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
  countUnusedWeakMathematicsQuestions,
  listWeakMathematicsBlueprintIds,
  startMathematicsPracticeSession,
} from "../lib/mathematics-practice.ts";
import {
  countUnusedReadingQuestions,
  readingRemediationAvailability,
  startReadingPracticeSession,
} from "../lib/reading-practice.ts";
import { canOpenShelf, deleteMaterial, findMaterialFile, readShelf, saveShelfFeedback, withdrawShelfFeedback } from "../lib/resource-shelf.ts";
import { parsePracticePrompt } from "../lib/practice-prompt.ts";
import { readingKnowledge } from "../lib/reading-knowledge.ts";
import {
  assignRemediationSourcePapers,
  handwritingPassageSetName,
  parseRemediationPlan,
  plansForAudience,
  remediationPlanAudience,
  remediationSourcePaperLabel,
  scrubRemediationSummaryForLearner,
} from "../lib/reading-remediation.ts";
import {
  buildPracticeScorePoints,
  cumulativeHitRatesByDate,
  groupPracticeScorePointsByDate,
} from "../lib/practice-score-chart.ts";
import {
  parseWritingMarkSummary,
  writingMarkPercent,
  writingMarksAsScoreSessions,
} from "../lib/writing-mark.ts";
import {
  parseWritingPromptSummary,
  pickActiveWritingPrompt,
} from "../lib/writing-prompt.ts";
import { composeReadingPassageNotes, composeResourceSetNotes, parseResourceSetNotes, stripResourcePageSuffix } from "../lib/shelf-fields.ts";
import { groupShelfMaterials } from "../lib/shelf-sets.ts";
import { youtubeVideoId } from "../lib/youtube-transcript.ts";

const core = readFileSync(new URL("../migrations/0002_core_schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0003_family_invitations.sql", import.meta.url), "utf8");
const coachMigration = readFileSync(new URL("../migrations/0017_coach_access.sql", import.meta.url), "utf8");
const actor = (id: string) => ({ user_id: id, email: id + "@example.invalid" });
const accepted = async () => true;

/** Empty math tables so attempt loaders can LEFT JOIN before migration 0018 is applied. */
function ensureMathematicsJoinTables(sql: DatabaseSync) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS mathematics_blueprints (
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      skill TEXT NOT NULL,
      title TEXT NOT NULL,
      method TEXT NOT NULL,
      authoring_rule TEXT NOT NULL,
      verification_rule TEXT NOT NULL,
      PRIMARY KEY (id, version)
    );
    CREATE TABLE IF NOT EXISTS mathematics_questions (
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      exam_goal TEXT,
      blueprint_id TEXT,
      prompt TEXT,
      options_json TEXT,
      correct_option TEXT,
      explanation_en TEXT,
      image_key TEXT,
      status TEXT,
      created_at TEXT,
      PRIMARY KEY (id, version)
    );
  `);
}

function fixture(migrate = true) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(core);
  sql.exec(`
    INSERT INTO users(id,email) VALUES
      ('owner','owner@example.invalid'), ('guardian','guardian@example.invalid'),
      ('other','other@example.invalid'), ('learner','learner@example.invalid'),
      ('learner2','learner2@example.invalid'), ('adult','adult@example.invalid'),
      ('coach','coach@example.invalid');
    INSERT INTO families(id,name,installation_owner_user_id) VALUES
      ('f1','First family','owner'), ('f2','Other family','other');
    INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES
      ('p1','f1','First child','selective'), ('p2','f1','Second child','oc'),
      ('p3','f2','Other child','selective');
    INSERT INTO guardian_grants(id,family_id,user_id,profile_id,role) VALUES
      ('g1','f1','owner',NULL,'owner'), ('g2','f1','guardian','p1','guardian'),
      ('g3','f2','other',NULL,'owner'), ('g4','f2','guardian',NULL,'guardian');
  `);
  if (migrate) {
    sql.exec(migration);
    sql.exec(coachMigration);
  }

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
  sql.exec(coachMigration);
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

test("coach invitations grant a read-only link for the selected child only", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());

  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("coach").email, role: "coach" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("coach"), invite.id)).ok, true);
  assert.equal((await linkedCoach(db, "coach"))?.id, "p1");
  assert.deepEqual((await listCoachedProfiles(db, "coach")).map((item) => item.id), ["p1"]);
  assert.equal((await listParentProfiles(db, "coach")).length, 0);

  const access = await childAccess(db, "p1", "owner");
  const coach = access?.coaches.find((item) => item.email === actor("coach").email);
  assert.ok(coach);
  assert.equal((await revokeCoach(db, actor("other"), coach.profileId, coach.userId)).ok, false);
  assert.equal((await revokeCoach(db, actor("owner"), coach.profileId, coach.userId)).ok, true);
  assert.equal(await linkedCoach(db, "coach"), null);

  const sibling = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p2", email: actor("coach").email, role: "coach" },
    accepted,
  );
  assert.ok(sibling.ok);
  assert.equal((await acceptInvitation(db, actor("coach"), sibling.id)).ok, true);
  assert.deepEqual((await listCoachedProfiles(db, "coach")).map((item) => item.id), ["p2"]);
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

test("reading remediation plans split learner vs parent audience", () => {
  assert.equal(
    remediationPlanAudience("Language list · at a glance = from a quick look.\nCOPYWORK: write each model sentence five times."),
    "learner",
  );
  assert.equal(
    remediationPlanAudience("Parent photo check · Ask Codex again so handwriting photos are reviewed with the plan."),
    "parent",
  );
  assert.equal(
    remediationPlanAudience([
      "Parent photo check · 3/3  Plan ID: rrd_8f99e1b173ff4f148124906c2a49724f",
      "No handwriting has been uploaded yet for the earlier plan.",
      "1) After writing, photograph every page clearly.",
      "2) Upload to Parent room → Reading → Resource shelf as Practice questions (misc. source).",
      "3) Use Passage set: Handwriting · rrd_8f99e1b173ff4f148124906c2a49724f",
      "4) Re-run this Reading remediation task (upload alone does not trigger Codex).",
      "Photo review should mark spelling and Model copies by target.",
    ].join("\n")),
    "parent",
  );
  assert.equal(
    plansForAudience(
      [{ summary: "Parent photo check · Upload handwriting notes with Model copies." }],
      "learner",
    ).length,
    0,
  );
  const filtered = plansForAudience(
    [
      { summary: "COPYWORK: handwrite these phrases." },
      { summary: "Parent photo check · no handwriting uploaded yet." },
    ],
    "learner",
  );
  assert.equal(filtered.length, 1);
  assert.match(filtered[0]?.summary || "", /COPYWORK/);
  assert.equal(
    handwritingPassageSetName("rrd_8f99e1b173ff4f148124906c2a49724f"),
    "Handwriting · rrd_8f99e1b173ff4f148124906c2a49724f",
  );
  assert.equal(
    scrubRemediationSummaryForLearner("Meaning · sure.\nPlan ID: rrd_abc123\nCOPYWORK: write five times."),
    "Meaning · sure.\nCOPYWORK: write five times.",
  );
});

test("remediation plans attach source papers by time window", () => {
  const attached = assignRemediationSourcePapers(
    [
      { id: "evd2", refId: "rrd_b", createdAt: "2026-11-15T12:00:00.000Z", summary: "later" },
      { id: "evd1", refId: "rrd_a", createdAt: "2026-11-14T12:00:00.000Z", summary: "earlier" },
    ],
    [
      {
        sessionId: "ses1",
        mode: "timed",
        completedAt: "2026-11-14T10:00:00.000Z",
        correct: 30,
        total: 38,
        incorrect: 8,
      },
      {
        sessionId: "ses2",
        mode: "daily",
        completedAt: "2026-11-15T09:00:00.000Z",
        correct: 6,
        total: 10,
        incorrect: 4,
      },
    ],
  );
  const earlier = attached.find((plan) => plan.refId === "rrd_a");
  const later = attached.find((plan) => plan.refId === "rrd_b");
  assert.deepEqual(earlier?.sourcePapers.map((paper) => paper.sessionId), ["ses1"]);
  assert.deepEqual(later?.sourcePapers.map((paper) => paper.sessionId), ["ses2"]);
  assert.equal(
    remediationSourcePaperLabel(earlier!.sourcePapers[0]!),
    "Timed paper · 2026-11-14 · 30 of 38",
  );
});

test("practice score chart keeps plain dates and tags identical sources", () => {
  const points = buildPracticeScorePoints([
    {
      id: "s4",
      mode: "daily",
      status: "completed",
      startedAt: "2026-11-14T17:00:00.000Z",
      completedAt: "2026-11-14T17:20:00.000Z",
      total: 10,
      correct: 8,
    },
    {
      id: "s3",
      mode: "timed",
      status: "completed",
      startedAt: "2026-11-14T16:00:00.000Z",
      completedAt: "2026-11-14T16:40:00.000Z",
      total: 40,
      correct: 28,
    },
    {
      id: "s2",
      mode: "daily",
      status: "completed",
      startedAt: "2026-11-14T09:00:00.000Z",
      completedAt: "2026-11-14T09:20:00.000Z",
      total: 10,
      correct: 7,
    },
    {
      id: "s1",
      mode: "daily",
      status: "completed",
      startedAt: "2026-11-13T10:00:00.000Z",
      completedAt: "2026-11-13T10:15:00.000Z",
      total: 10,
      correct: 9,
    },
    {
      id: "open",
      mode: "timed",
      status: "active",
      startedAt: "2026-11-15T10:00:00.000Z",
      completedAt: null,
      total: 5,
      correct: 2,
    },
  ]);
  assert.deepEqual(points.map((point) => point.date), [
    "2026-11-13",
    "2026-11-14",
    "2026-11-14",
    "2026-11-14",
  ]);
  assert.deepEqual(points.map((point) => point.source), [
    "Practice",
    "Practice-1",
    "Timed",
    "Practice-2",
  ]);
  assert.equal(points[0]?.percent, 90);
  assert.equal(points[1]?.percent, 70);
  assert.equal(points[2]?.percent, 70);
  assert.equal(points[3]?.percent, 80);

  // Answer-weighted running hit rate matches overall Accuracy on the latest date.
  // Day1: 9/10 = 90%. Day2 adds 7+28+8 = 43 correct / 60 answers → 52/70 = 74%.
  const hitRates = cumulativeHitRatesByDate(groupPracticeScorePointsByDate(points));
  assert.equal(hitRates[0]?.average, 90);
  assert.equal(hitRates[1]?.average, Math.round((52 / 70) * 100));
  assert.equal(hitRates[1]?.correct, 52);
  assert.equal(hitRates[1]?.answered, 70);
});

test("writing prompt summaries parse the learner-visible brief", () => {
  const parsed = parseWritingPromptSummary(`Writing prompt
Status: active
Title: New sports club
Form: letter
Audience: the principal
Minutes: 30
Focus skill: language-control
Brief:
Write a letter to your principal persuading them to start an after-school sports club.

Give three clear reasons and end with a polite request.
Why this prompt:
Builds on last mark’s weak language-control.`);
  assert.ok(parsed);
  assert.equal(parsed!.status, "active");
  assert.equal(parsed!.title, "New sports club");
  assert.equal(parsed!.form, "letter");
  assert.equal(parsed!.audience, "the principal");
  assert.equal(parsed!.minutes, 30);
  assert.equal(parsed!.focusSkill, "language-control");
  assert.match(parsed!.brief, /after-school sports club/);
  assert.match(parsed!.whyThisPrompt || "", /language-control/);
  assert.equal(
    pickActiveWritingPrompt([
      {
        id: "old",
        refId: "a",
        createdAt: "2026-11-01T00:00:00.000Z",
        summary: "x",
        ...parsed!,
        status: "archived",
        title: "Old",
      },
      {
        id: "new",
        refId: "b",
        createdAt: "2026-11-22T00:00:00.000Z",
        summary: "x",
        ...parsed!,
      },
    ])?.id,
    "new",
  );
});

test("writing mark summaries parse rubric scores for the progress chart", () => {
  const parsed = parseWritingMarkSummary(`Writing mark
Date: 2026-11-22
Prompt title: School garden letter
Task response: 3/5
Organisation: 4/5
Language control: 3/5
Total: 10/15
Weakest: language-control
Kid notes:
You answered the letter task clearly. Tighten word choice in paragraph 2.
Next focus:
Rewrite one paragraph with more precise verbs.`);
  assert.ok(parsed);
  assert.equal(parsed!.scores.taskResponse, 3);
  assert.equal(parsed!.scores.organisation, 4);
  assert.equal(parsed!.scores.languageControl, 3);
  assert.equal(parsed!.total, 10);
  assert.equal(parsed!.weakest, "language-control");
  assert.match(parsed!.kidNotes || "", /Tighten word choice/);
  assert.match(parsed!.nextFocus || "", /precise verbs/);
  assert.equal(writingMarkPercent({
    id: "1",
    refId: "wmk1",
    createdAt: "2026-11-22T00:00:00.000Z",
    summary: "x",
    ...parsed!,
  }), 67);

  const sessions = writingMarksAsScoreSessions([
    {
      id: "m1",
      refId: "w1",
      createdAt: "2026-11-21T00:00:00.000Z",
      summary: "x",
      ...parsed!,
      total: 9,
    },
    {
      id: "m2",
      refId: "w2",
      createdAt: "2026-11-22T00:00:00.000Z",
      summary: "x",
      ...parsed!,
    },
  ]);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0]?.mode, "writing");
  assert.equal(sessions[0]?.correct, 9);
  assert.equal(sessions[1]?.correct, 10);
  assert.equal(sessions[0]?.total, 15);
});

test("reading remediation plans parse model sentences for handwriting UI", () => {
  const parsed = parseRemediationPlan([
    "Reading repair follow-up — 2/3: Eight targets",
    "Forms come from missed questions. Each Model is a new example for handwriting.",
    "",
    "1. impression / expression — An ocean in a hollow, word-choice options.",
    "Meaning: impression = a view formed in your mind; expression = how a feeling is shown.",
    "Model: My first impression was wrong.",
    "Write that Model sentence 5 times.",
    "",
    "2. at a glance / at large — word-choice options.",
    "Meaning: at a glance = from a quick look.",
    "Model: At a glance, they looked alike.",
    "Write that Model sentence 5 times.",
    "",
    "COPYWORK: write each Model sentence 5 times.",
  ].join("\n"));
  assert.equal(parsed.title, "Reading repair follow-up — 2/3: Eight targets");
  assert.equal(parsed.targets.length, 2);
  assert.equal(parsed.targets[0]?.form, "impression / expression");
  assert.equal(parsed.targets[0]?.model, "My first impression was wrong.");
  assert.equal(parsed.targets[1]?.model, "At a glance, they looked alike.");
  assert.match(parsed.drill || "", /each Model sentence 5 times/i);

  const paren = parseRemediationPlan([
    "1) impression / expression — An ocean in a hollow, word-choice options.",
    "Meaning: an impression is the view formed in someone's mind; an expression shows or communicates an idea or feeling.",
    "Model: My first impression was wrong.",
  ].join("\n"));
  assert.equal(paren.targets.length, 1);
  assert.equal(paren.targets[0]?.form, "impression / expression");
  assert.equal(paren.targets[0]?.model, "My first impression was wrong.");
});

test("reading prompts split into passage instruction article and stem", () => {
  const parsed = parsePracticePrompt(
    [
      "A handful of differences",
      "",
      "Read the complete article. Choose the best word or phrase for each numbered gap.",
      "",
      "A handful of differences",
      "",
      "Sand is not just sand.\n\nBeaches form slowly [8].",
      "",
      "Which word or phrase best fills gap [8] in A handful of differences?",
    ].join("\n"),
    "reading",
  );
  assert.equal(parsed.title, "A handful of differences");
  assert.match(parsed.instruction || "", /Read the complete article/);
  assert.match(parsed.passage || "", /Sand is not just sand/);
  assert.doesNotMatch(parsed.passage || "", /^A handful of differences/);
  assert.match(parsed.stem, /gap \[8\]/);
  assert.equal(parsed.extracts.length, 0);
  assert.equal(parsePracticePrompt("Plain thinking stem", "thinking").stem, "Plain thinking stem");

  const multi = parsePracticePrompt(
    [
      "Finding a way",
      "",
      "Read four original extracts about finding a way. For each statement, choose the one extract that supports it.",
      "",
      "Extract A\nFirst extract body about maps.",
      "",
      "Extract B\nSecond extract body about scenic routes.",
      "",
      "Extract C\nThird extract body.",
      "",
      "Extract D\nFourth extract body.",
      "",
      "Which extract supports the idea that plans improve after a mistake?",
    ].join("\n"),
    "reading",
  );
  assert.equal(multi.extracts.length, 4);
  assert.equal(multi.extracts[0]?.label, "Extract A");
  assert.match(multi.extracts[0]?.body || "", /maps/);
  assert.equal(multi.extracts[3]?.label, "Extract D");
});

test("shelf evidence is limited to the authorised child and chosen exam archive", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_focus_practice_mode.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0012_practice_subjects.sql", import.meta.url), "utf8"));
  // Session/attempt subject only — full 0013 also alters practice_questions, which this fixture omits.
  sql.exec(`
    ALTER TABLE practice_sessions ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
      CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing'));
    ALTER TABLE practice_attempts ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
      CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing'));
  `);
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
  assert.match(bankBrief, /ADD about 90 new active Thinking Skills questions/);
  assert.match(bankBrief, /2 full 40-question timed papers \(80\) plus 10 weak-spot items \(90 total\)/);
  assert.match(bankBrief, /about 10 on the learner’s weak-spot blueprints/);
  assert.match(bankBrief, /balanced timed-paper pool/);
  assert.match(bankBrief, /Do NOT skew the timed-paper pool toward weak spots/);
  assert.match(bankBrief, /slightly concise/);
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
  assert.match(readingBrief, /at least 38 active answers/);
  assert.match(readingBrief, /FULL official timed Reading paper/);
  assert.match(readingBrief, /multiple matching/);
  assert.match(readingBrief, /COUNT\(DISTINCT passage_group\) AS articles/);
  assert.match(readingBrief, /reading_questions q ON q.id = a.question_id/);
  assert.match(readingBrief, /ALWAYS set blueprint_id/);
  assert.match(readingBrief, /whole articles only/);
  assert.match(readingBrief, /contiguous block/);
  assert.match(readingBrief, /Aim for 6–7 answers per article/);
  assert.match(readingBrief, /Never copy or lightly paraphrase/);
  assert.match(readingBrief, /Passage authenticity/);
  assert.match(readingBrief, /genuine-feeling/);
  assert.match(readingBrief, /cartoonish/);
  assert.match(readingBrief, /Language register/);
  assert.match(readingBrief, /shrewd/);
  assert.match(readingBrief, /richer exam-level vocabulary/);
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
  assert.match(remediationBrief, /COPYWORK:/);
  assert.match(remediationBrief, /Model:/);
  assert.match(remediationBrief, /Handwriting ·/);
  assert.match(remediationBrief, /reading_remediation/);
  assert.match(remediationBrief, /attempt_review_en/);
  assert.match(remediationBrief, /Per-miss kid reviews/);
  assert.match(remediationBrief, /subject = 'reading'/);
  assert.match(readingBrief, /Do NOT insert Thinking Skills practice_questions/);
  const mathematicsBrief = buildCodexBankBrief({
    profileId: "p1",
    goal: "selective",
    subject: "mathematics",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    materials: bankShelf.materials,
  });
  assert.match(mathematicsBrief, /Mathematics practice-bank generation/);
  assert.match(mathematicsBrief, /subject: mathematics/);
  assert.match(mathematicsBrief, /mathematics_blueprints/);
  assert.match(mathematicsBrief, /mathematics_questions/);
  assert.match(mathematicsBrief, /five options A–E/);
  assert.match(mathematicsBrief, /ADD about 80 new active mathematics_questions/);
  assert.match(mathematicsBrief, /2 full 35-question timed papers \(70\) plus 10 weak-spot items \(80 total\)/);
  assert.match(mathematicsBrief, /exactly about 10 on the learner’s weak-spot mathematics blueprints/);
  assert.match(mathematicsBrief, /mathematics_practice_pack/);
  const writingBrief = buildCodexBankBrief({
    profileId: "p1",
    goal: "selective",
    subject: "writing",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    materials: bankShelf.materials,
  });
  assert.match(writingBrief, /Writing coaching \(prompts \+ marks\)/);
  assert.match(writingBrief, /writing_prompt/);
  assert.match(writingBrief, /writing_mark/);
  assert.match(writingBrief, /existing writing as reference/);
  assert.match(writingBrief, /Status: active/);
  assert.match(writingBrief, /Task response: N\/5/);
  assert.match(writingBrief, /Do NOT insert practice_questions/);
  assert.match(writingBrief, /writing_blueprints/);
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
  assert.match(
    composeResourceSetNotes({
      setLabel: "Paper set",
      setName: "NSW Selective Reading PT1 marked",
      page: "3",
      pageCount: "12",
      notes: "30/38 · missed Q8",
    }),
    /Paper set: NSW Selective Reading PT1 marked\nPage: 3 of 12\n30\/38 · missed Q8/,
  );
  assert.match(
    composeResourceSetNotes({
      setLabel: "Source set",
      setName: "Workbook ch.4",
      page: "1",
      pageCount: "5",
    }),
    /Source set: Workbook ch\.4\nPage: 1 of 5/,
  );
  assert.deepEqual(
    parseResourceSetNotes("Source set: Wk18 STTC\nPage: 2 of 7\nOptional note"),
    {
      setLabel: "Source set",
      setName: "Wk18 STTC",
      page: 2,
      pageCount: 7,
      sourceQuestions: null,
      extraNotes: "Optional note",
    },
  );
  assert.equal(stripResourcePageSuffix("Wk18 STTC TS workbook · page 3 of 7"), "Wk18 STTC TS workbook");
  const grouped = groupShelfMaterials([
    {
      id: "p2",
      kind: "study_material",
      title: "Wk18 STTC TS workbook · page 2 of 2",
      url: null,
      notes: "Source set: Wk18 STTC\nPage: 2 of 2",
      fileName: "2.jpg",
      fileType: "image/jpeg",
      createdAt: "2026-11-17T02:00:00.000Z",
    },
    {
      id: "p1",
      kind: "study_material",
      title: "Wk18 STTC TS workbook · page 1 of 2",
      url: null,
      notes: "Source set: Wk18 STTC\nPage: 1 of 2",
      fileName: "1.jpg",
      fileType: "image/jpeg",
      createdAt: "2026-11-17T01:00:00.000Z",
    },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.title, "Wk18 STTC");
  assert.equal(grouped[0]?.pages.length, 2);
  assert.equal(grouped[0]?.anchor.id, "p1");
  const markedMaterial = await getMaterialForCodex(db, "p1", "notes", "owner");
  assert.ok(markedMaterial);
  const markedBrief = buildCodexMaterialBrief(
    { ...markedMaterial, kind: "marked_paper", notes: "Paper set: NSW PT1\nPage: 1 of 2\n30/38" },
    "p1",
    "owner",
  );
  assert.match(markedBrief, /marked-paper review/);
  assert.match(markedBrief, /PERFORMANCE EVIDENCE/);
  assert.match(markedBrief, /Paper set/);
  assert.match(markedBrief, /kind = 'marked_paper'/);
  assert.equal((await readShelf(db, "p1", "selective", "owner", "reading")).materials[0]?.id, "reading-notes");
  assert.equal((await listSucceededMaterialEvidence(db, "p1", "selective", "owner", "reading")).length, 0);
  assert.equal((await listLearnerCoachTips(db, "learner", "reading")).length, 0);
  const readingParsed = parseCodexAnalysisInput({
    json: JSON.stringify({
      summary_en: "Practise inference from short informational passages.",
      parent_zh: "给家长的备注",
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
  const tipInvite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(tipInvite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), tipInvite.id)).ok, true);
  const learnerTips = await listLearnerCoachTips(db, "learner", "reading");
  assert.equal(learnerTips.length, 1);
  assert.match(learnerTips[0]?.summaryEn || "", /inference/);
  assert.equal(learnerTips[0]?.trainingDirections[0], "Ask what the author implies, not only what is stated.");
  assert.equal((await listLearnerCoachTips(db, "learner", "thinking")).length, 0);
  assert.equal((await listLearnerCoachTips(db, "other", "reading")).length, 0);

  sql.exec(readFileSync(new URL("../migrations/0016_reading_evidence_kinds.sql", import.meta.url), "utf8"));
  sql.exec(`
    INSERT INTO learning_evidence(id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at)
    VALUES('evd-lang','p1','selective','reading','reading_remediation','rrd-lang',
           'Language list · at a glance = from a quick look · at large = as a whole.',
           '2026-11-14T12:00:00.000Z');
  `);
  const tipsWithLang = await listLearnerCoachTips(db, "learner", "reading");
  assert.equal(tipsWithLang.length, 2);
  const languageTip = tipsWithLang.find((tip) => tip.materialKind === "reading_remediation");
  assert.ok(languageTip);
  assert.match(languageTip?.summaryEn || "", /at a glance/);
  const parentPlans = await listReadingRemediationPlans(db, "p1", "selective", "owner");
  assert.equal(parentPlans.length, 1);
  assert.match(parentPlans[0]?.summary || "", /at a glance/);
  const learnerPlans = await listReadingRemediationPlans(db, "p1", "selective", "learner");
  assert.equal(learnerPlans.length, 1);
  assert.equal((await listReadingRemediationPlans(db, "p1", "selective", "other")).length, 0);
  const reviewBrief = buildCodexAttemptReviewBrief({
    profileId: "p1",
    goal: "selective",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    pendingCount: 3,
  });
  assert.match(reviewBrief, /attempt_review_en/);
  assert.match(reviewBrief, /incorrect/);
  assert.match(reviewBrief, /subject = 'thinking'/);
  assert.match(reviewBrief, /Thinking Skills/);
  const mathReviewBrief = buildCodexAttemptReviewBrief({
    profileId: "p1",
    goal: "selective",
    nickname: bankShelf.nickname,
    actorUserId: "owner",
    pendingCount: 2,
    subject: "mathematics",
  });
  assert.match(mathReviewBrief, /Mathematical Reasoning/);
  assert.match(mathReviewBrief, /subject = 'mathematics'/);
  assert.match(mathReviewBrief, /mathematics_blueprints/);
  assert.match(mathReviewBrief, /attempt_review_en/);
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
  ensureMathematicsJoinTables(sql);
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
  ensureMathematicsJoinTables(sql);
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

  const forceBeforeExpiry = await submitTimedPaper(db, "learner", ready.session.id, { force: true });
  assert.equal(forceBeforeExpiry.ok, false);
  if (!forceBeforeExpiry.ok) assert.match(forceBeforeExpiry.error, /Time is still left/);

  sql.prepare(
    `UPDATE practice_sessions SET started_at = ? WHERE id = ?`,
  ).run("2020-01-01T00:00:00.000Z", ready.session.id);
  const forced = await submitTimedPaper(db, "learner", ready.session.id, { force: true });
  assert.equal(forced.ok, true);
  if (!forced.ok) return;
  assert.equal(forced.session.status, "completed");
  assert.equal(forced.session.attempts.every((item) => Boolean(item.finalizedAt)), true);
  assert.equal(forced.session.attempts.filter((item) => !item.selectedOption).every((item) => item.isCorrect === false), true);

  // Top up the bank — the forced paper already consumed 40 unused items.
  for (let index = 0; index < 40; index += 1) {
    sql.prepare(
      `INSERT INTO practice_questions
         (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, status, created_at)
       VALUES (?, 1, ?, ?, ?, '{"A":"A","B":"B","C":"C","D":"D"}', 'A', 'active', ?)`,
    ).run(
      `q-timed-extra-b-${index}`,
      blueprint.id,
      blueprint.version,
      `Timed filler prompt B ${index} for paper sizing.`,
      `2026-11-08T03:${String(index).padStart(2, "0")}:00.000Z`,
    );
  }

  // Fresh timed paper for the happy-path submit below.
  const restart = await startPracticeSession(db, "learner", "timed");
  assert.equal(restart.ok, true);
  if (!restart.ok) return;
  assert.equal(restart.session.attempts.length, 40);

  // Fillers use correct option A; force a miss on one of those so weak-spot logic is stable.
  const missTarget = restart.session.attempts.find((item) => item.questionId?.startsWith("q-timed-extra-"))
    ?? restart.session.attempts[1]!;
  for (const attempt of restart.session.attempts) {
    const saved = await saveTimedDraft(db, "learner", restart.session.id, {
      attemptId: attempt.id,
      selectedOption: attempt.id === missTarget.id ? "B" : "A",
      timeMs: 100,
    });
    assert.equal(saved.ok, true);
  }
  const submitted = await submitTimedPaper(db, "learner", restart.session.id);
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
  ensureMathematicsJoinTables(sql);

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

  const timedTooSmall = await startReadingPracticeSession(db, "learner", "timed");
  assert.equal(timedTooSmall.ok, false);
  if (!timedTooSmall.ok) {
    assert.equal(timedTooSmall.status, 409);
    assert.match(timedTooSmall.error, /38 unused answers/);
  }

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

test("learners can practise Mathematics weak-spot skills", async (t) => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0004_thinking_knowledge.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0005_resource_shelf.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0006_learning_inputs.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0007_practice_questions.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0008_practice_explanations.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0010_timed_draft_answers.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0011_focus_practice_mode.sql", import.meta.url), "utf8"));
  // Widen subject CHECKs without running full 0012–0018 rebuilds.
  sql.exec(`
    ALTER TABLE practice_sessions ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
      CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing'));
    ALTER TABLE practice_attempts ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
      CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing'));
  `);
  ensureMathematicsJoinTables(sql);
  sql.exec(`
    INSERT INTO mathematics_blueprints
      (id, version, skill, title, method, authoring_rule, verification_rule)
    VALUES
      ('number-sense', 1, 'Number', 'Number sense', 'm', 'a', 'v'),
      ('space', 1, 'Space', 'Space', 'm', 'a', 'v');
  `);

  const invite = await issueInvitation(
    db,
    actor("owner"),
    { profileId: "p1", email: actor("learner").email, role: "learner" },
    accepted,
  );
  assert.ok(invite.ok);
  assert.equal((await acceptInvitation(db, actor("learner"), invite.id)).ok, true);

  assert.equal((await startMathematicsPracticeSession(db, "learner", "focus")).ok, false);

  const options = '{"A":"1","B":"2","C":"3","D":"4","E":"5"}';
  for (let index = 0; index < 4; index += 1) {
    sql.prepare(
      `INSERT INTO mathematics_questions
         (id, version, exam_goal, blueprint_id, prompt, options_json, correct_option, explanation_en, status, created_at)
       VALUES (?, 1, 'selective', 'number-sense', ?, ?, 'A', 'why', 'active', ?)`,
    ).run(
      `mq-num-${index}`,
      `Number prompt ${index}`,
      options,
      `2026-11-20T10:0${index}:00.000Z`,
    );
  }
  for (let index = 0; index < 4; index += 1) {
    sql.prepare(
      `INSERT INTO mathematics_questions
         (id, version, exam_goal, blueprint_id, prompt, options_json, correct_option, explanation_en, status, created_at)
       VALUES (?, 1, 'selective', 'space', ?, ?, 'A', 'why', 'active', ?)`,
    ).run(
      `mq-space-${index}`,
      `Space prompt ${index}`,
      options,
      `2026-11-20T11:0${index}:00.000Z`,
    );
  }

  sql.exec(`
    INSERT INTO practice_sessions(id, profile_id, exam_goal, mode, status, started_at, completed_at, is_focus, subject)
    VALUES('psn-math-miss','p1','selective','daily','completed','2026-11-20T09:00:00.000Z','2026-11-20T09:10:00.000Z',0,'mathematics');
    INSERT INTO practice_attempts
      (id, session_id, profile_id, exam_goal, subject, question_id, question_version,
       question_prompt, options_json, correct_option, selected_option, is_correct, finalized_at, created_at)
    VALUES
      ('pat-math-miss-1','psn-math-miss','p1','selective','mathematics','mq-num-0',1,
       'Number prompt 0','${options}','A','B',0,'2026-11-20T09:05:00.000Z','2026-11-20T09:01:00.000Z'),
      ('pat-math-miss-2','psn-math-miss','p1','selective','mathematics','mq-num-1',1,
       'Number prompt 1','${options}','A','C',0,'2026-11-20T09:06:00.000Z','2026-11-20T09:02:00.000Z');
  `);

  const weakIds = await listWeakMathematicsBlueprintIds(db, "p1", "selective");
  assert.deepEqual(weakIds, ["number-sense"]);
  assert.ok((await countUnusedWeakMathematicsQuestions(db, "p1", "selective")) >= 2);

  const focused = await startMathematicsPracticeSession(db, "learner", "focus");
  assert.equal(focused.ok, true);
  if (!focused.ok) return;
  assert.equal(focused.session.mode, "focus");
  assert.equal(focused.session.subject, "mathematics");
  assert.ok(focused.session.attempts.length >= 1 && focused.session.attempts.length <= 10);
  for (const attempt of focused.session.attempts) {
    assert.ok(attempt.questionId?.startsWith("mq-num-"));
  }
});
