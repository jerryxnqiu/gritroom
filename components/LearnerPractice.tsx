"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { LearnerCoachTip } from "@/lib/material-analysis";
import type {
  PracticeAttemptView,
  PracticeMode,
  PracticeResultSessionSummary,
  PracticeSessionView,
} from "@/lib/practice";
import {
  buildReadingArticleBlocks,
  readingArticleForIndex,
} from "@/lib/reading-articles";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";
import type { WritingMark } from "@/lib/writing-mark";
import type { WritingPrompt } from "@/lib/writing-prompt";
import { LearnerCoachTips } from "./LearnerCoachTips";
import { LearnerResults } from "./LearnerResults";
import { PracticePrompt } from "./PracticePrompt";
import { useLearnerSection, type LearnerSection } from "./LearnerSectionContext";
import { WritingTaskPanel } from "./WritingTaskPanel";

const WARN_10_SECONDS = 10 * 60;
const WARN_5_SECONDS = 5 * 60;

type Profile = { id: string; examGoal: "selective" | "oc"; nickname: string };
type Phase = "hub" | "question";

function thinkingTimedPaperSpec(goal: Profile["examGoal"]) {
  return goal === "oc"
    ? { questions: 30, minutes: 30, label: "30-question timed paper" }
    : { questions: 40, minutes: 40, label: "40-question timed paper" };
}

function readingTimedPaperSpec(goal: Profile["examGoal"]) {
  return goal === "oc"
    ? { questions: 33, minutes: 40, label: "33-answer timed Reading paper" }
    : { questions: 38, minutes: 45, label: "38-answer timed Reading paper" };
}

function mathematicsTimedPaperSpec() {
  return { questions: 35, minutes: 40, label: "35-question timed Mathematics paper" };
}

function timedPaperForSubject(subject: PracticeSubject, goal: Profile["examGoal"]) {
  if (subject === "reading") return readingTimedPaperSpec(goal);
  if (subject === "mathematics") return mathematicsTimedPaperSpec();
  if (subject === "writing") return { questions: 1, minutes: 30, label: "30-minute Writing task" };
  return thinkingTimedPaperSpec(goal);
}

/** Whole-set allowance: timed papers use official minutes; short sets are 1 min × question count. */
function sessionClockMinutes(session: PracticeSessionView) {
  if (session.mode === "timed") {
    return timedPaperForSubject(session.subject, session.examGoal).minutes;
  }
  return Math.max(1, session.attempts.length);
}

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  if (mode === "focus") return "Weak-spot practice";
  return "Practice";
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LearnerPractice({
  subject = "thinking",
  initialSession,
  initialRemainingCount,
  initialWeakRemainingCount = 0,
  initialResultSessions,
  initialResultsHasMore = false,
  initialCoachTips = [],
  initialWritingPrompt = null,
  initialWritingMarks = [],
  profile,
}: {
  subject?: PracticeSubject;
  initialSession: PracticeSessionView | null;
  initialRemainingCount: number;
  initialWeakRemainingCount?: number;
  initialResultSessions: PracticeResultSessionSummary[];
  initialResultsHasMore?: boolean;
  initialCoachTips?: LearnerCoachTip[];
  initialWritingPrompt?: WritingPrompt | null;
  initialWritingMarks?: WritingMark[];
  profile: Profile;
}) {
  const { section, setSection } = useLearnerSection();
  const reading = subject === "reading";
  const mathematics = subject === "mathematics";
  const writing = subject === "writing";
  const paper = timedPaperForSubject(subject, profile.examGoal);
  const [session, setSession] = useState(initialSession);
  const [remainingCount, setRemainingCount] = useState(initialRemainingCount);
  const [weakRemainingCount, setWeakRemainingCount] = useState(initialWeakRemainingCount);
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
  const warned10Ref = useRef(false);
  const warned5Ref = useRef(false);
  const forceExitRef = useRef(false);

  const open = session?.attempts.find((item) => !item.finalizedAt) ?? null;
  const timed = session?.mode === "timed";
  const active = Boolean(session && session.status === "active");
  const timedTimeUp = timed && active && remainingSeconds === 0;
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
  const canStartFocus = (subject === "thinking" || subject === "mathematics")
    && weakRemainingCount > 0
    && !active;
  const canStartTimed = !active && remainingCount >= paper.questions;
  const inQuestion = phase === "question" && Boolean(current) && (active || Boolean(review));
  const sectionForActive = session?.mode === "timed" ? "timed" : "practice";
  const readingArticles = useMemo(
    () => (reading && session ? buildReadingArticleBlocks(session.attempts) : []),
    [reading, session],
  );
  const currentReadingArticle = reading && session
    ? readingArticleForIndex(
      readingArticles,
      Math.max(0, (current ? session.attempts.findIndex((item) => item.id === current.id) : timedIndex)),
    )
    : null;
  const currentArticleIndex = currentReadingArticle
    ? readingArticles.findIndex((block) => block.key === currentReadingArticle.key)
    : -1;

  useEffect(() => {
    if (review || !current) return;
    setStartedAt(Date.now());
    setSelected(current.selectedOption || "");
    setConfidence(current.confidence ?? 3);
    setDraftNotes(current.draftNotes || "");
  }, [current?.id, current?.selectedOption, current?.confidence, current?.draftNotes, review]);

  useEffect(() => {
    warned10Ref.current = false;
    warned5Ref.current = false;
    forceExitRef.current = false;
  }, [session?.id]);

  useEffect(() => {
    if (!session || session.status !== "active") {
      setRemainingSeconds(null);
      return;
    }
    const endsAt = Date.parse(session.startedAt) + sessionClockMinutes(session) * 60_000;
    function tick() {
      setRemainingSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.mode, session?.status, session?.startedAt, session?.examGoal, session?.subject, session?.attempts.length]);

  useEffect(() => {
    if (!session || session.status !== "active" || session.mode !== "timed") return;
    if (remainingSeconds === null) return;

    if (remainingSeconds <= WARN_10_SECONDS && remainingSeconds > WARN_5_SECONDS && !warned10Ref.current) {
      warned10Ref.current = true;
      setStatus({ text: "10 minutes left on this paper." });
    } else if (remainingSeconds <= WARN_5_SECONDS && remainingSeconds > 0 && !warned5Ref.current) {
      warned5Ref.current = true;
      setStatus({ text: "5 minutes left on this paper." });
    }

    if (remainingSeconds === 0 && !forceExitRef.current) {
      forceExitRef.current = true;
      setStatus({ text: "Time is up — submitting your paper now." });
      submitPaper({ force: true });
    }
    // submitPaper reads latest session/selection via closure on each render; fire only once per session via forceExitRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, session?.id, session?.status, session?.mode]);

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
    if (mode === "timed" && !canStartTimed) return;
    if (mode === "focus" && !canStartFocus) return;
    if ((mode === "daily" || mode === "diagnostic") && !canStartPractice) return;
    setStatus(undefined);
    setReview(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/practice/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode, subject }),
        });
        const data = await response.json() as {
          session?: PracticeSessionView;
          remainingCount?: number;
          weakRemainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not start practice.");
        setSession(data.session);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        if (typeof data.weakRemainingCount === "number") setWeakRemainingCount(data.weakRemainingCount);
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
          weakRemainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session || !data.attempt) {
          throw new Error(data.error || "Could not save your answer.");
        }
        setSession(data.session);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        if (typeof data.weakRemainingCount === "number") setWeakRemainingCount(data.weakRemainingCount);
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

  function submitPaper(options: { force?: boolean } = {}) {
    if (!session || !timed) return;
    const force = Boolean(options.force);
    if (!force) setStatus(undefined);
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
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ force }),
          },
        );
        const data = await response.json() as {
          session?: PracticeSessionView;
          remainingCount?: number;
          weakRemainingCount?: number;
          error?: string;
        };
        if (!response.ok || !data.session) throw new Error(data.error || "Could not submit the paper.");
        setSession(data.session);
        if (typeof data.remainingCount === "number") setRemainingCount(data.remainingCount);
        if (typeof data.weakRemainingCount === "number") setWeakRemainingCount(data.weakRemainingCount);
        setPhase("hub");
        go("results");
        if (force) {
          setStatus({ text: "Time ran out — your paper was submitted with the answers you had saved." });
        }
      } catch (error) {
        if (force) forceExitRef.current = false;
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
        ["tips", "Coach tips"],
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
    const timeUp = remainingSeconds === 0;
    const timerWarn10 = timed && remainingSeconds !== null && remainingSeconds <= WARN_10_SECONDS && remainingSeconds > WARN_5_SECONDS;
    const timerLow = remainingSeconds !== null && remainingSeconds <= (timed ? WARN_5_SECONDS : 60);
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
          </p>
          {remainingSeconds !== null ? (
            <div
              className={`practice-timer${timed ? " is-float" : ""}${timerWarn10 ? " is-warn" : ""}${timerLow ? " is-low" : ""}${timeUp ? " is-up" : ""}`}
              role="timer"
              aria-live="polite"
            >
              {timeUp ? (
                <span className="practice-timer-label">
                  {timed
                    ? "Time is up — submitting your paper now. Unanswered questions count as misses."
                    : "Time is up for this set — finish any open questions, then continue to results."}
                </span>
              ) : (
                <>
                  <div className="practice-timer-copy">
                    <span className="practice-timer-kicker">Clock</span>
                    <span className="practice-timer-label">
                      {timed
                        ? timerLow
                          ? "5 minutes or less left"
                          : timerWarn10
                            ? "10 minutes or less left"
                            : "Paper time left"
                        : "Set time left"}
                    </span>
                  </div>
                  <span className="practice-timer-clock">{formatClock(remainingSeconds)}</span>
                </>
              )}
            </div>
          ) : null}

          {timed && session ? (
            reading && readingArticles.length ? (
              <div className="practice-article-nav" role="navigation" aria-label="Reading articles and questions">
                {readingArticles.map((block, articleIndex) => (
                  <div key={block.key} className="practice-article-block">
                    <p className={`practice-article-label${articleIndex === currentArticleIndex ? " is-current" : ""}`}>
                      Article {articleIndex + 1}
                      <span className="meta">
                        {" · "}Q{block.startIndex + 1}–{block.endIndex + 1}
                        {block.title ? ` · ${block.title}` : ""}
                      </span>
                    </p>
                    <div className="practice-question-nav">
                      {session.attempts.slice(block.startIndex, block.endIndex + 1).map((item, offset) => {
                        const index = block.startIndex + offset;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`practice-q-chip${index === timedIndex ? " is-current" : ""}${item.selectedOption ? " is-answered" : ""}`}
                            aria-current={index === timedIndex ? "true" : undefined}
                            aria-label={`Article ${articleIndex + 1}, question ${index + 1}${item.selectedOption ? ", answered" : ", unanswered"}`}
                            disabled={pending || timedTimeUp}
                            onClick={() => jumpTimed(index)}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="practice-question-nav" role="navigation" aria-label="Jump to question">
                {session.attempts.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`practice-q-chip${index === timedIndex ? " is-current" : ""}${item.selectedOption ? " is-answered" : ""}`}
                    aria-current={index === timedIndex ? "true" : undefined}
                    aria-label={`Question ${index + 1}${item.selectedOption ? ", answered" : ", unanswered"}`}
                    disabled={pending || timedTimeUp}
                    onClick={() => jumpTimed(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )
          ) : null}

          <h2 id="practice-heading">
            {reading && currentReadingArticle
              ? `Article ${currentArticleIndex + 1} of ${readingArticles.length}`
              : current?.blueprintTitle
                || (reading ? "Reading question" : mathematics ? "Mathematics question" : "Your next question")}
          </h2>
          {reading && currentReadingArticle ? (
            <p className="meta">
              {currentReadingArticle.title}
              {" · "}Q{questionNumber} of {total}
              {" · "}this article Q{currentReadingArticle.startIndex + 1}–{currentReadingArticle.endIndex + 1}
            </p>
          ) : current?.skill ? <p className="meta">{current.skill}</p> : null}
          {current?.imageKey ? (
            <p className="practice-figure">
              <img
                src={`/api/practice/attempts/${encodeURIComponent(current.id)}/image`}
                alt="Question figure"
              />
            </p>
          ) : null}
          <PracticePrompt prompt={current?.prompt} subject={subject} />
          <fieldset className="practice-options" disabled={pending || Boolean(review) || timedTimeUp}>
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
              {timedTimeUp
                ? "Time is up — this paper is being submitted. Unanswered questions count as misses."
                : reading
                  ? "Reading follows the real paper layout: finish one article’s answers together before moving on. Each article appears once. You can still jump within an article and change answers until time runs out or you submit."
                  : "You can jump back to any question and change answers until time runs out or you submit. You’ll get warnings at 10 and 5 minutes left. Correct answers stay hidden until submit."}
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
                  disabled={pending || timedTimeUp || timedIndex === 0}
                  onClick={() => jumpTimed(timedIndex - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending || timedTimeUp || !selected}
                  onClick={() => saveTimedAnswer(timedIndex < total - 1 ? "next" : "stay")}
                >
                  {timedIndex < total - 1 ? "Save & next" : "Save answer"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending || timedTimeUp || timedIndex >= total - 1}
                  onClick={() => jumpTimed(timedIndex + 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending || timedTimeUp || timedAnswered < total}
                  onClick={() => submitPaper()}
                >
                  {timedTimeUp
                    ? "Submitting…"
                    : `Submit paper${timedAnswered < total ? ` · ${total - timedAnswered} left` : ""}`}
                </button>
              </>
            ) : (
              <button type="button" className="button" disabled={pending || !selected} onClick={saveDailyAnswer}>
                Save answer
              </button>
            )}
            <button type="button" className="button secondary" disabled={pending || timedTimeUp} onClick={pauseForLater}>
              Pause for later
            </button>
          </div>
          {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
        </section>
      </>
    );
  }

  if (section === "tips") {
    return (
      <>
        {sectionNav}
        <LearnerCoachTips subject={subject} tips={initialCoachTips} />
      </>
    );
  }

  if (section === "results") {
    return (
      <>
        {sectionNav}
        <LearnerResults
          subject={subject}
          examGoal={profile.examGoal}
          initialSessions={initialResultSessions}
          initialHasMore={initialResultsHasMore}
          languageTips={initialCoachTips.filter((tip) => tip.materialKind === "reading_remediation")}
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
              {remainingSeconds !== null ? ` · ${formatClock(remainingSeconds)} left on the clock.` : ""}
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
        ) : writing ? (
          <>
            <WritingTaskPanel
              nickname={profile.nickname}
              minutes={paper.minutes}
              prompt={initialWritingPrompt}
              pastMarks={initialWritingMarks}
            />
            <div className="actions">
              <button type="button" className="button secondary" onClick={() => go("tips")}>
                Open Writing feedback
              </button>
            </div>
          </>
        ) : wantTimed ? (
          <>
            <h2 id="practice-heading">
              {reading
                ? "Sit a full Reading timed paper."
                : mathematics
                  ? "Sit a full Mathematical Reasoning paper."
                  : "Sit a full Thinking Skills paper."}
            </h2>
            <p className="lede">
              {reading
                ? `${paper.questions} answers · ${paper.minutes} minutes. Official layout: whole articles one after another (about 6–7 answers each), each article used once. Work an article’s answers together; you can still jump and change answers until time runs out or you submit. Warnings at 10 and 5 minutes left; when time ends the paper submits and unanswered items count as misses.`
                : `${paper.questions} questions · ${paper.minutes} minutes${mathematics ? " · five options (A–E)" : ""}. Move between questions freely and change answers anytime. You’ll get warnings at 10 and 5 minutes left; when time runs out the paper submits automatically and unanswered items count as misses.`}
            </p>
            <div className="actions practice-start-actions">
              <button
                type="button"
                className="button"
                disabled={pending || !canStartTimed}
                onClick={() => start("timed")}
              >
                {`Start ${paper.label}`}
              </button>
              {!canStartTimed ? (
                <p className="meta">
                  {`Needs ${paper.questions} unused ${reading ? "answers" : "questions"} (${remainingCount} ready). Use Practice for a short set, or ask your family to refresh the bank.`}
                </p>
              ) : (
                <p className="meta">{remainingCount} unused {reading ? "answers" : "questions"} ready in the bank.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="practice-heading">A short {subjectLabel(subject)} practice set.</h2>
            <p className="lede">
              {reading
                ? "Practice uses whole Reading articles (each article’s answers stay together). The set aims for about ten answers and allows one minute per answer in total, including reviews."
                : mathematics
                  ? "Do a mixed ten-question set, or practise only the Mathematics skills you miss most. The set clock allows one minute per question in total (10 questions → 10 minutes), including reviews."
                  : "Do a mixed ten-question set, or practise only the skills you miss most. The set clock allows one minute per question in total (10 questions → 10 minutes), including reviews."}
            </p>
            <div className="actions practice-start-actions">
              {canStartPractice ? (
                <button type="button" className="button" disabled={pending} onClick={() => start("daily")}>
                  Practice · up to 10 questions · timed
                </button>
              ) : (
                <p className="meta">
                  {reading
                    ? "No unused Reading questions yet. Ask your family to generate the Reading practice bank when they are ready."
                    : mathematics
                      ? "No unused Mathematics questions yet. Ask your family to generate the Mathematics practice bank when they are ready."
                      : "You have finished every practice question available right now. Ask your family to refresh the practice bank when they are ready."}
                </p>
              )}
              {subject === "thinking" || subject === "mathematics" ? (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={pending || !canStartFocus}
                    onClick={() => start("focus")}
                  >
                    Practice weak spots · up to 10 · timed
                  </button>
                  {canStartFocus ? (
                    <p className="meta">
                      {weakRemainingCount} unused question{weakRemainingCount === 1 ? "" : "s"} ready in your weak-spot skills
                      {canStartPractice ? ` · ${remainingCount} unused in the whole bank` : ""}.
                    </p>
                  ) : canStartPractice ? (
                    <p className="meta">
                      {remainingCount} unused questions ready. Weak-spot practice unlocks after a few incorrect answers, or when your family refreshes the bank for those skills.
                    </p>
                  ) : null}
                </>
              ) : canStartPractice ? (
                <p className="meta">
                  {remainingCount} unused {reading ? "Reading" : subjectLabel(subject)} question{remainingCount === 1 ? "" : "s"} ready.
                </p>
              ) : null}
            </div>
          </>
        )}
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </section>
    </>
  );
}
