import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";

export async function GET() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) {
    return json({ authenticated: false }, { status: 401 });
  }

  return json({
    authenticated: true,
    email: session.email,
    entry: session.entry,
    familyId: session.family_id,
    profileId: session.profile_id,
  });
}
