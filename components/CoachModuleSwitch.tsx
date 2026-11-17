import Link from "next/link";

import {
  coachArchiveHref,
  practiceSubjects,
  subjectLabel,
  type PracticeSubject,
} from "@/lib/subjects";

export function CoachModuleSwitch({
  subject,
  profileId,
  hash,
}: {
  subject: PracticeSubject;
  profileId?: string | null;
  hash?: string;
}) {
  return (
    <nav className="parent-module-switch" aria-label="Practice module">
      {practiceSubjects.map((item) => (
        <Link
          key={item}
          className={item === subject ? "button" : "button secondary"}
          aria-current={item === subject ? "true" : undefined}
          href={coachArchiveHref({ subject: item, profileId, hash })}
        >
          {subjectLabel(item)}
        </Link>
      ))}
    </nav>
  );
}
