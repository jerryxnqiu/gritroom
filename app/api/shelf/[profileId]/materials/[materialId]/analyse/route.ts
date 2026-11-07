import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import {
  buildCodexMaterialBrief,
  getMaterialForCodex,
  parseCodexAnalysisInput,
  saveCodexMaterialAnalysis,
} from "@/lib/material-analysis";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";

/** Copy-ready Codex agent task: D1/R2 locations + write-back instructions. */
export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string; materialId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const { profileId, materialId } = await params;
  const material = await getMaterialForCodex(env.DB, profileId, materialId, session.user_id);
  if (!material) return json({ error: "This resource is unavailable." }, { status: 404 });

  return json({
    brief: buildCodexMaterialBrief(material, profileId, session.user_id),
    material: {
      id: material.id,
      title: material.title,
      kind: material.kind,
      examGoal: material.examGoal,
      fileKey: material.fileKey,
    },
  });
}

/** Optional write-back if an agent prefers HTTP over wrangler SQL. */
export async function POST(request: Request, { params }: { params: Promise<{ profileId: string; materialId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const body = await readJson(request);
  const input = parseCodexAnalysisInput(body);
  if ("error" in input) return json({ error: input.error }, { status: 400 });

  const { profileId, materialId } = await params;
  try {
    const result = await saveCodexMaterialAnalysis(env.DB, profileId, materialId, session.user_id, input);
    if (!result.ok) return json({ error: result.error }, { status: result.status });
    return json({ analysis: result.analysis }, { status: 201 });
  } catch {
    return json({ error: "Could not save Codex findings. Try again." }, { status: 503 });
  }
}
