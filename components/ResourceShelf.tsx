import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { readShelf } from "@/lib/resource-shelf";
import { AddResourceDialog } from "./AddResourceDialog";
import { QuestionFoundations } from "./QuestionFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";
import { ShelfMaterialList } from "./ShelfMaterialList";

export async function ResourceShelf({ profile, goal, userId }: { profile: ParentProfile; goal: ExamGoal; userId: string }) {
  const { materials, feedback } = await readShelf(env.DB, profile.id, goal, userId);
  const scope = `${profile.id}:${goal}`;

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

      <section className="family-subsection" aria-labelledby="shelf-coaching">
        <h3 id="shelf-coaching">02 · Coaching reports &amp; videos</h3>
        <ShelfMaterialList profileId={profile.id} materials={materials.filter((item) => item.kind !== "study_material")} empty="No coaching reports or video links in this archive yet." />
      </section>

      <section className="family-subsection" aria-labelledby="shelf-study">
        <h3 id="shelf-study">03 · Extra study materials</h3>
        <ShelfMaterialList profileId={profile.id} materials={materials.filter((item) => item.kind === "study_material")} empty="No extra study materials in this archive yet." />
      </section>

      <section className="family-subsection shelf-anchor" id="practice-evidence" aria-labelledby="shelf-practice">
        <h3 id="shelf-practice">04 · Practice evidence</h3>
        <p className="meta">Saved answers, time per question and any working shared by the learner will appear here once practice is available for this archive.</p>
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
