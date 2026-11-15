import type { ExamGoal } from "@/lib/family";
import {
  handwritingPassageSetName,
  plansForAudience,
  remediationPlanAudience,
  remediationSourcePaperLabel,
  type RemediationSourcePaper,
} from "@/lib/reading-remediation";
import { LearnerHandwritingUpload } from "./LearnerHandwritingUpload";
import { RemediationPlanView } from "./RemediationPlanView";

type LanguagePlan = {
  id: string;
  summary: string;
  createdAt: string;
  refId?: string | null;
  sourcePapers?: RemediationSourcePaper[];
};

function HowToUse({
  audience,
  nickname,
  passageSet,
}: {
  audience: "learner" | "parent";
  nickname?: string;
  passageSet?: string | null;
}) {
  if (audience === "learner") {
    return (
      <ol className="practice-language-howto">
        <li>
          <strong>Learn the words.</strong> Read each target form and its meaning until you can say it in your own words.
        </li>
        <li>
          <strong>Do the copywork on paper.</strong> Follow the handwriting drill (usually write each model sentence
          several times).
        </li>
        <li>
          <strong>Photograph and upload the pages yourself</strong>
          {passageSet ? (
            <>
              {" "}using the form below (Passage set <code>{passageSet}</code> is filled in for you).
            </>
          ) : (
            <> using the upload form once a remediation plan is ready.</>
          )}
          {" "}Your family asks Codex to review those photos and comment on your writing.
        </li>
      </ol>
    );
  }

  const child = nickname || "your child";
  return (
    <ol className="practice-language-howto">
      <li>
        <strong>Run remediation</strong> from Practice bank after Reading misses (Ask Codex for Reading remediation &
        copywork).
      </li>
      <li>
        <strong>{child} studies, writes, and uploads.</strong> They learn the words/phrases, handwrite the copywork, then
        photograph and upload the pages in Learner room (Words & phrases).
      </li>
      <li>
        <strong>Ask Codex again</strong> once their handwriting photos appear on the Reading shelf
        {passageSet ? (
          <>
            {" "}under Passage set <code>{passageSet}</code>
          </>
        ) : null}
        {" "}— treat that writing as evidence for Codex to review and comment on with the remediation plan.
      </li>
    </ol>
  );
}

export function ReadingLanguagePack({
  plans,
  audience,
  nickname,
  goal,
  limit = 3,
  defaultOpen = true,
}: {
  plans: LanguagePlan[];
  audience: "learner" | "parent";
  nickname?: string;
  goal?: ExamGoal;
  limit?: number;
  defaultOpen?: boolean;
}) {
  const learnerPlans = plansForAudience(plans, "learner");
  const parentOnlyPlans = plans.filter((plan) => remediationPlanAudience(plan.summary) === "parent");
  const list = learnerPlans;
  const latestRef = plans.find((plan) => plan.refId)?.refId
    || parentOnlyPlans.find((plan) => plan.refId)?.refId
    || list.find((plan) => plan.refId)?.refId
    || null;
  const passageSet = handwritingPassageSetName(latestRef);
  const who = audience === "parent"
    ? (nickname ? `What ${nickname} should learn & write` : "What the learner should learn & write")
    : "What you should learn & write";
  const empty = audience === "parent"
    ? `No language / copywork plan yet. After Reading mistakes, run Ask Codex for Reading remediation & copywork — then ${nickname || "the learner"} studies the words, writes on paper, and uploads the handwriting photos from Learner room.`
    : "No language list yet. After Reading mistakes, ask your family to run Reading remediation & copywork. Then you will see words to learn, a handwriting drill, and a place to upload your photos here.";

  return (
    <div className="practice-language-pack-wrap">
      <div className="practice-language-howto-card">
        <p className="eyebrow">How to use this</p>
        <HowToUse audience={audience} nickname={nickname} passageSet={latestRef ? passageSet : null} />
      </div>

      {!list.length ? (
        <p className="meta">{empty}</p>
      ) : (
        <details className="practice-language-pack" open={defaultOpen}>
          <summary>
            <span className="eyebrow">Words & phrases</span>
            <strong>{who}</strong>
            <span className="meta">
              {list.length} plan{list.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="practice-language-pack-body">
            {list.slice(0, limit).map((plan) => (
              <article key={plan.id} className="practice-language-card">
                <p className="meta">{plan.createdAt.slice(0, 10)}</p>
                {plan.sourcePapers?.length ? (
                  <div className="remediation-source-papers">
                    <span className="meta">From these Reading papers</span>
                    <ul>
                      {plan.sourcePapers.map((paper) => (
                        <li key={paper.sessionId}>
                          <strong>{remediationSourcePaperLabel(paper)}</strong>
                          {paper.incorrect ? (
                            <span className="meta"> · {paper.incorrect} miss{paper.incorrect === 1 ? "" : "es"}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="meta">From recent Reading misses (no finished miss paper linked yet).</p>
                )}
                <RemediationPlanView summary={plan.summary} />
              </article>
            ))}
            {audience === "learner" ? (
              <p className="meta">
                After the drill, upload your handwriting photos below. Your family asks Codex to review them and leave
                comments on your writing.
              </p>
            ) : (
              <p className="meta">
                The learner learns, writes, and uploads photos under Last results. You ask Codex so that handwriting is
                reviewed and commented on with the rest of this plan.
              </p>
            )}
          </div>
        </details>
      )}

      {audience === "learner" && goal && latestRef ? (
        <LearnerHandwritingUpload goal={goal} planRefId={latestRef} />
      ) : null}

      {audience === "parent" ? (
        <details className="practice-language-pack practice-language-pack-parent" open>
          <summary>
            <span className="eyebrow">Parent follow-up</span>
            <strong>Ask Codex to review handwriting</strong>
            <span className="meta">{parentOnlyPlans.length ? `${parentOnlyPlans.length} note${parentOnlyPlans.length === 1 ? "" : "s"}` : "checklist"}</span>
          </summary>
          <div className="practice-language-pack-body">
            {latestRef ? (
              <p className="practice-language-passage-set">
                <span className="meta">Passage set the learner’s uploads use</span>
                <code>{passageSet}</code>
              </p>
            ) : null}
            {parentOnlyPlans.length ? (
              parentOnlyPlans.map((plan) => (
                <article key={plan.id} className="practice-language-card">
                  <p className="meta">{plan.createdAt.slice(0, 10)}</p>
                  <p className="shelf-copy practice-prompt">{plan.summary}</p>
                </article>
              ))
            ) : (
              <p className="meta">
                After {nickname || "the learner"} uploads handwriting in Learner room (Passage set{" "}
                <code>{passageSet}</code>), run Ask Codex for Reading remediation & copywork again so those pages are
                reviewed and commented on with the plan. The <code>rrd_…</code> code is the plan id — that is expected.
              </p>
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
