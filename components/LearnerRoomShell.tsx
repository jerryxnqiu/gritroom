"use client";

import { useEffect, useState, type ReactNode } from "react";

import { RoomLayout, type RoomNavItem } from "./RoomLayout";

type Section = "practice" | "timed" | "results";

function sectionFromHash(hash: string): Section {
  const value = hash.replace(/^#/, "");
  if (value === "timed" || value === "results") return value;
  return "practice";
}

export function LearnerRoomShell({
  name,
  badge,
  initialSection = "practice",
  children,
}: {
  name: string;
  badge: string;
  initialSection?: Section;
  children: ReactNode;
}) {
  const [section, setSection] = useState<Section>(initialSection);

  useEffect(() => {
    function sync() {
      setSection(window.location.hash ? sectionFromHash(window.location.hash) : initialSection);
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialSection]);

  const navItems: RoomNavItem[] = [
    { href: "/learner#practice", label: "Practice", current: section === "practice" },
    { href: "/learner#timed", label: "Timed paper", current: section === "timed" },
    { href: "/learner#results", label: "Last results", current: section === "results" },
  ];

  return (
    <RoomLayout role="learner" name={name} badge={badge} navItems={navItems}>
      {children}
    </RoomLayout>
  );
}
