-- Read-only coaching teachers: invite by email, land in a learner-mirrored results room.
-- SQLite cannot ALTER CHECK in place, so rebuild invite + login tables.
-- D1 ignores PRAGMA foreign_keys=OFF. Drop dependent learner_links FKs before
-- swapping family_invites, then restore them. Also defer checks for D1.

PRAGMA defer_foreign_keys = ON;

-- Drop invite triggers before the open_family_invites view; otherwise RENAME
-- recompiles them and fails because the view is missing.
DROP TRIGGER IF EXISTS invite_identity_immutable;
DROP TRIGGER IF EXISTS invite_accept_guard;
DROP TRIGGER IF EXISTS invite_accept_relationship;
DROP TRIGGER IF EXISTS invite_cancel_audit;
DROP TRIGGER IF EXISTS learner_link_guard;
DROP TRIGGER IF EXISTS learner_link_immutable;
DROP VIEW IF EXISTS open_family_invites;

-- Break the learner_links → family_invites FK so the invites table can be rebuilt.
CREATE TABLE learner_links_tmp (
  profile_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  invite_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL
);
INSERT INTO learner_links_tmp (profile_id, user_id, invite_id, linked_at)
SELECT profile_id, user_id, invite_id, linked_at FROM learner_links;
DROP TABLE learner_links;
ALTER TABLE learner_links_tmp RENAME TO learner_links;

CREATE TABLE family_invites_new (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('learner', 'guardian', 'admin', 'coach')),
  profile_id TEXT,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sending', 'sent', 'failed')),
  accepted_by_user_id TEXT REFERENCES users(id),
  revoked_by_user_id TEXT REFERENCES users(id),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

INSERT INTO family_invites_new (
  id, family_id, email, role, profile_id, token_hash, expires_at, accepted_at, revoked_at,
  created_by_user_id, created_at, delivery_status, accepted_by_user_id, revoked_by_user_id
)
SELECT
  i.id,
  i.family_id,
  i.email,
  i.role,
  (SELECT p.id FROM profiles p WHERE p.id = i.profile_id),
  i.token_hash,
  i.expires_at,
  i.accepted_at,
  i.revoked_at,
  i.created_by_user_id,
  i.created_at,
  i.delivery_status,
  (SELECT u.id FROM users u WHERE u.id = i.accepted_by_user_id),
  (SELECT u.id FROM users u WHERE u.id = i.revoked_by_user_id)
FROM family_invites i
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = i.family_id)
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = i.created_by_user_id);

DROP TABLE family_invites;
ALTER TABLE family_invites_new RENAME TO family_invites;

CREATE INDEX idx_family_invites_profile ON family_invites(profile_id, created_at DESC);
CREATE INDEX idx_family_invites_recipient ON family_invites(email, created_at DESC);
CREATE INDEX idx_family_invites_sender ON family_invites(created_by_user_id, created_at DESC);

-- Restore learner_links with full foreign keys to the rebuilt invites table.
CREATE TABLE learner_links_new (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  invite_id TEXT NOT NULL UNIQUE REFERENCES family_invites(id),
  linked_at TEXT NOT NULL
);
INSERT INTO learner_links_new (profile_id, user_id, invite_id, linked_at)
SELECT l.profile_id, l.user_id, l.invite_id, l.linked_at
FROM learner_links l
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = l.profile_id)
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)
  AND EXISTS (SELECT 1 FROM family_invites i WHERE i.id = l.invite_id);
DROP TABLE learner_links;
ALTER TABLE learner_links_new RENAME TO learner_links;

CREATE TABLE login_challenges_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  entry TEXT NOT NULL CHECK (entry IN ('learner', 'parent', 'coach')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  request_ip TEXT,
  request_ua TEXT
);

INSERT INTO login_challenges_new (
  id, email, entry, code_hash, attempts, max_attempts, expires_at, consumed_at,
  created_at, request_ip, request_ua
)
SELECT
  id, email, entry, code_hash, attempts, max_attempts, expires_at, consumed_at,
  created_at, request_ip, request_ua
FROM login_challenges;

DROP TABLE login_challenges;
ALTER TABLE login_challenges_new RENAME TO login_challenges;

CREATE INDEX idx_login_challenges_email ON login_challenges(email, created_at DESC);

CREATE TABLE login_sessions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry TEXT NOT NULL CHECK (entry IN ('learner', 'parent', 'coach')),
  token_hash TEXT NOT NULL UNIQUE,
  profile_id TEXT,
  family_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (family_id) REFERENCES families(id)
);

INSERT INTO login_sessions_new (
  id, user_id, entry, token_hash, profile_id, family_id, expires_at, revoked_at, created_at, last_seen_at
)
SELECT
  s.id,
  s.user_id,
  s.entry,
  s.token_hash,
  (SELECT p.id FROM profiles p WHERE p.id = s.profile_id),
  (SELECT f.id FROM families f WHERE f.id = s.family_id),
  s.expires_at,
  s.revoked_at,
  s.created_at,
  s.last_seen_at
FROM login_sessions s
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);

DROP TABLE login_sessions;
ALTER TABLE login_sessions_new RENAME TO login_sessions;

CREATE INDEX idx_login_sessions_token ON login_sessions(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE coach_links (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  invite_id TEXT NOT NULL UNIQUE REFERENCES family_invites(id),
  linked_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, user_id)
);

CREATE INDEX idx_coach_links_user ON coach_links(user_id);

CREATE VIEW open_family_invites AS
SELECT i.* FROM family_invites i
JOIN profiles p ON p.id = i.profile_id AND p.family_id = i.family_id
WHERE i.role IN ('learner', 'guardian', 'coach') AND i.delivery_status = 'sent'
  AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  AND julianday(i.expires_at) > julianday('now')
  AND EXISTS (
    SELECT 1 FROM profile_access_managers m WHERE m.profile_id = i.profile_id
      AND m.user_id = i.created_by_user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM learner_links l JOIN users u ON u.id = l.user_id WHERE u.email = i.email
  )
  AND (i.role <> 'learner' OR NOT EXISTS (
    SELECT 1 FROM learner_links l WHERE l.profile_id = i.profile_id
  ))
  AND NOT EXISTS (
    SELECT 1 FROM users u JOIN guardian_grants g ON g.user_id = u.id AND g.revoked_at IS NULL
    WHERE u.email = i.email AND (i.role = 'learner' OR (
      g.family_id = i.family_id AND (g.profile_id = i.profile_id
        OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
    ))
  )
  AND NOT EXISTS (
    SELECT 1 FROM coach_links c JOIN users u ON u.id = c.user_id
    WHERE u.email = i.email AND c.profile_id = i.profile_id
  );

CREATE TRIGGER invite_identity_immutable
BEFORE UPDATE OF family_id, profile_id, email, role, created_by_user_id ON family_invites
BEGIN
  SELECT RAISE(ABORT, 'Invitation identity is immutable');
END;

CREATE TRIGGER invite_accept_guard
BEFORE UPDATE OF accepted_at, accepted_by_user_id ON family_invites
WHEN OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL OR NOT EXISTS (
  SELECT 1 FROM open_family_invites i JOIN users u ON u.email = i.email
  WHERE i.id = OLD.id AND u.id = NEW.accepted_by_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'Invitation cannot be accepted');
END;

CREATE TRIGGER invite_accept_relationship
AFTER UPDATE OF accepted_at ON family_invites
WHEN OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL
BEGIN
  INSERT INTO learner_links (profile_id, user_id, invite_id, linked_at)
  SELECT NEW.profile_id, NEW.accepted_by_user_id, NEW.id, NEW.accepted_at
  WHERE NEW.role = 'learner';

  INSERT INTO guardian_grants (id, family_id, user_id, profile_id, role, created_at)
  SELECT 'grn_' || lower(hex(randomblob(16))), NEW.family_id, NEW.accepted_by_user_id,
    NEW.profile_id, 'guardian', NEW.accepted_at
  WHERE NEW.role = 'guardian';

  INSERT INTO coach_links (profile_id, user_id, invite_id, linked_at)
  SELECT NEW.profile_id, NEW.accepted_by_user_id, NEW.id, NEW.accepted_at
  WHERE NEW.role = 'coach';

  INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
  VALUES ('evt_' || lower(hex(randomblob(16))), NEW.family_id, NEW.accepted_by_user_id,
    NEW.profile_id, 'invitation_accepted', NEW.accepted_at);
END;

CREATE TRIGGER invite_cancel_audit
AFTER UPDATE OF revoked_at ON family_invites
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.revoked_by_user_id IS NOT NULL
BEGIN
  INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
  VALUES ('evt_' || lower(hex(randomblob(16))), NEW.family_id, NEW.revoked_by_user_id,
    NEW.profile_id, 'invitation_closed', NEW.revoked_at);
END;

CREATE TRIGGER learner_link_guard
BEFORE INSERT ON learner_links
WHEN NOT EXISTS (
  SELECT 1 FROM family_invites i
  JOIN users u ON u.email = i.email
  JOIN profiles p ON p.id = i.profile_id AND p.family_id = i.family_id
  WHERE i.id = NEW.invite_id AND p.id = NEW.profile_id AND u.id = NEW.user_id
    AND i.accepted_by_user_id = u.id AND i.role = 'learner'
    AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'A verified acceptance is required');
END;

CREATE TRIGGER learner_link_immutable
BEFORE UPDATE ON learner_links
BEGIN
  SELECT RAISE(ABORT, 'A linked learner identity is immutable');
END;

CREATE TRIGGER coach_link_guard
BEFORE INSERT ON coach_links
WHEN NOT EXISTS (
  SELECT 1 FROM family_invites i
  JOIN users u ON u.email = i.email
  JOIN profiles p ON p.id = i.profile_id AND p.family_id = i.family_id
  WHERE i.id = NEW.invite_id AND p.id = NEW.profile_id AND u.id = NEW.user_id
    AND i.accepted_by_user_id = u.id AND i.role = 'coach'
    AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'A verified coach acceptance is required');
END;

CREATE TRIGGER coach_link_immutable
BEFORE UPDATE ON coach_links
BEGIN
  SELECT RAISE(ABORT, 'A coach link is immutable');
END;

CREATE TRIGGER coach_revoke_audit
AFTER DELETE ON coach_links
BEGIN
  INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
  SELECT 'evt_' || lower(hex(randomblob(16))), p.family_id, OLD.user_id, OLD.profile_id,
    'coach_revoked', datetime('now')
  FROM profiles p WHERE p.id = OLD.profile_id;
END;
