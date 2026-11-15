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

  const barW = 22;
  const barGap = 5;
  const groupGap = 28;
  const pad = { top: 28, right: 16, bottom: 108, left: 40 };
  const groupWidths = groups.map(
    (group) => group.points.length * barW + Math.max(0, group.points.length - 1) * barGap,
  );
  const innerW = groupWidths.reduce((sum, value) => sum + value, 0)
    + groupGap * Math.max(0, groups.length - 1);
  const width = pad.left + innerW + pad.right;
  const height = 300;
  const innerH = height - pad.top - pad.bottom;
  const baseline = pad.top + innerH;

  function yFor(percent: number) {
    return pad.top + innerH * (1 - percent / 100);
  }

  const groupStarts: number[] = [];
  let cursor = pad.left;
  for (const groupWidth of groupWidths) {
    groupStarts.push(cursor);
    cursor += groupWidth + groupGap;
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

      <div className="practice-score-chart-plot">
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
              y1={baseline}
              y2={baseline}
              className="practice-score-baseline"
            />

            {groups.map((group, groupIndex) => {
              const columnX = groupStarts[groupIndex]!;
              const groupWidth = groupWidths[groupIndex]!;
              const labelX = columnX + groupWidth / 2;

              return (
                <g key={group.date}>
                  {group.points.map((point, pointIndex) => {
                    const x = columnX + pointIndex * (barW + barGap);
                    const y = yFor(point.percent);
                    const barH = Math.max(2, baseline - y);
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
                    y1={baseline}
                    y2={baseline + 6}
                    className="practice-score-tick"
                  />
                  {/* Rotate 90° so the full ISO date hangs below the axis into reserved padding. */}
                  <text
                    className="practice-score-label"
                    textAnchor="start"
                    dominantBaseline="middle"
                    transform={`translate(${labelX} ${baseline + 10}) rotate(90)`}
                  >
                    {group.date}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {tooltip ? (
          <div
            className={`practice-score-tooltip${tooltip.y < pad.top + 48 ? " is-below" : ""}`}
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
