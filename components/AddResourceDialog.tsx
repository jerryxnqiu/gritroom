"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import type { ExamGoal } from "@/lib/family";
import { materialKinds, materialTypes } from "@/lib/shelf-fields";

export function AddResourceDialog({ profileId, goal }: { profileId: string; goal: ExamGoal }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const profile = encodeURIComponent(profileId);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/shelf/${profile}/materials`, { method: "POST", body });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not save the resource. Try again.");
        form.reset();
        dialog.current?.close();
        if (body.get("goal") === goal) {
          setNotice("Resource added to this archive.");
          router.refresh();
        } else {
          router.replace(`/parent?child=${profile}&shelfGoal=${body.get("goal") === "oc" ? "oc" : "selective"}#resource-shelf`);
        }
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not save the resource. Try again.");
      }
    });
  }

  return (
    <>
      <button type="button" className="button" onClick={() => { setError(""); setNotice(""); dialog.current?.showModal(); }}>Add resource</button>
      {notice ? <span className="meta" role="status">{notice}</span> : null}
      <dialog ref={dialog} className="shelf-dialog" aria-labelledby="add-resource-heading" onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <h3 id="add-resource-heading">Add a resource</h3>
        <p className="meta">Save a report, video link, photo or study document to this child’s archive.</p>
        <form onSubmit={save} aria-busy={pending}>
          <fieldset className="stack-form" disabled={pending}>
            <div className="shelf-form-pair">
              <label className="field"><span>Resource type</span>
                <select name="kind" defaultValue="coaching_report">
                  {Object.entries(materialKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field"><span>Exam archive</span>
                <select name="goal" defaultValue={goal}>
                  <option value="selective">Selective</option>
                  <option value="oc">OC</option>
                </select>
              </label>
            </div>
            <label className="field"><span>Title</span><input name="title" maxLength={140} required /></label>
            <label className="field"><span>Video or resource link (optional)</span><input name="url" type="url" placeholder="https://youtube.com/watch?v=…" maxLength={2000} /></label>
            <label className="field"><span>Notes (optional)</span>
              <textarea name="notes" rows={3} maxLength={6000} placeholder="Optional context for a later Codex review" />
            </label>
            <label className="field"><span>Attach a file (optional)</span><input name="file" type="file" accept={materialTypes.join(",")} aria-describedby="resource-file-help" /></label>
            <p id="resource-file-help" className="meta">PDF, JPG, PNG or WebP · up to 8 MB. After saving, click Ask Codex so an agent can read D1/R2 and write the analysis back.</p>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="shelf-actions">
              <button type="submit" className="button">{pending ? "Saving…" : "Save resource"}</button>
              <button type="button" className="button secondary" onClick={() => { formReset(dialog.current); dialog.current?.close(); }}>Cancel</button>
            </div>
          </fieldset>
        </form>
      </dialog>
    </>
  );
}

function formReset(dialog: HTMLDialogElement | null) {
  dialog?.querySelector("form")?.reset();
}
