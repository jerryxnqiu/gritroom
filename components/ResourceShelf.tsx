import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { readShelf, type ShelfMaterial } from "@/lib/resource-shelf";
import { materialKinds } from "@/lib/shelf-fields";
import { AddResourceDialog } from "./AddResourceDialog";
import { QuestionFoundations } from "./QuestionFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";

function MaterialList({ materials, profileId, empty }: { materials: ShelfMaterial[]; profileId: string; empty: string }) {
  if (!materials.length) return <p className="meta">{empty}</p>;
  return (
    <ul className="shelf-items">
      {materials.map((material) => (
        <li className="shelf-item" key={material.id}>
          <div>
            <strong>{material.title}</strong>
            <p className="meta">{materialKinds[material.kind]} · <time dateTime={material.createdAt}>{material.createdAt.slice(0, 10)}</time></p>
            {material.notes ? <details className="shelf-notes"><summary>Notes</summary><p className="shelf-copy">{material.notes}</p></details> : null}
          </div>
          <div className="shelf-item-links">
            {material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer">Open link <span aria-hidden="true">↗</span></a> : null}
            {material.fileName ? <a href={`/api/shelf/${encodeURIComponent(profileId)}/materials/${encodeURIComponent(material.id)}`} download={material.fileName}>Download file</a> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

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
        <MaterialList profileId={profile.id} materials={materials.filter((item) => item.kind !== "study_material")} empty="No coaching reports or video links in this archive yet." />
      </section>

      <section className="family-subsection" aria-labelledby="shelf-study">
        <h3 id="shelf-study">03 · Extra study materials</h3>
        <MaterialList profileId={profile.id} materials={materials.filter((item) => item.kind === "study_material")} empty="No extra study materials in this archive yet." />
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
