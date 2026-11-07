"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type { PracticeAttemptView, PracticeMode, PracticeSessionView } from "@/lib/practice";

type Profile = { id: string; examGoal: string; nickname: string };

export function LearnerPractice({
  initialSession,
  profile,
}: {
  initialSession: PracticeSessionView | null;
  profile: Profile;
}) {
  const [session, setSession] = useState(initialSession);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [selected, setSelected] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [draftNotes, setDraftNotes] = useState("");
  const [review, setReview] = useState<PracticeAttemptView | null>(null);
  const startedAt = useRef(Date.now());

  const open = session?.attempts.find((item) => !item.finalizedAt) ?? null;
  const current = review || open;
  const finished = Boolean(session && session.status !== "active" && !review);
  const answered = session?.attempts.filter((item) => item.finalizedAt) ?? [];
  const total = session?.attempts.length ?? 0;
  const index = review
    ? session!.attempts.findIndex((item) => item.id === review.id)
    : answered.length;

  useEffect(() => {
    if (review) return;
    startedAt.current = Date.now();
    setSelected("");
    setConfidence(3);
    setDraftNotes("");
  }, [open?.id, review]);

  function start(mode: PracticeMode) {
    setStatus(undefined);
    setReview(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/practice/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = await response.json() as { session?: PracticeSessionView; error?: string };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not start practice.");
        setSession(data.session);
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
          error?: string;
        };
        if (!response.ok || !data.session || !data.attempt) {
          throw new Error(data.error || "Could not save your answer.");
        }
        setSession(data.session);
        setReview(data.attempt);
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not save your answer.", error: true });
      }
    });
  }

  if (!session) {
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">Thinking Skills</p>
        <h2 id="practice-heading">Begin when you are ready.</h2>
        <p className="lede">
          Short checked questions for {profile.nickname}. Your answers, time and confidence are saved for your family room.
        </p>
        <div className="actions">
          <button type="button" className="button" disabled={pending} onClick={() => start("diagnostic")}>
            Starting-point check
          </button>
          <button type="button" className="button secondary" disabled={pending} onClick={() => start("daily")}>
            Focused practice
          </button>
        </div>
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    );
  }

  if (finished) {
    const correct = answered.filter((item) => item.isCorrect).length;
    return (
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">{session.mode === "diagnostic" ? "Starting-point check" : "Focused practice"} complete</p>
        <h2 id="practice-heading">Nice work.</h2>
        <p className="lede">
          You answered {correct} of {total} correctly. Your family can review the detail under practice evidence.
        </p>
        <ul className="practice-summary">
          {answered.map((item, itemIndex) => (
            <li key={item.id}>
              <span className="meta">Q{itemIndex + 1}</span>
              <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
                {item.isCorrect ? "Correct" : "Not yet"} · {item.selectedOption}
              </strong>
              {item.blueprintTitle ? <span className="meta">{item.blueprintTitle}</span> : null}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="button" disabled={pending} onClick={() => start("daily")}>
            Another focused practice
          </button>
          <button type="button" className="button secondary" disabled={pending} onClick={() => start("diagnostic")}>
            New starting-point check
          </button>
        </div>
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    );
  }

  return (
    <section className="panel practice-panel" aria-labelledby="practice-heading" aria-busy={pending}>
      <p className="eyebrow">
        {session.mode === "diagnostic" ? "Starting-point check" : "Focused practice"} · Question {index + 1} of {total}
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
        <p className={review.isCorrect ? "notice" : "error"} role="status">
          {review.isCorrect ? "Correct." : `Not yet. The checked answer is ${review.correctOption}.`}
          {" "}Continue when you are ready.
        </p>
      ) : null}
      <div className="actions">
        {review ? (
          <button type="button" className="button" disabled={pending} onClick={() => setReview(null)}>
            {session.attempts.some((item) => !item.finalizedAt) ? "Next question" : "See results"}
          </button>
        ) : (
          <button type="button" className="button" disabled={pending || !selected} onClick={saveAnswer}>
            Save answer
          </button>
        )}
      </div>
      {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
    </section>
  );
}
