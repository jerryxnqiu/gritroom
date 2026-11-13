"use client";

import { useState, type ReactNode } from "react";

export const LATEST_VISIBLE = 5;

export function useCollapsedList<T>(items: T[], limit = LATEST_VISIBLE) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, items.length - limit);
  const visible = expanded || hiddenCount === 0 ? items : items.slice(0, limit);
  return {
    visible,
    expanded,
    hiddenCount,
    canToggle: hiddenCount > 0,
    showOlder: () => setExpanded(true),
    showLatestOnly: () => setExpanded(false),
  };
}

export function CollapseToggle({
  expanded,
  hiddenCount,
  noun = "older",
  onShowOlder,
  onShowLatestOnly,
}: {
  expanded: boolean;
  hiddenCount: number;
  noun?: string;
  onShowOlder: () => void;
  onShowLatestOnly: () => void;
}) {
  if (hiddenCount <= 0 && !expanded) return null;
  return (
    <div className="actions collapse-toggle">
      {expanded ? (
        <button type="button" className="button secondary" onClick={onShowLatestOnly}>
          Show latest {LATEST_VISIBLE} only
        </button>
      ) : (
        <button type="button" className="button secondary" onClick={onShowOlder}>
          Show {hiddenCount} {noun}
        </button>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="family-subsection collapsible-section">
      <summary className="collapsible-section-summary">{title}</summary>
      <div className="collapsible-section-body">{children}</div>
    </details>
  );
}
