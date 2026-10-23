-- PREPARED ONLY. Not a migration, scheduler, or authorization to apply this schema.
-- No recipient value, encrypted recipient, recipient hash, message body or phone
-- number is persisted here. Addresses exist only in a single invocation's memory.
CREATE TABLE event_cleanup_confirmations (
 owner_id TEXT PRIMARY KEY NOT NULL,
 scope_hash TEXT NOT NULL CHECK(length(scope_hash)=64),
 receipt_id TEXT UNIQUE NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('prepared','dispatching','accepted','uncertain','expired','unavailable')),
 captured_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>captured_at AND expires_at<=captured_at+86400000),
 attempted_at INTEGER,
 accepted_at INTEGER,
 provider_message_id TEXT
);
--> statement-breakpoint
CREATE TABLE event_cleanup_runs (
 id TEXT PRIMARY KEY NOT NULL,
 actor_owner_id TEXT NOT NULL,
 scope_hash TEXT NOT NULL,
 data_scope_hash TEXT NOT NULL,
 manifest_json TEXT NOT NULL,
 approved_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX event_cleanup_run_expiry ON event_cleanup_runs(expires_at);
