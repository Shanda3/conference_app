-- LOCAL ONLY: prepared additive integration, never executed remotely by this increment.
-- Requires planner_states, public_program_sources and manual account-deletion safety schema.
CREATE TABLE organizer_review_grants (
 conference_id TEXT NOT NULL CHECK(conference_id='thunderplains-2026'), owner_id TEXT NOT NULL,
 can_apply INTEGER NOT NULL CHECK(can_apply IN(0,1)), PRIMARY KEY(conference_id,owner_id)
);
CREATE TABLE organizer_review_heads (
 conference_id TEXT PRIMARY KEY CHECK(conference_id='thunderplains-2026'), revision INTEGER NOT NULL CHECK(revision>=1),
 sessions_json TEXT NOT NULL, history_json TEXT NOT NULL, approved_at TEXT NOT NULL, last_operation TEXT
);
CREATE TABLE organizer_review_candidates (
 id TEXT PRIMARY KEY, conference_id TEXT NOT NULL CHECK(conference_id='thunderplains-2026'),
 base_revision INTEGER NOT NULL, preview_hash TEXT NOT NULL, sessions_json TEXT NOT NULL,
 checked_at TEXT NOT NULL, expires_at TEXT NOT NULL, applied_at TEXT,
 FOREIGN KEY(conference_id) REFERENCES organizer_review_heads(conference_id)
);
CREATE INDEX organizer_review_candidates_scope ON organizer_review_candidates(conference_id,checked_at);
CREATE TABLE organizer_review_checks (
 conference_id TEXT PRIMARY KEY CHECK(conference_id='thunderplains-2026'), status TEXT NOT NULL CHECK(status IN('ok','failed')),
 checked_at TEXT NOT NULL, message TEXT NOT NULL, candidate_id TEXT
);
CREATE TABLE organizer_review_approvals (
 operation_id TEXT PRIMARY KEY, conference_id TEXT NOT NULL CHECK(conference_id='thunderplains-2026'),
 candidate_id TEXT NOT NULL UNIQUE, reviewer_id TEXT, revision INTEGER NOT NULL, preview_hash TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TABLE organizer_review_intents (
 owner_id TEXT PRIMARY KEY, conference_id TEXT NOT NULL CHECK(conference_id='thunderplains-2026'),
 planner_revision INTEGER NOT NULL, overrides_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Public freshness metadata stays independent of schedule approval and contains no attendee text.
CREATE TABLE organizer_review_abstract_checks (
 session_id TEXT PRIMARY KEY, source_title TEXT NOT NULL, source_status TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('ok','failed')), hash TEXT NOT NULL, checked_at TEXT NOT NULL
);
CREATE TRIGGER organizer_review_intents_deletion_insert BEFORE INSERT ON organizer_review_intents WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
CREATE TRIGGER organizer_review_intents_deletion_update BEFORE UPDATE ON organizer_review_intents WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
CREATE TRIGGER organizer_review_grants_deletion_insert BEFORE INSERT ON organizer_review_grants WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
CREATE TRIGGER organizer_review_grants_deletion_update BEFORE UPDATE ON organizer_review_grants WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
