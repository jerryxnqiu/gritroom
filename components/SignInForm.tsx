"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type EntryKind = "learner" | "parent";

export function SignInForm({ entry }: { entry: EntryKind }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = sentTo || email.trim();
    if (pending || !address || (sentTo && code.length !== 6)) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const verifying = Boolean(sentTo);
        const response = await fetch(verifying ? "/api/auth/verify-code" : "/api/auth/request-code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(verifying ? { email: address, entry, code } : { email: address, entry }),
        });
        const result = await response.json() as { message?: string; error?: string; redirectTo?: string };
        if (!response.ok) {
          setError(result.error || "Could not sign in. Please try again.");
        } else if (verifying) {
          router.replace(result.redirectTo === "/parent" ? "/parent" : "/learner");
          router.refresh();
        } else {
          setSentTo(address);
          setCode("");
          setMessage(result.message || "Check your inbox for a sign-in code.");
        }
      } catch {
        setError("Could not reach GritRoom. Check your connection and try again.");
      }
    });
  }

  return (
    <form className="stack-form sign-in-form" onSubmit={submit} aria-busy={pending}>
      {sentTo ? (
        <>
          <p className="sign-in-address">Code sent to <strong>{sentTo}</strong></p>
          <label className="field">
            <span>Six-digit email code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              name="code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter your code"
              type="text"
              value={code}
              pattern="[0-9]{6}"
              required
              autoFocus
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span>{entry === "parent" ? "Parent email" : "Approved family email"}</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={entry === "parent" ? "Your parent email address" : "Your family email address"}
            type="email"
            value={email}
            maxLength={254}
            required
          />
        </label>
      )}
      {message ? <p className="notice" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button entry-submit" disabled={pending || (sentTo ? code.length !== 6 : !email.trim())} type="submit">
        {pending ? (sentTo ? "Opening your room…" : "Sending your code…") : (sentTo ? "Enter my room" : "Email me a sign-in code")}
        <span aria-hidden="true">→</span>
      </button>
      {sentTo ? (
        <button
          className="text-button"
          disabled={pending}
          type="button"
          onClick={() => { setSentTo(""); setCode(""); setMessage(""); setError(""); }}
        >
          Use another email or request a new code
        </button>
      ) : null}
    </form>
  );
}
