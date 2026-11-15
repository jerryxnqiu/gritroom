export type PracticeScoreSession = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  total: number;
  correct: number;
};

export type PracticeScorePoint = {
  id: string;
  /** Plain calendar date for the x-axis. */
  date: string;
  /** What the bar is from (Practice, Timed, …); -1/-2 only when identical sources share a day. */
  source: string;
  percent: number;
  correct: number;
  total: number;
  mode: string;
  at: string;
};

function sessionStamp(session: PracticeScoreSession) {
  return session.completedAt || session.startedAt;
}

function sessionDate(session: PracticeScoreSession) {
  return sessionStamp(session).slice(0, 10);
}

export function practiceScoreSourceName(mode: string) {
  if (mode === "diagnostic") return "Starting-point";
  if (mode === "timed") return "Timed";
  if (mode === "focus") return "Weak spots";
  return "Practice";
}

/** Chronological score points: x-axis dates stay plain; duplicate sources on a day get -1, -2. */
export function buildPracticeScorePoints(sessions: PracticeScoreSession[]): PracticeScorePoint[] {
  const completed = sessions
    .filter((session) => session.status === "completed" && session.total > 0)
    .slice()
    .sort((a, b) => {
      const byTime = sessionStamp(a).localeCompare(sessionStamp(b));
      return byTime || a.id.localeCompare(b.id);
    });

  const sourceCounts = new Map<string, number>();
  for (const session of completed) {
    const key = `${sessionDate(session)}::${session.mode}`;
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }

  const seen = new Map<string, number>();
  return completed.map((session) => {
    const date = sessionDate(session);
    const key = `${date}::${session.mode}`;
    const dayModeTotal = sourceCounts.get(key) || 1;
    const index = (seen.get(key) || 0) + 1;
    seen.set(key, index);
    const base = practiceScoreSourceName(session.mode);
    return {
      id: session.id,
      date,
      source: dayModeTotal > 1 ? `${base}-${index}` : base,
      percent: Math.round((session.correct / session.total) * 100),
      correct: session.correct,
      total: session.total,
      mode: session.mode,
      at: sessionStamp(session),
    };
  });
}
