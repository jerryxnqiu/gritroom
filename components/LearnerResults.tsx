"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type {
  PracticeEvidenceItem,
  PracticeEvidenceSession,
  PracticeResultSessionSummary,
} from "@/lib/practice";

type ModeFilter = "all" | "daily" | "timed" | "diagnostic";
type AnswerFilter = "incorrect" | "all";

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  return "Practice";
}

function AttemptRow({ item, index }: { item: PracticeEvidenceItem; index: number }) {
  const review = item.attemptReviewEn || item.explanationEn;
  return (
    <details className="practice-result-attempt">
      <summary>
        <span className="meta">Q{index + 1}</span>
        <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
          {item.isCorrect ? "Correct" : "Not yet"} · {item.selectedOption}
          {!item.isCorrect && item.correctOption ? ` · answer ${item.correctOption}` : ""}
        </strong>
        {item.blueprintTitle ? <span className="meta">{item.blueprintTitle}</span> : null}
      </summary>
      <div className="practice-result-attempt-body">
        <p className="shelf-copy">{item.prompt}</p>
        {item.imageKey ? (
          <p className="practice-figure">
            <img src={`/api/practice/attempts/${encodeURIComponent(item.id)}/image`} alt="Question figure" />
          </p>
        ) : null}
        {review ? (
          <p className="shelf-notes shelf-copy">{review}</p>
        ) : !item.isCorrect ? (
          <p className="meta">A fuller review will appear after your family asks Codex to review this miss.</p>
        ) : null}
      </div>
    </details>
  );
}

export function LearnerResults({
  initialSessions,
  initialHasMore = false,
}: {
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

  useEffect(() => {
    if (openId && !details[openId]) openSessionDetail(openId);
    // Prefetch the first listed paper once on mount / after filter reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function loadList(mode: ModeFilter, offset: number, append: boolean) {
    setStatus(undefined);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          mode,
          offset: String(offset),
          limit: "10",
        });
        const response = await fetch(`/api/practice/results?${params}`);
        const data = await response.json() as {
          sessions?: PracticeResultSessionSummary[];
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok || !data.sessions) {
          throw new Error(data.error || "Could not load results.");
        }
        setSessions((current) => append ? [...current, ...data.sessions!] : data.sessions!);
        setHasMore(Boolean(data.hasMore));
        setModeFilter(mode);
        if (!append) {
          setOpenId(data.sessions[0]?.id ?? null);
        }
      } catch (error) {
        setStatus({
          text: error instanceof Error ? error.message : "Could not load results.",
          error: true,
        });
      }
    });
  }

  function openSessionDetail(sessionId: string) {
    setOpenId(sessionId);
    if (details[sessionId]) return;
    setStatus(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/practice/results/${encodeURIComponent(sessionId)}`);
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

  if (!sessions.length && modeFilter === "all" && !pending) {
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">Last results</p>
        <h2 id="practice-heading">No finished set yet.</h2>
        <p className="lede">
          When you complete a practice set or timed paper, each paper appears here as its own card — open one to review.
        </p>
      </section>
    );
  }

  return (
    <section className="panel practice-panel" aria-labelledby="practice-heading" aria-busy={pending}>
      <p className="eyebrow">Last results</p>
      <h2 id="practice-heading">Your past papers.</h2>
      <p className="lede">
        Browse by paper, not by every question at once. Open one session, then focus on misses or scan all answers.
      </p>

      <div className="practice-evidence-filters" role="group" aria-label="Result mode filter">
        {([
          ["all", "All"],
          ["daily", "Practice"],
          ["timed", "Timed"],
          ["diagnostic", "Starting-point"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={modeFilter === value ? "button" : "button secondary"}
            aria-pressed={modeFilter === value}
            disabled={pending}
            onClick={() => loadList(value, 0, false)}
          >
            {label}
          </button>
        ))}
      </div>

      {!sessions.length ? (
        <p className="meta">No sessions in this filter yet.</p>
      ) : (
        <div className="practice-result-layout">
          <ul className="practice-result-sessions">
            {sessions.map((session) => {
              const when = (session.completedAt || session.startedAt).slice(0, 10);
              const selected = openId === session.id;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    className={`practice-result-session${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => openSessionDetail(session.id)}
                  >
                    <span className="practice-result-session-title">{modeLabel(session.mode)}</span>
                    <span className="meta">
                      {session.correct} of {session.total} correct
                      {session.incorrect ? ` · ${session.incorrect} to review` : ""}
                      {" · "}
                      {when}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="practice-result-detail">
            {!openId ? (
              <p className="meta">Choose a paper on the left to review it.</p>
            ) : !openSession ? (
              <p className="meta">Loading that paper…</p>
            ) : (
              <>
                <div className="practice-result-detail-head">
                  <div>
                    <p className="eyebrow">{modeLabel(openSession.mode)} complete</p>
                    <h3>{openSession.correct} of {openSession.total} correct</h3>
                  </div>
                  <div className="practice-evidence-filters" role="group" aria-label="Answer filter">
                    <button
                      type="button"
                      className={answerFilter === "incorrect" ? "button" : "button secondary"}
                      aria-pressed={answerFilter === "incorrect"}
                      onClick={() => setAnswerFilter("incorrect")}
                    >
                      Misses{openSession.incorrect ? ` · ${openSession.incorrect}` : ""}
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
                </div>

                {answerFilter === "incorrect" && openSession.incorrect === 0 ? (
                  <p className="meta">No misses in this paper — nice.</p>
                ) : (
                  <div className="practice-result-attempts">
                    {visibleAttempts.map((item) => {
                      const index = openSession.attempts.findIndex((attempt) => attempt.id === item.id);
                      return <AttemptRow key={item.id} item={item} index={index} />;
                    })}
                  </div>
                )}
              </>
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
            onClick={() => loadList(modeFilter, sessions.length, true)}
          >
            Load older papers
          </button>
        </div>
      ) : sessions.length > 0 ? (
        <p className="meta" style={{ marginTop: "1rem" }}>
          Showing {sessions.length} paper{sessions.length === 1 ? "" : "s"}.
        </p>
      ) : null}

      {status ? (
        <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
