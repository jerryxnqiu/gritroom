import { parseRemediationPlan } from "@/lib/reading-remediation";

export function RemediationPlanView({ summary }: { summary: string }) {
  const plan = parseRemediationPlan(summary);

  if (!plan.targets.length) {
    return <p className="shelf-copy practice-prompt">{plan.leftover || summary}</p>;
  }

  return (
    <div className="remediation-plan">
      {plan.title ? <p className="remediation-plan-title">{plan.title}</p> : null}
      {plan.intro ? <p className="meta remediation-plan-intro">{plan.intro}</p> : null}

      <ol className="remediation-target-list">
        {plan.targets.map((target, index) => (
          <li key={`${target.form}-${index}`} className="remediation-target">
            <div className="remediation-target-head">
              <strong className="remediation-target-form">{target.form}</strong>
              {target.context ? <span className="meta">{target.context}</span> : null}
            </div>
            {target.meaning ? (
              <p className="remediation-target-meaning">
                <strong className="remediation-label">Meaning</strong>
                {target.meaning}
              </p>
            ) : null}
            {target.model ? (
              <div className="remediation-target-write">
                <span className="remediation-write-badge">Write this</span>
                <p className="remediation-model-row">
                  <strong className="remediation-label">Model</strong>
                  <span className="remediation-model">
                    “{target.model.replace(/^["“]|["”]$/g, "")}”
                  </span>
                </p>
                <p className="meta">
                  {target.write || "Handwrite this model sentence on paper (usually 5 times)."}
                </p>
              </div>
            ) : target.write ? (
              <p className="meta">{target.write}</p>
            ) : null}
          </li>
        ))}
      </ol>

      {plan.drill ? (
        <p className="remediation-drill">
          <strong className="remediation-label">Copywork</strong>
          {plan.drill}
        </p>
      ) : null}
    </div>
  );
}
