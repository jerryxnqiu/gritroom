-- Focused weak-spot rounds reuse mode='daily' storage with an is_focus flag.
-- Avoid rebuilding practice_sessions (D1 enforces FKs from practice_attempts).

ALTER TABLE practice_sessions ADD COLUMN is_focus INTEGER NOT NULL DEFAULT 0
  CHECK (is_focus IN (0, 1));
