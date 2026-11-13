import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialAnalyses } from "@/lib/material-analysis";
import { readShelf } from "@/lib/resource-shelf";
import { parentArchiveHref, subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { AddResourceDialog } from "./AddResourceDialog";
import { ParentModuleSwitch } from "./ParentModuleSwitch";
import { QuestionFoundations } from "./QuestionFoundations";
import { ReadingFoundations } from "./ReadingFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";
import { ShelfMaterialList } from "./ShelfMaterialList";

export async function ResourceShelf({
  profile,
  goal,
  subject,
  userId,
}: {
  profile: ParentProfile;
  goal: ExamGoal;
  subject: PracticeSubject;
  userId: string;
}) {
  const [{ materials, feedback }, analyses] = await Promise.all([
    readShelf(env.DB, profile.id, goal, userId, subject),
    listMaterialAnalyses(env.DB, profile.id, goal, userId, subject),
  ]);
  const scope = `${profile.id}:${goal}:${subject}`;
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const study = materials.filter((item) => item.kind === "study_material");
  const moduleLabel = subjectLabel(subject);

  return (
    <section className="panel family-panel" id="shelf" aria-labelledby="resource-shelf-heading">
      <p className="eyebrow">04 / Practice inputs</p>
      <h2 id="resource-shelf-heading">{moduleLabel} resource shelf</h2>
      <p className="lede">
        Store coaching reports and miscellaneous practice sources for {profile.nickname}’s {moduleLabel} module.
        {subject === "thinking"
          ? " Use Practice bank when you want Codex to refresh questions from everything here."
          : " Use Practice bank when you want Codex to turn these into Reading training directions."}
      </p>
      <div className="shelf-toolbar">
        <div className="shelf-switch-stack">
          <ParentModuleSwitch profileId={profile.id} goal={goal} subject={subject} hash="shelf" />
          <nav className="shelf-actions" aria-label="Exam archive">
            {(["selective", "oc"] as const).map((archive) => (
              <Link
                key={archive}
                className={archive === goal ? "button" : "button secondary"}
                aria-current={archive === goal ? "true" : undefined}
                href={parentArchiveHref({ profileId: profile.id, goal: archive, subject, hash: "shelf" })}
              >
                {examLabel(archive)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="shelf-actions">
          <AddResourceDialog key={scope} profileId={profile.id} goal={goal} subject={subject} />
        </div>
      </div>

      {subject === "thinking" ? (
        <details className="family-subsection">
          <summary>01 · Official exam information</summary>
          <QuestionFoundations goal={goal} />
        </details>
      ) : (
        <details className="family-subsection">
          <summary>01 · Official Reading information</summary>
          <ReadingFoundations goal={goal} />
        </details>
      )}

      <details className="family-subsection">
        <summary id="shelf-coaching">02 · Coaching reports &amp; videos</summary>
        <div className="shelf-nest">
          <ShelfMaterialList
            profileId={profile.id}
            materials={coaching}
            analyses={analyses.filter((item) => coaching.some((material) => material.id === item.materialId))}
            empty="No coaching reports or video links in this module shelf yet."
          />
        </div>
      </details>

      <details className="family-subsection">
        <summary id="shelf-study">03 · Practice questions from other sources</summary>
        <div className="shelf-nest">
          <p className="meta">
            {subject === "thinking"
              ? "Workbook pages and other miscellaneous practice papers used as style exemplars. No per-file Codex click — use Generate practice bank above."
              : "Reading passages and workbook pages used as style exemplars. No per-file Codex click — use Ask Codex to review Reading shelf above in bulk. For one article across several screenshots, add each photo with the same Passage set name and page N of M; the bulk review joins the set and keeps it as a style model for later original questions."}
          </p>
          <ShelfMaterialList
            profileId={profile.id}
            materials={study}
            analyses={analyses.filter((item) => study.some((material) => material.id === item.materialId))}
            empty="No miscellaneous practice sources in this module shelf yet."
            showAskCodex={false}
          />
        </div>
      </details>

      <details className="family-subsection shelf-anchor" id="parent-feedback">
        <summary id="shelf-feedback">04 · Feedback &amp; question preferences</summary>
        <div className="shelf-nest">
          <p className="meta">
            Save your observations or share what your child says about {moduleLabel.toLowerCase()} in this exam archive.
          </p>
          <ShelfFeedbackForm
            key={scope}
            profileId={profile.id}
            goal={goal}
            subject={subject}
            feedback={feedback.map(({ authorId, ...item }) => ({
              ...item,
              canWithdraw: Boolean(profile.canManage) || authorId === userId,
            }))}
          />
        </div>
      </details>
    </section>
  );
}
