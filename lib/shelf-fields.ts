import type { ExamGoal } from "./family";
import { parseSubject, type PracticeSubject } from "./subjects.ts";

export const materialKinds = {
  coaching_report: "Coaching report",
  coaching_video: "Coaching video",
  marked_paper: "Marked paper test",
  study_material: "Practice questions (misc. source)",
} as const;

export type MaterialKind = keyof typeof materialKinds;

export const materialTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const maxMaterialBytes = 8 * 1024 * 1024;
/** Multi-page marked papers / practice sources — enough for a full sample paper. */
export const maxMaterialFiles = 40;
/** Cap whole-set upload under the Workers request body limit (~100 MB). */
export const maxMaterialBatchBytes = 95 * 1024 * 1024;

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

function isMaterialKind(value: unknown): value is MaterialKind {
  return value === "coaching_report"
    || value === "coaching_video"
    || value === "marked_paper"
    || value === "study_material";
}

/** Structured notes so Codex can group multi-screenshot Reading passages in bulk review. */
export function composeReadingPassageNotes(input: {
  notes?: string;
  passageSet?: string;
  page?: string;
  pageCount?: string;
  sourceQuestions?: string;
}) {
  return composeResourceSetNotes({
    setLabel: "Passage set",
    setName: input.passageSet,
    page: input.page,
    pageCount: input.pageCount,
    sourceQuestions: input.sourceQuestions,
    notes: input.notes,
  });
}

/** Shared set metadata for marked papers and multi-page practice sources. */
export function composeResourceSetNotes(input: {
  setLabel: "Passage set" | "Paper set" | "Source set";
  setName?: string;
  page?: string;
  pageCount?: string;
  sourceQuestions?: string;
  notes?: string;
}) {
  const lines: string[] = [];
  const setName = input.setName?.trim();
  const page = input.page?.trim();
  const pageCount = input.pageCount?.trim();
  const sourceQuestions = input.sourceQuestions?.trim();
  if (setName) lines.push(`${input.setLabel}: ${setName}`);
  if (page && pageCount) lines.push(`Page: ${page} of ${pageCount}`);
  else if (page) lines.push(`Page: ${page}`);
  if (sourceQuestions) lines.push(`Source questions in this article: ${sourceQuestions}`);
  const extra = input.notes?.trim();
  if (extra) lines.push(extra);
  return lines.join("\n").trim();
}

export type ResourceSetLabel = "Passage set" | "Paper set" | "Source set";

/** Parse Paper/Source/Passage set lines written into shelf notes. */
export function parseResourceSetNotes(notes: string | null | undefined) {
  const text = notes?.trim() || "";
  const setMatch = text.match(/^(Passage set|Paper set|Source set):\s*(.+)$/m);
  const pageMatch = text.match(/^Page:\s*(\d+)(?:\s+of\s+(\d+))?$/m);
  const sourceQuestionsMatch = text.match(/^Source questions in this article:\s*(.+)$/m);
  const meta = /^(Passage set|Paper set|Source set|Page|Source questions in this article):/i;
  const extraNotes = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !meta.test(line))
    .join("\n")
    .trim();
  return {
    setLabel: (setMatch?.[1] as ResourceSetLabel | undefined) ?? null,
    setName: setMatch?.[2]?.trim() || null,
    page: pageMatch ? Number(pageMatch[1]) : null,
    pageCount: pageMatch?.[2] ? Number(pageMatch[2]) : null,
    sourceQuestions: sourceQuestionsMatch?.[1]?.trim() || null,
    extraNotes: extraNotes || null,
  };
}

/** Drop “ · page N of M” from auto-generated multi-page titles. */
export function stripResourcePageSuffix(title: string) {
  return title.replace(/\s·\s*page\s+\d+(?:\s+of\s+\d+)?$/i, "").trim() || title;
}

function collectUploadFiles(form: FormData) {
  const multi = form.getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (multi.length) return multi;
  const single = form.get("file");
  if (single instanceof File && single.size > 0) return [single];
  return [] as File[];
}

function setLabelFor(kind: MaterialKind, subject: PracticeSubject) {
  if (kind === "marked_paper") return "Paper set" as const;
  if (subject === "reading") return "Passage set" as const;
  return "Source set" as const;
}

export async function parseMaterial(form: FormData) {
  const goal = shelfGoal(form.get("goal"));
  const subject = parseSubject(form.get("subject")) ?? "thinking";
  const kindRaw = form.get("kind");
  const title = String(form.get("title") ?? "").trim();
  const rawLink = String(form.get("url") ?? "").trim();
  const rawNotes = String(form.get("notes") ?? "").trim();
  const setName = String(form.get("setName") || form.get("passageSet") || "").trim();
  const files = collectUploadFiles(form);

  if (!goal || !isMaterialKind(kindRaw)) {
    return { error: "Choose a material type and exam goal." } as const;
  }
  const kind = kindRaw;
  if (!title || title.length > 140) return { error: "Enter a title of up to 140 characters." } as const;
  if (rawNotes.length > 6000) return { error: "Keep notes and transcripts within 6,000 characters." } as const;
  const url = rawLink ? httpLink(rawLink) : null;
  if (rawLink && (!url || url.length > 2000)) return { error: "Enter a valid web link." } as const;

  if (files.length > maxMaterialFiles) {
    return { error: `Upload up to ${maxMaterialFiles} images or PDFs in one set.` } as const;
  }

  for (const file of files) {
    const fileError = await validateMaterialFile(file);
    if (fileError) return { error: fileError } as const;
  }

  const multiPage = kind === "marked_paper" || kind === "study_material";
  if (multiPage && files.length > 1 && !setName) {
    return {
      error: kind === "marked_paper"
        ? "Name this paper set so Codex can join every page."
        : "Name this source set so Codex can join every page.",
    } as const;
  }
  if (kind === "marked_paper" && !files.length && !rawNotes && !url) {
    return { error: "Add marked-page photos (or a note/link) for this paper test." } as const;
  }
  if (!url && !rawNotes && !files.length) {
    return { error: "Add a file, link or note to save this resource." } as const;
  }

  const pageCount = Math.max(1, files.length);
  const setLabel = setLabelFor(kind, subject);
  const resolvedSetName = setName
    || (files.length > 1 ? title.slice(0, 120) : "");

  const pages = (files.length ? files : [null]).map((file, index) => {
    const page = index + 1;
    const notes = multiPage && (resolvedSetName || files.length > 1)
      ? composeResourceSetNotes({
        setLabel,
        setName: resolvedSetName || undefined,
        page: String(page),
        pageCount: String(pageCount),
        sourceQuestions: subject === "reading" && kind === "study_material"
          ? String(form.get("sourceQuestions") ?? "")
          : undefined,
        notes: rawNotes,
      })
      : subject === "reading" && kind === "study_material"
        ? composeReadingPassageNotes({
          notes: rawNotes,
          passageSet: String(form.get("passageSet") ?? form.get("setName") ?? ""),
          page: String(form.get("passagePage") ?? ""),
          pageCount: String(form.get("passagePageCount") ?? ""),
          sourceQuestions: String(form.get("sourceQuestions") ?? ""),
        })
        : rawNotes;
    const pageTitle = files.length > 1
      ? `${title} · page ${page} of ${pageCount}`.slice(0, 140)
      : title;
    return {
      title: pageTitle,
      notes: notes || null,
      file,
      // Only attach link/url to the first page of a multi-file set.
      url: index === 0 ? url : null,
    };
  });

  return { goal, subject, kind, pages } as const;
}

/** Shared magic-byte check for shelf uploads (PDF + images) and learner handwriting photos. */
export async function validateMaterialFile(file: File, options?: { imagesOnly?: boolean }) {
  if (file.size > maxMaterialBytes) return "Use a file up to 8 MB.";
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const head = new TextDecoder().decode(bytes);
  const jpeg = file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = file.type === "image/png"
    && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const webp = file.type === "image/webp"
    && head.startsWith("RIFF")
    && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (options?.imagesOnly) {
    if (!jpeg && !png && !webp) return "Choose a JPG, PNG or WebP photo.";
    return null;
  }
  const pdf = file.type === "application/pdf" && head.startsWith("%PDF-");
  if (!pdf && !jpeg && !png && !webp) return "Choose a valid PDF, JPG, PNG or WebP file.";
  return null;
}
