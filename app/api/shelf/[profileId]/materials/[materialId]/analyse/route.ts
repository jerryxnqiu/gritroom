import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { analyseMaterial } from "@/lib/material-analysis";
import { getDeepseekApiKey } from "@/lib/secrets";
import { parseAnalysisPages } from "@/lib/shelf-pages";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string; materialId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, { status: 403 });

  let pagesInput: unknown;
  try {
    const body = await request.json() as { pages?: unknown };
    pagesInput = body?.pages;
  } catch {
    return json({ error: "Send page images as JSON." }, { status: 400 });
  }

  const parsed = parseAnalysisPages(pagesInput);
  if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });

  const { profileId, materialId } = await params;
  try {
    const result = await analyseMaterial(
      env.DB,
      env.BUCKET,
      profileId,
      materialId,
      session.user_id,
      getDeepseekApiKey(),
      parsed.pages,
    );
    if (!result.ok) return json({ error: result.error }, { status: result.status });
    return json({ analysis: result.analysis });
  } catch {
    return json({ error: "We couldn’t analyse this resource. Try again." }, { status: 503 });
  }
}
