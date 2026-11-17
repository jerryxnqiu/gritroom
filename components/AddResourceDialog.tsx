"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import type { ExamGoal } from "@/lib/family";
import { materialKinds, materialTypes, maxMaterialFiles } from "@/lib/shelf-fields";
import { parentArchiveHref, parseSubject, practiceSubjects, subjectLabel, type PracticeSubject } from "@/lib/subjects";

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
  const multiPageKind = kind === "marked_paper" || kind === "study_material";
  const readingPassage = subject === "reading" && kind === "study_material";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/shelf/${profile}/materials`, { method: "POST", body });
        const result = await response.json() as { error?: string; count?: number };
        if (!response.ok) throw new Error(result.error || "Could not save the resource. Try again.");
        form.reset();
        setKind("coaching_report");
        dialog.current?.close();
        const nextGoal = body.get("goal") === "oc" ? "oc" : "selective";
        const nextSubject = parseSubject(body.get("subject")) ?? subject;
        const count = result.count ?? 1;
        if (nextGoal === goal && nextSubject === subject) {
          setNotice(count > 1 ? `Added ${count} pages to this archive.` : "Resource added to this archive.");
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
        <p className="meta">
          Save coaching reports/videos, a marked paper test (many page photos), or miscellaneous practice sources.
        </p>
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
                {practiceSubjects.map((item) => (
                  <option key={item} value={item}>{subjectLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input
                name="title"
                maxLength={140}
                required
                placeholder={
                  kind === "marked_paper"
                    ? "e.g. NSW Selective Reading sample · marked Nov 2026"
                    : readingPassage
                      ? "e.g. River Otters practice article"
                      : undefined
                }
              />
            </label>
            {multiPageKind ? (
              <>
                <label className="field">
                  <span>{kind === "marked_paper" ? "Paper set name" : readingPassage ? "Passage / source set name" : "Source set name"}</span>
                  <input
                    name="setName"
                    maxLength={120}
                    required={kind === "marked_paper"}
                    placeholder={kind === "marked_paper" ? "e.g. NSW Selective Reading PT1 marked" : "e.g. River Otters"}
                    aria-describedby="resource-set-help"
                  />
                </label>
                {readingPassage ? (
                  <label className="field"><span>Questions in this article (optional)</span>
                    <input name="sourceQuestions" maxLength={40} placeholder="e.g. 3" />
                  </label>
                ) : null}
                <p id="resource-set-help" className="meta">
                  {kind === "marked_paper"
                    ? "Select every page photo of this marked paper in order (page 1, 2, …). GritRoom saves them as one Paper set for Codex to join."
                    : "Select every screenshot/page of this practice source in order. GritRoom saves them as one set so Codex can join the pages."}
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
                  kind === "marked_paper"
                    ? "e.g. 30/38 · missed Q8, Q14, Q22 — vocab in context"
                    : "Optional context for a later Codex review"
                }
              />
            </label>
            <label className="field">
              <span>{multiPageKind ? "Attach pages (images or PDF)" : "Attach a file (optional)"}</span>
              <input
                name={multiPageKind ? "files" : "file"}
                type="file"
                accept={materialTypes.join(",")}
                multiple={multiPageKind}
                aria-describedby="resource-file-help"
              />
            </label>
            <p id="resource-file-help" className="meta">
              {multiPageKind
                ? `PDF, JPG, PNG or WebP · up to ${maxMaterialFiles} pages · 8 MB each · whole set under ~95 MB. Choose pages in order; no PDF merge needed.`
                : "PDF, JPG, PNG or WebP · up to 8 MB. Coaching items can be reviewed with Ask Codex."}
            </p>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="shelf-actions">
              <button type="submit" className="button">{pending ? "Saving…" : multiPageKind ? "Save set" : "Save resource"}</button>
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
