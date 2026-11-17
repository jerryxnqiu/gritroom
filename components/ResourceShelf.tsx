import Link from "next/link";
import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal, type ParentProfile } from "@/lib/family";
import { listMaterialAnalyses } from "@/lib/material-analysis";
import { readShelf } from "@/lib/resource-shelf";
import { parentArchiveHref, subjectLabel, type PracticeSubject } from "@/lib/subjects";
import { AddResourceDialog } from "./AddResourceDialog";
import { MathematicsFoundations } from "./MathematicsFoundations";
import { QuestionFoundations } from "./QuestionFoundations";
import { ReadingFoundations } from "./ReadingFoundations";
import { ShelfFeedbackForm } from "./ShelfFeedbackForm";
import { ShelfMaterialList } from "./ShelfMaterialList";
import { WritingFoundations } from "./WritingFoundations";

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
  const coaching = materials.filter((item) => item.kind === "coaching_report" || item.kind === "coaching_video");
  const marked = materials.filter((item) => item.kind === "marked_paper");
  const study = materials.filter((item) => item.kind === "study_material");
  const moduleLabel = subjectLabel(subject);

  return (
    <section className="panel family-panel" id="shelf" aria-labelledby="resource-shelf-heading">
      <p className="eyebrow">04 / Practice inputs</p>
      <h2 id="resource-shelf-heading">{moduleLabel} resource shelf</h2>
      <p className="lede">
        Store coaching reports, marked paper tests, and miscellaneous practice sources for {profile.nickname}’s {moduleLabel} module.
        {subject === "writing"
          ? " Writing is open response — keep prompts and marked samples here for coaching."
          : " Use Practice bank when you want Codex to refresh questions from everything here."}
      </p>
      <div className="shelf-toolbar">
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
        <div className="shelf-actions">
          <AddResourceDialog key={scope} profileId={profile.id} goal={goal} subject={subject} />
        </div>
      </div>

      <details className="family-subsection">
        <summary>01 · Official {moduleLabel} information</summary>
        {subject === "thinking" ? <QuestionFoundations goal={goal} /> : null}
        {subject === "reading" ? <ReadingFoundations goal={goal} /> : null}
        {subject === "mathematics" ? <MathematicsFoundations goal={goal} /> : null}
        {subject === "writing" ? <WritingFoundations goal={goal} /> : null}
      </details>

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
        <summary id="shelf-marked">03 · Marked paper tests</summary>
        <div className="shelf-nest">
          <p className="meta">
            Upload every page photo of a government/sample paper the learner sat on paper (no PDF merge needed).
            Add a score/miss note, then Ask Codex to review the marked paper — that becomes training directions for the next bank iteration.
          </p>
          <ShelfMaterialList
            profileId={profile.id}
            materials={marked}
            analyses={analyses.filter((item) => marked.some((material) => material.id === item.materialId))}
            empty="No marked paper tests in this module shelf yet."
            askCodexLabel="Ask Codex to review marked paper"
            askCodexAgainLabel="Ask Codex to review marked paper again"
          />
        </div>
      </details>

      <details className="family-subsection">
        <summary id="shelf-study">04 · Practice questions from other sources</summary>
        <div className="shelf-nest">
          <p className="meta">
            {subject === "reading"
              ? "Upload every screenshot/page of a practice article or workbook set in one go. Codex joins the Source/Passage set as a style model when generating Reading practice — it does not copy protected text."
              : "Upload every screenshot/page of a miscellaneous practice paper in one go. These are style exemplars for Ask Codex to generate practice bank — not live bank items themselves."}
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
        <summary id="shelf-feedback">05 · Feedback &amp; question preferences</summary>
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
