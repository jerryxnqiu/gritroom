"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ExamGoal } from "@/lib/family";
import { handwritingPassageSetName } from "@/lib/reading-remediation";

export function LearnerHandwritingUpload({
  goal,
  planRefId,
}: {
  goal: ExamGoal;
  planRefId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const passageSet = handwritingPassageSetName(planRefId);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/learner/handwriting", { method: "POST", body });
        const result = await response.json() as { error?: string; passageSet?: string };
        if (!response.ok) throw new Error(result.error || "Could not upload the photo. Try again.");
        form.reset();
        setNotice(`Saved under ${result.passageSet || passageSet}. Upload the next page if you have more.`);
        router.refresh();
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not upload the photo. Try again.");
      }
    });
  }

  return (
    <div className="practice-language-upload">
      <p className="eyebrow">Upload your handwriting</p>
      <p className="meta">
        Photograph each finished page yourself. Photos are saved with Passage set{" "}
        <code>{passageSet}</code> so your family can ask Codex to review and comment on your writing.
      </p>
      <form onSubmit={save} aria-busy={pending} className="stack-form">
        <input type="hidden" name="goal" value={goal} />
        <input type="hidden" name="planRefId" value={planRefId} />
        <div className="shelf-form-pair">
          <label className="field">
            <span>Page</span>
            <input name="page" type="number" min={1} max={40} defaultValue={1} required />
          </label>
          <label className="field">
            <span>Of pages</span>
            <input name="pageCount" type="number" min={1} max={40} defaultValue={1} required />
          </label>
        </div>
        <label className="field">
          <span>Photo</span>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Uploading…" : "Upload page"}
        </button>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="meta" role="status">{notice}</p> : null}
    </div>
  );
}
