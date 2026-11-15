"use client";

import { useMemo, useState } from "react";

import {
  buildPracticeScorePoints,
  type PracticeScoreSession,
} from "@/lib/practice-score-chart";

function modeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point";
  if (mode === "timed") return "Timed paper";
  if (mode === "focus") return "Weak spots";
  return "Practice";
}

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

  const width = Math.max(420, points.length * 56);
  const height = 220;
  const pad = { top: 18, right: 12, bottom: 52, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const barGap = Math.min(18, Math.max(8, innerW / points.length * 0.28));
  const barW = Math.max(10, (innerW - barGap * (points.length - 1)) / points.length);

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
          Same-day papers are tagged -1, -2… Oldest on the left.
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
                  aria-label={`${point.label}: ${point.percent}% (${point.correct} of ${point.total})`}
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
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="practice-score-value"
                >
                  {point.percent}
                </text>
                <text
                  x={x + barW / 2}
                  y={height - 18}
                  textAnchor="middle"
                  className="practice-score-label"
                  transform={`rotate(-32 ${x + barW / 2} ${height - 18})`}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {active ? (
        <p className="practice-score-caption" role="status">
          <strong>{active.label}</strong>
          {" · "}
          {modeLabel(active.mode)}
          {" · "}
          {active.correct} of {active.total} correct ({active.percent}%)
        </p>
      ) : (
        <p className="meta practice-score-caption">Hover or tap a bar for the paper details.</p>
      )}
    </div>
  );
}
