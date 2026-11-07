"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { examLabel } from "@/lib/family";
import type { RecipientInvite } from "@/lib/invitations";

export function InvitationInbox({ invites }: { invites: RecipientInvite[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [pending, startTransition] = useTransition();

  function respond(invite: RecipientInvite, action: "accept" | "decline") {
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/family/invitations/${encodeURIComponent(invite.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const result = await response.json() as { error?: string; role?: "learner" | "guardian"; profileId?: string };
        if (!response.ok) throw new Error(result.error || "Could not update the invitation. Try again.");
        if (action === "accept") {
          router.replace(result.role === "guardian" && result.profileId
            ? `/parent?child=${encodeURIComponent(result.profileId)}`
            : "/learner");
        } else {
          setFeedback({ text: "Invitation declined." });
        }
        router.refresh();
      } catch (error) {
        setFeedback({ text: error instanceof Error ? error.message : "Could not update the invitation. Try again.", error: true });
        router.refresh();
      }
    });
  }

  return (
    <div className="invitation-inbox" aria-busy={pending}>
      {feedback ? <p className={feedback.error ? "error" : "notice"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
      {invites.length ? invites.map((invite) => (
        <article className="panel invite-card" key={invite.id}>
          <span className="pill">{invite.role === "learner" ? "Learner invitation" : "Guardian invitation"}</span>
          <h2>{invite.nickname} <span className="invite-goal">· {examLabel(invite.examGoal)}</span></h2>
          <p className="meta">{invite.familyName}</p>
          <p className="meta">Invited by <strong>{invite.inviterEmail}</strong></p>
          <p className="lede">{invite.role === "learner"
            ? "Accept to connect this email to your learner profile. Make sure you recognise the parent who invited you."
            : "Accept to see this child’s progress. This invitation gives you access to this child only."}</p>
          <div className="actions">
            <button className="button" type="button" disabled={pending} onClick={() => respond(invite, "accept")}>Accept invitation</button>
            <button className="button secondary" type="button" disabled={pending} onClick={() => respond(invite, "decline")}>Decline invitation</button>
          </div>
        </article>
      )) : <div className="panel"><p className="lede">There are no open invitations for this email.</p></div>}
    </div>
  );
}
