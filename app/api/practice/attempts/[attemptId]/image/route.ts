import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies } from "@/lib/http";
import { findAttemptImage } from "@/lib/practice";

/** Serves the stem figure snapshotted on an attempt (immutable R2 key). */
export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || (session.entry !== "learner" && session.entry !== "parent")) {
    return new Response("Sign-in required.", { status: 401 });
  }

  const { attemptId } = await params;
  const file = await findAttemptImage(env.DB, attemptId, session.user_id, session.entry);
  if (!file) return new Response("Image unavailable.", { status: 404 });

  const object = await env.BUCKET.get(file.key);
  if (!object) return new Response("Image unavailable.", { status: 404 });

  const headers = new Headers();
  headers.set("cache-control", "private, max-age=3600");
  const type = object.httpMetadata?.contentType;
  if (type) headers.set("content-type", type);
  if (object.httpMetadata?.contentDisposition) {
    headers.set("content-disposition", object.httpMetadata.contentDisposition);
  } else {
    headers.set("content-disposition", "inline");
  }
  return new Response(object.body, { headers });
}
