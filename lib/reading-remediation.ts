/** Guess whether a remediation evidence blob is for the learner, parent, or both. */
export function remediationPlanAudience(summary: string): "learner" | "parent" | "both" {
  const text = summary.toLowerCase();
  const parentHeavy = /parent photo|photo check|upload to parent|for the parent|remind the learner|ask codex again|re-run this remediation|re-run the reading remediation|no handwriting has been uploaded|plan id\s*:/.test(text);
  const learnerHeavy = /copywork|memorise|language list|model sentence|meaning ·|meaning:|vocab|phrase|slang|write each target|handwrite|upload in learner|photograph each page yourself/.test(text);

  if (parentHeavy && !learnerHeavy) return "parent";
  if (learnerHeavy && !parentHeavy) return "learner";
  if (parentHeavy && learnerHeavy) {
    // Mixed blob — treat as both; UI will still show how-to steps.
    return "both";
  }
  return "both";
}

export function plansForAudience<T extends { summary: string }>(
  plans: T[],
  audience: "learner" | "parent",
) {
  return plans.filter((plan) => {
    const kind = remediationPlanAudience(plan.summary);
    if (audience === "parent") return true;
    return kind === "learner" || kind === "both";
  });
}

/** Passage set label used when the learner uploads handwriting photos for a plan. */
export function handwritingPassageSetName(refId: string | null | undefined) {
  const id = (refId || "").trim();
  if (!id) return "Handwriting · (latest plan)";
  return `Handwriting · ${id}`;
}

/** Hide raw plan-id lines from learner-facing text. */
export function scrubRemediationSummaryForLearner(summary: string) {
  return summary
    .split(/\n/)
    .filter((line) => !/^\s*plan\s*id\s*:/i.test(line))
    .filter((line) => !/^\s*rrd_[a-z0-9]+/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
