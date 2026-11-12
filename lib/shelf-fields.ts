import type { ExamGoal } from "./family";
import { parseSubject, type PracticeSubject } from "./subjects.ts";

export const materialKinds = {
  coaching_report: "Coaching report",
  coaching_video: "Coaching video",
  study_material: "Practice questions (misc. source)",
} as const;

export type MaterialKind = keyof typeof materialKinds;

export const materialTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const maxMaterialBytes = 8 * 1024 * 1024;

export function shelfGoal(value: unknown): ExamGoal | null {
  return value === "selective" || value === "oc" ? value : null;
}

export { parseSubject, type PracticeSubject };

function httpLink(input: string): string | null {
  try {
    const url = new URL(input);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Structured notes so Codex can group multi-screenshot Reading passages in bulk review. */
export function composeReadingPassageNotes(input: {
  notes?: string;
  passageSet?: string;
  page?: string;
  pageCount?: string;
  sourceQuestions?: string;
}) {
  const lines: string[] = [];
  const passageSet = input.passageSet?.trim();
  const page = input.page?.trim();
  const pageCount = input.pageCount?.trim();
  const sourceQuestions = input.sourceQuestions?.trim();
  if (passageSet) lines.push(`Passage set: ${passageSet}`);
  if (page && pageCount) lines.push(`Page: ${page} of ${pageCount}`);
  else if (page) lines.push(`Page: ${page}`);
  if (sourceQuestions) lines.push(`Source questions in this article: ${sourceQuestions}`);
  const extra = input.notes?.trim();
  if (extra) lines.push(extra);
  return lines.join("\n").trim();
}

export async function parseMaterial(form: FormData) {
  const goal = shelfGoal(form.get("goal"));
  const subject = parseSubject(form.get("subject")) ?? "thinking";
  const kind = form.get("kind");
  const title = String(form.get("title") ?? "").trim();
  const rawLink = String(form.get("url") ?? "").trim();
  const rawNotes = String(form.get("notes") ?? "").trim();
  const notes = subject === "reading"
    ? composeReadingPassageNotes({
      notes: rawNotes,
      passageSet: String(form.get("passageSet") ?? ""),
      page: String(form.get("passagePage") ?? ""),
      pageCount: String(form.get("passagePageCount") ?? ""),
      sourceQuestions: String(form.get("sourceQuestions") ?? ""),
    })
    : rawNotes;
  const upload = form.get("file");
  const file = upload instanceof File && (upload.size || upload.name) ? upload : null;

  if (!goal || (kind !== "coaching_report" && kind !== "coaching_video" && kind !== "study_material")) {
    return { error: "Choose a material type and exam goal." } as const;
  }
  if (!title || title.length > 140) return { error: "Enter a title of up to 140 characters." } as const;
  if (notes.length > 6000) return { error: "Keep notes and transcripts within 6,000 characters." } as const;
  const url = rawLink ? httpLink(rawLink) : null;
  if (rawLink && (!url || url.length > 2000)) return { error: "Enter a valid web link." } as const;
  if (!url && !notes && !file) return { error: "Add a file, link or note to save this resource." } as const;

  if (file) {
    if (file.size > maxMaterialBytes) return { error: "Use a file up to 8 MB." } as const;
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const head = new TextDecoder().decode(bytes);
    const valid = (
      (file.type === "application/pdf" && head.startsWith("%PDF-")) ||
      (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (file.type === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) ||
      (file.type === "image/webp" && head.startsWith("RIFF") && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP")
    );
    if (!valid) return { error: "Choose a valid PDF, JPG, PNG or WebP file." } as const;
  }

  return { goal, subject, kind, title, url, notes: notes || null, file } as const;
}
