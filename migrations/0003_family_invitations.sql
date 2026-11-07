-- Consent creates a durable relationship. Pending invitations do not grant access.
ALTER TABLE family_invites ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent'
  CHECK (delivery_status IN ('sending', 'sent', 'failed'));
ALTER TABLE family_invites ADD COLUMN accepted_by_user_id TEXT REFERENCES users(id);
ALTER TABLE family_invites ADD COLUMN revoked_by_user_id TEXT REFERENCES users(id);
ALTER TABLE guardian_grants ADD COLUMN revoked_by_user_id TEXT REFERENCES users(id);

CREATE TABLE learner_links (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  invite_id TEXT NOT NULL UNIQUE REFERENCES family_invites(id),
  linked_at TEXT NOT NULL
);

-- Preserve valid accepted links from phase 1. Repeated copies of the same
-- relationship collapse; incompatible legacy relationships fail the migration.
INSERT INTO learner_links (profile_id, user_id, invite_id, linked_at)
SELECT p.id, u.id, MIN(i.id), MIN(i.accepted_at)
FROM family_invites i
JOIN profiles p ON p.id = i.profile_id AND p.family_id = i.family_id
JOIN users u ON u.email = i.email
WHERE i.role = 'learner' AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
GROUP BY p.id, u.id;

CREATE INDEX idx_family_invites_profile ON family_invites(profile_id, created_at DESC);
CREATE INDEX idx_family_invites_recipient ON family_invites(email, created_at DESC);
CREATE INDEX idx_family_invites_sender ON family_invites(created_by_user_id, created_at DESC);

CREATE VIEW profile_access_managers AS
SELECT p.id AS profile_id, p.family_id, g.user_id
FROM profiles p JOIN guardian_grants g ON g.family_id = p.family_id
WHERE g.revoked_at IS NULL AND g.role IN ('owner', 'admin')
  AND (g.profile_id IS NULL OR g.profile_id = p.id);

CREATE VIEW open_family_invites AS
SELECT i.* FROM family_invites i
JOIN profiles p ON p.id = i.profile_id AND p.family_id = i.family_id
WHERE i.role IN ('learner', 'guardian') AND i.delivery_status = 'sent'
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

-- The accepted status, relationship, and audit record commit together.
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

CREATE TRIGGER guardian_revoke_audit
AFTER UPDATE OF revoked_at ON guardian_grants
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.revoked_by_user_id IS NOT NULL
BEGIN
  INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
  VALUES ('evt_' || lower(hex(randomblob(16))), NEW.family_id, NEW.revoked_by_user_id,
    NEW.profile_id, 'guardian_revoked', NEW.revoked_at);
END;
