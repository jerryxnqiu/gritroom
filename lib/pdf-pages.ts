"use client";

import { MAX_ANALYSIS_PAGES, type AnalysisPageImage } from "./shelf-pages";

const MAX_RENDER_WIDTH = 1280;
const JPEG_QUALITY = 0.72;

export async function renderPdfPages(file: Blob): Promise<
  | { ok: true; pages: AnalysisPageImage[]; totalPages: number; truncated: boolean }
  | { ok: false; error: string }
> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const data = new Uint8Array(await file.arrayBuffer());
    if (data.byteLength < 5 || String.fromCharCode(data[0], data[1], data[2], data[3], data[4]) !== "%PDF-") {
      return { ok: false, error: "This file does not look like a PDF." };
    }

    const pdf = await pdfjs.getDocument({ data }).promise;
    const totalPages = pdf.numPages;
    if (totalPages < 1) return { ok: false, error: "This PDF has no pages to analyse." };

    const limit = Math.min(totalPages, MAX_ANALYSIS_PAGES);
    const pages: AnalysisPageImage[] = [];
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_RENDER_WIDTH / Math.max(base.width, 1));
      const viewport = page.getViewport({ scale });
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return { ok: false, error: "This browser cannot prepare PDF page images." };
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      pages.push({ page: pageNumber, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY) });
      page.cleanup();
    }
    await pdf.destroy();

    return {
      ok: true,
      pages,
      totalPages,
      truncated: totalPages > MAX_ANALYSIS_PAGES,
    };
  } catch {
    return { ok: false, error: "Could not prepare PDF page images in this browser." };
  }
}
