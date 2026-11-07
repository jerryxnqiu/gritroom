import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { analyseMaterial } from "@/lib/material-analysis";
import { getDeepseekApiKey } from "@/lib/secrets";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string; materialId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, { status: 403 });

  const { profileId, materialId } = await params;
  try {
    const result = await analyseMaterial(env.DB, profileId, materialId, session.user_id, getDeepseekApiKey());
    if (!result.ok) return json({ error: result.error }, { status: result.status });
    return json({ analysis: result.analysis });
  } catch {
    return json({ error: "We couldn’t analyse this resource. Try again." }, { status: 503 });
  }
}
