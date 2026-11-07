"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FamilyBootstrap() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [examGoal, setExamGoal] = useState<"selective" | "oc">("selective");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createFamily() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/family/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, examGoal }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not create the family.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="panel">
      <h2>Create your family</h2>
      <p className="lede">Start with one child profile. You can add siblings and guardians later.</p>
      <div className="stack-form">
        <label className="field">
          <span>Child’s nickname</span>
          <input
            maxLength={40}
            name="nickname"
            onChange={(event) => setNickname(event.target.value)}
            placeholder="e.g. Maya"
            value={nickname}
          />
        </label>
        <label className="field">
          <span>Exam goal</span>
          <select
            name="examGoal"
            onChange={(event) => setExamGoal(event.target.value as "selective" | "oc")}
            value={examGoal}
          >
            <option value="selective">Selective</option>
            <option value="oc">OC</option>
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button disabled={pending || !nickname.trim()} onClick={createFamily} type="button">
          Create family room
        </button>
      </div>
    </section>
  );
}
