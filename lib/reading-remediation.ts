/** Guess whether a remediation evidence blob is for the learner, parent, or both. */
export function remediationPlanAudience(summary: string): "learner" | "parent" | "both" {
  const text = summary.toLowerCase().trim();
  // Explicit parent follow-up rows must never leak into the learner Words & phrases list,
  // even when they mention handwriting / Model copies for the photo-review checklist.
  if (
    /^parent photo check\b/.test(text)
    || /^parent follow-up\b/.test(text)
    || /upload to parent room|resource shelf as practice questions|re-run this reading remediation task/.test(text)
  ) {
    return "parent";
  }

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

export type RemediationTarget = {
  form: string;
  context: string | null;
  meaning: string | null;
  model: string | null;
  write: string | null;
};

export type ParsedRemediationPlan = {
  title: string | null;
  intro: string | null;
  targets: RemediationTarget[];
  drill: string | null;
  leftover: string | null;
};

function takeField(lines: string[], label: RegExp) {
  const index = lines.findIndex((line) => label.test(line));
  if (index < 0) return { value: null as string | null, rest: lines };
  const matched = lines[index]!.replace(label, "").trim();
  const more: string[] = [];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const next = lines[cursor]!;
    if (/^(meaning|model|write|copywork)\b/i.test(next) || /^\d+\.\s/.test(next)) break;
    more.push(next);
    cursor += 1;
  }
  const value = [matched, ...more].join(" ").replace(/\s+/g, " ").trim() || null;
  return { value, rest: [...lines.slice(0, index), ...lines.slice(cursor)] };
}

function parseTargetBlock(block: string): RemediationTarget | null {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;

  let working = [...lines];
  const meaning = takeField(working, /^meaning\s*[:·]\s*/i);
  working = meaning.rest;
  const model = takeField(working, /^model\s*[:·]\s*/i);
  working = model.rest;
  const write = takeField(working, /^write\b[:\s]*/i);
  working = write.rest;

  const head = working.join(" ").replace(/\s+/g, " ").trim();
  if (!head && !model.value) return null;

  const split = head.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  const form = (split?.[1] || head || model.value || "Target").trim();
  const context = split?.[2]?.trim() || null;

  return {
    form,
    context,
    meaning: meaning.value,
    model: model.value,
    write: write.value,
  };
}

/**
 * Turn a remediation summary into title / targets / copywork so the UI can highlight
 * what kids must handwrite (the Model sentence).
 */
export function parseRemediationPlan(summary: string): ParsedRemediationPlan {
  const text = scrubRemediationSummaryForLearner(summary);
  if (!text) {
    return { title: null, intro: null, targets: [], drill: null, leftover: null };
  }

  const itemSplit = text.split(/(?=^\d+\.\s+)/m);
  const head = (itemSplit[0] || "").trim();
  const blocks = itemSplit.slice(1).map((block) => block.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  const targets = blocks.map(parseTargetBlock).filter((item): item is RemediationTarget => Boolean(item));

  let title: string | null = null;
  let intro: string | null = null;
  let drill: string | null = null;
  let leftover: string | null = null;

  if (head) {
    const headLines = head.split(/\n/).map((line) => line.trim()).filter(Boolean);
    const drillIndex = headLines.findIndex((line) => /^copywork\b/i.test(line));
    const bodyLines = drillIndex >= 0 ? headLines.slice(0, drillIndex) : headLines;
    const drillLines = drillIndex >= 0 ? headLines.slice(drillIndex) : [];
    if (bodyLines.length) {
      title = bodyLines[0] || null;
      intro = bodyLines.slice(1).join(" ").replace(/\s+/g, " ").trim() || null;
    }
    if (drillLines.length) {
      drill = drillLines.join(" ").replace(/^copywork\s*[:·]?\s*/i, "").trim() || null;
    }
  }

  // Trailing copywork after numbered items (common Codex layout).
  if (targets.length && blocks.length) {
    const lastRaw = itemSplit[itemSplit.length - 1] || "";
    const afterModel = lastRaw.split(/\n(?=COPYWORK\b|Copywork\b)/i);
    if (afterModel.length > 1) {
      const trailing = afterModel.slice(1).join("\n").replace(/^copywork\s*[:·]?\s*/i, "").trim();
      if (trailing) drill = drill ? `${drill} ${trailing}` : trailing;
      // Re-parse last target without the trailing drill lines.
      const cleaned = afterModel[0]!.replace(/^\d+\.\s*/, "").trim();
      const retarget = parseTargetBlock(cleaned);
      if (retarget) targets[targets.length - 1] = retarget;
    }
  }

  if (!targets.length) {
    leftover = text;
  }

  return { title, intro, targets, drill, leftover };
}
