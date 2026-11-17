"use client";

import type { LearnerCoachTip } from "@/lib/material-analysis";
import type { PracticeResultSessionSummary } from "@/lib/practice";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { LearnerCoachTips } from "./LearnerCoachTips";
import { LearnerResults } from "./LearnerResults";
import { useLearnerSection } from "./LearnerSectionContext";

export function CoachView({
  subject,
  examGoal,
  nickname,
  profileId,
  initialResultSessions,
  initialResultsHasMore = false,
  initialCoachTips = [],
}: {
  subject: PracticeSubject;
  examGoal: "selective" | "oc";
  nickname: string;
  profileId: string;
  initialResultSessions: PracticeResultSessionSummary[];
  initialResultsHasMore?: boolean;
  initialCoachTips?: LearnerCoachTip[];
}) {
  const { section } = useLearnerSection();
  const readingTips = subject === "reading" ? initialCoachTips : [];

  return (
    <div className="learner-practice">
      <p className="meta coach-readonly-note">
        Read-only coaching view for <strong>{nickname}</strong> · {subjectLabel(subject)}.
        You can review results and tips; practice papers stay with the learner.
      </p>

      <section
        id="results"
        className={`practice-panel${section === "results" ? " is-active-section" : ""}`}
        hidden={section !== "results"}
        aria-labelledby="coach-results-heading"
      >
        <div className="practice-panel-copy">
          <p className="eyebrow">Last results</p>
          <h2 id="coach-results-heading">How the papers went</h2>
          <p className="meta">Same review layout the learner sees — scores, misses, and skill breakdowns.</p>
        </div>
        <LearnerResults
          subject={subject}
          examGoal={examGoal}
          initialSessions={initialResultSessions}
          initialHasMore={initialResultsHasMore}
          languageTips={readingTips}
          audience="coach"
          nickname={nickname}
          profileId={profileId}
        />
      </section>

      <section
        id="tips"
        className={`practice-panel${section === "tips" ? " is-active-section" : ""}`}
        hidden={section !== "tips"}
        aria-labelledby="coach-tips-heading"
      >
        <div className="practice-panel-copy">
          <p className="eyebrow">Coach tips</p>
          <h2 id="coach-tips-heading">Guidance from the family shelf</h2>
          <p className="meta">Tips the parent asked Codex to prepare for this learner.</p>
        </div>
        <LearnerCoachTips tips={initialCoachTips} subject={subject} />
      </section>
    </div>
  );
}
