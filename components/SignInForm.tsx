"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type EntryKind = "learner" | "parent";

export function SignInForm({ entry }: { entry: EntryKind }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestCode() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, entry }),
      });
      const data = (await response.json()) as { message?: string; error?: string; debugCode?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not request a code.");
        return;
      }
      setMessage(data.message ?? "Check your email for a sign-in code.");
      setDebugCode(data.debugCode ?? null);
      setStep("code");
    });
  }

  function verifyCode() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, entry, code }),
      });
      const data = (await response.json()) as {
        error?: string;
        redirectTo?: string;
        needsOnboarding?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? "Could not verify that code.");
        return;
      }
      router.push(data.redirectTo ?? (entry === "parent" ? "/parent" : "/learner"));
      router.refresh();
    });
  }

  return (
    <div className="stack-form">
      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
      </label>

      {step === "code" ? (
        <label className="field">
          <span>Email code</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            name="code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="6-digit code"
            value={code}
          />
        </label>
      ) : null}

      {message ? <p className="notice">{message}</p> : null}
      {debugCode ? <p className="notice subtle">Local debug code: {debugCode}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="actions">
        {step === "email" ? (
          <button disabled={pending || !email} onClick={requestCode} type="button">
            Email me a sign-in code
          </button>
        ) : (
          <>
            <button disabled={pending || code.length < 6} onClick={verifyCode} type="button">
              Sign in
            </button>
            <button className="secondary" disabled={pending} onClick={requestCode} type="button">
              Resend code
            </button>
          </>
        )}
      </div>
    </div>
  );
}
