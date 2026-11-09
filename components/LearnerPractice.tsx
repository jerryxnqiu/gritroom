"use client";

import { useEffect, useState, useTransition } from "react";

import type {
  PracticeAttemptView,
  PracticeMode,
  PracticeResultSessionSummary,
  PracticeSessionView,
} from "@/lib/practice";
import { LearnerResults } from "./LearnerResults";
import { useLearnerSection, type LearnerSection } from "./LearnerSectionContext";

type Profile = { id: string; examGoal: "selective" | "oc"; nickname: string };
type Phase = "hub" | "question";

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

export function LearnerPractice({
  initialSession,
  initialRemainingCount,
  initialResultSessions,
  initialResultsHasMore = false,
  profile,
}: {
  initialSession: PracticeSessionView | null;
  initialRemainingCount: number;
  initialResultSessions: PracticeResultSessionSummary[];
  initialResultsHasMore?: boolean;
  profile: Profile;
}) {
  const { section, setSection } = useLearnerSection();
  const paper = timedPaperSpec(profile.examGoal);
  const [session, setSession] = useState(initialSession);
  const [remainingCount, setRemainingCount] = useState(initialRemainingCount);
  const [phase, setPhase] = useState<Phase>("hub");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [selected, setSelected] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [draftNotes, setDraftNotes] = useState("");
  const [review, setReview] = useState<PracticeAttemptView | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [timedIndex, setTimedIndex] = useState(0);

  const open = session?.attempts.find((item) => !item.finalizedAt) ?? null;
  const timed = session?.mode === "timed";
  const active = Boolean(session && session.status === "active");
  const answered = session?.attempts.filter((item) => item.finalizedAt) ?? [];
  const total = session?.attempts.length ?? 0;
  const left = session?.attempts.filter((item) => !item.finalizedAt).length ?? 0;
  const timedAnswered = session?.attempts.filter((item) => Boolean(item.selectedOption)).length ?? 0;
  const timedCurrent = timed && session ? session.attempts[timedIndex] ?? null : null;
  const current = review || (timed ? timedCurrent : open);
  const questionNumber = current && session
    ? session.attempts.findIndex((item) => item.id === current.id) + 1
    : answered.length + 1;
  const canStartPractice = remainingCount > 0 && !active;
  const canStartTimed = remainingCount >= paper.questions && !active;
  const inQuestion = phase === "question" && Boolean(current) && (active || Boolean(review));
  const sectionForActive = session?.mode === "timed" ? "timed" : "practice";

  useEffect(() => {
    if (review || !current) return;
    setStartedAt(Date.now());
    setSelected(current.selectedOption || "");
    setConfidence(current.confidence ?? 3);
    setDraftNotes(current.draftNotes || "");
  }, [current?.id, current?.selectedOption, current?.confidence, current?.draftNotes, review]);

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

  function go(next: LearnerSection, options?: { keepQuestion?: boolean }) {
    setStatus(undefined);
    if (!options?.keepQuestion && (next !== sectionForActive || !active)) {
      setPhase("hub");
      setReview(null);
    }
    setSection(next);
  }

  function jumpTimed(index: number) {
    if (!session || !timed) return;
    const next = Math.max(0, Math.min(session.attempts.length - 1, index));
    setTimedIndex(next);
    setStatus(undefined);
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
        setTimedIndex(0);
        go(mode === "timed" ? "timed" : "practice", { keepQuestion: true });
        setPhase("question");
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not start practice.", error: true });
      }
    });
  }

  function saveDailyAnswer() {
    if (!session || !open || !selected || review || timed) return;
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
        setReview(data.attempt);
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not save your answer.", error: true });
      }
    });
  }

  function saveTimedAnswer(then?: "stay" | "next") {
    if (!session || !timedCurrent || !selected || timedCurrent.finalizedAt) return;
    setStatus(undefined);
    const elapsed = Math.max(0, Date.now() - startedAt);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/practice/sessions/${encodeURIComponent(session.id)}/attempts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              draft: true,
              attemptId: timedCurrent.id,
              selectedOption: selected,
              timeMs: elapsed,
            }),
          },
        );
        const data = await response.json() as {
          session?: PracticeSessionView;
          attempt?: PracticeAttemptView;
          error?: string;
        };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not save your answer.");
        setSession(data.session);
        setStartedAt(Date.now());
        if (then === "next" && timedIndex < data.session.attempts.length - 1) {
          setTimedIndex(timedIndex + 1);
        } else {
          setStatus({ text: "Answer saved. You can go back and change it before you submit the paper." });
        }
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not save your answer.", error: true });
      }
    });
  }

  function submitPaper() {
    if (!session || !timed) return;
    setStatus(undefined);
    startTransition(async () => {
      try {
        if (selected && timedCurrent && selected !== (timedCurrent.selectedOption || "")) {
          const response = await fetch(
            `/api/practice/sessions/${encodeURIComponent(session.id)}/attempts`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                draft: true,
                attemptId: timedCurrent.id,
                selectedOption: selected,
                timeMs: Math.max(0, Date.now() - startedAt),
              }),
            },
          );
          const draft = await response.json() as { session?: PracticeSessionView; error?: string };
          if (!response.ok || !draft.session) throw new Error(draft.error || "Could not save your answer.");
          setSession(draft.session);
        }
        const response = await fetch(
          `/api/practice/sessions/${encodeURIComponent(session.id)}/submit`,
          { method: "POST" },
        );
        const data = await response.json() as {
          session?: PracticeSessionView;
          remainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not submit the paper.");
        setSession(data.session);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        setPhase("hub");
        go("results");
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not submit the paper.", error: true });
      }
    });
  }

  function pauseForLater() {
    setReview(null);
    setPhase("hub");
    setStatus({ text: "Paused. Your answers are saved — continue when you are ready." });
  }

  function resumeTimed() {
    if (!session) return;
    const firstBlank = session.attempts.findIndex((item) => !item.selectedOption);
    setTimedIndex(firstBlank >= 0 ? firstBlank : 0);
    setStatus(undefined);
    setPhase("question");
  }

  const sectionNav = (
    <nav className="practice-section-nav" aria-label="Practice sections">
      {([
        ["practice", "Practice"],
        ["timed", "Timed paper"],
        ["results", "Last results"],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={section === value ? "button" : "button secondary"}
          aria-current={section === value ? "page" : undefined}
          onClick={() => go(value)}
        >
          {label}
        </button>
      ))}
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
            {timed
              ? ` · ${timedAnswered} answered`
              : left > 0 ? ` · ${left} left` : ""}
            {timed && remainingSeconds !== null ? ` · ${formatClock(remainingSeconds)} left` : ""}
          </p>
          {timed && remainingSeconds !== null ? (
            <p className={`practice-timer${remainingSeconds <= 5 * 60 ? " is-low" : ""}${timeUp ? " is-up" : ""}`} role="timer" aria-live="polite">
              {timeUp
                ? "Time is up — check your answers, then submit the paper."
                : `Paper time left · ${formatClock(remainingSeconds)}`}
            </p>
          ) : null}

          {timed && session ? (
            <div className="practice-question-nav" role="navigation" aria-label="Jump to question">
              {session.attempts.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`practice-q-chip${index === timedIndex ? " is-current" : ""}${item.selectedOption ? " is-answered" : ""}`}
                  aria-current={index === timedIndex ? "true" : undefined}
                  aria-label={`Question ${index + 1}${item.selectedOption ? ", answered" : ", unanswered"}`}
                  disabled={pending}
                  onClick={() => jumpTimed(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
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
          ) : (
            <p className="meta">
              You can jump back to any question and change answers until you submit the paper. Correct answers stay hidden until then.
            </p>
          )}
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
            ) : timed ? (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending || timedIndex === 0}
                  onClick={() => jumpTimed(timedIndex - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending || !selected}
                  onClick={() => saveTimedAnswer(timedIndex < total - 1 ? "next" : "stay")}
                >
                  {timedIndex < total - 1 ? "Save & next" : "Save answer"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending || timedIndex >= total - 1}
                  onClick={() => jumpTimed(timedIndex + 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending || timedAnswered < total}
                  onClick={submitPaper}
                >
                  Submit paper{timedAnswered < total ? ` · ${total - timedAnswered} left` : ""}
                </button>
              </>
            ) : (
              <button type="button" className="button" disabled={pending || !selected} onClick={saveDailyAnswer}>
                Save answer
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
    return (
      <>
        {sectionNav}
        <LearnerResults
          initialSessions={initialResultSessions}
          initialHasMore={initialResultsHasMore}
        />
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
              {timed
                ? `${timedAnswered} of ${total} answered. You can still jump back and change answers before submitting.`
                : answered.length === 0
                  ? `This practice still has all ${total} question${total === 1 ? "" : "s"} waiting — none are saved yet.`
                  : `Saved progress: ${answered.length} of ${total} done. Next up is question ${answered.length + 1} of ${total} (${left} left).`}
              {wantTimed && remainingSeconds !== null ? ` · ${formatClock(remainingSeconds)} left on the clock.` : ""}
            </p>
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={pending}
                onClick={() => timed ? resumeTimed() : (setStatus(undefined), setPhase("question"))}
              >
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
              {paper.questions} questions · {paper.minutes} minutes. Move between questions freely, change answers anytime, then submit once at the end.
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
