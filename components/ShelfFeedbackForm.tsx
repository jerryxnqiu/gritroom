"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ExamGoal } from "@/lib/family";
import type { PracticeSubject } from "@/lib/subjects";

type Feedback = { id: string; body: string; createdAt: string; canWithdraw: boolean };

export function ShelfFeedbackForm({
  profileId,
  goal,
  subject = "thinking",
  feedback,
}: {
  profileId: string;
  goal: ExamGoal;
  subject?: PracticeSubject;
  feedback: Feedback[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const endpoint = `/api/shelf/${encodeURIComponent(profileId)}/feedback`;

  function submit(path: string, request: RequestInit, success: string, form?: HTMLFormElement) {
    setStatus(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(path, request);
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not save feedback. Try again.");
        form?.reset();
        router.refresh();
        setStatus({ text: success });
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not save feedback. Try again.", error: true });
      }
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submit(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, subject, body: new FormData(form).get("body") }),
    }, "Feedback saved for future practice.", form);
  }

  return (
    <>
      <form className="stack-form shelf-feedback-form" aria-busy={pending} onSubmit={save}>
        <label className="field"><span>What should we consider for future practice?</span>
          <textarea name="body" rows={3} placeholder="e.g. Try longer passages, richer vocabulary and more complex sentences." maxLength={2000} required disabled={pending} />
        </label>
        <button type="submit" className="button secondary" disabled={pending}>Save feedback for future practice</button>
      </form>
      {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      {feedback.length ? (
        <ul className="shelf-items">
          {feedback.map((item) => (
            <li key={item.id} className="shelf-item">
              <div><p className="shelf-copy">{item.body}</p><time className="meta" dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div>
              {item.canWithdraw ? (
                <button type="button" className="text-button" disabled={pending} onClick={() => submit(
                  `${endpoint}/${encodeURIComponent(item.id)}`, { method: "DELETE" }, "Feedback withdrawn.",
                )}>Withdraw feedback</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="meta">No feedback saved in this archive yet.</p>}
    </>
  );
}
