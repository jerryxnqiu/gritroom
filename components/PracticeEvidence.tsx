"use client";

import { useMemo, useState, useTransition } from "react";

import type { ExamGoal } from "@/lib/family";
import type { PracticeEvidenceItem, PracticeEvidenceSession } from "@/lib/practice";

type AnswerFilter = "incorrect" | "all";
type ModeFilter = "all" | "daily" | "timed" | "diagnostic";

function formatTime(timeMs: number | null) {
  if (timeMs === null) return "—";
  const seconds = Math.round(timeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  return "Practice";
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

export function PracticeEvidence({
  profileId,
  goal,
  initialSessions,
  initialHasMore = false,
}: {
  profileId: string;
  goal: ExamGoal;
  initialSessions: PracticeEvidenceSession[];
  initialHasMore?: boolean;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("incorrect");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();

  const visible = useMemo(() => {
    return sessions
      .map((session) => {
        const attempts = answerFilter === "incorrect"
          ? session.attempts.filter((item) => !item.isCorrect)
          : session.attempts;
        return { session, attempts };
      })
      .filter((row) => row.attempts.length > 0);
  }, [sessions, answerFilter]);

  function load(mode: ModeFilter, offset: number, append: boolean) {
    setStatus(undefined);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          profileId,
          goal,
          mode,
          offset: String(offset),
          limit: "20",
        });
        const response = await fetch(`/api/practice/evidence?${params}`);
        const data = await response.json() as {
          sessions?: PracticeEvidenceSession[];
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok || !data.sessions) {
          throw new Error(data.error || "Could not load practice evidence.");
        }
        setSessions((current) => append ? [...current, ...data.sessions!] : data.sessions!);
        setHasMore(Boolean(data.hasMore));
        setModeFilter(mode);
      } catch (error) {
        setStatus({
          text: error instanceof Error ? error.message : "Could not load practice evidence.",
          error: true,
        });
      }
    });
  }

  if (!sessions.length && modeFilter === "all" && !pending) {
    return (
      <p className="meta">
        No practice answers yet. When your child completes a practice set or timed paper, each question’s answer, time, confidence and notes appear here.
      </p>
    );
  }

  const incorrectTotal = sessions.reduce((sum, session) => sum + session.incorrect, 0);

  return (
    <div className="practice-evidence">
      <div className="practice-evidence-filters" role="group" aria-label="Practice evidence filters">
        <button
          type="button"
          className={modeFilter === "all" ? "button" : "button secondary"}
          aria-pressed={modeFilter === "all"}
          disabled={pending}
          onClick={() => load("all", 0, false)}
        >
          All modes
        </button>
        <button
          type="button"
          className={modeFilter === "daily" ? "button" : "button secondary"}
          aria-pressed={modeFilter === "daily"}
          disabled={pending}
          onClick={() => load("daily", 0, false)}
        >
          Practice
        </button>
        <button
          type="button"
          className={modeFilter === "timed" ? "button" : "button secondary"}
          aria-pressed={modeFilter === "timed"}
          disabled={pending}
          onClick={() => load("timed", 0, false)}
        >
          Timed papers
        </button>
        <button
          type="button"
          className={modeFilter === "diagnostic" ? "button" : "button secondary"}
          aria-pressed={modeFilter === "diagnostic"}
          disabled={pending}
          onClick={() => load("diagnostic", 0, false)}
        >
          Starting-point
        </button>
      </div>

      <div className="practice-evidence-filters" role="group" aria-label="Answer filter">
        <button
          type="button"
          className={answerFilter === "incorrect" ? "button" : "button secondary"}
          aria-pressed={answerFilter === "incorrect"}
          onClick={() => setAnswerFilter("incorrect")}
        >
          Incorrect only{incorrectTotal ? ` · ${incorrectTotal}` : ""}
        </button>
        <button
          type="button"
          className={answerFilter === "all" ? "button" : "button secondary"}
          aria-pressed={answerFilter === "all"}
          onClick={() => setAnswerFilter("all")}
        >
          All answers
        </button>
      </div>

      {!sessions.length ? (
        <p className="meta">No sessions in this mode filter yet.</p>
      ) : null}

      {answerFilter === "incorrect" && sessions.length > 0 && incorrectTotal === 0 ? (
        <p className="meta">No incorrect answers in these practice sessions.</p>
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

      {hasMore ? (
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => load(modeFilter, sessions.length, true)}
          >
            Load older sessions
          </button>
        </div>
      ) : sessions.length > 0 ? (
        <p className="meta">Showing {sessions.length} practice session{sessions.length === 1 ? "" : "s"}.</p>
      ) : null}

      {status ? (
        <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
