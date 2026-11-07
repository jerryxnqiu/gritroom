"use client";

import { useState, useTransition } from "react";

export function ParentSettings() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function checkGmail() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const response = await fetch("/api/settings/gmail/check", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        reason?: string;
        from?: string;
        deepseekConfigured?: boolean;
        stage?: string;
      };
      if (!data.ok) {
        setError(data.reason ?? "Gmail check failed.");
        return;
      }
      setStatus(
        `Gmail SMTP authenticated for ${data.from}. DeepSeek secret ${data.deepseekConfigured ? "is" : "is not"} configured.`,
      );
    });
  }

  function sendTest() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const response = await fetch("/api/settings/gmail/test", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; message?: string; reason?: string };
      if (!response.ok || !data.ok) {
        setError(data.reason ?? data.message ?? "Test email failed.");
        return;
      }
      setStatus(data.message ?? "Test email accepted.");
    });
  }

  return (
    <section className="panel">
      <button className="ghost-toggle" onClick={() => setOpen((value) => !value)} type="button">
        Connections & settings {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="panel-body">
          <p className="lede">
            Model and mail credentials stay in Worker Secrets. Checking mail proves SMTP auth; a test email is a
            separate action from login codes.
          </p>
          <div className="actions">
            <button disabled={pending} onClick={checkGmail} type="button">
              Check Gmail connection
            </button>
            <button className="secondary" disabled={pending} onClick={sendTest} type="button">
              Send a test email to parent
            </button>
          </div>
          {status ? <p className="notice">{status}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
