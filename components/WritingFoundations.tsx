import { env } from "cloudflare:workers";

import { examLabel, type ExamGoal } from "@/lib/family";
import { writingKnowledge } from "@/lib/writing-knowledge";

export async function WritingFoundations({ goal }: { goal: ExamGoal }) {
  const { format, blueprints } = await writingKnowledge(env.DB, goal);

  return (
    <div>
      <p className="meta">
        {goal === "oc"
          ? "Writing is part of the Selective placement test, not Opportunity Class. You can still keep coaching notes for composition practice in this shelf."
          : `Official Writing format for ${examLabel(goal)}. Sources stay on the NSW pages; GritRoom stores format notes and coaching methods only.`}
      </p>
      {format ? (
        <p className="meta knowledge-format">
          <strong>Official format</strong> · {format.questionCount} open-response task
          {" · "}{format.minutes} minutes.{" "}
          <a href={format.url}>{format.label}</a>
          {format.notes ? <> · {format.notes}</> : null}
        </p>
      ) : goal === "selective" ? (
        <p className="meta">Writing format for Selective will appear here after migration.</p>
      ) : null}
      {blueprints.length ? (
        <div className="knowledge-patterns" aria-label="Writing patterns">
          {blueprints.map((blueprint) => (
            <details key={blueprint.id} className="knowledge-pattern">
              <summary>{blueprint.title}</summary>
              <div className="knowledge-detail">
                <p className="meta"><strong>{blueprint.skill}</strong> · Blueprint v{blueprint.version}</p>
                <p><strong>Writing method.</strong> {blueprint.method}</p>
                <p><strong>How we set a prompt.</strong> {blueprint.authoringRule}</p>
                <p><strong>How we review a response.</strong> {blueprint.verificationRule}</p>
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
      ) : goal === "selective" ? (
        <p className="meta">Writing foundations for Selective will appear here after review.</p>
      ) : (
        <p className="meta">Use coaching reports and feedback in this shelf while practising composition separately.</p>
      )}
    </div>
  );
}
