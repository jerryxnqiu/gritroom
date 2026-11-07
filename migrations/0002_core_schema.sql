-- Core identity, auth, family, and settings (PRD §5, §14)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  installation_owner_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (installation_owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  school_year TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE TABLE IF NOT EXISTS guardian_grants (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'guardian')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_active
  ON guardian_grants(family_id, user_id, profile_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS family_invites (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('learner', 'guardian', 'admin')),
  profile_id TEXT,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS login_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  entry TEXT NOT NULL CHECK (entry IN ('learner', 'parent')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  request_ip TEXT,
  request_ua TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_email
  ON login_challenges(email, created_at DESC);

CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry TEXT NOT NULL CHECK (entry IN ('learner', 'parent')),
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

CREATE INDEX IF NOT EXISTS idx_login_sessions_token
  ON login_sessions(token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS learner_codes (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS account_events (
  id TEXT PRIMARY KEY,
  family_id TEXT,
  user_id TEXT,
  profile_id TEXT,
  event_type TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_settings (
  family_id TEXT PRIMARY KEY,
  encrypted_config_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE TABLE IF NOT EXISTS email_send_log (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  to_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_created
  ON email_send_log(created_at DESC);
