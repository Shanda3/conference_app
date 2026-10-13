-- Additive public organizer schedule data ONLY. No attendee tables, identity, credentials, or deletion migrations.
CREATE TABLE IF NOT EXISTS public_program_control (id TEXT PRIMARY KEY, last_attempt TEXT NOT NULL, lease_until TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS public_program_sources (
 conference_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, last_success_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('ok','failed')), message TEXT NOT NULL,
 sessions_json TEXT, reference_json TEXT, hash TEXT, changes_json TEXT NOT NULL DEFAULT '[]', changed_at TEXT
);
CREATE TABLE IF NOT EXISTS public_program_checks (
 conference_id TEXT NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL,
 session_count INTEGER NOT NULL, changed_count INTEGER NOT NULL, message TEXT NOT NULL,
 PRIMARY KEY(conference_id,checked_at)
);
CREATE TABLE IF NOT EXISTS public_program_changes (
 conference_id TEXT NOT NULL, session_id TEXT NOT NULL, checked_at TEXT NOT NULL,
 kind TEXT NOT NULL, fields_json TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL,
 PRIMARY KEY(conference_id,session_id,checked_at)
);
