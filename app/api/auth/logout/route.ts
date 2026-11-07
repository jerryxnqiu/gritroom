import { revokeSession } from "@/lib/auth";
import { clearSessionCookieHeader, getSessionTokenFromCookies, json } from "@/lib/http";

export async function POST() {
  const token = await getSessionTokenFromCookies();
  await revokeSession(token);
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearSessionCookieHeader(),
      },
    },
  );
}
