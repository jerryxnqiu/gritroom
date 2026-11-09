"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ParentSectionProvider,
  parentSectionFromHash,
  type ParentSection,
} from "./ParentSectionContext";
import { RoomLayout, type RoomNavItem } from "./RoomLayout";

export function ParentRoomShell({
  name,
  badge,
  initialSection = "progress",
  children,
}: {
  name: string;
  badge: string;
  initialSection?: ParentSection;
  children: ReactNode;
}) {
  const [section, setSectionState] = useState<ParentSection>(initialSection);

  const setSection = useCallback((next: ParentSection) => {
    setSectionState(next);
    const hash = `#${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, []);

  useEffect(() => {
    function sync() {
      setSectionState(window.location.hash
        ? parentSectionFromHash(window.location.hash, initialSection)
        : initialSection);
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialSection]);

  const navItems: RoomNavItem[] = useMemo(() => [
    { href: "#progress", label: "Progress", current: section === "progress" },
    { href: "#family", label: "Family", current: section === "family" },
    { href: "#bank", label: "Practice bank", current: section === "bank" },
    { href: "#shelf", label: "Resources", current: section === "shelf" },
    { href: "#evidence", label: "Evidence", current: section === "evidence" },
  ], [section]);

  return (
    <ParentSectionProvider value={{ section, setSection }}>
      <RoomLayout
        role="parent"
        name={name}
        badge={badge}
        navItems={navItems}
        onNavItemClick={(href) => setSection(parentSectionFromHash(href, section))}
      >
        {children}
      </RoomLayout>
    </ParentSectionProvider>
  );
}
