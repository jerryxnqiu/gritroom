"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type { ExamGoal } from "@/lib/family";
import type {
  PracticeEvidenceItem,
  PracticeEvidenceSession,
  PracticeResultSessionSummary,
} from "@/lib/practice";

type AnswerFilter = "incorrect" | "all";
type ModeFilter = "all" | "daily" | "timed" | "diagnostic" | "focus";

function formatTime(timeMs: number | null) {
  if (timeMs === null) return "—";
  const seconds = Math.round(timeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  if (mode === "focus") return "Weak-spot practice";
  return "Practice";
}

function AttemptDetail({ item, index }: { item: PracticeEvidenceItem; index: number }) {
  const optionEntries = Object.entries(item.options || {});
  return (
    <article className={`practice-evidence-attempt-card${item.isCorrect ? "" : " is-miss"}`}>
      <header>
        <span className="meta">Q{index + 1}</span>
        <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
          {item.isCorrect
            ? `Correct · answered ${item.selectedOption}`
            : `Incorrect · answered ${item.selectedOption} · correct ${item.correctOption}`}
        </strong>
        {item.blueprintTitle ? <span className="meta">{item.blueprintTitle}</span> : null}
        {item.skill ? <span className="meta">{item.skill}</span> : null}
      </header>

      {item.imageKey ? (
        <p className="practice-figure">
          <img src={`/api/practice/attempts/${encodeURIComponent(item.id)}/image`} alt="Question figure" />
        </p>
      ) : null}
      <p className="shelf-copy practice-prompt">{item.prompt}</p>

      {optionEntries.length ? (
        <ul className="practice-evidence-options">
          {optionEntries.map(([key, label]) => {
            const selected = key === item.selectedOption;
            const correct = key === item.correctOption;
            return (
              <li
                key={key}
                className={`practice-evidence-option${selected ? " is-selected" : ""}${correct ? " is-correct" : ""}`}
              >
                <span className="practice-key">{key}</span>
                <span>{label}</span>
                {selected && !item.isCorrect ? <span className="meta">Chosen</span> : null}
                {correct ? <span className="meta">Correct</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="meta">
        Confidence {item.confidence ?? "—"}/5 · {formatTime(item.timeMs)} · {item.finalizedAt.slice(0, 10)}
      </p>
      {item.draftNotes ? <p className="shelf-notes shelf-copy"><strong>Working notes · </strong>{item.draftNotes}</p> : null}
      {item.attemptReviewEn ? (
        <p className="shelf-notes shelf-copy"><strong>Codex review · </strong>{item.attemptReviewEn}</p>
      ) : item.explanationEn ? (
        <p className="shelf-notes shelf-copy"><strong>Explanation · </strong>{item.explanationEn}</p>
      ) : !item.isCorrect ? (
        <p className="meta">No Codex review yet — use Ask Codex to review incorrect attempts.</p>
      ) : null}
    </article>
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
  initialSessions: PracticeResultSessionSummary[];
  initialHasMore?: boolean;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("incorrect");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [openId, setOpenId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [details, setDetails] = useState<Record<string, PracticeEvidenceSession>>({});
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();

  const openSession = details[openId || ""] ?? null;
  const visibleAttempts = useMemo(() => {
    if (!openSession) return [];
    return answerFilter === "incorrect"
      ? openSession.attempts.filter((item) => !item.isCorrect)
      : openSession.attempts;
  }, [openSession, answerFilter]);

  function openSessionDetail(sessionId: string) {
    setOpenId(sessionId);
    if (details[sessionId]) return;
    setStatus(undefined);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ profileId, goal });
        const response = await fetch(
          `/api/practice/evidence/${encodeURIComponent(sessionId)}?${params}`,
        );
        const data = await response.json() as {
          session?: PracticeEvidenceSession;
          error?: string;
        };
        if (!response.ok || !data.session) {
          throw new Error(data.error || "Could not open that session.");
        }
        setDetails((current) => ({ ...current, [sessionId]: data.session! }));
      } catch (error) {
        setStatus({
          text: error instanceof Error ? error.message : "Could not open that session.",
          error: true,
        });
      }
    });
  }

  useEffect(() => {
    if (openId && !details[openId]) openSessionDetail(openId);
    // Prefetch first listed paper once on mount / after filter reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

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
          sessions?: PracticeResultSessionSummary[];
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok || !data.sessions) {
          throw new Error(data.error || "Could not load practice evidence.");
        }
        setSessions((current) => append ? [...current, ...data.sessions!] : data.sessions!);
        setHasMore(Boolean(data.hasMore));
        setModeFilter(mode);
        if (!append) {
          setOpenId(data.sessions[0]?.id ?? null);
          setDetails({});
        }
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
        No practice answers yet. When your child completes a practice set or timed paper, each paper appears here as a score card — open one for the question detail.
      </p>
    );
  }

  const birdIncorrect = sessions.reduce((sum, session) => sum + session.incorrect, 0);

  return (
    <div className="practice-evidence">
      <div className="practice-evidence-filters" role="group" aria-label="Practice evidence filters">
        {([
          ["all", "All modes"],
          ["daily", "Practice"],
          ["timed", "Timed papers"],
          ["diagnostic", "Starting-point"],
          ["focus", "Weak spots"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={modeFilter === value ? "button" : "button secondary"}
            aria-pressed={modeFilter === value}
            disabled={pending}
            onClick={() => load(value, 0, false)}
          >
            {label}
          </button>
        ))}
      </div>

      {!sessions.length ? (
        <p className="meta">No sessions in this mode filter yet.</p>
      ) : (
        <div className="practice-result-layout">
          <div>
            <p className="eyebrow">Bird’s-eye</p>
            <ul className="practice-result-sessions">
              {sessions.map((session) => {
                const when = (session.completedAt || session.startedAt).slice(0, 10);
                const selected = openId === session.id;
                const pct = session.total ? Math.round((session.correct / session.total) * 100) : 0;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`practice-result-session${selected ? " is-selected" : ""}`}
                      aria-pressed={selected}
                      disabled={pending}
                      onClick={() => openSessionDetail(session.id)}
                    >
                      <span className="practice-result-session-title">
                        {modeLabel(session.mode)}
                        {session.status === "abandoned" ? " · abandoned" : ""}
                      </span>
                      <span className="meta">
                        {session.correct}/{session.total} · {pct}%
                        {session.incorrect ? ` · ${session.incorrect} miss` : ""}
                        {" · "}
                        {when}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="practice-result-detail">
            <div className="practice-result-detail-head">
              <div>
                <p className="eyebrow">Detail</p>
                {!openSession ? (
                  <h3>{openId ? "Loading…" : "Choose a paper"}</h3>
                ) : (
                  <h3>
                    {modeLabel(openSession.mode)} · {openSession.correct} of {openSession.total}
                  </h3>
                )}
              </div>
              {openSession ? (
                <div className="practice-evidence-filters" role="group" aria-label="Answer filter">
                  <button
                    type="button"
                    className={answerFilter === "incorrect" ? "button" : "button secondary"}
                    aria-pressed={answerFilter === "incorrect"}
                    onClick={() => setAnswerFilter("incorrect")}
                  >
                    Incorrect{openSession.incorrect ? ` · ${openSession.incorrect}` : ""}
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
              ) : null}
            </div>

            {!openId ? (
              <p className="meta">Select a session on the left to review questions, options and explanations.</p>
            ) : !openSession ? (
              <p className="meta">Loading that paper…</p>
            ) : answerFilter === "incorrect" && openSession.incorrect === 0 ? (
              <p className="meta">No incorrect answers in this paper.</p>
            ) : (
              <div className="practice-evidence-attempt-list">
                {visibleAttempts.map((item) => {
                  const index = openSession.attempts.findIndex((attempt) => attempt.id === item.id);
                  return <AttemptDetail key={item.id} item={item} index={index} />;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {hasMore ? (
        <div className="actions" style={{ marginTop: "1rem" }}>
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
        <p className="meta" style={{ marginTop: "1rem" }}>
          Showing {sessions.length} session{sessions.length === 1 ? "" : "s"}
          {birdIncorrect ? ` · ${birdIncorrect} incorrect across this list` : ""}.
        </p>
      ) : null}

      {status ? (
        <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
