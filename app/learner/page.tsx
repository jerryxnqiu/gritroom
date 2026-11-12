import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { GrowthArtwork } from "@/components/Brand";
import { LearnerModuleSwitch } from "@/components/LearnerModuleSwitch";
import { LearnerPractice } from "@/components/LearnerPractice";
import { LearnerRoomShell } from "@/components/LearnerRoomShell";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, hasOpenInvitations, linkedLearner } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";
import {
  countUnusedPracticeQuestions,
  countUnusedWeakPracticeQuestions,
  getPracticeSession,
  latestPracticeSession,
  listLearnerPracticeResults,
} from "@/lib/practice";
import {
  countUnusedReadingQuestions,
  latestReadingSession,
} from "@/lib/reading-practice";
import { shelfSubject, subjectLabel } from "@/lib/subjects";

export default async function LearnerPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/?entry=learner");
  if (session.entry !== "learner") redirect("/parent");

  const params = await searchParams;
  const subject = shelfSubject(params.subject);

  const [profile, hasInvites] = await Promise.all([
    linkedLearner(env.DB, session.user_id),
    hasOpenInvitations(env.DB, session.email),
  ]);

  const latest = profile
    ? subject === "reading"
      ? await latestReadingSession(env.DB, profile.id, profile.examGoal)
      : await latestPracticeSession(env.DB, profile.id, profile.examGoal)
    : null;
  const [practice, remainingCount, weakRemainingCount, resultPage] = profile
    ? await Promise.all([
      latest ? getPracticeSession(env.DB, latest.id, session.user_id) : Promise.resolve(null),
      subject === "reading"
        ? countUnusedReadingQuestions(env.DB, profile.id, profile.examGoal)
        : countUnusedPracticeQuestions(env.DB, profile.id, profile.examGoal),
      subject === "reading"
        ? Promise.resolve(0)
        : countUnusedWeakPracticeQuestions(env.DB, profile.id, profile.examGoal),
      listLearnerPracticeResults(env.DB, session.user_id, { sessionLimit: 11, subject }),
    ])
    : [null, 0, 0, [] as Awaited<ReturnType<typeof listLearnerPracticeResults>>];
  const resultsHasMore = resultPage.length > 10;
  const resultSessions = resultsHasMore ? resultPage.slice(0, 10) : resultPage;

  const name = profile?.nickname || "Learner";
  const badge = profile
    ? `${examLabel(profile.examGoal)} · ${subjectLabel(subject)}`
    : "Your account";
  const body = (
    <>
      <header className="room-heading">
        <p className="eyebrow">Make a little room for progress</p>
        <h1>{profile ? <>Ready for your next step,<br />{profile.nickname}<span className="accent-text">?</span></> : "Your practice room."}</h1>
        <p className="lede">{profile ? "You don’t have to get it all right. You just have to begin." : "Your learner profile isn’t connected to this email yet."}</p>
      </header>
      {hasInvites ? <Link className="button secondary invitation-back" href="/invitations">Review invitations</Link> : null}
      {profile ? (
        <>
          <LearnerModuleSwitch subject={subject} />
          <LearnerPractice
            subject={subject}
            initialSession={practice}
            initialRemainingCount={remainingCount}
            initialWeakRemainingCount={weakRemainingCount}
            initialResultSessions={resultSessions}
            initialResultsHasMore={resultsHasMore}
            profile={{ id: profile.id, examGoal: profile.examGoal, nickname: profile.nickname }}
          />
        </>
      ) : (
        <section className="learner-feature" aria-labelledby="learner-feature-heading">
          <div>
            <p className="eyebrow">Your private family room</p>
            <h2 id="learner-feature-heading">A little practice.<br />Stronger skills.</h2>
            <p>Once your family connects your profile, this is where your practice and feedback will appear.</p>
          </div>
          <GrowthArtwork className="learner-illustration" />
        </section>
      )}
    </>
  );

  const initialSection = practice?.status === "active"
    ? (practice.mode === "timed" ? "timed" : "practice")
    : practice
      ? "results"
      : "practice";

  if (profile) {
    return (
      <LearnerRoomShell name={name} badge={badge} initialSection={initialSection}>
        {body}
      </LearnerRoomShell>
    );
  }
  return <RoomLayout role="learner" name={name} badge={badge}>{body}</RoomLayout>;
}
