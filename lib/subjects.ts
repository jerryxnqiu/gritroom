/** Practice modules inside a Selective / OC archive. */
export type PracticeSubject = "thinking" | "reading";

export const practiceSubjects = ["thinking", "reading"] as const;

export function subjectLabel(subject: PracticeSubject) {
  return subject === "reading" ? "Reading" : "Thinking Skills";
}

export function parseSubject(value: unknown): PracticeSubject | null {
  return value === "thinking" || value === "reading" ? value : null;
}

/** Default when URL / form omit subject — keeps existing Thinking Skills behaviour. */
export function shelfSubject(value: unknown): PracticeSubject {
  return parseSubject(value) ?? "thinking";
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
