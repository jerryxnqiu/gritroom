import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialsForCodexBank } from "@/lib/material-analysis";
import { countIncorrectAttemptsNeedingReview } from "@/lib/practice";
import { parentArchiveHref, subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { AskCodexAttemptReviewButton } from "./AskCodexAttemptReviewButton";
import { AskCodexBankButton } from "./AskCodexBankButton";
import { ParentModuleSwitch } from "./ParentModuleSwitch";

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
  const [shelf, pendingReviews] = await Promise.all([
    listMaterialsForCodexBank(env.DB, profile.id, goal, userId, subject),
    subject === "thinking"
      ? countIncorrectAttemptsNeedingReview(env.DB, profile.id, goal, userId)
      : Promise.resolve(0),
  ]);
  const materialCount = shelf?.materials.length ?? 0;
  const moduleLabel = subjectLabel(subject);

  return (
    <section className="panel family-panel" id="bank" aria-labelledby="practice-bank-heading">
      <p className="eyebrow">03 / Practice bank</p>
      <h2 id="practice-bank-heading">Generate {moduleLabel.toLowerCase()} bank</h2>
      <p className="lede">
        {subject === "reading"
          ? `Ask Codex to mimic ${profile.nickname}’s uploaded Reading papers and the official NSW samples — invent original articles and questions, weighting about half toward Reading skills ${profile.nickname} misses most — and separately build language remediation (vocab / phrases / copywork with handwriting photo checks) from coaching notes and Passage sets.`
          : `Ask Codex to read the latest D1 inputs for ${profile.nickname}’s ${examLabel(goal)} Thinking Skills archive — blueprints, coaching reports, miscellaneous practice sources, material analyses, practice evidence and parent feedback — then add about 60 new questions (with kid-facing explanations): enough for weak-spot practice, with the rest balanced across other skills for timed papers and mixed sets.`}
      </p>
      <div className="shelf-toolbar">
        <ParentModuleSwitch profileId={profile.id} goal={goal} subject={subject} hash="bank" />
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
            Mimics uploaded Passage sets + official samples, biases new stems toward weak Reading skills from past misses, inserts live items into reading_questions for Learner room → Reading, and saves a pack summary into Reading evidence.
          </p>
          <AskCodexBankButton
            profileId={profile.id}
            goal={goal}
            subject="reading"
            task="remediation"
            disabled={materialCount === 0}
            label="Ask Codex for Reading remediation & copywork"
          />
          <p className="meta">
            Diagnoses likely misunderstandings, lists vocab/phrases with meanings, sets handwriting drills, and explains how to
            upload writing photos for Codex to cross-check.
          </p>
        </>
      ) : (
        <AskCodexBankButton
          profileId={profile.id}
          goal={goal}
          subject={subject}
          disabled={materialCount === 0}
        />
      )}

      {materialCount === 0 ? (
        <p className="meta">
          Add coaching reports or practice-question sources in the {moduleLabel} resource shelf below first.
        </p>
      ) : (
        <p className="meta">
          {materialCount} {moduleLabel.toLowerCase()} shelf source{materialCount === 1 ? "" : "s"} ready for this archive.
          Paste the copied task into a Codex chat in this gritroom repo.
        </p>
      )}

      {subject === "thinking" ? (
        <div className="family-subsection">
          <h3>Review incorrect attempts</h3>
          <p className="meta">
            After practice, ask Codex to write personalised kid-facing notes for incorrect answers that still need a review.
            Those notes appear in the learner room and under practice evidence.
          </p>
          <AskCodexAttemptReviewButton profileId={profile.id} goal={goal} disabled={pendingReviews === 0} />
          <p className="meta">
            {pendingReviews === 0
              ? "No incorrect attempts are waiting for a Codex review in this archive."
              : `${pendingReviews} incorrect attempt${pendingReviews === 1 ? "" : "s"} waiting for a Codex review.`}
          </p>
        </div>
      ) : (
        <div className="family-subsection">
          <h3>After copywork</h3>
          <p className="meta">
            Upload handwriting photos to Resources with Passage set <code>Handwriting · …</code> (page N of M), then run
            remediation again so Codex can mark progress. Full learner Reading practice will use these packs later.
          </p>
        </div>
      )}
    </section>
  );
}
