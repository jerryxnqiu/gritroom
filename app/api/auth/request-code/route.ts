import { requestSignInCode, type EntryKind } from "@/lib/auth";
import { clientIp, isValidEmail, json, normalizeEmail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJson<{ email?: string; entry?: EntryKind }>(request);
  const email = normalizeEmail(body?.email ?? "");
  const entry = body?.entry === "learner" ? "learner" : body?.entry === "parent" ? "parent" : null;

  if (!entry || !isValidEmail(email)) {
    return json({ error: "Enter a valid email and choose learner or parent." }, { status: 400 });
  }

  const result = await requestSignInCode({
    email,
    entry,
    ip: clientIp(request),
    ua: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return json({ error: result.error }, { status: result.status });
  }

  return json({
    message: result.neutralMessage,
    debugCode: result.debugCode,
  });
}
