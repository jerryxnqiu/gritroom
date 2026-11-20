import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReadingArticleBlocks,
  groupReadingQuestionsByPassage,
  pickExactArticleSubset,
  pickReadingQuestionsByArticle,
} from "../lib/reading-articles.ts";

function q(id: string, passageGroup: string, title = "Title") {
  return {
    id,
    version: 1,
    passageGroup,
    passageTitle: title,
    passageText: `Passage for ${passageGroup}`,
    prompt: `Stem ${id}`,
    optionsJson: '{"A":"1","B":"2","C":"3","D":"4"}',
    correctOption: "A",
    explanationEn: null,
  };
}

test("groups unused Reading rows by passage_group", () => {
  const groups = groupReadingQuestionsByPassage([
    q("b", "pg-2"),
    q("a", "pg-1"),
    q("c", "pg-1"),
  ]);
  assert.equal(groups.length, 2);
  const first = groups.find((group) => group[0]?.passageGroup === "pg-1");
  assert.deepEqual(first?.map((item) => item.id), ["a", "c"]);
});

test("timed pick requires whole articles that sum exactly to the paper length", () => {
  const unused = [
    ...[1, 2, 3].map((n) => q(`f${n}`, "fiction", "Fiction")),
    ...[1, 2, 3, 4, 5].map((n) => q(`c${n}`, "cloze", "Cloze")),
    ...[1, 2].map((n) => q(`p${n}`, "poetry", "Poetry")),
  ];
  // 3+5=8 exact (whole articles only)
  const exact = pickExactArticleSubset(groupReadingQuestionsByPassage(unused), 8);
  assert.ok(exact);
  assert.equal(exact!.flat().length, 8);
  assert.equal(new Set(exact!.map((group) => group[0]!.passageGroup)).size, 2);

  // 3+5+2=10; no subset of {3,5,2} sums to 4
  assert.equal(pickExactArticleSubset(groupReadingQuestionsByPassage(unused), 4), null);

  const timed = pickReadingQuestionsByArticle(unused, "timed", 8);
  assert.equal(timed.length, 8);
  const orderGroups: string[] = [];
  for (const item of timed) {
    const last = orderGroups[orderGroups.length - 1];
    if (last !== item.passageGroup) orderGroups.push(item.passageGroup);
  }
  assert.equal(orderGroups.length, 2);
  assert.equal(new Set(timed.map((item) => item.passageGroup)).size, 2);
});

test("practice pick keeps whole articles together", () => {
  const unused = [
    ...[1, 2, 3, 4].map((n) => q(`a${n}`, "pg-a", "A")),
    ...[1, 2, 3, 4, 5, 6].map((n) => q(`b${n}`, "pg-b", "B")),
  ];
  const picked = pickReadingQuestionsByArticle(unused, "daily", 38);
  assert.ok(picked.length >= 4);
  const groups: string[] = [];
  for (const item of picked) {
    const last = groups[groups.length - 1];
    if (last !== item.passageGroup) groups.push(item.passageGroup);
  }
  // Contiguous blocks only — each passage_group appears once in sequence.
  assert.equal(groups.length, new Set(groups).size);
});

test("timed pick prefers 6–7 answer articles when they can fill the paper", () => {
  const unused = [
    ...[1, 2, 3].map((n) => q(`s${n}`, "small", "Small")),
    ...[1, 2, 3, 4, 5, 6].map((n) => q(`a${n}`, "six-a", "Six A")),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => q(`b${n}`, "seven-b", "Seven B")),
    ...[1, 2, 3, 4, 5].map((n) => q(`f${n}`, "five", "Five")),
  ];
  // 6+7=13 from preferred sizes; 3+5+5 would not apply — small/five are not preferred.
  const picked = pickReadingQuestionsByArticle(unused, "timed", 13);
  assert.equal(picked.length, 13);
  const used = new Set(picked.map((item) => item.passageGroup));
  assert.deepEqual([...used].sort(), ["seven-b", "six-a"]);
});

test("session UI blocks collapse consecutive same-article prompts", () => {
  const blocks = buildReadingArticleBlocks([
    {
      id: "1",
      prompt: "River Otters\n\nOtters live near rivers.\n\nWhat do they hunt?",
    },
    {
      id: "2",
      prompt: "River Otters\n\nOtters live near rivers.\n\nWhere do they live?",
    },
    {
      id: "3",
      prompt: "City Maps\n\nMaps show streets.\n\nWhat shows streets?",
    },
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.title, "River Otters");
  assert.equal(blocks[0]?.startIndex, 0);
  assert.equal(blocks[0]?.endIndex, 1);
  assert.equal(blocks[1]?.startIndex, 2);
  assert.equal(blocks[1]?.endIndex, 2);
});
