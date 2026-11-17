"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { MaterialAnalysis } from "@/lib/material-analysis";
import type { ShelfMaterial } from "@/lib/resource-shelf";
import { materialKinds } from "@/lib/shelf-fields";
import { groupShelfMaterials, type ShelfMaterialGroup } from "@/lib/shelf-sets";
import { ConfirmDialog } from "./ConfirmDialog";

export function ShelfMaterialList({
  materials,
  profileId,
  empty,
  analyses = [],
  showAskCodex = true,
  askCodexLabel = "Ask Codex",
  askCodexAgainLabel = "Ask Codex again",
}: {
  materials: ShelfMaterial[];
  profileId: string;
  empty: string;
  analyses?: MaterialAnalysis[];
  /** Per-item Codex analysis. Off for misc practice sources — use archive bank generation instead. */
  showAskCodex?: boolean;
  askCodexLabel?: string;
  askCodexAgainLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShelfMaterialGroup | null>(null);
  const latest = new Map(analyses.map((item) => [item.materialId, item]));
  const groups = useMemo(() => groupShelfMaterials(materials), [materials]);

  function requestDelete(group: ShelfMaterialGroup) {
    if (pending) return;
    setError("");
    setNotice("");
    setPendingDelete(group);
  }

  function confirmDelete() {
    const group = pendingDelete;
    if (!group || pending) return;
    setBusyId(group.key);
    startTransition(async () => {
      try {
        for (const page of group.pages) {
          const response = await fetch(
            `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(page.id)}`,
            { method: "DELETE" },
          );
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Could not delete this resource. Try again.");
        }
        setPendingDelete(null);
        router.refresh();
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Something went wrong. Try again.");
        setPendingDelete(null);
      } finally {
        setBusyId(null);
      }
    });
  }

  function askCodex(group: ShelfMaterialGroup) {
    if (pending) return;
    setError("");
    setNotice("");
    setBusyId(group.key);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(group.anchor.id)}/analyse`,
        );
        const result = await response.json() as { brief?: string; error?: string };
        if (!response.ok || !result.brief) throw new Error(result.error || "Could not prepare the Codex task.");
        await navigator.clipboard.writeText(result.brief);
        setNotice(
          group.pages.length > 1
            ? `Codex task copied for “${group.title}” (${group.pages.length} pages). Paste it into a Codex chat in this gritroom repo; Codex will join the set and save the analysis back.`
            : `Codex task copied for “${group.title}”. Paste it into a Codex chat in this gritroom repo; Codex will read D1/R2 and save the analysis back.`,
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
        {groups.map((group) => {
          const analysis = group.pages
            .map((page) => latest.get(page.id))
            .find((item) => item?.status === "succeeded")
            ?? latest.get(group.anchor.id);
          const busy = busyId === group.key && pending;
          const analysed = analysis?.status === "succeeded";
          const multi = group.pages.length > 1;
          return (
            <li className="shelf-item" key={group.key}>
              <div>
                <strong>{group.title}</strong>
                <p className="meta">
                  {materialKinds[group.kind]}
                  {multi ? <> · {group.pages.length} pages</> : null}
                  {" · "}
                  <time dateTime={group.createdAt}>{group.createdAt.slice(0, 10)}</time>
                  {analysed ? <> · <span className="shelf-status shelf-status-done">Codex reviewed</span></> : null}
                </p>
                {group.notes ? <details className="shelf-notes"><summary>Notes</summary><p className="shelf-copy">{group.notes}</p></details> : null}
                {multi ? (
                  <details className="shelf-notes">
                    <summary>Pages in this set</summary>
                    <ul className="shelf-set-pages">
                      {group.pages.map((page, index) => (
                        <li key={page.id}>
                          <span>Page {index + 1}</span>
                          {page.fileName ? (
                            <a
                              href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(page.id)}`}
                              download={page.fileName}
                            >
                              Download
                            </a>
                          ) : (
                            <span className="meta">No file</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {analysed ? (
                  <details className="shelf-notes shelf-analysis">
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
                {group.url ? <a href={group.url} target="_blank" rel="noopener noreferrer">Open link <span aria-hidden="true">↗</span></a> : null}
                {!multi && group.anchor.fileName ? (
                  <a href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(group.anchor.id)}`} download={group.anchor.fileName}>
                    Download file
                  </a>
                ) : null}
                {showAskCodex ? (
                  <button
                    type="button"
                    className={`text-button${analysed ? " shelf-analysed" : ""}`}
                    disabled={pending}
                    onClick={() => askCodex(group)}
                  >
                    {busy ? "Preparing…" : analysed ? askCodexAgainLabel : askCodexLabel}
                  </button>
                ) : null}
                <button type="button" className="text-button shelf-delete" disabled={pending} onClick={() => requestDelete(group)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete && pendingDelete.pages.length > 1 ? "Delete this set?" : "Delete this resource?"}
        message={
          pendingDelete
            ? pendingDelete.pages.length > 1
              ? `Remove “${pendingDelete.title}” and all ${pendingDelete.pages.length} pages from this shelf? This cannot be undone.`
              : `Remove “${pendingDelete.title}” from this shelf? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        pending={pending && busyId === pendingDelete?.key}
        onCancel={() => {
          if (!pending) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
