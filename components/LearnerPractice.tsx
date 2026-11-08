"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type { PracticeAttemptView, PracticeMode, PracticeSessionView } from "@/lib/practice";

type Profile = { id: string; examGoal: string; nickname: string };
type Phase = "hub" | "question";

export function LearnerPractice({
  initialSession,
  initialRemainingCount,
  profile,
}: {
  initialSession: PracticeSessionView | null;
  initialRemainingCount: number;
  profile: Profile;
}) {
  const [session, setSession] = useState(initialSession);
  const [remainingCount, setRemainingCount] = useState(initialRemainingCount);
  const [phase, setPhase] = useState<Phase>("hub");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [selected, setSelected] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [draftNotes, setDraftNotes] = useState("");
  const [review, setReview] = useState<PracticeAttemptView | null>(null);
  const startedAt = useRef(Date.now());

  const open = session?.attempts.find((item) => !item.finalizedAt) ?? null;
  const current = review || open;
  const finished = Boolean(session && session.status !== "active");
  const active = Boolean(session && session.status === "active");
  const answered = session?.attempts.filter((item) => item.finalizedAt) ?? [];
  const total = session?.attempts.length ?? 0;
  const left = session?.attempts.filter((item) => !item.finalizedAt).length ?? 0;
  // Position in this practice set (not a fresh "1 of N" restart counter).
  const questionNumber = current && session
    ? session.attempts.findIndex((item) => item.id === current.id) + 1
    : answered.length + 1;
  const canStartMore = remainingCount > 0 && !active;
  // Stay on the question screen while reviewing the last answer, even after the session completes.
  const inQuestion = phase === "question" && Boolean(current) && (active || Boolean(review));

  useEffect(() => {
    if (review) return;
    startedAt.current = Date.now();
    setSelected("");
    setConfidence(3);
    setDraftNotes("");
  }, [open?.id, review]);

  function start(mode: PracticeMode) {
    if (!canStartMore) return;
    setStatus(undefined);
    setReview(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/practice/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = await response.json() as {
          session?: PracticeSessionView;
          remainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not start practice.");
        setSession(data.session);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        setPhase("question");
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not start practice.", error: true });
      }
    });
  }

  function saveAnswer() {
    if (!session || !open || !selected || review) return;
    setStatus(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/practice/sessions/${encodeURIComponent(session.id)}/attempts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              attemptId: open.id,
              selectedOption: selected,
              confidence,
              timeMs: Math.max(0, Date.now() - startedAt.current),
              draftNotes,
            }),
          },
        );
        const data = await response.json() as {
          session?: PracticeSessionView;
          attempt?: PracticeAttemptView;
          remainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session || !data.attempt) {
          throw new Error(data.error || "Could not save your answer.");
        }
        setSession(data.session);
        setReview(data.attempt);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not save your answer.", error: true });
      }
    });
  }

  function pauseForLater() {
    setReview(null);
    setPhase("hub");
    setStatus({ text: "Paused. Your answers are saved — continue when you are ready." });
  }

  function startActions() {
    if (active) return null;
    if (!canStartMore) {
      return (
        <p className="meta">
          You have finished every practice question available right now. Ask your family to refresh the practice bank when they are ready.
        </p>
      );
    }
    return (
      <div className="actions">
        <button type="button" className="button" disabled={pending} onClick={() => start("diagnostic")}>
          {session ? "New starting-point check" : "Starting-point check"}
        </button>
        <button type="button" className="button secondary" disabled={pending} onClick={() => start("daily")}>
          {session ? "Another focused practice" : "Focused practice"}
        </button>
      </div>
    );
  }

  if (inQuestion) {
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading" aria-busy={pending}>
        <p className="eyebrow">
          {session!.mode === "diagnostic" ? "Starting-point check" : "Focused practice"}
          {" · "}
          Question {questionNumber} of {total}
          {left > 0 ? ` · ${left} left in this set` : ""}
        </p>
        <h2 id="practice-heading">{current?.blueprintTitle || "Your next question"}</h2>
        {current?.skill ? <p className="meta">{current.skill}</p> : null}
        {current?.imageKey ? (
          <p className="practice-figure">
            <img
              src={`/api/practice/attempts/${encodeURIComponent(current.id)}/image`}
              alt="Question figure"
            />
          </p>
        ) : null}
        <p className="practice-prompt">{current?.prompt}</p>
        <fieldset className="practice-options" disabled={pending || Boolean(review)}>
          <legend className="field"><span>Choose an answer</span></legend>
          {Object.entries(current?.options || {}).map(([key, label]) => (
            <label key={key} className={`practice-option${selected === key ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="answer"
                value={key}
                checked={selected === key}
                onChange={() => setSelected(key)}
              />
              <span className="practice-key">{key}</span>
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>How sure are you? ({confidence}/5)</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={confidence}
            disabled={pending || Boolean(review)}
            onChange={(event) => setConfidence(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Optional working notes</span>
          <textarea
            rows={3}
            maxLength={8000}
            value={draftNotes}
            disabled={pending || Boolean(review)}
            placeholder="Jot the key step or why you ruled an option out."
            onChange={(event) => setDraftNotes(event.target.value)}
          />
        </label>
        {review ? (
          <div className="practice-review" role="status">
            <p className={review.isCorrect ? "notice" : "error"}>
              {review.isCorrect
                ? `Correct · answered ${review.selectedOption}.`
                : `Not yet · answered ${review.selectedOption} · correct answer ${review.correctOption}.`}
              {" "}Continue when you are ready.
            </p>
            {review.attemptReviewEn || review.explanationEn ? (
              <p className="shelf-copy practice-review-body">
                {review.attemptReviewEn || review.explanationEn}
              </p>
            ) : !review.isCorrect ? (
              <p className="meta">A fuller review for this miss will appear after your family asks Codex to review incorrect attempts.</p>
            ) : null}
          </div>
        ) : null}
        <div className="actions">
          {review ? (
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={() => {
                const moreOpen = session!.attempts.some((item) => !item.finalizedAt);
                setReview(null);
                if (!moreOpen) setPhase("hub");
              }}
            >
              {session!.attempts.some((item) => !item.finalizedAt) ? "Next question" : "See results"}
            </button>
          ) : (
            <button type="button" className="button" disabled={pending || !selected} onClick={saveAnswer}>
              Save answer
            </button>
          )}
          <button type="button" className="button secondary" disabled={pending} onClick={pauseForLater}>
            Pause for later
          </button>
        </div>
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    );
  }

  if (active) {
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">
          {session!.mode === "diagnostic" ? "Starting-point check" : "Focused practice"} · in progress
        </p>
        <h2 id="practice-heading">Continue where you left off.</h2>
        <p className="lede">
          {answered.length === 0
            ? `This practice still has all ${total} question${total === 1 ? "" : "s"} waiting — none are saved yet. Your progress stays saved once you answer.`
            : `Saved progress: ${answered.length} of ${total} done. Next up is question ${answered.length + 1} of ${total} (${left} left). You will not repeat the ones already saved.`}
        </p>
        <div className="actions">
          <button type="button" className="button" disabled={pending} onClick={() => { setStatus(undefined); setPhase("question"); }}>
            Continue practice
          </button>
        </div>
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    );
  }

  if (finished && session) {
    const correct = answered.filter((item) => item.isCorrect).length;
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">{session.mode === "diagnostic" ? "Starting-point check" : "Focused practice"} complete</p>
        <h2 id="practice-heading">Nice work.</h2>
        <p className="lede">
          You answered {correct} of {total} correctly. Your family can review the detail under practice evidence.
          {canStartMore
            ? ` ${remainingCount} question${remainingCount === 1 ? "" : "s"} still waiting if you want another round.`
            : " There are no new practice questions left until your family refreshes the bank."}
        </p>
        <ul className="practice-summary">
          {answered.map((item, itemIndex) => (
            <li key={item.id}>
              <span className="meta">Q{itemIndex + 1}</span>
              <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
                {item.isCorrect ? "Correct" : "Not yet"} · {item.selectedOption}
              </strong>
              {item.blueprintTitle ? <span className="meta">{item.blueprintTitle}</span> : null}
              {!item.isCorrect && (item.attemptReviewEn || item.explanationEn) ? (
                <p className="shelf-copy practice-review-body">
                  {item.attemptReviewEn || item.explanationEn}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {startActions()}
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    );
  }

  return (
    <section className="panel practice-panel" aria-labelledby="practice-heading">
      <p className="eyebrow">Thinking Skills</p>
      <h2 id="practice-heading">Begin when you are ready.</h2>
      <p className="lede">
        Short checked questions for {profile.nickname}. Your answers, time and confidence are saved for your family room.
        {canStartMore ? ` ${remainingCount} question${remainingCount === 1 ? "" : "s"} waiting.` : ""}
      </p>
      {startActions()}
      {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
    </section>
  );
}
