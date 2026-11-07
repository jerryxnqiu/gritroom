import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { GrowthArtwork } from "@/components/Brand";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, linkedLearner } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";

export default async function LearnerPage() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/?entry=learner");
  if (session.entry !== "learner") redirect("/parent");

  const profile = await linkedLearner(env.DB, session.email);

  return (
    <RoomLayout role="learner" name={profile?.nickname || "Learner"} badge={profile ? `${examLabel(profile.examGoal)} · Personal practice` : "Your account"}>
      <header className="room-heading">
        <p className="eyebrow">Make a little room for progress</p>
        <h1>{profile ? <>Ready for your next step,<br />{profile.nickname}<span className="accent-text">?</span></> : "Your practice room."}</h1>
        <p className="lede">{profile ? "You don’t have to get it all right. You just have to begin." : "Your learner profile isn’t connected to this email yet."}</p>
      </header>
      <section className="learner-feature" aria-labelledby="learner-feature-heading">
        <div>
          <p className="eyebrow">{profile ? examLabel(profile.examGoal) + " preparation" : "Your private family room"}</p>
          <h2 id="learner-feature-heading">A little practice.<br />Stronger skills.</h2>
          <p>{profile ? "Your Thinking Skills practice will appear here when it’s ready." : "Once your family connects your profile, this is where your practice and feedback will appear."}</p>
        </div>
        <GrowthArtwork className="learner-illustration" />
      </section>
    </RoomLayout>
  );
}
