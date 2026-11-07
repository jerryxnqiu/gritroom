"use client";

import { useState, useTransition } from "react";

export function ParentSettings() {
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [pending, startTransition] = useTransition();

  function run(action: "check" | "test") {
    setStatus(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/settings/gmail/${action}`, { method: "POST" });
        const data = await response.json() as {
          ok?: boolean; reason?: string; error?: string; message?: string; deepseekConfigured?: boolean;
        };
        if (!response.ok || !data.ok) throw new Error(data.error ?? data.reason ?? "Gmail could not complete this request.");
        setStatus({ text: action === "check"
          ? `Gmail connection verified. AI connection ${data.deepseekConfigured ? "configured" : "not configured"}.`
          : data.message ?? "Test email accepted for delivery." });
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Could not complete this request.", error: true });
      }
    });
  }

  return (
    <details className="panel">
      <summary>Connections &amp; settings</summary>
      <div className="panel-body">
        <p className="lede">Check the email connection without sending a message, or send a separate test email.</p>
        <div className="actions">
          <button className="button" disabled={pending} onClick={() => run("check")} type="button">Check Gmail connection</button>
          <button className="button secondary" disabled={pending} onClick={() => run("test")} type="button">Send a test email to parent</button>
        </div>
        {status ? <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p> : null}
      </div>
    </details>
  );
}
