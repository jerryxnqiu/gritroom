"use client";

import { createContext, useContext } from "react";

export type ParentSection = "progress" | "family" | "bank" | "shelf" | "evidence";

type ParentSectionContextValue = {
  section: ParentSection;
  setSection: (section: ParentSection) => void;
};

const ParentSectionContext = createContext<ParentSectionContextValue | null>(null);

export function ParentSectionProvider({
  value,
  children,
}: {
  value: ParentSectionContextValue;
  children: React.ReactNode;
}) {
  return (
    <ParentSectionContext.Provider value={value}>
      {children}
    </ParentSectionContext.Provider>
  );
}

export function useParentSection() {
  const value = useContext(ParentSectionContext);
  if (!value) {
    throw new Error("useParentSection must be used inside ParentSectionProvider.");
  }
  return value;
}

export function parentSectionFromHash(hash: string, fallback: ParentSection = "progress"): ParentSection {
  const value = hash.replace(/^#/, "");
  if (
    value === "progress"
    || value === "family"
    || value === "family-access"
    || value === "bank"
    || value === "practice-bank"
    || value === "shelf"
    || value === "resource-shelf"
    || value === "evidence"
    || value === "practice-evidence"
  ) {
    if (value === "family-access") return "family";
    if (value === "practice-bank") return "bank";
    if (value === "resource-shelf") return "shelf";
    if (value === "practice-evidence") return "evidence";
    return value as ParentSection;
  }
  return fallback;
}
