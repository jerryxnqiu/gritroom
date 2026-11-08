import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { GrowthArtwork } from "@/components/Brand";
import { LearnerPractice } from "@/components/LearnerPractice";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, hasOpenInvitations, linkedLearner } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";
import { countUnusedPracticeQuestions, getPracticeSession, latestPracticeSession } from "@/lib/practice";

export default async function LearnerPage() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/?entry=learner");
  if (session.entry !== "learner") redirect("/parent");

  const [profile, hasInvites] = await Promise.all([
    linkedLearner(env.DB, session.user_id),
    hasOpenInvitations(env.DB, session.email),
  ]);

  const latest = profile
    ? await latestPracticeSession(env.DB, profile.id, profile.examGoal)
    : null;
  const [practice, remainingCount] = profile
    ? await Promise.all([
      latest ? getPracticeSession(env.DB, latest.id, session.user_id) : Promise.resolve(null),
      countUnusedPracticeQuestions(env.DB, profile.id, profile.examGoal),
    ])
    : [null, 0];

  return (
    <RoomLayout role="learner" name={profile?.nickname || "Learner"} badge={profile ? `${examLabel(profile.examGoal)} · Personal practice` : "Your account"}>
      <header className="room-heading">
        <p className="eyebrow">Make a little room for progress</p>
        <h1>{profile ? <>Ready for your next step,<br />{profile.nickname}<span className="accent-text">?</span></> : "Your practice room."}</h1>
        <p className="lede">{profile ? "You don’t have to get it all right. You just have to begin." : "Your learner profile isn’t connected to this email yet."}</p>
      </header>
      {hasInvites ? <Link className="button secondary invitation-back" href="/invitations">Review invitations</Link> : null}
      {profile ? (
        <LearnerPractice
          initialSession={practice}
          initialRemainingCount={remainingCount}
          profile={{ id: profile.id, examGoal: profile.examGoal, nickname: profile.nickname }}
        />
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
    </RoomLayout>
  );
}
