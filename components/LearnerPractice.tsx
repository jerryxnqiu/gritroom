"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

import type { PracticeAttemptView, PracticeMode, PracticeSessionView } from "@/lib/practice";

type Profile = { id: string; examGoal: "selective" | "oc"; nickname: string };
type Phase = "hub" | "question";
type Section = "practice" | "timed" | "results";

function timedPaperSpec(goal: Profile["examGoal"]) {
  return goal === "oc"
    ? { questions: 30, minutes: 30, label: "30-question timed paper" }
    : { questions: 40, minutes: 40, label: "40-question timed paper" };
}

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  return "Practice";
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseSection(hash: string, session: PracticeSessionView | null): Section {
  const value = hash.replace(/^#/, "");
  if (value === "timed" || value === "practice" || value === "results") return value;
  if (session?.status === "active") return session.mode === "timed" ? "timed" : "practice";
  if (session) return "results";
  return "practice";
}

export function LearnerPractice({
  initialSession,
  initialRemainingCount,
  profile,
}: {
  initialSession: PracticeSessionView | null;
  initialRemainingCount: number;
  profile: Profile;
}) {
  const paper = timedPaperSpec(profile.examGoal);
  const [session, setSession] = useState(initialSession);
  const [remainingCount, setRemainingCount] = useState(initialRemainingCount);
  const [section, setSection] = useState<Section>(() => parseSection("", initialSession));
  const [phase, setPhase] = useState<Phase>("hub");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [selected, setSelected] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [draftNotes, setDraftNotes] = useState("");
  const [review, setReview] = useState<PracticeAttemptView | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const open = session?.attempts.find((item) => !item.finalizedAt) ?? null;
  const current = review || open;
  const finished = Boolean(session && session.status !== "active");
  const active = Boolean(session && session.status === "active");
  const answered = session?.attempts.filter((item) => item.finalizedAt) ?? [];
  const total = session?.attempts.length ?? 0;
  const left = session?.attempts.filter((item) => !item.finalizedAt).length ?? 0;
  const questionNumber = current && session
    ? session.attempts.findIndex((item) => item.id === current.id) + 1
    : answered.length + 1;
  const canStartPractice = remainingCount > 0 && !active;
  const canStartTimed = remainingCount >= paper.questions && !active;
  const timed = session?.mode === "timed";
  const inQuestion = phase === "question" && Boolean(current) && (active || Boolean(review));
  const sectionForActive = session?.mode === "timed" ? "timed" : "practice";

  useEffect(() => {
    function sync() {
      setSection(parseSection(window.location.hash, session));
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [session]);

  useEffect(() => {
    if (review) return;
    setStartedAt(Date.now());
    setSelected("");
    setConfidence(3);
    setDraftNotes("");
  }, [open?.id, review]);

  useEffect(() => {
    if (!session || session.mode !== "timed" || session.status !== "active") {
      setRemainingSeconds(null);
      return;
    }
    const endsAt = Date.parse(session.startedAt) + timedPaperSpec(session.examGoal).minutes * 60_000;
    function tick() {
      setRemainingSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.mode, session?.status, session?.startedAt, session?.examGoal]);

  function go(next: Section) {
    setSection(next);
    setStatus(undefined);
    if (next !== sectionForActive || !active) setPhase("hub");
    const hash = `#${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }

  function start(mode: PracticeMode) {
    if (mode === "timed" ? !canStartTimed : !canStartPractice) return;
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
        go(mode === "timed" ? "timed" : "practice");
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
              timeMs: Math.max(0, Date.now() - startedAt),
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
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        if (data.session.mode === "timed") {
          const stillOpen = data.session.attempts.some((item) => !item.finalizedAt);
          setReview(null);
          if (!stillOpen) {
            setPhase("hub");
            go("results");
          }
        } else {
          setReview(data.attempt);
        }
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

  const sectionNav = (
    <nav className="practice-section-nav" aria-label="Practice sections">
      <Link
        href="#practice"
        className={section === "practice" ? "button" : "button secondary"}
        aria-current={section === "practice" ? "page" : undefined}
        onClick={(event) => { event.preventDefault(); go("practice"); }}
      >
        Practice
      </Link>
      <Link
        href="#timed"
        className={section === "timed" ? "button" : "button secondary"}
        aria-current={section === "timed" ? "page" : undefined}
        onClick={(event) => { event.preventDefault(); go("timed"); }}
      >
        Timed paper
      </Link>
      <Link
        href="#results"
        className={section === "results" ? "button" : "button secondary"}
        aria-current={section === "results" ? "page" : undefined}
        onClick={(event) => { event.preventDefault(); go("results"); }}
      >
        Last results
      </Link>
    </nav>
  );

  if (inQuestion && section === sectionForActive) {
    const timeUp = timed && remainingSeconds === 0;
    return (
      <>
        {sectionNav}
        <section className="panel practice-panel" aria-labelledby="practice-heading" aria-busy={pending}>
          <p className="eyebrow">
            {modeLabel(session!.mode)}
            {" · "}
            Question {questionNumber} of {total}
            {left > 0 ? ` · ${left} left` : ""}
            {timed && remainingSeconds !== null ? ` · ${formatClock(remainingSeconds)} left` : ""}
          </p>
          {timed && remainingSeconds !== null ? (
            <p className={`practice-timer${remainingSeconds <= 5 * 60 ? " is-low" : ""}${timeUp ? " is-up" : ""}`} role="timer" aria-live="polite">
              {timeUp ? "Time is up — finish this question, then see results." : `Paper time left · ${formatClock(remainingSeconds)}`}
            </p>
          ) : null}
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
          {!timed ? (
            <>
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
            </>
          ) : null}
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
                  if (!moreOpen) {
                    setPhase("hub");
                    go("results");
                  }
                }}
              >
                {session!.attempts.some((item) => !item.finalizedAt) ? "Next question" : "See results"}
              </button>
            ) : (
              <button type="button" className="button" disabled={pending || !selected} onClick={saveAnswer}>
                {timed ? "Save and continue" : "Save answer"}
              </button>
            )}
            <button type="button" className="button secondary" disabled={pending} onClick={pauseForLater}>
              Pause for later
            </button>
          </div>
          {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
        </section>
      </>
    );
  }

  if (section === "results") {
    const correct = answered.filter((item) => item.isCorrect).length;
    return (
      <>
        {sectionNav}
        <section className="panel practice-panel" aria-labelledby="practice-heading">
          {!finished || !session ? (
            <>
              <p className="eyebrow">Last results</p>
              <h2 id="practice-heading">No finished set yet.</h2>
              <p className="lede">
                When you complete a practice set or timed paper, the question-by-question review lands here.
              </p>
              <div className="actions">
                <button type="button" className="button" onClick={() => go("practice")}>Go to Practice</button>
                <button type="button" className="button secondary" onClick={() => go("timed")}>Go to Timed paper</button>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">{modeLabel(session.mode)} complete</p>
              <h2 id="practice-heading">Nice work.</h2>
              <p className="lede">
                You answered {correct} of {total} correctly. Your family can also review this under practice evidence.
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
              <div className="actions practice-start-actions">
                <button type="button" className="button" onClick={() => go("practice")}>Start another practice</button>
                <button type="button" className="button secondary" onClick={() => go("timed")}>Open timed paper</button>
              </div>
            </>
          )}
          {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
        </section>
      </>
    );
  }

  const wantTimed = section === "timed";
  const activeHere = active && ((wantTimed && timed) || (!wantTimed && !timed));
  const activeElsewhere = active && !activeHere;

  return (
    <>
      {sectionNav}
      <section className="panel practice-panel" aria-labelledby="practice-heading">
        <p className="eyebrow">{wantTimed ? "Timed paper" : "Practice"}</p>
        {activeHere ? (
          <>
            <h2 id="practice-heading">Continue where you left off.</h2>
            <p className="lede">
              {answered.length === 0
                ? `This ${wantTimed ? "paper" : "practice"} still has all ${total} question${total === 1 ? "" : "s"} waiting — none are saved yet.`
                : `Saved progress: ${answered.length} of ${total} done. Next up is question ${answered.length + 1} of ${total} (${left} left).`}
              {wantTimed && remainingSeconds !== null ? ` · ${formatClock(remainingSeconds)} left on the clock.` : ""}
            </p>
            <div className="actions">
              <button type="button" className="button" disabled={pending} onClick={() => { setStatus(undefined); setPhase("question"); }}>
                Continue {wantTimed ? "paper" : "practice"}
              </button>
            </div>
          </>
        ) : activeElsewhere ? (
          <>
            <h2 id="practice-heading">Finish your open set first.</h2>
            <p className="lede">
              You still have an open {timed ? "timed paper" : "practice set"}. Pause or finish it before starting something new.
            </p>
            <div className="actions">
              <button type="button" className="button" onClick={() => go(sectionForActive)}>
                Go to {timed ? "Timed paper" : "Practice"}
              </button>
            </div>
          </>
        ) : wantTimed ? (
          <>
            <h2 id="practice-heading">Sit a full Thinking Skills paper.</h2>
            <p className="lede">
              {paper.questions} questions · {paper.minutes} minutes. Answers save as you go; reviews wait until the end.
            </p>
            <div className="actions practice-start-actions">
              <button
                type="button"
                className="button"
                disabled={pending || !canStartTimed}
                onClick={() => start("timed")}
              >
                Start {paper.label}
              </button>
              {!canStartTimed ? (
                <p className="meta">
                  Needs {paper.questions} unused questions ({remainingCount} ready). Use Practice for a short set, or ask your family to refresh the bank.
                </p>
              ) : (
                <p className="meta">{remainingCount} unused questions ready in the bank.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="practice-heading">A short practice set.</h2>
            <p className="lede">
              Five unused questions with a quick review after each answer. Your family can see the detail later.
            </p>
            <div className="actions practice-start-actions">
              {canStartPractice ? (
                <>
                  <button type="button" className="button" disabled={pending} onClick={() => start("daily")}>
                    Practice · 5 questions
                  </button>
                  <p className="meta">{remainingCount} unused questions ready in the bank.</p>
                </>
              ) : (
                <p className="meta">
                  You have finished every practice question available right now. Ask your family to refresh the practice bank when they are ready.
                </p>
              )}
            </div>
          </>
        )}
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    </>
  );
}
