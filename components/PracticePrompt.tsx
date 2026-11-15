"use client";

import { useEffect, useState } from "react";

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
  const extracts = parsed.extracts;
  const [activeExtract, setActiveExtract] = useState(0);

  useEffect(() => {
    setActiveExtract(0);
  }, [prompt, subject]);

  if (subject !== "reading" || (!parsed.title && !parsed.instruction && !parsed.passage && !extracts.length)) {
    return <p className={`practice-prompt${className ? ` ${className}` : ""}`}>{parsed.stem}</p>;
  }

  const safeIndex = Math.min(activeExtract, Math.max(0, extracts.length - 1));
  const active = extracts[safeIndex] ?? null;

  return (
    <div className={`practice-reading-prompt${className ? ` ${className}` : ""}`}>
      {(parsed.title || parsed.instruction || parsed.passage || extracts.length >= 2) ? (
        <section className="practice-reading-passage" aria-label="Reading passage">
          <p className="eyebrow">Passage</p>
          {parsed.title ? <h3 className="practice-reading-title">{parsed.title}</h3> : null}

          {extracts.length >= 2 ? (
            <>
              <div className="practice-extract-tabs" role="tablist" aria-label="Reading extracts">
                {extracts.map((extract, index) => {
                  const selected = index === safeIndex;
                  return (
                    <button
                      key={extract.label}
                      type="button"
                      role="tab"
                      id={`extract-tab-${extract.label.replace(/\s+/g, "-").toLowerCase()}`}
                      className={`practice-extract-tab${selected ? " is-active" : ""}`}
                      aria-selected={selected}
                      aria-controls={`extract-panel-${extract.label.replace(/\s+/g, "-").toLowerCase()}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActiveExtract(index)}
                    >
                      {extract.label}
                    </button>
                  );
                })}
              </div>
              {parsed.instruction ? (
                <p className="practice-reading-instruction">{parsed.instruction}</p>
              ) : (
                <p className="practice-reading-instruction">
                  Using the tabs above ({extracts[0]?.label} – {extracts[extracts.length - 1]?.label}), read each extract,
                  then answer the question.
                </p>
              )}
              {active ? (
                <div
                  className="practice-extract-panel"
                  role="tabpanel"
                  id={`extract-panel-${active.label.replace(/\s+/g, "-").toLowerCase()}`}
                  aria-labelledby={`extract-tab-${active.label.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <p className="practice-extract-label">{active.label}</p>
                  <p className="practice-reading-body">{active.body}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {parsed.instruction ? (
                <p className="practice-reading-instruction">{parsed.instruction}</p>
              ) : null}
              {parsed.passage ? (
                <p className="practice-reading-body">{parsed.passage}</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      <section className="practice-reading-question" aria-label="Question">
        <p className="eyebrow">Question</p>
        <p className="practice-reading-stem">{parsed.stem}</p>
      </section>
    </div>
  );
}
