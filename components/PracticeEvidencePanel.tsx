import { env } from "cloudflare:workers";

import type { ExamGoal, ParentProfile } from "@/lib/family";
import { examLabel } from "@/lib/family";
import {
  listReadingRemediationPlans,
  listSucceededMaterialEvidence,
} from "@/lib/material-analysis";
import type { PracticeResultSessionSummary } from "@/lib/practice";
import { readShelf } from "@/lib/resource-shelf";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { listWritingMarks, WRITING_TOTAL_MAX } from "@/lib/writing-mark";
import { listWritingPrompts } from "@/lib/writing-prompt";
import { CollapsibleSection } from "./CollapsedList";
import { PracticeEvidence } from "./PracticeEvidence";
import { ReadingLanguagePack } from "./ReadingLanguagePack";
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
  const [analyses, shelf, remediationPlans, writingMarks, writingPrompts] = await Promise.all([
    listSucceededMaterialEvidence(env.DB, profile.id, goal, userId, subject),
    readShelf(env.DB, profile.id, goal, userId, subject),
    subject === "reading"
      ? listReadingRemediationPlans(env.DB, profile.id, goal, userId)
      : Promise.resolve([]),
    subject === "writing"
      ? listWritingMarks(env.DB, profile.id, goal, userId, 40)
      : Promise.resolve([]),
    subject === "writing"
      ? listWritingPrompts(env.DB, profile.id, goal, userId, 20)
      : Promise.resolve([]),
  ]);
  const feedback = shelf.feedback.map(({ id, body, createdAt }) => ({ id, body, createdAt }));

  return (
    <section className="panel family-panel" id="evidence" aria-labelledby="practice-evidence-heading">
      <p className="eyebrow">05 / Practice evidence</p>
      <h2 id="practice-evidence-heading">{moduleLabel} evidence</h2>
      <p className="lede">
        {subject === "reading"
          ? `Codex findings, vocabulary / phrase lists from remediation, and parent feedback for ${profile.nickname}’s ${examLabel(goal)} Reading shelf. Attempt papers appear below when Reading practice sessions are finished.`
          : subject === "writing"
            ? `Writing marks (/${WRITING_TOTAL_MAX}), kid notes, shelf findings and parent feedback for ${profile.nickname}’s ${examLabel(goal)} Writing archive.`
            : `Codex findings from ${profile.nickname}’s ${examLabel(goal)} ${moduleLabel} coaching reports, plus bird’s-eye scores for finished practice papers. Open a paper for the full question, options, and review.`}
      </p>

      {subject === "reading" ? (
        <div className="family-subsection">
          <h3>Reading repair — words, copywork & photo check</h3>
          <ReadingLanguagePack
            audience="parent"
            nickname={profile.nickname}
            plans={remediationPlans.map((plan) => ({
              id: plan.id,
              summary: plan.summary,
              createdAt: plan.createdAt,
              refId: plan.refId,
              sourcePapers: plan.sourcePapers,
            }))}
            limit={5}
          />
        </div>
      ) : null}

      {subject === "writing" ? (
        <>
          <div className="family-subsection">
            <h3>Assigned Writing prompts</h3>
            {writingPrompts.length ? (
              <ul className="progress-session-list">
                {writingPrompts.map((prompt) => (
                  <li key={prompt.id}>
                    <details className="practice-result-attempt">
                      <summary>
                        <span className="practice-result-session-title">
                          {prompt.title}
                          {prompt.status === "active" ? " · active" : " · archived"}
                        </span>
                        <span className="meta">
                          {prompt.minutes} min
                          {prompt.form ? ` · ${prompt.form}` : ""}
                          {prompt.focusSkill ? ` · ${prompt.focusSkill}` : ""}
                          {" · "}
                          {prompt.createdAt.slice(0, 10)}
                        </span>
                      </summary>
                      <div className="knowledge-detail">
                        {prompt.brief.split(/\n+/).map((paragraph) => (
                          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                        ))}
                        {prompt.whyThisPrompt ? (
                          <p className="meta"><strong>Why this prompt.</strong> {prompt.whyThisPrompt}</p>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No assigned prompts yet. Ask Codex for Writing prompts / marks.</p>
            )}
          </div>
          <div className="family-subsection">
            <h3>Writing marks (existing pieces)</h3>
            {writingMarks.length ? (
              <ul className="progress-session-list">
                {writingMarks.map((mark) => (
                  <li key={mark.id}>
                    <details className="practice-result-attempt">
                      <summary>
                        <span className="practice-result-session-title">
                          {mark.promptTitle || "Writing mark"}
                          {" · "}
                          {mark.total}/{WRITING_TOTAL_MAX}
                        </span>
                        <span className="meta">
                          Task {mark.scores.taskResponse}/5 · Organisation {mark.scores.organisation}/5 · Language{" "}
                          {mark.scores.languageControl}/5 · {mark.createdAt.slice(0, 10)}
                        </span>
                      </summary>
                      <div className="knowledge-detail">
                        {mark.kidNotes ? <p>{mark.kidNotes}</p> : null}
                        {mark.nextFocus ? <p className="meta"><strong>Next focus.</strong> {mark.nextFocus}</p> : null}
                        {mark.weakest ? <p className="meta"><strong>Weakest.</strong> {mark.weakest}</p> : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No Writing marks yet. Upload a draft and ask Codex to mark it.</p>
            )}
          </div>
        </>
      ) : null}

      <CollapsibleSection title="Shelf findings">
        <SubjectFindingsPanel
          nickname={profile.nickname}
          archiveLabel={examLabel(goal)}
          moduleLabel={moduleLabel}
          analyses={analyses}
          feedback={feedback}
        />
      </CollapsibleSection>

      {subject !== "writing" && (subject === "thinking" || subject === "mathematics" || subject === "reading" || sessions.length > 0) ? (
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
