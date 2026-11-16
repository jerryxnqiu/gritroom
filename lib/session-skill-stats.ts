export type SkillAttempt = {
  skill: string | null;
  blueprintTitle: string | null;
  isCorrect: boolean;
};

export type SessionSkillStat = {
  key: string;
  label: string;
  tested: number;
  correct: number;
  incorrect: number;
  percent: number;
};

function skillLabel(attempt: SkillAttempt) {
  const skill = attempt.skill?.trim();
  if (skill) return skill;
  const title = attempt.blueprintTitle?.trim();
  if (title) return title;
  return "Unclassified";
}

/** Group one paper’s Thinking Skills attempts by knowledge point / skill. */
export function buildSessionSkillStats(attempts: SkillAttempt[]): SessionSkillStat[] {
  const byKey = new Map<string, SessionSkillStat>();

  for (const attempt of attempts) {
    const label = skillLabel(attempt);
    const key = label.toLowerCase();
    const current = byKey.get(key) || {
      key,
      label,
      tested: 0,
      correct: 0,
      incorrect: 0,
      percent: 0,
    };
    current.tested += 1;
    if (attempt.isCorrect) current.correct += 1;
    else current.incorrect += 1;
    current.percent = Math.round((current.correct / current.tested) * 100);
    byKey.set(key, current);
  }

  return [...byKey.values()].sort((a, b) => {
    const byMiss = b.incorrect - a.incorrect;
    if (byMiss) return byMiss;
    const byTested = b.tested - a.tested;
    if (byTested) return byTested;
    return a.label.localeCompare(b.label);
  });
}
