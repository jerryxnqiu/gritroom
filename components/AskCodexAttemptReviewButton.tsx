"use client";

import { useState, useTransition } from "react";

import type { ExamGoal } from "@/lib/family";

export function AskCodexAttemptReviewButton({
  profileId,
  goal,
  disabled = false,
}: {
  profileId: string;
  goal: ExamGoal;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function copyBrief() {
    if (pending || disabled) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/shelf/${encodeURIComponent(profileId)}/attempt-review-brief?goal=${encodeURIComponent(goal)}`,
        );
        const result = await response.json() as { brief?: string; pendingCount?: number; error?: string };
        if (!response.ok || !result.brief) throw new Error(result.error || "Could not prepare the Codex review task.");
        await navigator.clipboard.writeText(result.brief);
        setNotice(
          `Codex review task copied (${result.pendingCount ?? "pending"} incorrect attempts). Paste it into a Codex chat in this gritroom repo.`,
        );
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not prepare the Codex review task.");
      }
    });
  }

  return (
    <div className="shelf-bank-action">
      <button type="button" className="button secondary" disabled={pending || disabled} onClick={copyBrief}>
        {pending ? "Preparing…" : "Ask Codex to review incorrect attempts"}
      </button>
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
