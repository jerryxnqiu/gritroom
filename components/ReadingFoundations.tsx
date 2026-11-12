import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal } from "@/lib/family";
import { readingKnowledge } from "@/lib/reading-knowledge";

export async function ReadingFoundations({ goal }: { goal: ExamGoal }) {
  const { format, blueprints } = await readingKnowledge(env.DB, goal);

  return (
    <div>
      <p className="meta">
        Official format and Reading methods for original {examLabel(goal)} practice. Sources stay on the NSW pages;
        GritRoom stores format notes and authoring methods only.
      </p>
      {format ? (
        <p className="meta knowledge-format">
          <strong>Official format</strong> · {format.questionCount} questions
          {" · "}{format.answerCount} answers
          {" · "}{format.minutes} minutes
          {" · "}{format.optionCount} options per answer.{" "}
          <a href={format.url}>{format.label}</a>
          {format.notes ? <> · {format.notes}</> : null}
        </p>
      ) : (
        <p className="meta">Reading format for this exam goal will appear here after migration.</p>
      )}
      {blueprints.length ? (
        <div className="knowledge-patterns" aria-label="Reading patterns">
          {blueprints.map((blueprint) => (
            <details key={blueprint.id} className="knowledge-pattern">
              <summary>{blueprint.title}</summary>
              <div className="knowledge-detail">
                <p className="meta"><strong>{blueprint.skill}</strong> · Blueprint v{blueprint.version}</p>
                <p><strong>Reading method.</strong> {blueprint.method}</p>
                <p><strong>How we write a new item.</strong> {blueprint.authoringRule}</p>
                <p><strong>How we check the answer.</strong> {blueprint.verificationRule}</p>
                <ul className="meta">
                  {blueprint.references.map((reference) => (
                    <li key={`${reference.url}#${reference.note}`}>
                      <a href={reference.url}>{reference.label}</a> · {reference.note}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="meta">Reading foundations for this exam goal will appear here after review.</p>
      )}
    </div>
  );
}
