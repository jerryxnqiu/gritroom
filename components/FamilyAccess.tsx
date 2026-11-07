"use client";

import { ChildAccessPanel } from "./ChildAccessPanel";
import type { ChildAccess } from "@/lib/invitations";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { examLabel, type ExamGoal, type ManagedFamily, type ParentProfile } from "@/lib/family";

type ProfileFieldsProps = { nickname?: string; goal?: ExamGoal; children: React.ReactNode };

function ProfileFields({ nickname, goal, children }: ProfileFieldsProps) {
  return (
    <div className="profile-fields">
      <label className="field">
        <span>Child’s nickname</span>
        <input name="nickname" defaultValue={nickname} placeholder="e.g. Maya" maxLength={40} required />
      </label>
      <label className="field">
        <span>Exam goal</span>
        <select name="examGoal" defaultValue={goal ?? "selective"}>
          <option value="selective">Selective</option>
          <option value="oc">OC</option>
        </select>
      </label>
      <div className="profile-action">{children}</div>
    </div>
  );
}

export function FamilyAccess({
  profiles, selected, families, access,
}: { profiles: ParentProfile[]; selected: ParentProfile | null; families: ManagedFamily[]; access: ChildAccess | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ text: string; error?: boolean; form: "edit" | "add" }>();
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent<HTMLFormElement>, editing: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const method = editing ? "PATCH" : "POST";
    const url = editing && selected ? `/api/family/profiles/${encodeURIComponent(selected.id)}` : "/api/family/profiles";
    const kind = editing ? "edit" : "add";
    setStatus(undefined);
    startTransition(async () => {
      try {
        const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json() as { profileId?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not save. Try again.");
        if (result.profileId) {
          form.reset();
          router.replace(`/parent?child=${encodeURIComponent(result.profileId)}#family-access`, { scroll: false });
        }
        router.refresh();
        setStatus({ form: kind, text: editing ? "Child details saved." : "Child added to your family." });
      } catch (error) {
        setStatus({ form: kind, text: error instanceof Error ? error.message : "Could not save. Try again.", error: true });
      }
    });
  }

  function feedback(form: "edit" | "add") {
    if (status?.form !== form) return null;
    return <p className={status.error ? "error" : "notice"} role={status.error ? "alert" : "status"}>{status.text}</p>;
  }

  return (
    <section className="panel family-panel" id="family-access" aria-labelledby="family-access-heading">
      <p className="eyebrow">01 / Family access</p>
      <h2 id="family-access-heading">Family access</h2>
      <p className="lede">Manage each child’s profile and exam goal.</p>
      {selected && profiles.length > 1 ? (
        <label className="field child-picker">
          <span>Choose child</span>
          <select
            value={selected.id}
            onChange={(event) => {
              setStatus(undefined);
              const id = event.currentTarget.value;
              startTransition(() => router.replace(`/parent?child=${encodeURIComponent(id)}#family-access`, { scroll: false }));
            }}
            disabled={pending}
          >
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.nickname} · {examLabel(profile.examGoal)}</option>)}
          </select>
        </label>
      ) : null}
      {selected ? (
        <div className="family-subsection">
          <h3>Child details</h3>
          {selected.canManage ? (
            <form key={selected.id} className="stack-form" onSubmit={(event) => save(event, true)} aria-busy={pending}>
              <ProfileFields nickname={selected.nickname} goal={selected.examGoal}>
                <button className="button secondary" type="submit" disabled={pending}>Save child details</button>
              </ProfileFields>
              {feedback("edit")}
            </form>
          ) : (
            <p className="child-badge">{selected.nickname} <span>{examLabel(selected.examGoal)}</span></p>
          )}
          <p className="meta">Each child has their own profile. Their exam goal guides their practice and materials.</p>
        </div>
      ) : null}
      {selected && access ? <ChildAccessPanel key={selected.id} profileId={selected.id} access={access} /> : null}
      {families.length ? (
        <details className="family-subsection">
          <summary>{profiles.length ? "Add another child" : "Add your child"}</summary>
          <form className="stack-form add-child-form" onSubmit={(event) => save(event, false)} aria-busy={pending}>
            {families.length > 1 ? (
              <label className="field"><span>Family</span><select name="familyId" defaultValue={selected?.familyId}>
                {families.map((family) => <option value={family.id} key={family.id}>{family.name}</option>)}
              </select></label>
            ) : <input type="hidden" name="familyId" value={families[0].id} />}
            <ProfileFields>
              <button className="button" type="submit" disabled={pending}>Add child</button>
            </ProfileFields>
            {feedback("add")}
          </form>
        </details>
      ) : null}
    </section>
  );
}
