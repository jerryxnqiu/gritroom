import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { FamilyBootstrap } from "@/components/FamilyBootstrap";
import { LogoutButton } from "@/components/LogoutButton";
import { ParentSettings } from "@/components/ParentSettings";
import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies } from "@/lib/http";

export default async function ParentPage() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    redirect("/login?entry=parent");
  }

  const profile = session.family_id
    ? await env.DB.prepare(
        `SELECT nickname, exam_goal FROM profiles WHERE family_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
        .bind(session.family_id)
        .first<{ nickname: string; exam_goal: string }>()
    : null;

  return (
    <main className="shell">
      <header className="room-header">
        <div>
          <p className="eyebrow">Parent room</p>
          <h1>{profile ? `${profile.nickname} · ${profile.exam_goal.toUpperCase()}` : "Set up your family"}</h1>
          <p className="meta">Signed in as {session.email}</p>
        </div>
        <LogoutButton />
      </header>

      {!profile ? <FamilyBootstrap /> : null}

      {profile ? (
        <>
          <section className="quick-grid">
            <div className="quick-link">
              <strong>01 Family access</strong>
              <span>Child profiles, exam goals, email invites, guardians, and optional device codes.</span>
            </div>
            <div className="quick-link">
              <strong>02 Parent feedback</strong>
              <span>Save observations and practice preferences for future lessons.</span>
            </div>
            <div className="quick-link">
              <strong>03 Resource shelf</strong>
              <span>Add coaching reports, videos, photos, PDFs, and notes for the current goal.</span>
            </div>
            <div className="quick-link">
              <strong>04 Progress & feedback</strong>
              <span>Review practice evidence, timing, drafts, and recommendation reasons.</span>
            </div>
          </section>

          <section className="panel">
            <h2>How practice becomes progress</h2>
            <p className="lede">
              Answers, confidence, timing, drafts, and your notes become evidence. GritRoom uses that evidence to
              explain the next lesson. Detailed practice flows land in the next build phase.
            </p>
            <div className="actions">
              <Link className="secondary" href="/learner" style={{ display: "inline-block", padding: "0.85rem 1.15rem" }}>
                Open learner room
              </Link>
            </div>
          </section>
        </>
      ) : null}

      <ParentSettings />
    </main>
  );
}
