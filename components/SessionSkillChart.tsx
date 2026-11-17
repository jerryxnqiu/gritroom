"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildSessionSkillStats,
  type SkillAttempt,
} from "@/lib/session-skill-stats";

export function SessionSkillChart({
  attempts,
  selectedKey = null,
  onSelectKey,
}: {
  attempts: SkillAttempt[];
  selectedKey?: string | null;
  onSelectKey?: (key: string | null) => void;
}) {
  const stats = useMemo(() => buildSessionSkillStats(attempts), [attempts]);
  const [internalKey, setInternalKey] = useState<string | null>(null);
  const controlled = onSelectKey != null;
  const activeKey = controlled ? selectedKey : internalKey;
  const rootRef = useRef<HTMLDivElement>(null);
  const maxTested = Math.max(1, ...stats.map((item) => item.tested));

  useEffect(() => {
    if (!activeKey) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      const root = rootRef.current;
      if (!target || !root) return;
      if (root.contains(target)) return;
      // Keep focus while reviewing the filtered questions under the chart.
      if ((target as Element).closest?.("[data-skill-attempts]")) return;
      if (controlled) onSelectKey?.(null);
      else setInternalKey(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeKey, controlled, onSelectKey]);

  if (!stats.length) return null;

  function select(key: string) {
    const next = activeKey === key ? null : key;
    if (controlled) onSelectKey?.(next);
    else setInternalKey(next);
  }

  return (
    <div className="session-skill-chart" ref={rootRef}>
      <div className="session-skill-chart-head">
        <div>
          <p className="eyebrow">Knowledge points in this paper</p>
          <strong>How many tested · how they went</strong>
        </div>
        <p className="meta">
          {activeKey
            ? "Showing that skill below · click elsewhere to clear."
            : "Sorted with the weakest skills first · click a skill to focus."}
        </p>
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
                aria-pressed={selected}
                aria-label={`${item.label}: ${item.correct} of ${item.tested} correct (${item.percent}%)`}
                onClick={() => select(item.key)}
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
    </div>
  );
}
