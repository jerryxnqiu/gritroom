import Link from "next/link";

import {
  learnerArchiveHref,
  practiceSubjects,
  subjectLabel,
  type PracticeSubject,
} from "@/lib/subjects";

export function LearnerModuleSwitch({
  subject,
  hash,
}: {
  subject: PracticeSubject;
  hash?: string;
}) {
  return (
    <nav className="parent-module-switch" aria-label="Practice module">
      {practiceSubjects.map((item) => (
        <Link
          key={item}
          className={item === subject ? "button" : "button secondary"}
          aria-current={item === subject ? "true" : undefined}
          href={learnerArchiveHref({ subject: item, hash })}
        >
          {subjectLabel(item)}
        </Link>
      ))}
    </nav>
  );
}
