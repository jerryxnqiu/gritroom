import { parsePracticePrompt } from "@/lib/practice-prompt";
import type { PracticeSubject } from "@/lib/subjects";

export function PracticePrompt({
  prompt,
  subject = "thinking",
  className = "",
}: {
  prompt: string | null | undefined;
  subject?: PracticeSubject;
  className?: string;
}) {
  const parsed = parsePracticePrompt(prompt, subject);
  if (subject !== "reading" || (!parsed.title && !parsed.instruction && !parsed.passage)) {
    return <p className={`practice-prompt${className ? ` ${className}` : ""}`}>{parsed.stem}</p>;
  }

  return (
    <div className={`practice-reading-prompt${className ? ` ${className}` : ""}`}>
      {(parsed.title || parsed.instruction || parsed.passage) ? (
        <section className="practice-reading-passage" aria-label="Reading passage">
          <p className="eyebrow">Passage</p>
          {parsed.title ? <h3 className="practice-reading-title">{parsed.title}</h3> : null}
          {parsed.instruction ? (
            <p className="practice-reading-instruction">{parsed.instruction}</p>
          ) : null}
          {parsed.passage ? (
            <p className="practice-reading-body">{parsed.passage}</p>
          ) : null}
        </section>
      ) : null}
      <section className="practice-reading-question" aria-label="Question">
        <p className="eyebrow">Question</p>
        <p className="practice-reading-stem">{parsed.stem}</p>
      </section>
    </div>
  );
}
