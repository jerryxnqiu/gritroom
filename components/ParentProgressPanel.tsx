"use client";

import type { PracticeResultSessionSummary } from "@/lib/practice";
import { useParentSection } from "./ParentSectionContext";

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  if (mode === "focus") return "Weak-spot practice";
  return "Practice";
}

export function ParentProgressPanel({
  nickname,
  archiveLabel,
  unusedCount,
  sessions,
}: {
  nickname: string;
  archiveLabel: string;
  unusedCount: number;
  sessions: PracticeResultSessionSummary[];
}) {
  const { setSection } = useParentSection();
  const completed = sessions.filter((item) => item.status === "completed");
  const answered = completed.reduce((sum, item) => sum + item.total, 0);
  const correct = completed.reduce((sum, item) => sum + item.correct, 0);
  const accuracy = answered ? Math.round((correct / answered) * 100) : null;
  const recent = sessions.slice(0, 8);

  return (
    <section className="panel family-panel" id="progress" aria-labelledby="progress-heading">
      <p className="eyebrow">01 / Progress</p>
      <h2 id="progress-heading">{nickname}’s practice snapshot</h2>
      <p className="lede">
        Bank balance and recent scores for the {archiveLabel} archive. Open Evidence for the bird’s-eye list and question detail.
      </p>

      <div className="progress-stat-row" role="list">
        <div className="progress-stat" role="listitem">
          <span className="eyebrow">Unused questions</span>
          <strong>{unusedCount}</strong>
          <span className="meta">Ready for practice or a timed paper</span>
        </div>
        <div className="progress-stat" role="listitem">
          <span className="eyebrow">Recent papers</span>
          <strong>{completed.length}</strong>
          <span className="meta">In this overview window</span>
        </div>
        <div className="progress-stat" role="listitem">
          <span className="eyebrow">Accuracy</span>
          <strong>{accuracy === null ? "—" : `${accuracy}%`}</strong>
          <span className="meta">
            {answered ? `${correct} of ${answered} recent answers` : "No finished answers yet"}
          </span>
        </div>
      </div>

      {recent.length ? (
        <>
          <h3 className="progress-session-heading">Recent sessions</h3>
          <ul className="progress-session-list">
            {recent.map((session) => {
              const when = (session.completedAt || session.startedAt).slice(0, 10);
              const pct = session.total ? Math.round((session.correct / session.total) * 100) : 0;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    className="progress-session-card"
                    onClick={() => setSection("evidence")}
                  >
                    <span className="practice-result-session-title">
                      {modeLabel(session.mode)}
                      {session.status === "abandoned" ? " · abandoned" : ""}
                    </span>
                    <span className="meta">
                      {session.correct} of {session.total} correct · {pct}%
                      {session.incorrect ? ` · ${session.incorrect} incorrect` : ""}
                      {" · "}
                      {when}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button type="button" className="button secondary" onClick={() => setSection("evidence")}>
              Open practice evidence
            </button>
          </div>
        </>
      ) : (
        <p className="meta">No finished practice sessions in this archive yet.</p>
      )}
    </section>
  );
}
