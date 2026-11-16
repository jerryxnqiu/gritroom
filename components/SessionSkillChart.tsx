"use client";

import { useMemo, useState } from "react";

import {
  buildSessionSkillStats,
  type SkillAttempt,
} from "@/lib/session-skill-stats";

export function SessionSkillChart({
  attempts,
}: {
  attempts: SkillAttempt[];
}) {
  const stats = useMemo(() => buildSessionSkillStats(attempts), [attempts]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = stats.find((item) => item.key === activeKey) ?? null;
  const maxTested = Math.max(1, ...stats.map((item) => item.tested));

  if (!stats.length) return null;

  return (
    <div className="session-skill-chart">
      <div className="session-skill-chart-head">
        <div>
          <p className="eyebrow">Knowledge points in this paper</p>
          <strong>How many tested · how they went</strong>
        </div>
        <p className="meta">Sorted with the weakest skills first.</p>
      </div>

      <ul className="session-skill-list">
        {stats.map((item) => {
          const widthPct = Math.max(12, (item.tested / maxTested) * 100);
          const correctPct = item.tested ? (item.correct / item.tested) * 100 : 0;
          const selected = activeKey === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                className={`session-skill-row${selected ? " is-active" : ""}`}
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
                onBlur={() => setActiveKey(null)}
                onMouseLeave={() => setActiveKey(null)}
                aria-label={`${item.label}: ${item.correct} of ${item.tested} correct (${item.percent}%)`}
              >
                <span className="session-skill-name">{item.label}</span>
                <span className="session-skill-track" style={{ width: `${widthPct}%` }}>
                  <span className="session-skill-correct" style={{ width: `${correctPct}%` }} />
                </span>
                <span className="session-skill-score">
                  {item.correct}/{item.tested}
                  <span className="meta"> · {item.percent}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {active ? (
        <p className="session-skill-caption" role="status">
          <strong>{active.label}</strong>
          {" · "}
          {active.tested} tested · {active.correct} correct · {active.incorrect} miss
          {" · "}
          {active.percent}%
        </p>
      ) : (
        <p className="meta session-skill-caption">
          Green share = correct. Row length = how many questions of that type were in this paper.
        </p>
      )}
    </div>
  );
}
