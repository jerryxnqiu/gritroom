import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies } from "@/lib/http";

export default async function LearnerPage() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") {
    redirect("/login?entry=learner");
  }

  const profile = session.profile_id
    ? await env.DB.prepare(`SELECT nickname, exam_goal FROM profiles WHERE id = ?`)
        .bind(session.profile_id)
        .first<{ nickname: string; exam_goal: string }>()
    : null;

  return (
    <main className="shell">
      <header className="room-header">
        <div>
          <p className="eyebrow">My room</p>
          <h1>{profile ? `Hi ${profile.nickname}` : "Waiting for a family invite"}</h1>
          <p className="meta">
            {profile
              ? `Goal: ${profile.exam_goal.toUpperCase()} Thinking Skills`
              : `Signed in as ${session.email}. Ask a parent to send a learner invite to this email.`}
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="quick-grid">
        <div className="quick-link">
          <strong>Continue practice</strong>
          <span>Resume an unfinished set when practice sessions are available.</span>
        </div>
        <div className="quick-link">
          <strong>Starting-point check</strong>
          <span>18 Thinking Skills questions to gather first evidence.</span>
        </div>
        <div className="quick-link">
          <strong>Next lesson</strong>
          <span>Methods, worked examples, and an 8-question practice set.</span>
        </div>
        <div className="quick-link">
          <strong>My progress</strong>
          <span>Your own practice history, feedback, and review queue.</span>
        </div>
      </section>
    </main>
  );
}
