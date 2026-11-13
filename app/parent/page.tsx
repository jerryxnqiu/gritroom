import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { FamilyAccess } from "@/components/FamilyAccess";
import { FamilyBootstrap } from "@/components/FamilyBootstrap";
import { ParentModuleSwitch } from "@/components/ParentModuleSwitch";
import { ParentProgressPanel } from "@/components/ParentProgressPanel";
import { ParentRoomShell } from "@/components/ParentRoomShell";
import { ParentSectionNav, ParentSectionView } from "@/components/ParentSectionView";
import { ParentSettings } from "@/components/ParentSettings";
import { PracticeBankPanel } from "@/components/PracticeBankPanel";
import { PracticeEvidencePanel } from "@/components/PracticeEvidencePanel";
import { ResourceShelf } from "@/components/ResourceShelf";
import { RoomLayout } from "@/components/RoomLayout";
import { getSession } from "@/lib/auth";
import { examLabel, hasOpenInvitations, isInstallationOwner, listManagedFamilies, listParentProfiles } from "@/lib/family";
import { getSessionTokenFromCookies } from "@/lib/http";
import { childAccess } from "@/lib/invitations";
import {
  countUnusedPracticeQuestions,
  listPracticeEvidenceSummaries,
} from "@/lib/practice";
import { countUnusedReadingQuestions } from "@/lib/reading-practice";
import { shelfGoal } from "@/lib/shelf-fields";
import { shelfSubject, subjectLabel } from "@/lib/subjects";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; shelfGoal?: string; subject?: string }>;
}) {
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
  const goal = selected ? (shelfGoal(params.shelfGoal) ?? selected.examGoal) : "selective";
  const subject = shelfSubject(params.subject);
  const access = selected?.canManage ? await childAccess(env.DB, selected.id, session.user_id) : null;

  const [unusedCount, evidencePage] = selected
    ? await Promise.all([
      subject === "reading"
        ? countUnusedReadingQuestions(env.DB, selected.id, goal)
        : countUnusedPracticeQuestions(env.DB, selected.id, goal, subject),
      listPracticeEvidenceSummaries(env.DB, selected.id, goal, session.user_id, {
        sessionLimit: 21,
        subject,
      }),
    ])
    : [0, [] as Awaited<ReturnType<typeof listPracticeEvidenceSummaries>>];
  const evidenceHasMore = evidencePage.length > 20;
  const evidenceSessions = evidenceHasMore ? evidencePage.slice(0, 20) : evidencePage;

  const name = selected?.nickname || "Your family";
  const badge = selected
    ? `${examLabel(selected.examGoal)} · ${subjectLabel(subject)} · Parent view`
    : "Parent view";

  const body = (
    <>
      <header className="room-heading parent-heading">
        <p className="eyebrow">The view behind the practice</p>
        <h1>Parent room.</h1>
        <p className="lede">
          {selected
            ? `Follow ${selected.nickname}’s bank balance, session scores, and practice inputs.`
            : "Set up your family and choose the right practice goal for each child."}
        </p>
      </header>
      {hasInvites ? <Link className="button secondary" href="/invitations">Review invitations</Link> : null}
      {selected ? (
        <div className="current-child">
          <span className="eyebrow">Current learner</span>
          <strong>{selected.nickname}</strong>
          <span className="pill">{examLabel(goal)}</span>
          <span className="pill">{subjectLabel(subject)}</span>
        </div>
      ) : null}

      {selected ? (
        <>
          <ParentModuleSwitch profileId={selected.id} goal={goal} subject={subject} hash="progress" />
          <ParentSectionNav />
          <ParentSectionView id="progress">
            <ParentProgressPanel
              nickname={selected.nickname}
              archiveLabel={examLabel(goal)}
              subjectLabel={subjectLabel(subject)}
              subject={subject}
              unusedCount={unusedCount}
              sessions={evidenceSessions}
            />
          </ParentSectionView>
          <ParentSectionView id="family">
            {families.length
              ? <FamilyAccess profiles={profiles} selected={selected} families={families} access={access} />
              : <FamilyBootstrap />}
            {owner ? <ParentSettings /> : null}
          </ParentSectionView>
          <ParentSectionView id="bank">
            <PracticeBankPanel profile={selected} goal={goal} subject={subject} userId={session.user_id} />
          </ParentSectionView>
          <ParentSectionView id="shelf">
            <ResourceShelf profile={selected} goal={goal} subject={subject} userId={session.user_id} />
          </ParentSectionView>
          <ParentSectionView id="evidence">
            <PracticeEvidencePanel
              profile={selected}
              goal={goal}
              subject={subject}
              userId={session.user_id}
              sessions={evidenceSessions}
              hasMore={evidenceHasMore}
            />
          </ParentSectionView>
        </>
      ) : (
        <>
          {families.length
            ? <FamilyAccess profiles={profiles} selected={selected} families={families} access={access} />
            : <FamilyBootstrap />}
          {owner ? <ParentSettings /> : null}
        </>
      )}
    </>
  );

  if (selected) {
    return (
      <ParentRoomShell name={name} badge={badge} initialSection="progress">
        {body}
      </ParentRoomShell>
    );
  }
  return <RoomLayout role="parent" name={name} badge={badge}>{body}</RoomLayout>;
}
