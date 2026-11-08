-- Older practice attempts were saved before question_id/version were snapshotted.
-- Without those ids, "unused question" checks treated finished work as never done
-- and could start a duplicate starting-point check.
-- Seeded bank ids are q-{blueprint_id}; restore that link for legacy rows.

UPDATE practice_attempts
SET question_id = 'q-' || blueprint_id,
    question_version = 1
WHERE question_id IS NULL
  AND blueprint_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM practice_questions q
    WHERE q.id = 'q-' || practice_attempts.blueprint_id
      AND q.version = 1
  );
