import { env } from "cloudflare:workers";

import type { ExamGoal, ParentProfile } from "@/lib/family";
import { examLabel } from "@/lib/family";
import { listSucceededMaterialEvidence } from "@/lib/material-analysis";
import type { PracticeResultSessionSummary } from "@/lib/practice";
import { readShelf } from "@/lib/resource-shelf";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { PracticeEvidence } from "./PracticeEvidence";
import { ReadingEvidencePanel } from "./ReadingEvidencePanel";

export async function PracticeEvidencePanel({
  profile,
  goal,
  subject,
  userId,
  sessions,
  hasMore,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  subject: PracticeSubject;
  userId: string;
  sessions: PracticeResultSessionSummary[];
  hasMore: boolean;
}) {
  const moduleLabel = subjectLabel(subject);

  if (subject === "reading") {
    const [analyses, shelf] = await Promise.all([
      listSucceededMaterialEvidence(env.DB, profile.id, goal, userId, "reading"),
      readShelf(env.DB, profile.id, goal, userId, "reading"),
    ]);
    return (
      <section className="panel family-panel" id="evidence" aria-labelledby="practice-evidence-heading">
        <p className="eyebrow">05 / Practice evidence</p>
        <h2 id="practice-evidence-heading">{moduleLabel} evidence</h2>
        <p className="lede">
          Codex findings, practice packs, remediation / copywork plans, and parent feedback for {profile.nickname}’s{" "}
          {examLabel(goal)} Reading shelf. Attempt papers will join this view when learner Reading practice is live.
        </p>
        <ReadingEvidencePanel
          nickname={profile.nickname}
          archiveLabel={examLabel(goal)}
          analyses={analyses}
          feedback={shelf.feedback.map(({ id, body, createdAt }) => ({ id, body, createdAt }))}
        />
      </section>
    );
  }

  return (
    <section className="panel family-panel" id="evidence" aria-labelledby="practice-evidence-heading">
      <p className="eyebrow">05 / Practice evidence</p>
      <h2 id="practice-evidence-heading">{moduleLabel} evidence</h2>
      <p className="lede">
        Bird’s-eye scores for {profile.nickname}’s {examLabel(goal)} {moduleLabel} papers on the left. Open one for
        the full question, options, and review — especially useful when revisiting incorrect answers.
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
