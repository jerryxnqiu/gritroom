import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { CoachModuleSwitch } from "@/components/CoachModuleSwitch";
import { CoachRoomShell } from "@/components/CoachRoomShell";
import { CoachView } from "@/components/CoachView";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, hasOpenInvitations, linkedCoach, listCoachedProfiles } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";
import { listLearnerCoachTips } from "@/lib/material-analysis";
import { listLearnerPracticeResults } from "@/lib/practice";
import { shelfSubject, subjectLabel } from "@/lib/subjects";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; child?: string }>;
}) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/?entry=coach");
  if (session.entry === "learner") redirect("/learner");
  if (session.entry === "parent") redirect("/parent");
  if (session.entry !== "coach") redirect("/?entry=coach");

  const params = await searchParams;
  const subject = shelfSubject(params.subject);
  const coached = await listCoachedProfiles(env.DB, session.user_id);
  const preferred = params.child && coached.some((item) => item.id === params.child)
    ? params.child
    : session.profile_id;
  const profile = await linkedCoach(env.DB, session.user_id, preferred);
  const hasInvites = await hasOpenInvitations(env.DB, session.email);

  const [resultPage, coachTips] = profile
    ? await Promise.all([
      listLearnerPracticeResults(env.DB, session.user_id, {
        sessionLimit: 11,
        subject,
        profileId: profile.id,
      }),
      listLearnerCoachTips(env.DB, session.user_id, subject, profile.id),
    ])
    : [[] as Awaited<ReturnType<typeof listLearnerPracticeResults>>, [] as Awaited<ReturnType<typeof listLearnerCoachTips>>];

  const resultsHasMore = resultPage.length > 10;
  const resultSessions = resultsHasMore ? resultPage.slice(0, 10) : resultPage;

  const name = profile?.nickname || "Coach";
  const badge = profile
    ? `Coaching · ${examLabel(profile.examGoal)} · ${subjectLabel(subject)}`
    : "Coaching access";

  const body = (
    <>
      <header className="room-heading">
        <p className="eyebrow">Coaching room</p>
        <h1>{profile ? <>Reviewing {profile.nickname}’s progress<span className="accent-text">.</span></> : "Your coaching access."}</h1>
        <p className="lede">
          {profile
            ? "Same results view the learner uses — read-only. You can’t sit papers from this room."
            : "Accept a coaching invitation to see a learner’s results here."}
        </p>
      </header>
      {hasInvites ? <Link className="button secondary invitation-back" href="/invitations">Review invitations</Link> : null}
      {coached.length > 1 ? (
        <nav className="parent-module-switch" aria-label="Coached learners">
          {coached.map((item) => (
            <Link
              key={item.id}
              className={item.id === profile?.id ? "button" : "button secondary"}
              href={`/coach?child=${encodeURIComponent(item.id)}&subject=${encodeURIComponent(subject)}`}
              aria-current={item.id === profile?.id ? "true" : undefined}
            >
              {item.nickname}
            </Link>
          ))}
        </nav>
      ) : null}
      {profile ? (
        <>
          <CoachModuleSwitch subject={subject} profileId={profile.id} hash="#results" />
          <CoachView
            key={`${profile.id}-${subject}`}
            subject={subject}
            examGoal={profile.examGoal}
            nickname={profile.nickname}
            profileId={profile.id}
            initialResultSessions={resultSessions}
            initialResultsHasMore={resultsHasMore}
            initialCoachTips={coachTips}
          />
        </>
      ) : (
        <section className="panel">
          <p className="lede">No coaching link is active for this email yet.</p>
        </section>
      )}
    </>
  );

  if (profile) {
    return (
      <CoachRoomShell name={name} badge={badge} initialSection="results">
        {body}
      </CoachRoomShell>
    );
  }
  return <RoomLayout role="coach" name={name} badge={badge}>{body}</RoomLayout>;
}
