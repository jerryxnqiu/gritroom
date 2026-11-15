import type { PracticeSubject } from "./subjects.ts";

export type ParsedPracticePrompt = {
  title: string | null;
  instruction: string | null;
  passage: string | null;
  stem: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeInstruction(paragraph: string) {
  const text = paragraph.trim();
  if (!text || text.length > 240) return false;
  if (/^(read |choose |select |look at |complete |fill |match |answer )/i.test(text)) return true;
  return /\b(gap|blank|passage|article|numbered|options?)\b/i.test(text)
    && text.split(/\s+/).length <= 40;
}

function stripLeadingTitle(blocks: string[], title: string | null) {
  if (!title || !blocks.length) return blocks;
  if (blocks[0]!.toLowerCase() === title.toLowerCase()) return blocks.slice(1);
  return blocks;
}

function splitPassageParts(passage: string, title: string | null) {
  let text = passage.trim();
  if (title) {
    text = text.replace(new RegExp(`^${escapeRegExp(title)}\\s*(?:\\n+|$)`, "i"), "").trim();
  }

  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (blocks.length >= 2 && looksLikeInstruction(blocks[0]!)) {
    return {
      instruction: blocks[0]!,
      passage: stripLeadingTitle(blocks.slice(1), title).join("\n\n"),
    };
  }
  return {
    instruction: null,
    passage: stripLeadingTitle(blocks, title).join("\n\n") || text,
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
  const raw = (prompt || "").trim();
  if (!raw) {
    return { title: null, instruction: null, passage: null, stem: "" };
  }
  if (subject !== "reading") {
    return { title: null, instruction: null, passage: null, stem: raw };
  }

  const parts = raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { title: null, instruction: null, passage: null, stem: raw };
  }

  const stem = parts[parts.length - 1]!;
  if (parts.length === 2) {
    const title = parts[0]!.length <= 120 && !parts[0]!.includes("\n") ? parts[0]! : null;
    if (title) {
      return { title, instruction: null, passage: null, stem };
    }
    const split = splitPassageParts(parts[0]!, null);
    return { title: null, instruction: split.instruction, passage: split.passage, stem };
  }

  const title = parts[0]!;
  const body = parts.slice(1, -1).join("\n\n");
  const split = splitPassageParts(body, title);
  return {
    title,
    instruction: split.instruction,
    passage: split.passage,
    stem,
  };
}
