"use client";

import Link from "next/link";

import type { ExamGoal } from "@/lib/family";
import {
  parentArchiveHref,
  practiceSubjects,
  subjectLabel,
  type PracticeSubject,
} from "@/lib/subjects";
import { useParentSection } from "./ParentSectionContext";

export function ParentModuleSwitch({
  profileId,
  goal,
  subject,
  hash,
}: {
  profileId: string;
  goal: ExamGoal;
  subject: PracticeSubject;
  hash?: string;
}) {
  const { section } = useParentSection();
  const targetHash = hash ?? section;

  return (
    <nav className="parent-module-switch" aria-label="Practice module">
      {practiceSubjects.map((item) => (
        <Link
          key={item}
          className={item === subject ? "button" : "button secondary"}
          aria-current={item === subject ? "true" : undefined}
          href={parentArchiveHref({ profileId, goal, subject: item, hash: targetHash })}
        >
          {subjectLabel(item)}
        </Link>
      ))}
    </nav>
  );
}
