import type { ShelfMaterial } from "./resource-shelf.ts";
import { parseResourceSetNotes, stripResourcePageSuffix } from "./shelf-fields.ts";

export type ShelfMaterialGroup = {
  key: string;
  kind: ShelfMaterial["kind"];
  title: string;
  setLabel: string | null;
  setName: string | null;
  pageCount: number;
  createdAt: string;
  notes: string | null;
  url: string | null;
  /** Anchor page for Ask Codex (usually page 1). */
  anchor: ShelfMaterial;
  pages: ShelfMaterial[];
};

function pageOrder(material: ShelfMaterial) {
  const parsed = parseResourceSetNotes(material.notes);
  if (parsed.page != null) return parsed.page;
  const fromTitle = material.title.match(/page\s+(\d+)/i);
  return fromTitle ? Number(fromTitle[1]) : Number.MAX_SAFE_INTEGER;
}

/** Collapse multi-page Paper/Source/Passage uploads into one shelf row. */
export function groupShelfMaterials(materials: ShelfMaterial[]): ShelfMaterialGroup[] {
  const groups = new Map<string, ShelfMaterial[]>();
  const order: string[] = [];

  for (const material of materials) {
    const parsed = parseResourceSetNotes(material.notes);
    const key = parsed.setName
      ? `${material.kind}::${parsed.setLabel || "set"}::${parsed.setName.toLowerCase()}`
      : `solo::${material.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(material);
  }

  return order.map((key) => {
    const pages = [...groups.get(key)!].sort((a, b) => {
      const byPage = pageOrder(a) - pageOrder(b);
      if (byPage) return byPage;
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
    const anchor = pages[0]!;
    const parsed = parseResourceSetNotes(anchor.notes);
    const declaredCount = Math.max(
      parsed.pageCount || 0,
      ...pages.map((page) => parseResourceSetNotes(page.notes).pageCount || 0),
    );
    return {
      key,
      kind: anchor.kind,
      title: parsed.setName || stripResourcePageSuffix(anchor.title),
      setLabel: parsed.setLabel,
      setName: parsed.setName,
      pageCount: Math.max(pages.length, declaredCount || 0),
      createdAt: pages.map((page) => page.createdAt).sort().at(-1) || anchor.createdAt,
      notes: parsed.extraNotes,
      url: pages.find((page) => page.url)?.url ?? null,
      anchor,
      pages,
    } satisfies ShelfMaterialGroup;
  });
}
