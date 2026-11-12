"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import type { ExamGoal } from "@/lib/family";
import { materialKinds, materialTypes } from "@/lib/shelf-fields";
import { parentArchiveHref, subjectLabel, type PracticeSubject } from "@/lib/subjects";

export function AddResourceDialog({
  profileId,
  goal,
  subject,
}: {
  profileId: string;
  goal: ExamGoal;
  subject: PracticeSubject;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>("coaching_report");
  const profile = encodeURIComponent(profileId);
  const showPassageSet = subject === "reading" && kind === "study_material";

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
        setKind("coaching_report");
        dialog.current?.close();
        const nextGoal = body.get("goal") === "oc" ? "oc" : "selective";
        const nextSubject = (body.get("subject") === "reading" ? "reading" : "thinking") as PracticeSubject;
        if (nextGoal === goal && nextSubject === subject) {
          setNotice("Resource added to this archive.");
          router.refresh();
        } else {
          router.replace(parentArchiveHref({
            profileId,
            goal: nextGoal,
            subject: nextSubject,
            hash: "shelf",
          }));
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
        <p className="meta">Save a coaching report/video, or miscellaneous practice pages for the selected module.</p>
        <form onSubmit={save} aria-busy={pending}>
          <fieldset className="stack-form" disabled={pending}>
            <div className="shelf-form-pair">
              <label className="field"><span>Resource type</span>
                <select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
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
            <label className="field"><span>Module</span>
              <select name="subject" defaultValue={subject}>
                <option value="thinking">{subjectLabel("thinking")}</option>
                <option value="reading">{subjectLabel("reading")}</option>
              </select>
            </label>
            <label className="field"><span>Title</span><input name="title" maxLength={140} required placeholder={showPassageSet ? "e.g. River Otters · page 1" : undefined} /></label>
            {showPassageSet ? (
              <>
                <label className="field"><span>Passage set name</span>
                  <input name="passageSet" maxLength={120} required placeholder="e.g. River Otters" aria-describedby="passage-set-help" />
                </label>
                <div className="shelf-form-pair">
                  <label className="field"><span>Page number</span>
                    <input name="passagePage" inputMode="numeric" maxLength={2} required placeholder="1" />
                  </label>
                  <label className="field"><span>Total pages in set</span>
                    <input name="passagePageCount" inputMode="numeric" maxLength={2} required placeholder="4" />
                  </label>
                </div>
                <label className="field"><span>Questions in this article (optional)</span>
                  <input name="sourceQuestions" maxLength={40} placeholder="e.g. 3" />
                </label>
                <p id="passage-set-help" className="meta">
                  Save each screenshot as its own resource with the same passage set name (page 1 of 4, 2 of 4, …).
                  Bulk Ask Codex to review Reading shelf joins the set and uses it as a style model for new items.
                </p>
              </>
            ) : null}
            <label className="field"><span>Video or resource link (optional)</span><input name="url" type="url" placeholder="https://youtube.com/watch?v=…" maxLength={2000} /></label>
            <label className="field"><span>Notes (optional)</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={6000}
                placeholder={
                  showPassageSet
                    ? "Optional extra context for this page"
                    : "Optional context for a later Codex review"
                }
              />
            </label>
            <label className="field"><span>Attach a file (optional)</span><input name="file" type="file" accept={materialTypes.join(",")} aria-describedby="resource-file-help" /></label>
            <p id="resource-file-help" className="meta">
              {subject === "reading"
                ? "PDF, JPG, PNG or WebP · up to 8 MB. Coaching reports can use Ask Codex one-by-one. Practice-question screenshots use a passage set and go through Ask Codex to review Reading shelf in bulk."
                : "PDF, JPG, PNG or WebP · up to 8 MB. Coaching items can be reviewed with Ask Codex; practice-question sources feed Ask Codex to generate practice bank."}
            </p>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="shelf-actions">
              <button type="submit" className="button">{pending ? "Saving…" : "Save resource"}</button>
              <button type="button" className="button secondary" onClick={() => { formReset(dialog.current); setKind("coaching_report"); dialog.current?.close(); }}>Cancel</button>
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
