"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ChildAccess, InviteRole } from "@/lib/invitations";

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-AU", {
  day: "numeric", month: "short", timeZone: "Australia/Sydney",
}).format(new Date(date));

export function ChildAccessPanel({ profileId, access }: { profileId: string; access: ChildAccess }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ area: InviteRole; text: string; error?: boolean }>();
  const [pending, startTransition] = useTransition();
  const childInvite = access.pending.find((invite) => invite.role === "learner");
  const guardianInvites = access.pending.filter((invite) => invite.role === "guardian");

  function change(area: InviteRole, url: string, data: object, text: string, form?: HTMLFormElement) {
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not update access. Try again.");
        form?.reset();
        setFeedback({ area, text });
        router.refresh();
      } catch (error) {
        setFeedback({ area, text: error instanceof Error ? error.message : "Could not update access. Try again.", error: true });
        router.refresh();
      }
    });
  }

  function send(event: FormEvent<HTMLFormElement>, role: InviteRole) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email || pending) return;
    change(role, "/api/family/invitations", { profileId, role, email },
      "Invitation emailed. The recipient needs to verify their email and accept.", form);
  }

  function status(area: InviteRole) {
    return feedback?.area === area
      ? <p className={feedback.error ? "error" : "notice"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>
      : null;
  }

  function invitationRow(invite: ChildAccess["pending"][number]) {
    return (
      <li className="access-row" key={invite.id}>
        <div>
          <strong>{invite.email}</strong>
          <span className="meta">{invite.status === "sending" ? "Sending invitation" : invite.status === "unavailable"
            ? "Invitation unavailable"
            : `Invitation pending · expires ${dateLabel(invite.expiresAt)}`}</span>
        </div>
        <button className="button secondary" type="button" disabled={pending}
          aria-label={`Cancel invitation for ${invite.email}`}
          onClick={() => change(invite.role, `/api/family/invitations/${encodeURIComponent(invite.id)}`, { action: "cancel" }, "Invitation cancelled.")}>
          Cancel invitation
        </button>
      </li>
    );
  }

  return (
    <>
      <section className="family-subsection" aria-labelledby="link-child-heading">
        <h3 id="link-child-heading">Link your child’s email</h3>
        {access.learnerEmail ? (
          <p className="access-link-status"><span className="pill">Email linked</span><strong>{access.learnerEmail}</strong></p>
        ) : childInvite ? (
          <ul className="access-list">{invitationRow(childInvite)}</ul>
        ) : (
          <form className="stack-form" onSubmit={(event) => send(event, "learner")} aria-busy={pending}>
            <p className="meta">Invite your child’s own email. They sign in with a six-digit code, then review and accept the invitation on their device.</p>
            <div className="invite-fields">
              <label className="field"><span>Child’s email</span>
                <input type="email" name="email" autoComplete="off" placeholder="Your child’s email address" maxLength={254} required />
              </label>
              <button className="button" disabled={pending} type="submit">Send child invitation</button>
            </div>
            <p className="meta">The invitation expires in seven days. Your child’s mailbox password is never needed.</p>
          </form>
        )}
        {status("learner")}
      </section>
      <details className="family-subsection">
        <summary>Invite another parent or guardian</summary>
        <div className="stack-form add-child-form">
          <p className="meta">Give another adult access to this child’s progress. They must verify their own email and accept. This invitation does not include access to other children.</p>
          <form className="invite-fields" onSubmit={(event) => send(event, "guardian")} aria-busy={pending}>
            <label className="field"><span>Parent or guardian’s email</span>
              <input type="email" name="email" autoComplete="off" placeholder="Their email address" maxLength={254} required />
            </label>
            <button className="button secondary" disabled={pending} type="submit">Send guardian invitation</button>
          </form>
          {status("guardian")}
          {guardianInvites.length ? <ul className="access-list">{guardianInvites.map(invitationRow)}</ul> : null}
          {access.guardians.length ? (
            <ul className="access-list" aria-label="Guardians with access">
              {access.guardians.map((guardian) => (
                <li className="access-row" key={guardian.id}>
                  <div><strong>{guardian.email}</strong><span className="meta">Has access to this child</span></div>
                  <button className="button secondary" type="button" disabled={pending}
                    aria-label={`Remove access for ${guardian.email}`}
                    onClick={() => change("guardian", `/api/family/guardians/${encodeURIComponent(guardian.id)}`, { action: "revoke" }, "Guardian access removed for this child.")}>
                    Remove access
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </>
  );
}
