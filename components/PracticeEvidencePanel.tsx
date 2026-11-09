import type { ExamGoal, ParentProfile } from "@/lib/family";
import { examLabel } from "@/lib/family";
import type { PracticeResultSessionSummary } from "@/lib/practice";
import { PracticeEvidence } from "./PracticeEvidence";

export function PracticeEvidencePanel({
  profile,
  goal,
  sessions,
  hasMore,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  sessions: PracticeResultSessionSummary[];
  hasMore: boolean;
}) {
  return (
    <section className="panel family-panel" id="evidence" aria-labelledby="practice-evidence-heading">
      <p className="eyebrow">05 / Practice evidence</p>
      <h2 id="practice-evidence-heading">Practice evidence</h2>
      <p className="lede">
        Bird’s-eye scores for {profile.nickname}’s {examLabel(goal)} papers on the left. Open one for the full question,
        options, and review — especially useful when revisiting incorrect answers.
      </p>
      <PracticeEvidence
        profileId={profile.id}
        goal={goal}
        initialSessions={sessions}
        initialHasMore={hasMore}
      />
    </section>
  );
}
