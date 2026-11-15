"use client";

import { useMemo, useState } from "react";

import {
  buildPracticeScorePoints,
  type PracticeScorePoint,
  type PracticeScoreSession,
} from "@/lib/practice-score-chart";

function groupPointsByDate(points: PracticeScorePoint[]) {
  const groups: { date: string; points: PracticeScorePoint[] }[] = [];
  for (const point of points) {
    const last = groups[groups.length - 1];
    if (last && last.date === point.date) last.points.push(point);
    else groups.push({ date: point.date, points: [point] });
  }
  return groups;
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
  const groups = useMemo(() => groupPointsByDate(points), [points]);
  const [tooltip, setTooltip] = useState<{
    point: PracticeScorePoint;
    x: number;
    y: number;
  } | null>(null);

  if (!points.length) {
    return (
      <div className="practice-score-chart-empty">
        <p className="eyebrow">Score trend</p>
        <p className="meta">Finished {subjectLabel} papers will plot here by date.</p>
      </div>
    );
  }

  const width = Math.max(440, groups.length * 88);
  const height = 268;
  const pad = { top: 22, right: 14, bottom: 72, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const columnGap = Math.min(22, Math.max(10, innerW / groups.length * 0.18));
  const columnW = Math.max(36, (innerW - columnGap * (groups.length - 1)) / groups.length);

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
          Same-day papers sit together under one date. Hover a bar for details.
        </p>
      </div>

      <div
        className="practice-score-chart-scroll"
        role="img"
        aria-label={`${subjectLabel} score chart`}
        onMouseLeave={() => setTooltip(null)}
      >
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

          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH}
            y2={pad.top + innerH}
            className="practice-score-baseline"
          />

          {groups.map((group, groupIndex) => {
            const columnX = pad.left + groupIndex * (columnW + columnGap);
            const barGap = group.points.length > 1 ? 4 : 0;
            const barW = Math.max(
              10,
              (columnW - barGap * (group.points.length - 1)) / group.points.length,
            );
            const labelX = columnX + columnW / 2;

            return (
              <g key={group.date}>
                {group.points.map((point, pointIndex) => {
                  const x = columnX + pointIndex * (barW + barGap);
                  const y = yFor(point.percent);
                  const barH = Math.max(2, pad.top + innerH - y);
                  const selected = tooltip?.point.id === point.id;
                  const mid = x + barW / 2;
                  return (
                    <g key={point.id}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={4}
                        className={`practice-score-bar${selected ? " is-active" : ""}${point.mode === "timed" ? " is-timed" : ""}`}
                        role={onSelect ? "button" : undefined}
                        tabIndex={onSelect ? 0 : undefined}
                        aria-label={`${point.date} ${point.source}: ${point.percent}% (${point.correct} of ${point.total})`}
                        onMouseEnter={() => setTooltip({ point, x: mid, y })}
                        onFocus={() => setTooltip({ point, x: mid, y })}
                        onBlur={() => setTooltip(null)}
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
                    </g>
                  );
                })}
                <line
                  x1={labelX}
                  x2={labelX}
                  y1={pad.top + innerH}
                  y2={pad.top + innerH + 5}
                  className="practice-score-tick"
                />
                <text
                  x={labelX}
                  y={height - 8}
                  textAnchor="end"
                  className="practice-score-label"
                  transform={`rotate(-90 ${labelX} ${height - 8})`}
                >
                  {group.date}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip ? (
          <div
            className="practice-score-tooltip"
            role="tooltip"
            style={{
              left: `${(tooltip.x / width) * 100}%`,
              top: `${(tooltip.y / height) * 100}%`,
            }}
          >
            <strong>{tooltip.point.source}</strong>
            <span>{tooltip.point.date}</span>
            <span>
              {tooltip.point.correct} of {tooltip.point.total} · {tooltip.point.percent}%
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
