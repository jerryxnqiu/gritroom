import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";

export function RoomLayout({
  role, name, badge, children,
}: { role: "parent" | "learner"; name: string; badge: string; children: ReactNode }) {
  const parent = role === "parent";
  const title = parent ? "Parent room" : "My room";
  return (
    <div className="room-layout">
      <aside className="room-sidebar">
        <Brand />
        <nav className="room-nav" aria-label="Your room">
          <p className="eyebrow">Your {parent ? "family" : "practice"} room</p>
          <Link href={parent ? "/parent" : "/learner"} aria-current="page">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {parent
                ? <><path d="M12 3 4 6.5v5c0 4.7 2.9 7.6 8 9.5 5.1-1.9 8-4.8 8-9.5v-5L12 3Z" /><path d="m8.5 12 2.1 2.1 4.9-5" /></>
                : <path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z" />}
            </svg>
            {title}
          </Link>
        </nav>
        <p className="room-motto">Small steps.<br />Strong thinking.</p>
        <div className="room-account">
          <span className="room-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || "G"}</span>
          <span className="room-identity"><strong>{name}</strong><small>{badge}</small></span>
          <LogoutButton />
        </div>
      </aside>
      <div className="room-main">
        <div className="room-breadcrumb"><span className="eyebrow">Your journey</span><span aria-hidden="true">/</span><span>{title}</span><span className="room-private">Private family room</span></div>
        <main className="room-content">{children}</main>
        <footer className="room-footer">GritRoom <span>Think clearly. Practise deliberately. Grow steadily.</span></footer>
      </div>
    </div>
  );
}
