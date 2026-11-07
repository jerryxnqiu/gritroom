"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  return (
    <div className="sign-out">
      <button
        className="icon-button"
        title="Sign out"
        aria-label={pending ? "Signing out" : "Sign out"}
        disabled={pending}
        onClick={() => {
          setError(false);
          startTransition(async () => {
            try {
              const response = await fetch("/api/auth/logout", { method: "POST" });
              if (!response.ok) throw new Error();
              router.replace("/");
              router.refresh();
            } catch {
              setError(true);
            }
          });
        }}
        type="button"
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5H5v14h6m-1-7h10m-4-4 4 4-4 4" />
        </svg>
      </button>
      {error ? <p className="sign-out-error" role="alert">Could not sign out. Try again.</p> : null}
    </div>
  );
}
