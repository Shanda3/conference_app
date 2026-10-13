-- Additive local proposal only. Existing account-deletion receipts are required.
CREATE TABLE member_profile_photos(
 owner_id TEXT PRIMARY KEY,event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 image BLOB CHECK(image IS NULL OR length(image)<=163840),
 visible INTEGER NOT NULL DEFAULT 0 CHECK(visible IN(0,1)),
 fallback TEXT NOT NULL CHECK(fallback IN('initials','gravatar')),
 revision INTEGER NOT NULL CHECK(revision>0),change_token TEXT NOT NULL,updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE profile_photo_daily(owner_id TEXT NOT NULL,day TEXT NOT NULL,attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 10),PRIMARY KEY(owner_id,day));
--> statement-breakpoint
CREATE TABLE profile_photo_monthly(month TEXT PRIMARY KEY,attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 2000));
--> statement-breakpoint
CREATE TABLE profile_photo_work(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,expires_at INTEGER NOT NULL,budget_month TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX photo_work_expiry ON profile_photo_work(expires_at);
--> statement-breakpoint
CREATE INDEX photo_storage_count ON member_profile_photos(owner_id) WHERE image IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER photo_block_insert BEFORE INSERT ON member_profile_photos WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER photo_block_update BEFORE UPDATE ON member_profile_photos WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER photo_block_work BEFORE INSERT ON profile_photo_work WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER photo_block_daily_insert BEFORE INSERT ON profile_photo_daily WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER photo_block_daily_update BEFORE UPDATE ON profile_photo_daily WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER photo_close_work AFTER INSERT ON account_deletions BEGIN DELETE FROM profile_photo_work WHERE owner_id=NEW.owner_id; END;
