-- PREPARED ONLY. Not a migration, scheduler, or authorization to apply this schema.
-- Temporary destinations must never be copied to logs, exports, Git, or browser code.
CREATE TABLE event_cleanup_confirmations (
 owner_id TEXT PRIMARY KEY NOT NULL,
 scope_hash TEXT NOT NULL CHECK(length(scope_hash)=64),
 receipt_id TEXT UNIQUE NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('prepared','dispatching','accepted','uncertain','expired')),
 destination TEXT,
 captured_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>captured_at AND expires_at<=captured_at+86400000),
 attempted_at INTEGER,
 accepted_at INTEGER,
 provider_message_id TEXT,
 CHECK(phase='prepared' OR destination IS NULL)
);
--> statement-breakpoint
CREATE INDEX event_cleanup_contact_expiry ON event_cleanup_confirmations(expires_at) WHERE destination IS NOT NULL;
