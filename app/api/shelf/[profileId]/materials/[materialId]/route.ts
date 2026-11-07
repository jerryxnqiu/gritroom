import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { findMaterialFile } from "@/lib/resource-shelf";

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string; materialId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const { profileId, materialId } = await params;
  const file = await findMaterialFile(env.DB, profileId, materialId, session.user_id);
  const object = file ? await env.BUCKET.get(file.key) : null;
  if (!file || !object) return json({ error: "File unavailable." }, { status: 404 });

  // Use a fixed fallback for older browsers and an encoded UTF-8 filename.
  const name = encodeURIComponent(file.name.toWellFormed()).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16));
  return new Response(object.body, {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="resource"; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
