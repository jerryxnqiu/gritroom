"use client";

import type { ReactNode } from "react";

import { useParentSection, type ParentSection } from "./ParentSectionContext";

export function ParentSectionNav() {
  const { section, setSection } = useParentSection();
  const items: Array<{ id: ParentSection; label: string }> = [
    { id: "progress", label: "Progress" },
    { id: "family", label: "Family" },
    { id: "bank", label: "Practice bank" },
    { id: "shelf", label: "Resources" },
    { id: "evidence", label: "Evidence" },
  ];
  return (
    <nav className="practice-section-nav parent-section-nav" aria-label="Parent room sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={section === item.id ? "button" : "button secondary"}
          aria-current={section === item.id ? "page" : undefined}
          onClick={() => setSection(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function ParentSectionView({
  id,
  children,
}: {
  id: ParentSection;
  children: ReactNode;
}) {
  const { section } = useParentSection();
  if (section !== id) return null;
  return <>{children}</>;
}
