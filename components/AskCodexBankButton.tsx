"use client";

import { useState, useTransition } from "react";

import type { ExamGoal } from "@/lib/family";

export function AskCodexBankButton({
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
          `/api/shelf/${encodeURIComponent(profileId)}/bank-brief?goal=${encodeURIComponent(goal)}`,
        );
        const result = await response.json() as { brief?: string; error?: string };
        if (!response.ok || !result.brief) throw new Error(result.error || "Could not prepare the Codex bank task.");
        await navigator.clipboard.writeText(result.brief);
        setNotice("Codex bank task copied. Paste it into a Codex chat in this gritroom repo.");
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not prepare the Codex bank task.");
      }
    });
  }

  return (
    <div className="shelf-bank-action">
      <button type="button" className="button secondary" disabled={pending || disabled} onClick={copyBrief}>
        {pending ? "Preparing…" : "Ask Codex to generate practice bank"}
      </button>
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
