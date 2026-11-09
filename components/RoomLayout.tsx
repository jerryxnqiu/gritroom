import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";

export type RoomNavItem = {
  href: string;
  label: string;
  current?: boolean;
};

export function RoomLayout({
  role, name, badge, navItems, onNavItemClick, children,
}: {
  role: "parent" | "learner";
  name: string;
  badge: string;
  navItems?: RoomNavItem[];
  onNavItemClick?: (href: string) => void;
  children: ReactNode;
}) {
  const parent = role === "parent";
  const title = parent ? "Parent room" : "My room";
  const items = navItems?.length
    ? navItems
    : [{ href: parent ? "/parent" : "/learner", label: title, current: true }];

  return (
    <div className="room-layout">
      <aside className="room-sidebar">
        <Brand />
        <nav className="room-nav" aria-label="Your room">
          <p className="eyebrow">Your {parent ? "family" : "practice"} room</p>
          {items.map((item) => {
            const hashOnly = item.href.startsWith("#");
            const className = item.current ? "is-current" : undefined;
            const icon = (
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {parent
                  ? item.href.includes("progress")
                    ? <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 3-3 3 2 5-6" /></>
                    : item.href.includes("family")
                      ? <><circle cx="9" cy="8" r="3" /><circle cx="16" cy="9" r="2.5" /><path d="M3 19c1.5-3 4-4.5 6-4.5S13.5 16 15 19" /><path d="M14 19c.7-1.8 2.2-3 4-3 1.2 0 2.2.4 3 1.2" /></>
                      : item.href.includes("bank")
                        ? <><path d="M4 7h16v12H4z" /><path d="M8 7V5h8v2" /><path d="M8 12h8M8 15h5" /></>
                        : item.href.includes("shelf")
                          ? <><path d="M5 5h14v4H5zM5 11h14v4H5zM5 17h14v2H5z" /></>
                          : item.href.includes("evidence")
                            ? <><path d="M8 6h10v14H8z" /><path d="M6 8h2M6 12h2M6 16h2" /><path d="M11 10h4M11 14h5" /></>
                            : <><path d="M12 3 4 6.5v5c0 4.7 2.9 7.6 8 9.5 5.1-1.9 8-4.8 8-9.5v-5L12 3Z" /><path d="m8.5 12 2.1 2.1 4.9-5" /></>
                  : item.href.includes("timed")
                    ? <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></>
                    : item.href.includes("results")
                      ? <><path d="M8 6h10v14H8z" /><path d="M6 8h2M6 12h2M6 16h2" /><path d="M11 10h4M11 14h5" /></>
                      : <path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z" />}
              </svg>
            );

            if (hashOnly && onNavItemClick) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={className}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavItemClick(item.href);
                  }}
                >
                  {icon}
                  {item.label}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={className}
              >
                {icon}
                {item.label}
              </Link>
            );
          })}
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
