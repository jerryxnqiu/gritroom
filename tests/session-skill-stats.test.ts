import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSessionSkillStats } from "../lib/session-skill-stats.ts";

test("groups thinking attempts by skill and sorts weakest first", () => {
  const stats = buildSessionSkillStats([
    { skill: "Relevant information", blueprintTitle: "Choose facts", isCorrect: false },
    { skill: "Relevant information", blueprintTitle: "Choose facts", isCorrect: false },
    { skill: "Relevant information", blueprintTitle: "Choose facts", isCorrect: true },
    { skill: "Counting overlapping groups", blueprintTitle: "Venn count", isCorrect: true },
    { skill: "Counting overlapping groups", blueprintTitle: "Venn count", isCorrect: true },
    { skill: null, blueprintTitle: "Odd one out", isCorrect: false },
  ]);

  assert.equal(stats.length, 3);
  assert.equal(stats[0].label, "Relevant information");
  assert.deepEqual(
    { tested: stats[0].tested, correct: stats[0].correct, incorrect: stats[0].incorrect, percent: stats[0].percent },
    { tested: 3, correct: 1, incorrect: 2, percent: 33 },
  );
  assert.equal(stats[1].label, "Odd one out");
  assert.equal(stats[1].tested, 1);
  assert.equal(stats[1].incorrect, 1);
  assert.equal(stats[2].label, "Counting overlapping groups");
  assert.equal(stats[2].percent, 100);
});

test("falls back to Unclassified when skill and title are missing", () => {
  const stats = buildSessionSkillStats([
    { skill: "  ", blueprintTitle: null, isCorrect: true },
    { skill: null, blueprintTitle: "  ", isCorrect: false },
  ]);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].label, "Unclassified");
  assert.equal(stats[0].tested, 2);
  assert.equal(stats[0].percent, 50);
});
