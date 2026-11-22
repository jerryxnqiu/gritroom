import type { WritingMark } from "@/lib/writing-mark";
import { WRITING_TOTAL_MAX } from "@/lib/writing-mark";
import type { WritingPrompt } from "@/lib/writing-prompt";

export function WritingTaskPanel({
  nickname,
  minutes,
  prompt,
  pastMarks,
}: {
  nickname: string;
  minutes: number;
  prompt: WritingPrompt | null;
  pastMarks: WritingMark[];
}) {
  return (
    <div className="writing-task-panel">
      {prompt ? (
        <article className="writing-active-prompt" aria-labelledby="writing-prompt-heading">
          <p className="eyebrow">Your Writing task</p>
          <h2 id="writing-prompt-heading">{prompt.title}</h2>
          <p className="meta">
            {prompt.minutes || minutes} minutes
            {prompt.form ? ` · ${prompt.form}` : ""}
            {prompt.audience ? ` · for ${prompt.audience}` : ""}
            {prompt.focusSkill ? ` · focus: ${prompt.focusSkill}` : ""}
          </p>
          <div className="writing-prompt-brief">
            {prompt.brief.split(/\n+/).map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </div>
          <p className="meta">
            Plan, then write under timed conditions if you can. Give your finished draft to your family so they can
            upload it and ask Codex to mark it.
          </p>
        </article>
      ) : (
        <div>
          <h2 id="practice-heading">No Writing topic yet.</h2>
          <p className="lede">
            Ask your family to prepare a Writing prompt in Parent room. When they do, the full task will show here —
            audience, purpose, and what to write in about {minutes} minutes.
          </p>
        </div>
      )}

      {pastMarks.length ? (
        <div className="family-subsection writing-past-pieces">
          <h3>Your earlier writing</h3>
          <p className="meta">
            Recent marked pieces for {nickname} — useful to remember what worked and what to improve.
          </p>
          <ul className="progress-session-list">
            {pastMarks.slice(0, 5).map((mark) => (
              <li key={mark.id}>
                <details className="practice-result-attempt">
                  <summary>
                    <span className="practice-result-session-title">
                      {mark.promptTitle || "Writing mark"}
                      {" · "}
                      {mark.total}/{WRITING_TOTAL_MAX}
                    </span>
                    <span className="meta">{mark.createdAt.slice(0, 10)}</span>
                  </summary>
                  <div className="knowledge-detail">
                    <p className="meta">
                      Task {mark.scores.taskResponse}/5 · Organisation {mark.scores.organisation}/5 · Language{" "}
                      {mark.scores.languageControl}/5
                    </p>
                    {mark.kidNotes ? <p>{mark.kidNotes}</p> : null}
                    {mark.nextFocus ? (
                      <p className="meta">
                        <strong>Next focus.</strong> {mark.nextFocus}
                      </p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
