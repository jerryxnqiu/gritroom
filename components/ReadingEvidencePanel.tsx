"use client";

import { useMemo, useState } from "react";

import type { MaterialAnalysisEvidence } from "@/lib/material-analysis";
import { materialKinds } from "@/lib/shelf-fields";
import { useParentSection } from "./ParentSectionContext";

type FeedbackItem = { id: string; body: string; createdAt: string };

export function ReadingEvidencePanel({
  nickname,
  archiveLabel,
  analyses,
  feedback,
}: {
  nickname: string;
  archiveLabel: string;
  analyses: MaterialAnalysisEvidence[];
  feedback: FeedbackItem[];
}) {
  const { setSection } = useParentSection();
  const [selectedId, setSelectedId] = useState(analyses[0]?.id ?? null);
  const selected = useMemo(
    () => analyses.find((item) => item.id === selectedId) ?? analyses[0] ?? null,
    [analyses, selectedId],
  );

  if (!analyses.length && !feedback.length) {
    return (
      <div className="reading-evidence-empty">
        <p className="meta">
          No Reading Codex findings or parent feedback yet for {nickname}’s {archiveLabel} archive. Add Passage sets under
          Resources, then ask Codex to generate Reading practice or a remediation / copywork plan.
        </p>
        <div className="actions">
          <button type="button" className="button secondary" onClick={() => setSection("shelf")}>
            Open Resources
          </button>
          <button type="button" className="button secondary" onClick={() => setSection("bank")}>
            Open Practice bank
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-evidence reading-evidence">
      <div className="reading-evidence-layout">
        <aside className="reading-evidence-rail" aria-label="Reading findings">
          <h3 className="progress-session-heading">Codex findings</h3>
          {analyses.length ? (
            <ul className="progress-session-list">
              {analyses.map((item) => {
                const active = selected?.id === item.id;
                const kind = materialKinds[item.materialKind as keyof typeof materialKinds] || item.materialKind;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`progress-session-card${active ? " is-current" : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className="practice-result-session-title">{item.materialTitle}</span>
                      <span className="meta">
                        {kind} · {(item.completedAt || item.createdAt).slice(0, 10)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="meta">No Codex Reading findings yet.</p>
          )}

          <h3 className="progress-session-heading">Parent feedback</h3>
          {feedback.length ? (
            <ul className="shelf-items reading-feedback-list">
              {feedback.map((item) => (
                <li key={item.id} className="shelf-item">
                  <div>
                    <p className="shelf-copy">{item.body}</p>
                    <time className="meta" dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">No active Reading feedback yet.</p>
          )}
        </aside>

        <div className="reading-evidence-detail">
          {selected ? (
            <article className="practice-evidence-attempt-card">
              <header>
                <span className="meta">Codex review</span>
                <strong>{selected.materialTitle}</strong>
                <span className="meta">
                  {(selected.completedAt || selected.createdAt).slice(0, 10)}
                </span>
              </header>
              {selected.summaryEn ? <p className="shelf-copy practice-prompt">{selected.summaryEn}</p> : null}
              {selected.trainingDirections.length ? (
                <div className="shelf-notes">
                  <strong>Training directions</strong>
                  <ul className="shelf-directions">
                    {selected.trainingDirections.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {selected.evidenceLimits ? (
                <p className="shelf-notes shelf-copy"><strong>Evidence limits · </strong>{selected.evidenceLimits}</p>
              ) : null}
              {selected.parentZh ? (
                <p className="shelf-notes shelf-copy"><strong>Parent note · </strong>{selected.parentZh}</p>
              ) : null}
            </article>
          ) : (
            <p className="meta">
              Parent feedback is listed on the left. Ask Codex to review the Reading shelf to add detailed findings here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
