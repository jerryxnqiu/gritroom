"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

export function FamilyBootstrap() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function createFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/family/bootstrap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) {
          setError(data.error || "Could not create the family.");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach GritRoom. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="panel family-panel" id="family-access" aria-labelledby="create-family-heading">
      <p className="eyebrow">01 / Family access</p>
      <h2 id="create-family-heading">Create your family</h2>
      <p className="lede">Start with one child’s profile. You can add another child at any time.</p>
      <form className="stack-form" onSubmit={createFamily} aria-busy={pending}>
        <div className="profile-fields">
          <label className="field">
            <span>Child’s nickname</span>
            <input maxLength={40} name="nickname" placeholder="e.g. Maya" required />
          </label>
          <label className="field">
            <span>Exam goal</span>
            <select name="examGoal" defaultValue="selective">
              <option value="selective">Selective</option>
              <option value="oc">OC</option>
            </select>
          </label>
          <div className="profile-action"><button className="button" type="submit" disabled={pending}>{pending ? "Creating…" : "Create family room"}</button></div>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
