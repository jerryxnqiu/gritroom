/** PRD: analyse at most six PDF pages; ask parents to split longer files. */
export const MAX_ANALYSIS_PAGES = 6;
export const MAX_PAGE_DATA_URL_CHARS = 3_500_000;

export type AnalysisPageImage = {
  page: number;
  dataUrl: string;
};

export function parseAnalysisPages(input: unknown):
  | { ok: true; pages: AnalysisPageImage[] }
  | { ok: false; error: string } {
  if (input == null) return { ok: true, pages: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Page images must be a list." };
  if (input.length > MAX_ANALYSIS_PAGES) {
    return {
      ok: false,
      error: `Analyse up to ${MAX_ANALYSIS_PAGES} PDF pages at a time. Split longer documents or choose the most relevant pages.`,
    };
  }

  const pages: AnalysisPageImage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return { ok: false, error: "Each page image is invalid." };
    const page = Number((item as { page?: unknown }).page);
    const dataUrl = String((item as { dataUrl?: unknown }).dataUrl ?? "");
    if (!Number.isInteger(page) || page < 1 || page > 200) {
      return { ok: false, error: "Each page needs a valid page number." };
    }
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl) || dataUrl.length > MAX_PAGE_DATA_URL_CHARS) {
      return { ok: false, error: "Each page must be a JPEG, PNG or WebP data URL within size limits." };
    }
    if (pages.some((existing) => existing.page === page)) {
      return { ok: false, error: "Duplicate page numbers are not allowed." };
    }
    pages.push({ page, dataUrl });
  }

  return { ok: true, pages: pages.sort((a, b) => a.page - b.page) };
}
