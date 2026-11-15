import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { saveLearnerHandwriting } from "@/lib/resource-shelf";
import { maxMaterialBytes, shelfGoal, validateMaterialFile } from "@/lib/shelf-fields";

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") {
    return json({ error: "Learner sign-in required." }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }

  const limit = maxMaterialBytes + 64 * 1024;
  let bytes = 0;
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > limit) controller.error(new Error("Handwriting upload exceeds the size limit."));
      else controller.enqueue(chunk);
    },
  }));

  let form: FormData;
  try {
    form = await new Response(body, { headers: request.headers }).formData();
  } catch {
    return bytes > limit
      ? json({ error: "Use a file up to 8 MB." }, { status: 413 })
      : json({ error: "Could not read the upload. Choose the photo again and retry." }, { status: 400 });
  }

  const goal = shelfGoal(form.get("goal"));
  const planRefId = String(form.get("planRefId") ?? "").trim();
  const page = Number(form.get("page"));
  const pageCount = Number(form.get("pageCount"));
  const upload = form.get("file");
  const file = upload instanceof File && (upload.size || upload.name) ? upload : null;

  if (!goal) return json({ error: "Choose an exam goal." }, { status: 400 });
  if (!planRefId) return json({ error: "No remediation plan is linked yet." }, { status: 400 });
  if (!file) return json({ error: "Choose a handwriting photo to upload." }, { status: 400 });

  const fileError = await validateMaterialFile(file, { imagesOnly: true });
  if (fileError) return json({ error: fileError }, { status: 400 });

  try {
    const saved = await saveLearnerHandwriting(env.DB, env.BUCKET, session.user_id, {
      goal,
      planRefId,
      page,
      pageCount,
      file,
    });
    return saved
      ? json(saved, { status: 201 })
      : json({ error: "Could not save that handwriting photo. Check the page numbers and try again." }, { status: 400 });
  } catch {
    return json({ error: "We couldn’t save the handwriting photo. Try again." }, { status: 503 });
  }
}
