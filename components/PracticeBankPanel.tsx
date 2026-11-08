import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialsForCodexBank } from "@/lib/material-analysis";
import { AskCodexBankButton } from "./AskCodexBankButton";

export async function PracticeBankPanel({
  profile,
  goal,
  userId,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  userId: string;
}) {
  const shelf = await listMaterialsForCodexBank(env.DB, profile.id, goal, userId);
  const materialCount = shelf?.materials.length ?? 0;

  return (
    <section className="panel family-panel" id="practice-bank" aria-labelledby="practice-bank-heading">
      <p className="eyebrow">02 / Practice bank</p>
      <h2 id="practice-bank-heading">Generate practice bank</h2>
      <p className="lede">
        Ask Codex to read the latest D1 inputs for {profile.nickname}’s {examLabel(goal)} archive — blueprints,
        coaching reports, miscellaneous practice sources, material analyses, practice evidence and parent feedback —
        then insert evolved questions into the active bank.
      </p>
      <div className="shelf-toolbar">
        <nav className="shelf-actions" aria-label="Practice bank archive">
          {(["selective", "oc"] as const).map((archive) => (
            <Link
              key={archive}
              className={archive === goal ? "button" : "button secondary"}
              aria-current={archive === goal ? "true" : undefined}
              href={`/parent?child=${encodeURIComponent(profile.id)}&shelfGoal=${archive}#practice-bank`}
            >
              {examLabel(archive)}
            </Link>
          ))}
        </nav>
      </div>
      <AskCodexBankButton profileId={profile.id} goal={goal} disabled={materialCount === 0} />
      {materialCount === 0 ? (
        <p className="meta">Add coaching reports or practice-question sources in the resource shelf below first.</p>
      ) : (
        <p className="meta">
          {materialCount} shelf source{materialCount === 1 ? "" : "s"} ready for this archive. Paste the copied task into a Codex chat in this gritroom repo.
        </p>
      )}
    </section>
  );
}
