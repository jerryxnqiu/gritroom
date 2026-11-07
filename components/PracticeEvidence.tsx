import type { PracticeEvidenceItem } from "@/lib/practice";

function formatTime(timeMs: number | null) {
  if (timeMs === null) return "—";
  const seconds = Math.round(timeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function PracticeEvidence({ items }: { items: PracticeEvidenceItem[] }) {
  if (!items.length) {
    return (
      <p className="meta">
        No practice answers yet. When your child completes a starting-point check or focused practice, each question’s answer, time, confidence and notes appear here.
      </p>
    );
  }

  return (
    <ul className="shelf-items practice-evidence">
      {items.map((item) => (
        <li key={item.id} className="shelf-item">
          <div>
            <p className="shelf-copy">{item.prompt}</p>
            <p className="meta">
              <strong className={item.isCorrect ? "practice-ok" : "practice-miss"}>
                {item.isCorrect ? "Correct" : "Incorrect"} · chose {item.selectedOption}
                {item.isCorrect ? "" : ` · checked ${item.correctOption}`}
              </strong>
              {" · "}
              {item.mode === "diagnostic" ? "Starting-point check" : "Focused practice"}
              {item.blueprintTitle ? ` · ${item.blueprintTitle}` : ""}
              {item.skill ? ` · ${item.skill}` : ""}
            </p>
            <p className="meta">
              Confidence {item.confidence ?? "—"}/5 · {formatTime(item.timeMs)} · {item.finalizedAt.slice(0, 10)}
            </p>
            {item.draftNotes ? <p className="shelf-notes shelf-copy">{item.draftNotes}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
