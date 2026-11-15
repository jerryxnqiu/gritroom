import type { PracticeSubject } from "./subjects.ts";

export type ReadingExtract = {
  label: string;
  body: string;
};

export type ParsedPracticePrompt = {
  title: string | null;
  instruction: string | null;
  passage: string | null;
  extracts: ReadingExtract[];
  stem: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeInstruction(paragraph: string) {
  const text = paragraph.trim();
  if (!text || text.length > 240) return false;
  if (/^(read |choose |select |look at |complete |fill |match |answer |using )/i.test(text)) return true;
  return /\b(gap|blank|passage|article|numbered|options?|extracts?)\b/i.test(text)
    && text.split(/\s+/).length <= 40;
}

function stripLeadingTitle(blocks: string[], title: string | null) {
  if (!title || !blocks.length) return blocks;
  if (blocks[0]!.toLowerCase() === title.toLowerCase()) return blocks.slice(1);
  return blocks;
}

/** Split a passage body into Extract A / B / C… tabs when multiple labeled extracts exist. */
export function splitReadingExtracts(passage: string | null | undefined): ReadingExtract[] {
  if (!passage?.trim()) return [];
  const text = passage.replace(/\r\n/g, "\n").trim();
  const chunks = text.split(/(?=^Extract\s+[A-Z]\b)/im).map((chunk) => chunk.trim()).filter(Boolean);
  const extracts: ReadingExtract[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^Extract\s+([A-Z])\b\s*(?:\n+|$)([\s\S]*)$/i);
    if (!match) continue;
    extracts.push({
      label: `Extract ${match[1]!.toUpperCase()}`,
      body: (match[2] || "").trim(),
    });
  }
  return extracts.length >= 2 ? extracts : [];
}

function splitPassageParts(passage: string, title: string | null) {
  let text = passage.trim();
  if (title) {
    text = text.replace(new RegExp(`^${escapeRegExp(title)}\\s*(?:\\n+|$)`, "i"), "").trim();
  }

  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (blocks.length >= 2 && looksLikeInstruction(blocks[0]!)) {
    const article = stripLeadingTitle(blocks.slice(1), title).join("\n\n");
    return {
      instruction: blocks[0]!,
      passage: article,
      extracts: splitReadingExtracts(article),
    };
  }
  const article = stripLeadingTitle(blocks, title).join("\n\n") || text;
  return {
    instruction: null,
    passage: article,
    extracts: splitReadingExtracts(article),
  };
}

/**
 * Reading attempts store title + passage + stem as one question_prompt blob.
 * Split that back into labeled parts for clearer learner/parent presentation.
 */
export function parsePracticePrompt(
  prompt: string | null | undefined,
  subject: PracticeSubject = "thinking",
): ParsedPracticePrompt {
  const empty = { title: null, instruction: null, passage: null, extracts: [] as ReadingExtract[], stem: "" };
  const raw = (prompt || "").trim();
  if (!raw) return empty;
  if (subject !== "reading") {
    return { ...empty, stem: raw };
  }

  const parts = raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { ...empty, stem: raw };
  }

  const stem = parts[parts.length - 1]!;
  if (parts.length === 2) {
    const title = parts[0]!.length <= 120 && !parts[0]!.includes("\n") ? parts[0]! : null;
    if (title) {
      return { ...empty, title, stem };
    }
    const split = splitPassageParts(parts[0]!, null);
    return {
      title: null,
      instruction: split.instruction,
      passage: split.passage,
      extracts: split.extracts,
      stem,
    };
  }

  const title = parts[0]!;
  const body = parts.slice(1, -1).join("\n\n");
  const split = splitPassageParts(body, title);
  return {
    title,
    instruction: split.instruction,
    passage: split.passage,
    extracts: split.extracts,
    stem,
  };
}
