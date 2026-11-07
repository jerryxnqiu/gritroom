"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MaterialAnalysis } from "@/lib/material-analysis";
import { renderPdfPages } from "@/lib/pdf-pages";
import type { ShelfMaterial } from "@/lib/resource-shelf";
import { materialKinds } from "@/lib/shelf-fields";
import { MAX_ANALYSIS_PAGES } from "@/lib/shelf-pages";

export function ShelfMaterialList({
  materials, profileId, empty, analyses = [],
}: {
  materials: ShelfMaterial[];
  profileId: string;
  empty: string;
  analyses?: MaterialAnalysis[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const latest = new Map(analyses.map((item) => [item.materialId, item]));

  function run(material: ShelfMaterial, action: "delete" | "analyse") {
    if (pending) return;
    if (action === "delete" && !window.confirm(`Delete “${material.title}” from this shelf?`)) return;
    setError("");
    setNotice("");
    setBusyId(material.id);
    startTransition(async () => {
      try {
        if (action === "delete") {
          const response = await fetch(
            `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`,
            { method: "DELETE" },
          );
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Could not delete this resource. Try again.");
        } else {
          const pages = await preparePages(material, profileId);
          if (!pages.ok) throw new Error(pages.error);
          const response = await fetch(
            `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}/analyse`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ pages: pages.pages }),
            },
          );
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Could not analyse this resource. Try again.");
          if (pages.notice) setNotice(pages.notice);
        }
        router.refresh();
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Something went wrong. Try again.");
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
          return (
            <li className="shelf-item" key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <p className="meta">{materialKinds[material.kind]} · <time dateTime={material.createdAt}>{material.createdAt.slice(0, 10)}</time></p>
                {material.notes ? <details className="shelf-notes"><summary>Notes</summary><p className="shelf-copy">{material.notes}</p></details> : null}
                {analysis?.status === "succeeded" ? (
                  <details className="shelf-notes shelf-analysis">
                    <summary>Analysis</summary>
                    <p className="shelf-copy">{analysis.summaryEn}</p>
                    {analysis.trainingDirections.length ? (
                      <ul className="shelf-directions">
                        {analysis.trainingDirections.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : null}
                    {analysis.evidenceLimits ? <p className="meta">Limits: {analysis.evidenceLimits}</p> : null}
                    {analysis.parentZh ? (
                      <details className="shelf-notes">
                        <summary>Parent analysis (Chinese)</summary>
                        <p className="shelf-copy">{analysis.parentZh}</p>
                      </details>
                    ) : null}
                  </details>
                ) : null}
                {analysis?.status === "failed" ? <p className="error" role="status">{analysis.error}</p> : null}
                {analysis?.status === "running" ? <p className="meta" role="status">Analysis in progress…</p> : null}
              </div>
              <div className="shelf-item-links">
                {material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer">Open link <span aria-hidden="true">↗</span></a> : null}
                {material.fileName ? (
                  <a href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`} download={material.fileName}>
                    Download file
                  </a>
                ) : null}
                <button type="button" className="text-button" disabled={pending} onClick={() => run(material, "analyse")}>
                  {busyId === material.id && pending ? "Analysing…" : analysis?.status === "succeeded" ? "Re-analyse" : "Analyse resource"}
                </button>
                <button type="button" className="text-button shelf-delete" disabled={pending} onClick={() => run(material, "delete")}>
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

async function preparePages(material: ShelfMaterial, profileId: string) {
  const isPdf = material.fileType === "application/pdf"
    || Boolean(material.fileName?.toLowerCase().endsWith(".pdf"));
  if (!isPdf || !material.fileName) return { ok: true as const, pages: [] };

  const response = await fetch(
    `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`,
  );
  if (!response.ok) return { ok: false as const, error: "Could not download the PDF for page analysis." };
  const rendered = await renderPdfPages(await response.blob());
  if (!rendered.ok) return rendered;
  return {
    ok: true as const,
    pages: rendered.pages,
    notice: rendered.truncated
      ? `Only the first ${MAX_ANALYSIS_PAGES} of ${rendered.totalPages} pages were analysed. Split longer PDFs to cover the rest.`
      : undefined,
  };
}
