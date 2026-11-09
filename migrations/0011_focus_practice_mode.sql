-- Add focused weak-spot practice sessions (short rounds from blueprints the learner often misses).
-- SQLite cannot ALTER CHECK constraints in place, so rebuild practice_sessions.

PRAGMA foreign_keys = OFF;

CREATE TABLE practice_sessions_new (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  mode TEXT NOT NULL CHECK (mode IN ('diagnostic', 'daily', 'timed', 'focus')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status IN ('completed', 'abandoned') AND completed_at IS NOT NULL)
  )
);

INSERT INTO practice_sessions_new (
  id, profile_id, exam_goal, mode, status, started_at, completed_at
)
SELECT id, profile_id, exam_goal, mode, status, started_at, completed_at
FROM practice_sessions;

DROP TABLE practice_sessions;
ALTER TABLE practice_sessions_new RENAME TO practice_sessions;

CREATE INDEX practice_sessions_scope ON practice_sessions(profile_id, exam_goal, started_at DESC);

PRAGMA foreign_keys = ON;
