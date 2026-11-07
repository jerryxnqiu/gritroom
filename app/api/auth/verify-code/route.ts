import { verifySignInCode, type EntryKind } from "@/lib/auth";
import { isValidEmail, json, normalizeEmail, readJson, sessionCookieHeader } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJson<{ email?: string; entry?: EntryKind; code?: string }>(request);
  const email = normalizeEmail(body?.email ?? "");
  const entry = body?.entry === "learner" ? "learner" : body?.entry === "parent" ? "parent" : null;
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";

  if (!entry || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return json({ error: "Enter your email and the 6-digit code." }, { status: 400 });
  }

  const result = await verifySignInCode({ email, entry, code });
  if (!result.ok) {
    return json({ error: result.error }, { status: result.status });
  }

  return json(
    {
      ok: true,
      entry: result.entry,
      needsOnboarding: result.needsOnboarding,
      redirectTo: result.entry === "parent" ? "/parent" : "/learner",
    },
    {
      headers: {
        "set-cookie": sessionCookieHeader(result.token, 30 * 24 * 60 * 60),
      },
    },
  );
}
