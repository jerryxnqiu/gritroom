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
  label: string;
  date: string;
  indexOnDay: number | null;
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

/** Build chronological score points; same-day papers become date-1, date-2, … */
export function buildPracticeScorePoints(sessions: PracticeScoreSession[]): PracticeScorePoint[] {
  const completed = sessions
    .filter((session) => session.status === "completed" && session.total > 0)
    .slice()
    .sort((a, b) => {
      const byTime = sessionStamp(a).localeCompare(sessionStamp(b));
      return byTime || a.id.localeCompare(b.id);
    });

  const counts = new Map<string, number>();
  for (const session of completed) {
    const date = sessionDate(session);
    counts.set(date, (counts.get(date) || 0) + 1);
  }

  const seen = new Map<string, number>();
  return completed.map((session) => {
    const date = sessionDate(session);
    const dayTotal = counts.get(date) || 1;
    const indexOnDay = (seen.get(date) || 0) + 1;
    seen.set(date, indexOnDay);
    const multi = dayTotal > 1;
    return {
      id: session.id,
      label: multi ? `${date}-${indexOnDay}` : date,
      date,
      indexOnDay: multi ? indexOnDay : null,
      percent: Math.round((session.correct / session.total) * 100),
      correct: session.correct,
      total: session.total,
      mode: session.mode,
      at: sessionStamp(session),
    };
  });
}
