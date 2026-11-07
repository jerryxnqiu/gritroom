-- Versioned practice question bank in D1. Optional stem figures live in R2 (image_key).
-- Attempts already snapshot prompt/options/correct; they also store question id/version and image_key.

CREATE TABLE practice_questions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL CHECK (blueprint_version > 0),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 8000),
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (length(correct_option) BETWEEN 1 AND 8),
  image_key TEXT UNIQUE,
  image_name TEXT,
  image_type TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES thinking_blueprints(id, version),
  CHECK (
    (image_key IS NULL AND image_name IS NULL AND image_type IS NULL)
    OR (image_key IS NOT NULL AND image_name IS NOT NULL AND image_type IS NOT NULL)
  )
);

CREATE INDEX practice_questions_active ON practice_questions(status, blueprint_id, id);

ALTER TABLE practice_attempts ADD COLUMN question_id TEXT;
ALTER TABLE practice_attempts ADD COLUMN question_version INTEGER
  CHECK (question_version IS NULL OR question_version > 0);
ALTER TABLE practice_attempts ADD COLUMN image_key TEXT;

-- Seed v1 from the original starter bank (text only; no figures yet).
INSERT INTO practice_questions
  (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, status, created_at)
VALUES
  ('q-necessary-vs-sufficient', 1, 'necessary-vs-sufficient', 1,
   'A library stamp is issued only if a book has been returned on time. Which statement must be true?',
   '{"A":"Every book returned on time receives a stamp.","B":"If a book has a stamp, it was returned on time.","C":"Books without a stamp were returned late.","D":"A late return can still receive a stamp."}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-overlap-in-counts', 1, 'overlap-in-counts', 1,
   'In a class of 20 children, 12 play chess and 10 play checkers. Which claim is not forced by these numbers alone?',
   '{"A":"At least 2 children play both games.","B":"At most 10 children play only checkers.","C":"Exactly 22 children play a game.","D":"It is possible that every checkers player also plays chess."}',
   'C', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-unique-identification', 1, 'unique-identification', 1,
   'A lost bag is blue, has a name tag beginning with L, and contains a maths workbook. Two bags match the colour and workbook. What else must be true to identify one bag for certain?',
   '{"A":"The owner likes blue bags.","B":"Only one of the matching bags has a name tag beginning with L.","C":"Both bags are the same size.","D":"The workbook has a school stamp."}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-condition-chain', 1, 'condition-chain', 1,
   'If Maya finishes her reading log, she may join art club. If she joins art club, she stays after school. Maya did not stay after school. What follows?',
   '{"A":"Maya finished her reading log.","B":"Maya joined art club.","C":"Maya did not finish her reading log.","D":"Maya stayed after school for another reason."}',
   'C', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-direct-support', 1, 'direct-support', 1,
   'Claim: The classroom plants grew faster this month because they were moved closer to the window. Which fact most strongly supports the claim?',
   '{"A":"The plants are popular with the class.","B":"Plants of the same type near the window grew faster than those left farther away.","C":"The classroom has several windows.","D":"The teacher waters the plants twice a week."}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-specific-counterevidence', 1, 'specific-counterevidence', 1,
   'Argument: Our team scored more goals after switching to orange shirts, so orange shirts improve scoring. Which fact most weakens the argument?',
   '{"A":"Orange is a bright colour.","B":"The team also began training twice as often in the same week.","C":"Some fans prefer blue shirts.","D":"The next match is on Saturday."}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-ordered-constraints', 1, 'ordered-constraints', 1,
   'Four books stand in a row: W, X, Y and Z. W is immediately left of Y. Z is at one end. X is not next to Z. Which order is possible?',
   '{"A":"Z, X, W, Y","B":"W, Y, X, Z","C":"X, W, Y, Z","D":"Z, W, X, Y"}',
   'C', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-fit-pieces', 1, 'fit-pieces', 1,
   'A square tray is divided into four equal smaller squares. You have two L-shaped tiles that each cover three of the small squares. How can they cover the tray without overlap?',
   '{"A":"They cannot cover the tray, because 3 + 3 is more than 4.","B":"Place them so each covers three small squares; together they need six small squares.","C":"They cannot cover only four small squares without overlap or going outside.","D":"Rotate one tile and stack it on the other."}',
   'C', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-track-rotation', 1, 'track-rotation', 1,
   'A triangular flag has a star painted near its top point. The flag is rotated 180 degrees in the plane. Where is the star now, relative to the flag''s new position?',
   '{"A":"Near the same top point as before, because the star does not move.","B":"Near the point that was previously at the bottom.","C":"In the centre of the flag.","D":"Off the flag."}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-missing-information', 1, 'missing-information', 1,
   'Rule: A parcel is express only if it weighs under 2 kg and is marked fragile. The table shows weight for two parcels but leaves the fragile mark blank for both. Which question must you answer to test the rule for parcel 1?',
   '{"A":"Who packed parcel 1?","B":"Is parcel 1 marked fragile?","C":"What colour is the parcel label?","D":"Was parcel 2 delivered yesterday?"}',
   'B', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-compare-differences', 1, 'compare-differences', 1,
   'A table shows morning and afternoon temperatures for three towns: A 12→18, B 15→19, C 10→17. Which town had the largest rise?',
   '{"A":"Town A","B":"Town B","C":"Town C","D":"Towns A and C rose by the same amount"}',
   'C', 'active', '2026-11-08T00:00:00.000Z'),
  ('q-structure-then-calculate', 1, 'structure-then-calculate', 1,
   'A relay uses three equal legs. The team''s total time is 6 minutes. The first leg takes 30 seconds less than each of the other two, which are equal. How long is the first leg?',
   '{"A":"1 minute 40 seconds","B":"1 minute 50 seconds","C":"2 minutes","D":"2 minutes 10 seconds"}',
   'A', 'active', '2026-11-08T00:00:00.000Z');
