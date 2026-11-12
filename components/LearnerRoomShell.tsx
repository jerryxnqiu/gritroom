"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  LearnerSectionProvider,
  sectionFromHash,
  type LearnerSection,
} from "./LearnerSectionContext";
import { RoomLayout, type RoomNavItem } from "./RoomLayout";

export function LearnerRoomShell({
  name,
  badge,
  initialSection = "practice",
  children,
}: {
  name: string;
  badge: string;
  initialSection?: LearnerSection;
  children: ReactNode;
}) {
  const [section, setSectionState] = useState<LearnerSection>(initialSection);

  const setSection = useCallback((next: LearnerSection) => {
    setSectionState(next);
    const hash = `#${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, []);

  useEffect(() => {
    function sync() {
      setSectionState(window.location.hash
        ? sectionFromHash(window.location.hash, initialSection)
        : initialSection);
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialSection]);

  const navItems: RoomNavItem[] = useMemo(() => [
    { href: "#practice", label: "Practice", current: section === "practice" },
    { href: "#timed", label: "Timed paper", current: section === "timed" },
    { href: "#tips", label: "Coach tips", current: section === "tips" },
    { href: "#results", label: "Last results", current: section === "results" },
  ], [section]);

  return (
    <LearnerSectionProvider value={{ section, setSection }}>
      <RoomLayout
        role="learner"
        name={name}
        badge={badge}
        navItems={navItems}
        onNavItemClick={(href) => {
          const next = sectionFromHash(href, section);
          setSection(next);
        }}
      >
        {children}
      </RoomLayout>
    </LearnerSectionProvider>
  );
}
