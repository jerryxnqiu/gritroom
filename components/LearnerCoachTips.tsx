"use client";

import { useMemo, useState } from "react";

import type { LearnerCoachTip } from "@/lib/material-analysis";
import { subjectLabel, type PracticeSubject } from "@/lib/subjects";

function tipLabel(kind: string) {
  if (kind === "coaching_report") return "From your coach";
  if (kind === "study_material") return "From your practice papers";
  if (kind === "video") return "From a practice video";
  return "Coach tip";
}

export function LearnerCoachTips({
  subject,
  tips,
}: {
  subject: PracticeSubject;
  tips: LearnerCoachTip[];
}) {
  const moduleLabel = subjectLabel(subject);
  const [selectedId, setSelectedId] = useState(tips[0]?.id ?? null);
  const selected = useMemo(
    () => tips.find((item) => item.id === selectedId) ?? tips[0] ?? null,
    [tips, selectedId],
  );

  if (!tips.length) {
    return (
      <section className="panel practice-panel" aria-labelledby="coach-tips-heading">
        <p className="eyebrow">Coach tips</p>
        <h2 id="coach-tips-heading">No {moduleLabel} tips yet.</h2>
        <p className="lede">
          When your family asks Codex to review coaching notes for {moduleLabel}, short tips for you will show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel practice-panel" aria-labelledby="coach-tips-heading">
      <p className="eyebrow">Coach tips</p>
      <h2 id="coach-tips-heading">Things to watch for in {moduleLabel}.</h2>
      <p className="lede">
        Short notes from your family’s coaching reviews — useful before a practice set.
      </p>
      <div className="reading-evidence-layout">
        <aside className="reading-evidence-rail" aria-label="Coach tips list">
          <ul className="progress-session-list">
            {tips.map((item) => {
              const active = selected?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`progress-session-card${active ? " is-current" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="practice-result-session-title">{tipLabel(item.materialKind)}</span>
                    <span className="meta">
                      {(item.completedAt || item.createdAt).slice(0, 10)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <div className="reading-evidence-detail">
          {selected ? (
            <article className="practice-evidence-attempt-card">
              <header>
                <span className="meta">{tipLabel(selected.materialKind)}</span>
                <strong>Remember this</strong>
                <span className="meta">
                  {(selected.completedAt || selected.createdAt).slice(0, 10)}
                </span>
              </header>
              <p className="shelf-copy practice-prompt">{selected.summaryEn}</p>
              {selected.trainingDirections.length ? (
                <div className="shelf-notes">
                  <strong>Try next time</strong>
                  <ul className="shelf-directions">
                    {selected.trainingDirections.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
