"use client";

import { useMemo, useState } from "react";

import type { PracticeEvidenceItem, PracticeEvidenceSession } from "@/lib/practice";

type Filter = "incorrect" | "all";

function formatTime(timeMs: number | null) {
  if (timeMs === null) return "—";
  const seconds = Math.round(timeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  return "Focused practice";
}

function AttemptCard({ item }: { item: PracticeEvidenceItem }) {
  return (
    <li className="shelf-item practice-evidence-attempt">
      <div>
        {item.imageKey ? (
          <p className="practice-figure">
            <img src={`/api/practice/attempts/${encodeURIComponent(item.id)}/image`} alt="Question figure" />
          </p>
        ) : null}
        <p className="shelf-copy">{item.prompt}</p>
        <p className="meta">
          <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
            {item.isCorrect
              ? `Correct · answered ${item.selectedOption}`
              : `Incorrect · answered ${item.selectedOption} · correct answer ${item.correctOption}`}
          </strong>
          {item.blueprintTitle ? ` · ${item.blueprintTitle}` : ""}
          {item.skill ? ` · ${item.skill}` : ""}
        </p>
        <p className="meta">
          Confidence {item.confidence ?? "—"}/5 · {formatTime(item.timeMs)} · {item.finalizedAt.slice(0, 10)}
        </p>
        {item.draftNotes ? <p className="shelf-notes shelf-copy">{item.draftNotes}</p> : null}
        {item.attemptReviewEn ? (
          <p className="shelf-notes shelf-copy"><strong>Codex review · </strong>{item.attemptReviewEn}</p>
        ) : item.explanationEn ? (
          <p className="shelf-notes shelf-copy"><strong>Explanation · </strong>{item.explanationEn}</p>
        ) : !item.isCorrect ? (
          <p className="meta">No Codex review yet — use Ask Codex to review incorrect attempts.</p>
        ) : null}
      </div>
    </li>
  );
}

export function PracticeEvidence({ sessions }: { sessions: PracticeEvidenceSession[] }) {
  const [filter, setFilter] = useState<Filter>("incorrect");

  const visible = useMemo(() => {
    return sessions
      .map((session) => {
        const attempts = filter === "incorrect"
          ? session.attempts.filter((item) => !item.isCorrect)
          : session.attempts;
        return { session, attempts };
      })
      .filter((row) => row.attempts.length > 0);
  }, [sessions, filter]);

  if (!sessions.length) {
    return (
      <p className="meta">
        No practice answers yet. When your child completes a starting-point check or focused practice, each question’s answer, time, confidence and notes appear here.
      </p>
    );
  }

  const incorrectTotal = sessions.reduce((sum, session) => sum + session.incorrect, 0);

  return (
    <div className="practice-evidence">
      <div className="practice-evidence-filters" role="group" aria-label="Practice evidence filter">
        <button
          type="button"
          className={filter === "incorrect" ? "button" : "button secondary"}
          aria-pressed={filter === "incorrect"}
          onClick={() => setFilter("incorrect")}
        >
          Incorrect only{incorrectTotal ? ` · ${incorrectTotal}` : ""}
        </button>
        <button
          type="button"
          className={filter === "all" ? "button" : "button secondary"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All answers
        </button>
      </div>

      {filter === "incorrect" && incorrectTotal === 0 ? (
        <p className="meta">No incorrect answers in the recent practice sessions.</p>
      ) : null}

      <div className="practice-evidence-sessions">
        {visible.map(({ session, attempts }, index) => {
          const when = (session.completedAt || session.startedAt).slice(0, 10);
          return (
            <details
              key={session.id}
              className="practice-evidence-session"
              open={index === 0}
            >
              <summary>
                <span className="practice-evidence-session-title">
                  {modeLabel(session.mode)}
                  {session.status === "abandoned" ? " · abandoned" : ""}
                </span>
                <span className="meta">
                  {session.correct} of {session.total} correct
                  {session.incorrect ? ` · ${session.incorrect} incorrect` : ""}
                  {" · "}
                  {when}
                </span>
              </summary>
              <ul className="shelf-items">
                {attempts.map((item) => <AttemptCard key={item.id} item={item} />)}
              </ul>
            </details>
          );
        })}
      </div>
      {sessions.length >= 20 ? (
        <p className="meta">Showing the {sessions.length} most recent practice sessions.</p>
      ) : null}
    </div>
  );
}
