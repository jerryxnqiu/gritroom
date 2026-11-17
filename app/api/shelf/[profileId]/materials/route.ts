import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { canOpenShelf, saveMaterials } from "@/lib/resource-shelf";
import { maxMaterialBatchBytes, parseMaterial } from "@/lib/shelf-fields";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, { status: 403 });

  const { profileId } = await params;
  if (!await canOpenShelf(env.DB, profileId, session.user_id)) {
    return json({ error: "This resource shelf is unavailable." }, { status: 404 });
  }

  const limit = maxMaterialBatchBytes + 256 * 1024;
  let bytes = 0;
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > limit) controller.error(new Error("Material upload exceeds the size limit."));
      else controller.enqueue(chunk);
    },
  }));
  let form: FormData;
  try {
    form = await new Response(body, { headers: request.headers }).formData();
  } catch {
    return bytes > limit
      ? json({ error: "Keep the whole set under about 160 MB (up to 20 files × 8 MB)." }, { status: 413 })
      : json({ error: "Could not read the upload. Choose the files again and retry." }, { status: 400 });
  }

  const input = await parseMaterial(form);
  if ("error" in input) return json({ error: input.error }, { status: 400 });

  try {
    const ids = await saveMaterials(env.DB, env.BUCKET, profileId, session.user_id, input);
    return ids.length
      ? json({ ids, id: ids[0], count: ids.length }, { status: 201 })
      : json({ error: "This resource shelf is unavailable." }, { status: 404 });
  } catch {
    return json({ error: "We couldn’t save the resource. Try again." }, { status: 503 });
  }
}
