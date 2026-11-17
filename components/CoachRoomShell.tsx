"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  LearnerSectionProvider,
  sectionFromHash,
  type LearnerSection,
} from "./LearnerSectionContext";
import { RoomLayout, type RoomNavItem } from "./RoomLayout";

export function CoachRoomShell({
  name,
  badge,
  initialSection = "results",
  children,
}: {
  name: string;
  badge: string;
  initialSection?: LearnerSection;
  children: ReactNode;
}) {
  const [section, setSectionState] = useState<LearnerSection>(
    initialSection === "practice" || initialSection === "timed" ? "results" : initialSection,
  );

  const setSection = useCallback((next: LearnerSection) => {
    const safe = next === "practice" || next === "timed" ? "results" : next;
    setSectionState(safe);
    const hash = `#${safe}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, []);

  useEffect(() => {
    function sync() {
      const fromHash = window.location.hash
        ? sectionFromHash(window.location.hash, "results")
        : initialSection;
      setSectionState(fromHash === "practice" || fromHash === "timed" ? "results" : fromHash);
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialSection]);

  const navItems: RoomNavItem[] = useMemo(() => [
    { href: "#results", label: "Results", current: section === "results" },
    { href: "#tips", label: "Coach tips", current: section === "tips" },
  ], [section]);

  return (
    <LearnerSectionProvider value={{ section, setSection }}>
      <RoomLayout
        role="coach"
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
