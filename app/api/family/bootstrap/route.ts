import { ensureOwnerFamily, getSession } from "@/lib/auth";
import { parseProfileInput } from "@/lib/family";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }
  if (session.family_id) {
    return json({ error: "Your family room is already set up." }, { status: 409 });
  }

  const input = parseProfileInput(await readJson(request));
  if (!input) return json({ error: "Enter a child’s nickname and choose Selective or OC." }, { status: 400 });

  const familyId = await ensureOwnerFamily(session.user_id, input.nickname, input.examGoal);
  if (!familyId) return json({ error: "You cannot create a family room from this account." }, { status: 403 });
  return json({ ok: true });
}
