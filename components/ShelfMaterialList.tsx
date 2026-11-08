"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MaterialAnalysis } from "@/lib/material-analysis";
import type { ShelfMaterial } from "@/lib/resource-shelf";
import { materialKinds } from "@/lib/shelf-fields";

export function ShelfMaterialList({
  materials, profileId, empty, analyses = [], showAskCodex = true,
}: {
  materials: ShelfMaterial[];
  profileId: string;
  empty: string;
  analyses?: MaterialAnalysis[];
  /** Per-item Codex analysis. Off for misc practice sources — use archive bank generation instead. */
  showAskCodex?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const latest = new Map(analyses.map((item) => [item.materialId, item]));

  function deleteMaterial(material: ShelfMaterial) {
    if (pending) return;
    if (!window.confirm(`Delete “${material.title}” from this shelf?`)) return;
    setError("");
    setNotice("");
    setBusyId(material.id);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`,
          { method: "DELETE" },
        );
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not delete this resource. Try again.");
        router.refresh();
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Something went wrong. Try again.");
      } finally {
        setBusyId(null);
      }
    });
  }

  function askCodex(material: ShelfMaterial) {
    if (pending) return;
    setError("");
    setNotice("");
    setBusyId(material.id);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}/analyse`,
        );
        const result = await response.json() as { brief?: string; error?: string };
        if (!response.ok || !result.brief) throw new Error(result.error || "Could not prepare the Codex task.");
        await navigator.clipboard.writeText(result.brief);
        setNotice(
          `Codex task copied for “${material.title}”. Paste it into a Codex chat in this gritroom repo; Codex will read D1/R2 and save the analysis back.`,
        );
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not prepare the Codex task.");
      } finally {
        setBusyId(null);
      }
    });
  }

  if (!materials.length) return <p className="meta">{empty}</p>;

  return (
    <div aria-busy={pending}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <ul className="shelf-items">
        {materials.map((material) => {
          const analysis = latest.get(material.id);
          const busy = busyId === material.id && pending;
          const analysed = analysis?.status === "succeeded";
          return (
            <li className="shelf-item" key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <p className="meta">
                  {materialKinds[material.kind]} · <time dateTime={material.createdAt}>{material.createdAt.slice(0, 10)}</time>
                  {analysed ? <> · <span className="shelf-status shelf-status-done">Codex reviewed</span></> : null}
                </p>
                {material.notes ? <details className="shelf-notes"><summary>Notes</summary><p className="shelf-copy">{material.notes}</p></details> : null}
                {analysed ? (
                  <details className="shelf-notes shelf-analysis" open>
                    <summary>Codex findings</summary>
                    <p className="shelf-copy">{analysis.summaryEn}</p>
                    {analysis.trainingDirections.length ? (
                      <ul className="shelf-directions">
                        {analysis.trainingDirections.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : null}
                    {analysis.evidenceLimits ? <p className="meta">Limits: {analysis.evidenceLimits}</p> : null}
                    {analysis.parentZh ? (
                      <details className="shelf-notes shelf-analysis-nested">
                        <summary>Parent analysis (Chinese)</summary>
                        <p className="shelf-copy">{analysis.parentZh}</p>
                      </details>
                    ) : null}
                  </details>
                ) : null}
              </div>
              <div className="shelf-item-links">
                {material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer">Open link <span aria-hidden="true">↗</span></a> : null}
                {material.fileName ? (
                  <a href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`} download={material.fileName}>
                    Download file
                  </a>
                ) : null}
                {showAskCodex ? (
                  <button
                    type="button"
                    className={`text-button${analysed ? " shelf-analysed" : ""}`}
                    disabled={pending}
                    onClick={() => askCodex(material)}
                  >
                    {busy ? "Preparing…" : analysed ? "Ask Codex again" : "Ask Codex"}
                  </button>
                ) : null}
                <button type="button" className="text-button shelf-delete" disabled={pending} onClick={() => deleteMaterial(material)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
