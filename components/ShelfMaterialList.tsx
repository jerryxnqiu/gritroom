"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ShelfMaterial } from "@/lib/resource-shelf";
import { materialKinds } from "@/lib/shelf-fields";

export function ShelfMaterialList({
  materials, profileId, empty,
}: { materials: ShelfMaterial[]; profileId: string; empty: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function remove(material: ShelfMaterial) {
    if (pending) return;
    if (!window.confirm(`Delete “${material.title}” from this shelf?`)) return;
    setError("");
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
        setError(problem instanceof Error ? problem.message : "Could not delete this resource. Try again.");
      }
    });
  }

  if (!materials.length) return <p className="meta">{empty}</p>;

  return (
    <div aria-busy={pending}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <ul className="shelf-items">
        {materials.map((material) => (
          <li className="shelf-item" key={material.id}>
            <div>
              <strong>{material.title}</strong>
              <p className="meta">{materialKinds[material.kind]} · <time dateTime={material.createdAt}>{material.createdAt.slice(0, 10)}</time></p>
              {material.notes ? <details className="shelf-notes"><summary>Notes</summary><p className="shelf-copy">{material.notes}</p></details> : null}
            </div>
            <div className="shelf-item-links">
              {material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer">Open link <span aria-hidden="true">↗</span></a> : null}
              {material.fileName ? (
                <a href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`} download={material.fileName}>
                  Download file
                </a>
              ) : null}
              <button type="button" className="text-button shelf-delete" disabled={pending} onClick={() => remove(material)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
