"use client";

import { createContext, useContext } from "react";

export type LearnerSection = "practice" | "timed" | "results" | "tips";

type LearnerSectionContextValue = {
  section: LearnerSection;
  setSection: (section: LearnerSection) => void;
};

const LearnerSectionContext = createContext<LearnerSectionContextValue | null>(null);

export function LearnerSectionProvider({
  value,
  children,
}: {
  value: LearnerSectionContextValue;
  children: React.ReactNode;
}) {
  return (
    <LearnerSectionContext.Provider value={value}>
      {children}
    </LearnerSectionContext.Provider>
  );
}

export function useLearnerSection() {
  const value = useContext(LearnerSectionContext);
  if (!value) {
    throw new Error("useLearnerSection must be used inside LearnerSectionProvider.");
  }
  return value;
}

export function sectionFromHash(hash: string, fallback: LearnerSection = "practice"): LearnerSection {
  const value = hash.replace(/^#/, "");
  if (value === "timed" || value === "results" || value === "practice" || value === "tips") return value;
  return fallback;
}
