/** Practice modules inside a Selective / OC archive. */
export type PracticeSubject = "thinking" | "reading" | "mathematics" | "writing";

export const practiceSubjects = ["thinking", "reading", "mathematics", "writing"] as const;

export function subjectLabel(subject: PracticeSubject) {
  if (subject === "reading") return "Reading";
  if (subject === "mathematics") return "Mathematics";
  if (subject === "writing") return "Writing";
  return "Thinking Skills";
}

export function parseSubject(value: unknown): PracticeSubject | null {
  return value === "thinking"
    || value === "reading"
    || value === "mathematics"
    || value === "writing"
    ? value
    : null;
}

/** Default when URL / form omit subject — keeps existing Thinking Skills behaviour. */
export function shelfSubject(value: unknown): PracticeSubject {
  return parseSubject(value) ?? "thinking";
}

/** MCQ paper modules that sit timed/practice sets. Writing is open response. */
export function isMcqSubject(subject: PracticeSubject) {
  return subject === "thinking" || subject === "reading" || subject === "mathematics";
}

export function parentArchiveHref(input: {
  profileId: string;
  goal: "selective" | "oc";
  subject: PracticeSubject;
  hash?: string;
}) {
  const params = new URLSearchParams({
    child: input.profileId,
    shelfGoal: input.goal,
    subject: input.subject,
  });
  const hash = input.hash ? `#${input.hash.replace(/^#/, "")}` : "";
  return `/parent?${params.toString()}${hash}`;
}

export function learnerArchiveHref(input: {
  subject: PracticeSubject;
  hash?: string;
}) {
  const params = new URLSearchParams({ subject: input.subject });
  const hash = input.hash ? `#${input.hash.replace(/^#/, "")}` : "";
  return `/learner?${params.toString()}${hash}`;
}

export function coachArchiveHref(input: {
  subject: PracticeSubject;
  profileId?: string | null;
  hash?: string;
}) {
  const params = new URLSearchParams({ subject: input.subject });
  if (input.profileId) params.set("child", input.profileId);
  const hash = input.hash ? `#${input.hash.replace(/^#/, "")}` : "";
  return `/coach?${params.toString()}${hash}`;
}
