"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildPracticeScorePoints,
  cumulativeHitRatesByDate,
  groupPracticeScorePointsByDate,
  type PracticeScorePoint,
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
  const groups = useMemo(() => groupPracticeScorePointsByDate(points), [points]);
  const runningAverages = useMemo(() => cumulativeHitRatesByDate(groups), [groups]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{
    point: PracticeScorePoint;
    x: number;
    y: number;
  } | null>(null);
  const hasPoints = points.length > 0;

  useEffect(() => {
    if (!hasPoints) {
      setHostWidth(0);
      setTooltip(null);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const sync = () => {
      const next = Math.floor(host.clientWidth);
      // Ignore 0-width while the host is detached (e.g. switching to an empty Maths archive).
      if (next <= 0) return;
      setHostWidth(Math.max(280, next));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hasPoints]);

  if (!hasPoints) {
    return (
      <div className="practice-score-chart-empty">
        <p className="eyebrow">Score trend</p>
        <p className="meta">Finished {subjectLabel} papers will plot here by date.</p>
      </div>
    );
  }

  const pad = { top: 28, right: 12, bottom: 108, left: 40 };
  const height = 300;
  const width = hostWidth || 640;
  const innerW = Math.max(120, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const baseline = pad.top + innerH;

  // Equal date columns across the full card; bars inside each day squeeze to fit.
  const groupGap = Math.min(20, Math.max(8, innerW / Math.max(groups.length, 1) * 0.12));
  const columnW = Math.max(
    18,
    (innerW - groupGap * Math.max(0, groups.length - 1)) / Math.max(groups.length, 1),
  );

  function yFor(percent: number) {
    return pad.top + innerH * (1 - percent / 100);
  }

  const averagePoints = runningAverages.map((item, groupIndex) => {
    const columnX = pad.left + groupIndex * (columnW + groupGap);
    return {
      ...item,
      x: columnX + columnW / 2,
      y: yFor(item.average),
    };
  });
  const averagePath = averagePoints
    .map((item, index) => `${index === 0 ? "M" : "L"} ${item.x.toFixed(1)} ${item.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="practice-score-chart">
      <div className="practice-score-chart-head">
        <div>
          <p className="eyebrow">Score trend</p>
          <strong>{subjectLabel} papers by date</strong>
        </div>
        <p className="meta">
          Bars are each paper. The line is the overall hit rate (correct ÷ all answers) through that date — same as Accuracy.
        </p>
      </div>

      <p className="practice-score-legend" aria-hidden="true">
        <span className="practice-score-legend-bar">Paper score</span>
        <span className="practice-score-legend-line">Overall hit rate</span>
      </p>

      <div
        ref={hostRef}
        className="practice-score-chart-host"
        role="img"
        aria-label={`${subjectLabel} score chart`}
        onMouseLeave={() => setTooltip(null)}
      >
        <div className="practice-score-chart-stage" style={{ width: "100%", height }}>
          {hostWidth ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              preserveAspectRatio="xMidYMid meet"
              className="practice-score-chart-svg"
            >
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
                const columnX = pad.left + groupIndex * (columnW + groupGap);
                const labelX = columnX + columnW / 2;
                const barGap = group.points.length > 1 ? Math.min(4, columnW * 0.08) : 0;
                const barW = Math.max(
                  4,
                  (columnW - barGap * (group.points.length - 1)) / group.points.length,
                );

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
                            rx={Math.min(4, barW / 3)}
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

              {averagePoints.length > 1 ? (
                <path d={averagePath} className="practice-score-average-line" />
              ) : null}
              {averagePoints.map((item) => (
                <g key={`avg-${item.date}`}>
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r={4.5}
                    className="practice-score-average-dot"
                  >
                    <title>
                      {`Overall hit rate through ${item.date}: ${item.average}% (${item.correct} of ${item.answered} answers)`}
                    </title>
                  </circle>
                  <text
                    x={item.x}
                    y={item.y - 10}
                    textAnchor="middle"
                    className="practice-score-average-value"
                  >
                    {item.average}
                  </text>
                </g>
              ))}
            </svg>
          ) : null}

          {tooltip && hostWidth ? (
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
    </div>
  );
}
