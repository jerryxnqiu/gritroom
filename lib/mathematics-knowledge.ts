import type { ExamGoal } from "./family";

type Source = { label: string; url: string; checkedOn: string };
type Format = Source & {
  questionCount: number;
  minutes: number;
  optionCount: number;
  notes: string | null;
};
type Reference = Source & { note: string };
type Blueprint = {
  id: string;
  version: number;
  skill: string;
  title: string;
  method: string;
  authoringRule: string;
  verificationRule: string;
};
type BlueprintRow = Blueprint & Reference;

export async function mathematicsKnowledge(db: D1Database, goal: ExamGoal) {
  const [format, { results }] = await Promise.all([
    db.prepare(
      `SELECT label, url, checked_on AS checkedOn, question_count AS questionCount,
              minutes, option_count AS optionCount, notes
       FROM mathematics_sources WHERE exam_goal = ? AND kind = 'format'`,
    ).bind(goal).first<Format>(),
    db.prepare(
      `WITH cited AS (
         SELECT r.*, s.label, s.url, s.checked_on AS checkedOn
         FROM mathematics_blueprint_references r
         JOIN mathematics_sources s ON s.id = r.source_id
         WHERE s.exam_goal = ? AND s.kind = 'worked_examples'
       )
       SELECT b.id, b.version, b.skill, b.title, b.method,
         b.authoring_rule AS authoringRule, b.verification_rule AS verificationRule,
         c.label, c.url, c.checkedOn, c.note
       FROM mathematics_blueprints b
       JOIN cited c ON c.blueprint_id = b.id AND c.blueprint_version = b.version
       WHERE b.version = (SELECT MAX(other.blueprint_version) FROM cited other WHERE other.blueprint_id = b.id)
       ORDER BY b.skill, b.title, c.label, c.note`,
    ).bind(goal).all<BlueprintRow>(),
  ]);

  const blueprints = new Map<string, Blueprint & { references: Reference[] }>();
  for (const { label, url, checkedOn, note, ...blueprint } of results) {
    const reference = { label, url, checkedOn, note };
    const existing = blueprints.get(blueprint.id);
    if (existing) existing.references.push(reference);
    else blueprints.set(blueprint.id, { ...blueprint, references: [reference] });
  }

  return { format, blueprints: [...blueprints.values()] };
}
