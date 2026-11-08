import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialAnalyses } from "@/lib/material-analysis";
import { listPracticeEvidence } from "@/lib/practice";
import { readShelf } from "@/lib/resource-shelf";
import { AddResourceDialog } from "./AddResourceDialog";
import { PracticeEvidence } from "./PracticeEvidence";
import { QuestionFoundations } from "./QuestionFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";
import { ShelfMaterialList } from "./ShelfMaterialList";

export async function ResourceShelf({ profile, goal, userId }: { profile: ParentProfile; goal: ExamGoal; userId: string }) {
  const [{ materials, feedback }, analyses, evidence] = await Promise.all([
    readShelf(env.DB, profile.id, goal, userId),
    listMaterialAnalyses(env.DB, profile.id, goal, userId),
    listPracticeEvidence(env.DB, profile.id, goal, userId),
  ]);
  const scope = `${profile.id}:${goal}`;
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const study = materials.filter((item) => item.kind === "study_material");

  return (
    <section className="panel family-panel" id="resource-shelf" aria-labelledby="resource-shelf-heading">
      <p className="eyebrow">03 / Practice inputs</p>
      <h2 id="resource-shelf-heading">Resource shelf</h2>
      <p className="lede">
        Store coaching reports and miscellaneous practice-question sources for {profile.nickname}. Use{" "}
        <a href="#practice-bank">Generate practice bank</a> above when you want Codex to refresh questions from everything here.
      </p>
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
        <summary id="shelf-study">03 · Practice questions from other sources</summary>
        <div className="shelf-nest">
          <p className="meta">Workbook pages and other miscellaneous practice papers used as style exemplars. No per-file Codex click — use Generate practice bank above.</p>
          <ShelfMaterialList
            profileId={profile.id}
            materials={study}
            analyses={analyses.filter((item) => study.some((material) => material.id === item.materialId))}
            empty="No miscellaneous practice-question sources in this archive yet."
            showAskCodex={false}
          />
        </div>
      </details>

      <details className="family-subsection shelf-anchor" id="practice-evidence" open={evidence.length > 0}>
        <summary id="shelf-practice">04 · Practice evidence</summary>
        <div className="shelf-nest">
          <p className="meta">Per-question answers, time, confidence and draft notes from {profile.nickname}’s learner room. Together with material analyses above, these records feed the practice-bank task.</p>
          <PracticeEvidence items={evidence} />
        </div>
      </details>

      <details className="family-subsection shelf-anchor" id="parent-feedback" open={feedback.length > 0}>
        <summary id="shelf-feedback">05 · Feedback &amp; question preferences</summary>
        <div className="shelf-nest">
          <p className="meta">Save your observations or share what your child says about the questions in this exam archive.</p>
          <ShelfFeedbackForm key={scope} profileId={profile.id} goal={goal} feedback={feedback.map(({ authorId, ...item }) => ({
            ...item, canWithdraw: Boolean(profile.canManage) || authorId === userId,
          }))} />
        </div>
      </details>
    </section>
  );
}
