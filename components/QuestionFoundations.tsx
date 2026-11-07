import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal } from "@/lib/family";
import { thinkingKnowledge } from "@/lib/thinking-knowledge";

export async function QuestionFoundations({ goal }: { goal: ExamGoal }) {
  const { format, blueprints } = await thinkingKnowledge(env.DB, goal);

  return (
    <section className="panel family-panel" id="resource-shelf" aria-labelledby="question-foundations">
      <p className="eyebrow">03 / Resource shelf</p>
      <h2 id="question-foundations">Question foundations</h2>
      <p className="lede">See the references and reasoning methods we use to design original {examLabel(goal)} Thinking Skills practice.</p>
      {format ? (
        <p className="meta knowledge-format">
          <strong>Official format</strong> · {format.questionCount} questions, {format.minutes} minutes, {format.optionCount} options per question.{" "}
          <a href={format.url}>{format.label}</a>
        </p>
      ) : null}
      {blueprints.length ? (
        <div className="knowledge-patterns">
          {blueprints.map((blueprint) => (
            <details key={blueprint.id} className="family-subsection">
              <summary>{blueprint.title}</summary>
              <div className="knowledge-detail">
                <p className="meta"><strong>{blueprint.skill}</strong> · Blueprint v{blueprint.version}</p>
                <p><strong>Reasoning method.</strong> {blueprint.method}</p>
                <p><strong>How we write a new question.</strong> {blueprint.authoringRule}</p>
                <p><strong>How we check the answer.</strong> {blueprint.verificationRule}</p>
                <ul className="meta">
                  {blueprint.references.map((reference) => (
                    <li key={`${reference.url}#q${reference.questionNumber}`}>
                      <a href={reference.url}>{reference.label} · Q{reference.questionNumber} explanation</a>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      ) : <p className="meta">Question foundations for this exam goal will appear here after review.</p>}
    </section>
  );
}
