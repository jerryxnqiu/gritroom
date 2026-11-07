import { env } from "cloudflare:workers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InvitationInbox } from "@/components/InvitationInbox";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies } from "@/lib/http";
import { recipientInvitations } from "@/lib/invitations";

export default async function InvitationsPage() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/");

  const invites = await recipientInvitations(env.DB, session);
  const parent = session.entry === "parent";
  return (
    <RoomLayout role={session.entry} name={parent ? "Your family" : "Learner"} badge="Verified email">
      <header className="room-heading parent-heading">
        <p className="eyebrow">Family access</p>
        <h1>Review your invitation.</h1>
        <p className="lede">Signed in as <strong>{session.email}</strong>. Accept only an invitation you recognise.</p>
      </header>
      <InvitationInbox invites={invites} />
      <Link className="button secondary invitation-back" href={parent ? "/parent" : "/learner"}>
        {parent ? "Go to Parent room" : "Go to My room"}
      </Link>
    </RoomLayout>
  );
}
