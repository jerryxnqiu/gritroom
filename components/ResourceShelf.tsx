import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialAnalyses } from "@/lib/material-analysis";
import { readShelf } from "@/lib/resource-shelf";
import { AddResourceDialog } from "./AddResourceDialog";
import { QuestionFoundations } from "./QuestionFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";
import { ShelfMaterialList } from "./ShelfMaterialList";

export async function ResourceShelf({ profile, goal, userId }: { profile: ParentProfile; goal: ExamGoal; userId: string }) {
  const [{ materials, feedback }, analyses] = await Promise.all([
    readShelf(env.DB, profile.id, goal, userId),
    listMaterialAnalyses(env.DB, profile.id, goal, userId),
  ]);
  const scope = `${profile.id}:${goal}`;
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const study = materials.filter((item) => item.kind === "study_material");

  return (
    <section className="panel family-panel" id="resource-shelf" aria-labelledby="resource-shelf-heading">
      <p className="eyebrow">03 / Practice inputs</p>
      <h2 id="resource-shelf-heading">Resource shelf</h2>
      <p className="lede">The materials, practice evidence and feedback that guide future questions for {profile.nickname}.</p>
      <div className="shelf-toolbar">
        <nav className="shelf-actions" aria-label="Exam archive">
          {(["selective", "oc"] as const).map((archive) => (
            <Link key={archive} className={archive === goal ? "button" : "button secondary"}
              aria-current={archive === goal ? "true" : undefined}
              href={`/parent?child=${encodeURIComponent(profile.id)}&shelfGoal=${archive}#resource-shelf`}>
              {examLabel(archive)}
            </Link>
          ))}
        </nav>
        <div className="shelf-actions"><AddResourceDialog key={scope} profileId={profile.id} goal={goal} /></div>
      </div>

      <details className="family-subsection">
        <summary>01 · Official exam information</summary>
        <QuestionFoundations goal={goal} />
      </details>

      <details className="family-subsection" open={coaching.length > 0}>
        <summary id="shelf-coaching">02 · Coaching reports &amp; videos</summary>
        <div className="shelf-nest">
          <ShelfMaterialList profileId={profile.id} materials={coaching} analyses={analyses.filter((item) => coaching.some((material) => material.id === item.materialId))} empty="No coaching reports or video links in this archive yet." />
        </div>
      </details>

      <details className="family-subsection" open={study.length > 0}>
        <summary id="shelf-study">03 · Extra study materials</summary>
        <div className="shelf-nest">
          <ShelfMaterialList profileId={profile.id} materials={study} analyses={analyses.filter((item) => study.some((material) => material.id === item.materialId))} empty="No extra study materials in this archive yet." />
        </div>
      </details>

      <section className="family-subsection shelf-anchor" id="practice-evidence" aria-labelledby="shelf-practice">
        <h3 id="shelf-practice">04 · Practice evidence</h3>
        <p className="meta">Per-question answers, time, confidence, drafts and working will be saved here once learner practice is live. Those records, together with material analyses above, will feed daily summaries and new question generation.</p>
      </section>

      <section className="family-subsection shelf-anchor" id="parent-feedback" aria-labelledby="shelf-feedback">
        <h3 id="shelf-feedback">05 · Feedback &amp; question preferences</h3>
        <p className="meta">Save your observations or share what your child says about the questions in this exam archive.</p>
        <ShelfFeedbackForm key={scope} profileId={profile.id} goal={goal} feedback={feedback.map(({ authorId, ...item }) => ({
          ...item, canWithdraw: Boolean(profile.canManage) || authorId === userId,
        }))} />
      </section>
    </section>
  );
}
