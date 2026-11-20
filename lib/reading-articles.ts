import { parsePracticePrompt } from "./practice-prompt.ts";
import type { PracticeMode } from "./practice.ts";

const SHORT_SET_SIZE = 10;
/** Preferred answers per Reading article (official-style blocks). */
export const READING_ARTICLE_ANSWER_MIN = 6;
export const READING_ARTICLE_ANSWER_MAX = 7;

function articleSizeScore(size: number) {
  if (size >= READING_ARTICLE_ANSWER_MIN && size <= READING_ARTICLE_ANSWER_MAX) return 2;
  if (size === 5 || size === 8) return 1;
  return 0;
}

function isPreferredArticleSize(size: number) {
  return size >= READING_ARTICLE_ANSWER_MIN && size <= READING_ARTICLE_ANSWER_MAX;
}

export type ReadingQuestionLike = {
  id: string;
  version: number;
  passageGroup: string;
  passageTitle: string;
  passageText: string;
  prompt: string;
  optionsJson: string;
  correctOption: string;
  explanationEn: string | null;
};

export type ReadingArticleBlock = {
  key: string;
  title: string;
  /** Inclusive 0-based indexes into the session attempt list. */
  startIndex: number;
  endIndex: number;
};

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
  return items;
}

/** Group unused bank rows by passage_group, keeping stable id order inside each article. */
export function groupReadingQuestionsByPassage(unused: ReadingQuestionLike[]) {
  const groups = new Map<string, ReadingQuestionLike[]>();
  for (const question of unused) {
    const key = question.passageGroup.trim() || question.id;
    const list = groups.get(key) || [];
    list.push(question);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version),
  );
}

/**
 * Exact subset of whole articles whose answer counts sum to `target`.
 * Returns null when no exact pack exists.
 */
export function pickExactArticleSubset(groups: ReadingQuestionLike[][], target: number) {
  if (target <= 0) return [] as ReadingQuestionLike[][];
  const sizes = groups.map((group) => group.length);
  // dp[sum] = previous sum used to reach it (and which group index), or -1 for start
  const prevSum = new Array<number>(target + 1).fill(-2);
  const prevGroup = new Array<number>(target + 1).fill(-1);
  prevSum[0] = -1;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const size = sizes[groupIndex]!;
    if (size <= 0 || size > target) continue;
    for (let sum = target - size; sum >= 0; sum -= 1) {
      if (prevSum[sum] === -2 || prevSum[sum + size] !== -2) continue;
      prevSum[sum + size] = sum;
      prevGroup[sum + size] = groupIndex;
    }
  }

  if (prevSum[target] === -2) return null;

  const chosenIndexes: number[] = [];
  let cursor = target;
  while (cursor > 0) {
    const groupIndex = prevGroup[cursor]!;
    chosenIndexes.push(groupIndex);
    cursor = prevSum[cursor]!;
  }
  chosenIndexes.reverse();
  return chosenIndexes.map((index) => groups[index]!);
}

/**
 * Build a Reading paper from whole articles only.
 * Timed: exact `timedAnswers` count, each passage_group used at most once.
 * Prefer 6–7 answer articles when they can form a valid paper; fall back to any whole-article pack.
 * Practice: whole articles until at least SHORT_SET_SIZE answers (or all that remain),
 * preferring 6–7 answer articles first.
 */
export function pickReadingQuestionsByArticle(
  unused: ReadingQuestionLike[],
  mode: PracticeMode,
  timedAnswers: number,
) {
  const groups = shuffleInPlace(groupReadingQuestionsByPassage(unused));
  if (!groups.length) return [] as ReadingQuestionLike[];

  if (mode === "timed") {
    const preferred = shuffleInPlace(groups.filter((group) => isPreferredArticleSize(group.length)));
    const preferredSubset = preferred.length
      ? pickExactArticleSubset(preferred, timedAnswers)
      : null;
    if (preferredSubset) return preferredSubset.flat();
    const subset = pickExactArticleSubset(groups, timedAnswers);
    if (!subset) return [] as ReadingQuestionLike[];
    return subset.flat();
  }

  const ranked = [...groups].sort((a, b) => {
    const score = articleSizeScore(b.length) - articleSizeScore(a.length);
    return score !== 0 ? score : 0;
  });
  const picked: ReadingQuestionLike[] = [];
  for (const group of ranked) {
    if (picked.length >= SHORT_SET_SIZE) break;
    picked.push(...group);
  }
  return picked;
}

/** Fingerprint an attempt prompt so consecutive same-article answers stay grouped in the UI. */
export function readingPassageKeyFromPrompt(prompt: string) {
  const parsed = parsePracticePrompt(prompt, "reading");
  const title = (parsed.title || "").trim().toLowerCase();
  const passage = (parsed.passage || "").replace(/\s+/g, " ").trim().slice(0, 160).toLowerCase();
  return `${title}::${passage}` || prompt.slice(0, 120);
}

export function readingPassageTitleFromPrompt(prompt: string) {
  return parsePracticePrompt(prompt, "reading").title?.trim() || "Reading article";
}

/** Collapse a session’s Reading attempts into contiguous article blocks. */
export function buildReadingArticleBlocks(
  attempts: Array<{ id: string; prompt: string }>,
): ReadingArticleBlock[] {
  const blocks: ReadingArticleBlock[] = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]!;
    const fingerprint = readingPassageKeyFromPrompt(attempt.prompt);
    const last = blocks[blocks.length - 1];
    if (last && last.key === fingerprint) {
      last.endIndex = index;
      continue;
    }
    blocks.push({
      key: fingerprint,
      title: readingPassageTitleFromPrompt(attempt.prompt),
      startIndex: index,
      endIndex: index,
    });
  }
  return blocks;
}

export function readingArticleForIndex(blocks: ReadingArticleBlock[], attemptIndex: number) {
  return blocks.find((block) => attemptIndex >= block.startIndex && attemptIndex <= block.endIndex) ?? null;
}
