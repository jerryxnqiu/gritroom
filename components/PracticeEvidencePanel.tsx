import { env } from "cloudflare:workers";

import type { ExamGoal, ParentProfile } from "@/lib/family";
import { examLabel } from "@/lib/family";
import { listSucceededMaterialEvidence } from "@/lib/material-analysis";
import type { PracticeResultSessionSummary } from "@/lib/practice";
import { readShelf } from "@/lib/resource-shelf";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { PracticeEvidence } from "./PracticeEvidence";
import { SubjectFindingsPanel } from "./SubjectFindingsPanel";

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
  const [analyses, shelf] = await Promise.all([
    listSucceededMaterialEvidence(env.DB, profile.id, goal, userId, subject),
    readShelf(env.DB, profile.id, goal, userId, subject),
  ]);
  const feedback = shelf.feedback.map(({ id, body, createdAt }) => ({ id, body, createdAt }));

  return (
    <section className="panel family-panel" id="evidence" aria-labelledby="practice-evidence-heading">
      <p className="eyebrow">05 / Practice evidence</p>
      <h2 id="practice-evidence-heading">{moduleLabel} evidence</h2>
      <p className="lede">
        {subject === "reading"
          ? `Codex findings, practice packs, remediation / copywork, and parent feedback for ${profile.nickname}’s ${examLabel(goal)} Reading shelf. Attempt papers appear below when Reading practice sessions are finished.`
          : `Codex findings from ${profile.nickname}’s ${examLabel(goal)} Thinking Skills coaching reports, plus bird’s-eye scores for finished practice papers. Open a paper for the full question, options, and review.`}
      </p>

      <div className="family-subsection">
        <h3>Shelf findings</h3>
        <SubjectFindingsPanel
          nickname={profile.nickname}
          archiveLabel={examLabel(goal)}
          moduleLabel={moduleLabel}
          analyses={analyses}
          feedback={feedback}
        />
      </div>

      {subject === "thinking" || sessions.length > 0 ? (
        <div className="family-subsection">
          <h3>Practice papers</h3>
          <PracticeEvidence
            profileId={profile.id}
            goal={goal}
            subject={subject}
            initialSessions={sessions}
            initialHasMore={hasMore}
          />
        </div>
      ) : null}
    </section>
  );
}
