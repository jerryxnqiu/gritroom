import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialsForCodexBank } from "@/lib/material-analysis";
import { countIncorrectAttemptsNeedingReview } from "@/lib/practice";
import { readingRemediationAvailability } from "@/lib/reading-practice";
import { parentArchiveHref, subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { AskCodexAttemptReviewButton } from "./AskCodexAttemptReviewButton";
import { AskCodexBankButton } from "./AskCodexBankButton";

export async function PracticeBankPanel({
  profile,
  goal,
  subject,
  userId,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  subject: PracticeSubject;
  userId: string;
}) {
  const [shelf, pendingReviews, remediation] = await Promise.all([
    listMaterialsForCodexBank(env.DB, profile.id, goal, userId, subject),
    subject === "thinking" || subject === "mathematics"
      ? countIncorrectAttemptsNeedingReview(env.DB, profile.id, goal, userId, subject)
      : Promise.resolve(0),
    subject === "reading"
      ? readingRemediationAvailability(env.DB, profile.id, goal)
      : Promise.resolve(null),
  ]);
  const materialCount = shelf?.materials.length ?? 0;
  const moduleLabel = subjectLabel(subject);
  const remediationDisabled = !remediation?.enabled;

  return (
    <section className="panel family-panel" id="bank" aria-labelledby="practice-bank-heading">
      <p className="eyebrow">03 / Practice bank</p>
      <h2 id="practice-bank-heading">
        {subject === "writing" ? `Support ${moduleLabel.toLowerCase()}` : `Generate ${moduleLabel.toLowerCase()} bank`}
      </h2>
      <p className="lede">
        {subject === "reading"
          ? `Ask Codex to mimic ${profile.nickname}’s uploaded Reading papers and the official NSW samples — invent original articles with richer exam-level English (not dumbed-down wording) across the official block mix and enough answers for a full ${goal === "oc" ? "33-answer" : "38-answer"} timed Reading paper (plus a Practice · 10 buffer), weighting about half toward Reading skills ${profile.nickname} misses most — and separately build language remediation (vocab / phrases / copywork; ${profile.nickname} uploads handwriting photos for Codex to check) from coaching notes and Passage sets.`
          : subject === "mathematics"
            ? `Ask Codex to read the latest D1 inputs for ${profile.nickname}’s ${examLabel(goal)} Mathematical Reasoning archive — blueprints, coaching reports, miscellaneous practice sources, material analyses, practice evidence and parent feedback — then add about 80 original five-option (A–E) questions into mathematics_questions: enough for 2 full 35-question timed papers plus 10 weak-spot items, with no calculator and paper working assumed.`
            : subject === "writing"
              ? `Writing is one open-response Selective task (30 minutes). Ask Codex to assign a learner-visible prompt (using ${profile.nickname}’s earlier writing as reference), and to mark new drafts on Task response, Organisation and Language control.`
              : `Ask Codex to read the latest D1 inputs for ${profile.nickname}’s ${examLabel(goal)} Thinking Skills archive — blueprints, coaching reports, miscellaneous practice sources, material analyses, practice evidence and parent feedback — then add about ${goal === "oc" ? "70" : "90"} new questions (slightly concise stems/options, kid-facing explanations): enough for 2 full timed papers (${goal === "oc" ? "30×2" : "40×2"}) plus 10 weak-spot items, keeping the timed-paper pool balanced rather than weak-spot heavy.`}
      </p>
      <div className="shelf-toolbar">
        <nav className="shelf-actions" aria-label="Exam archive">
          {(["selective", "oc"] as const).map((archive) => (
            <Link
              key={archive}
              className={archive === goal ? "button" : "button secondary"}
              aria-current={archive === goal ? "true" : undefined}
              href={parentArchiveHref({ profileId: profile.id, goal: archive, subject, hash: "bank" })}
            >
              {examLabel(archive)}
            </Link>
          ))}
        </nav>
      </div>

      {subject === "reading" ? (
        <>
          <AskCodexBankButton
            profileId={profile.id}
            goal={goal}
            subject="reading"
            task="bank"
            disabled={materialCount === 0}
            label="Ask Codex to generate Reading practice"
          />
          <p className="meta">
            Mimics uploaded Passage sets + official samples, tops the bank up to a full timed Reading paper (38 Selective / 33 OC answers) with official block coverage, biases new stems toward weak Reading skills from past misses, inserts live items into reading_questions for Learner room → Reading, and saves a pack summary into Reading evidence.
          </p>
          <AskCodexBankButton
            profileId={profile.id}
            goal={goal}
            subject="reading"
            task="remediation"
            disabled={remediationDisabled}
            label="Ask Codex for Reading remediation & copywork"
          />
          <p className="meta">
            For Reading misses this also writes the per-question kid reviews (same role as Thinking’s “review incorrect attempts”),
            then diagnoses language gaps, lists vocab/phrases with meanings, sets handwriting drills, and explains how to upload
            writing photos for Codex to cross-check.
          </p>
          {remediation ? <p className="meta">{remediation.reason}</p> : null}
        </>
      ) : subject === "writing" ? (
        <>
          <AskCodexBankButton
            profileId={profile.id}
            goal={goal}
            subject="writing"
            disabled={goal === "oc" && materialCount === 0}
            label="Ask Codex for Writing prompts / marks"
          />
          <p className="meta">
            Codex reads {profile.nickname}’s past marks and shelf drafts as reference, then assigns an active Writing
            prompt the learner can see in Learner room → Writing. When a new draft is uploaded, ask again to mark it
            (Task / Organisation / Language, each /5).
          </p>
        </>
      ) : (
        <AskCodexBankButton
          profileId={profile.id}
          goal={goal}
          subject={subject}
          disabled={materialCount === 0}
          label={subject === "mathematics" ? "Ask Codex to generate Mathematics practice" : undefined}
        />
      )}

      {subject === "writing" ? (
        <p className="meta">
          {materialCount === 0
            ? goal === "oc"
              ? "OC has no official Writing paper. Add a practice draft on the Writing shelf if you still want composition coaching."
              : "No Writing shelf files yet — Codex can still invent practice prompts; add a learner draft when you are ready to mark."
            : `${materialCount} Writing shelf source${materialCount === 1 ? "" : "s"} ready. Paste the copied task into a Codex chat in this gritroom repo.`}
        </p>
      ) : materialCount === 0 ? (
        <p className="meta">
          Add coaching reports or practice-question sources in the {moduleLabel} resource shelf below first.
        </p>
      ) : (
        <p className="meta">
          {materialCount} {moduleLabel.toLowerCase()} shelf source{materialCount === 1 ? "" : "s"} ready for this archive.
          Paste the copied task into a Codex chat in this gritroom repo.
        </p>
      )}

      {subject === "thinking" || subject === "mathematics" ? (
        <div className="family-subsection">
          <h3>Review incorrect attempts</h3>
          <p className="meta">
            After practice, ask Codex to write personalised kid-facing notes for incorrect answers that still need a review.
            Those notes appear in the learner room and under practice evidence.
          </p>
          <AskCodexAttemptReviewButton
            profileId={profile.id}
            goal={goal}
            subject={subject}
            disabled={pendingReviews === 0}
          />
          <p className="meta">
            {pendingReviews === 0
              ? "No incorrect attempts are waiting for a Codex review in this archive."
              : `${pendingReviews} incorrect attempt${pendingReviews === 1 ? "" : "s"} waiting for a Codex review.`}
          </p>
          {subject === "mathematics" ? (
            <p className="meta">
              Generated items land in mathematics_questions for Learner room → Mathematics (short Practice sets, weak-spot rounds, and a 35-question timed paper).
            </p>
          ) : null}
        </div>
      ) : subject === "reading" ? (
        <div className="family-subsection">
          <h3>How Reading remediation works</h3>
          <ol className="practice-language-howto">
            <li>
              After Reading misses, click <strong>Ask Codex for Reading remediation & copywork</strong>.
            </li>
            <li>
              {profile.nickname} opens Learner room → Last results, learns the words, handwrites the copywork, and
              uploads the page photos there.
            </li>
            <li>
              Ask Codex for Reading remediation again so those handwriting photos are reviewed and commented on with the
              plan in Evidence.
            </li>
          </ol>
        </div>
      ) : null}
    </section>
  );
}
