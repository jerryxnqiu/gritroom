import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialsForCodexBank } from "@/lib/material-analysis";
import { countIncorrectAttemptsNeedingReview } from "@/lib/practice";
import { AskCodexAttemptReviewButton } from "./AskCodexAttemptReviewButton";
import { AskCodexBankButton } from "./AskCodexBankButton";

export async function PracticeBankPanel({
  profile,
  goal,
  userId,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  userId: string;
}) {
  const [shelf, pendingReviews] = await Promise.all([
    listMaterialsForCodexBank(env.DB, profile.id, goal, userId),
    countIncorrectAttemptsNeedingReview(env.DB, profile.id, goal, userId),
  ]);
  const materialCount = shelf?.materials.length ?? 0;

  return (
    <section className="panel family-panel" id="bank" aria-labelledby="practice-bank-heading">
      <p className="eyebrow">03 / Practice bank</p>
      <h2 id="practice-bank-heading">Generate practice bank</h2>
      <p className="lede">
        Ask Codex to read the latest D1 inputs for {profile.nickname}’s {examLabel(goal)} archive — blueprints,
        coaching reports, miscellaneous practice sources, material analyses, practice evidence and parent feedback —
        then add about 60 new questions (with kid-facing explanations): enough for weak-spot practice, with the rest
        balanced across other skills for timed papers and mixed sets.
      </p>
      <div className="shelf-toolbar">
        <nav className="shelf-actions" aria-label="Practice bank archive">
          {(["selective", "oc"] as const).map((archive) => (
            <Link
              key={archive}
              className={archive === goal ? "button" : "button secondary"}
              aria-current={archive === goal ? "true" : undefined}
              href={`/parent?child=${encodeURIComponent(profile.id)}&shelfGoal=${archive}#bank`}
            >
              {examLabel(archive)}
            </Link>
          ))}
        </nav>
      </div>
      <AskCodexBankButton profileId={profile.id} goal={goal} disabled={materialCount === 0} />
      {materialCount === 0 ? (
        <p className="meta">Add coaching reports or practice-question sources in the resource shelf below first.</p>
      ) : (
        <p className="meta">
          {materialCount} shelf source{materialCount === 1 ? "" : "s"} ready for this archive. Paste the copied task into a Codex chat in this gritroom repo.
        </p>
      )}

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
    </section>
  );
}
