import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { FamilyAccess } from "@/components/FamilyAccess";
import { FamilyBootstrap } from "@/components/FamilyBootstrap";
import { ParentSettings } from "@/components/ParentSettings";
import { PracticeBankPanel } from "@/components/PracticeBankPanel";
import { ResourceShelf } from "@/components/ResourceShelf";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, hasOpenInvitations, isInstallationOwner, listManagedFamilies, listParentProfiles } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";
import { childAccess } from "@/lib/invitations";
import { shelfGoal } from "@/lib/shelf-fields";

const sections = [
  { title: "Family access", text: "Manage child profiles and exam goals.", href: "#family-access", action: "Open family access" },
  { title: "Practice bank", text: "Ask Codex to refresh questions from the latest shelf evidence.", href: "#practice-bank", action: "Generate practice bank" },
  { title: "Resource shelf", text: "Official sources, reports and study materials.", href: "#resource-shelf", action: "Open resource shelf" },
  { title: "Progress & feedback", text: "Answers, working and next steps.", href: "#practice-evidence", action: "View practice evidence" },
];

export default async function ParentPage({ searchParams }: { searchParams: Promise<{ child?: string; shelfGoal?: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) redirect("/?entry=parent");
  if (session.entry !== "parent") redirect("/learner");

  const [profiles, families, owner, hasInvites, params] = await Promise.all([
    listParentProfiles(env.DB, session.user_id),
    listManagedFamilies(env.DB, session.user_id),
    isInstallationOwner(env.DB, session.user_id),
    hasOpenInvitations(env.DB, session.email),
    searchParams,
  ]);
  const selected = profiles.find((profile) => profile.id === params.child) ?? profiles[0] ?? null;

  const access = selected?.canManage ? await childAccess(env.DB, selected.id, session.user_id) : null;

  return (
    <RoomLayout role="parent" name={selected?.nickname || "Your family"} badge={selected ? `${examLabel(selected.examGoal)} · Parent view` : "Parent view"}>
      <header className="room-heading parent-heading">
        <p className="eyebrow">The view behind the practice</p>
        <h1>Parent room.</h1>
        <p className="lede">Set up your family and choose the right practice goal for each child.</p>
      </header>
      {hasInvites ? <Link className="button secondary" href="/invitations">Review invitations</Link> : null}
      {selected ? (
        <>
          <div className="current-child"><span className="eyebrow">Current learner</span><strong>{selected.nickname}</strong><span className="pill">{examLabel(selected.examGoal)}</span></div>
          <div className="parent-steps" aria-label="Parent room sections">
            {sections.map((section, index) => (
              <a className="step-card step-link" key={section.title} href={section.href}>
                <span className="eyebrow">0{index + 1}</span><strong>{section.title}</strong><span>{section.text}</span><small>{section.action} <span aria-hidden="true">↘</span></small>
              </a>
            ))}
          </div>
        </>
      ) : null}
      {selected || families.length
        ? <FamilyAccess profiles={profiles} selected={selected} families={families} access={access} />
        : <FamilyBootstrap />}
      {selected ? (
        <>
          <PracticeBankPanel profile={selected} goal={shelfGoal(params.shelfGoal) ?? selected.examGoal} userId={session.user_id} />
          <ResourceShelf profile={selected} goal={shelfGoal(params.shelfGoal) ?? selected.examGoal} userId={session.user_id} />
        </>
      ) : null}
      {owner ? <ParentSettings /> : null}
    </RoomLayout>
  );
}
