type LanguagePlan = {
  id: string;
  summary: string;
  createdAt: string;
};

export function ReadingLanguagePack({
  plans,
  audience,
  nickname,
  limit = 3,
  defaultOpen = true,
}: {
  plans: LanguagePlan[];
  audience: "learner" | "parent";
  nickname?: string;
  limit?: number;
  defaultOpen?: boolean;
}) {
  const who = audience === "parent"
    ? (nickname ? `${nickname} can memorise` : "Learner can memorise")
    : "Memorise from your latest Reading remediation";
  const empty = audience === "parent"
    ? `No vocabulary or phrase list yet. After Reading mistakes, run Ask Codex for Reading remediation & copywork — the language list will appear here for you and under ${nickname || "the learner"}’s Last results / Coach tips.`
    : "No vocabulary or phrase list yet. After Reading mistakes, ask your family to run Reading remediation & copywork — those words and slang to memorise will appear here and under Coach tips.";

  if (!plans.length) {
    return <p className="meta">{empty}</p>;
  }

  const visible = plans.slice(0, limit);

  return (
    <details className="practice-language-pack" open={defaultOpen}>
      <summary>
        <span className="eyebrow">Words & phrases</span>
        <strong>{who}</strong>
        <span className="meta">
          {plans.length} remediation list{plans.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="practice-language-pack-body">
        {visible.map((plan) => (
          <article key={plan.id} className="practice-language-card">
            <p className="meta">{plan.createdAt.slice(0, 10)}</p>
            <p className="shelf-copy practice-prompt">{plan.summary}</p>
          </article>
        ))}
        {plans.length > visible.length ? (
          <p className="meta">
            {audience === "parent"
              ? `Showing latest ${visible.length}. Older plans stay in Evidence after each remediation run.`
              : "Open Coach tips for the full list and older remediation plans."}
          </p>
        ) : audience === "learner" ? (
          <p className="meta">Open Coach tips for older remediation plans.</p>
        ) : (
          <p className="meta">
            These lists also show in the learner room under Last results and Coach tips.
          </p>
        )}
      </div>
    </details>
  );
}
