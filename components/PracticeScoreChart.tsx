"use client";

import { useMemo, useState } from "react";

import {
  buildPracticeScorePoints,
  type PracticeScoreSession,
} from "@/lib/practice-score-chart";

export function PracticeScoreChart({
  sessions,
  subjectLabel,
  onSelect,
}: {
  sessions: PracticeScoreSession[];
  subjectLabel: string;
  onSelect?: (sessionId: string) => void;
}) {
  const points = useMemo(() => buildPracticeScorePoints(sessions), [sessions]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = points.find((point) => point.id === activeId) ?? null;

  if (!points.length) {
    return (
      <div className="practice-score-chart-empty">
        <p className="eyebrow">Score trend</p>
        <p className="meta">Finished {subjectLabel} papers will plot here by date.</p>
      </div>
    );
  }

  const width = Math.max(420, points.length * 64);
  const height = 248;
  const pad = { top: 22, right: 12, bottom: 64, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const barGap = Math.min(18, Math.max(8, innerW / points.length * 0.28));
  const barW = Math.max(12, (innerW - barGap * (points.length - 1)) / points.length);

  function yFor(percent: number) {
    return pad.top + innerH * (1 - percent / 100);
  }

  return (
    <div className="practice-score-chart">
      <div className="practice-score-chart-head">
        <div>
          <p className="eyebrow">Score trend</p>
          <strong>{subjectLabel} papers by date</strong>
        </div>
        <p className="meta">
          Dates stay on the axis. Each bar names the paper type; identical types on one day get -1, -2…
        </p>
      </div>

      <div className="practice-score-chart-scroll" role="img" aria-label={`${subjectLabel} score chart`}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="practice-score-chart-svg">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="practice-score-grid" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className="practice-score-axis">
                  {tick}%
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            const x = pad.left + index * (barW + barGap);
            const y = yFor(point.percent);
            const barH = Math.max(2, pad.top + innerH - y);
            const selected = activeId === point.id;
            const mid = x + barW / 2;
            return (
              <g key={point.id}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={5}
                  className={`practice-score-bar${selected ? " is-active" : ""}${point.mode === "timed" ? " is-timed" : ""}`}
                  role={onSelect ? "button" : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  aria-label={`${point.date} ${point.source}: ${point.percent}% (${point.correct} of ${point.total})`}
                  onMouseEnter={() => setActiveId(point.id)}
                  onFocus={() => setActiveId(point.id)}
                  onClick={() => onSelect?.(point.id)}
                  onKeyDown={(event) => {
                    if (!onSelect) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(point.id);
                    }
                  }}
                />
                <text x={mid} y={y - 6} textAnchor="middle" className="practice-score-value">
                  {point.percent}
                </text>
                <text x={mid} y={height - 34} textAnchor="middle" className="practice-score-source">
                  {point.source}
                </text>
                <text
                  x={mid}
                  y={height - 14}
                  textAnchor="middle"
                  className="practice-score-label"
                  transform={`rotate(-28 ${mid} ${height - 14})`}
                >
                  {point.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {active ? (
        <p className="practice-score-caption" role="status">
          <strong>{active.date}</strong>
          {" · "}
          {active.source}
          {" · "}
          {active.correct} of {active.total} correct ({active.percent}%)
        </p>
      ) : (
        <p className="meta practice-score-caption">Hover or tap a bar for the paper details.</p>
      )}
    </div>
  );
}
