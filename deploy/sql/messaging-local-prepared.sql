-- Apply only after release approval. Requires the existing attendee-social and account-deletion schemas.
CREATE TABLE IF NOT EXISTS message_sequences(seq INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,room TEXT NOT NULL,message_id TEXT NOT NULL,UNIQUE(scope,message_id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_sequence_room ON message_sequences(scope,room,seq);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS message_read_state(owner_id TEXT NOT NULL,scope TEXT NOT NULL CHECK(scope IN('group','conference','talk')),room TEXT NOT NULL,read_at INTEGER NOT NULL DEFAULT 0,read_id TEXT NOT NULL DEFAULT '',read_seq INTEGER NOT NULL DEFAULT 0,muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN(0,1)),PRIMARY KEY(owner_id,scope,room));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS message_reactions(scope TEXT NOT NULL CHECK(scope IN('group','conference','talk')),room TEXT NOT NULL,message_id TEXT NOT NULL,owner_id TEXT NOT NULL,emoji TEXT NOT NULL CHECK(emoji IN('👍','❤️','🎉','😂','👀')),created_at INTEGER NOT NULL,PRIMARY KEY(scope,room,message_id,owner_id,emoji));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_reactions_message ON message_reactions(scope,room,message_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,session_id TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS push_subscription_owner ON push_subscriptions(owner_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS push_deliveries(subscription_id TEXT NOT NULL,scope TEXT NOT NULL,room TEXT NOT NULL,message_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(subscription_id,scope,message_id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS push_delivery_due ON push_deliveries(next_attempt_at,lease_until);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_chat_delete AFTER DELETE ON chat_messages BEGIN DELETE FROM message_reactions WHERE message_id=OLD.id AND scope IN('conference','talk'); DELETE FROM push_deliveries WHERE message_id=OLD.id AND scope IN('conference','talk'); DELETE FROM message_sequences WHERE message_id=OLD.id AND scope IN('conference','talk'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_chat_hide AFTER UPDATE OF deleted_at ON chat_messages WHEN NEW.deleted_at IS NOT NULL BEGIN DELETE FROM message_reactions WHERE message_id=NEW.id AND scope IN('conference','talk'); DELETE FROM push_deliveries WHERE message_id=NEW.id AND scope IN('conference','talk'); DELETE FROM message_sequences WHERE message_id=NEW.id AND scope IN('conference','talk'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_group_delete AFTER DELETE ON private_group_messages BEGIN DELETE FROM message_reactions WHERE message_id=OLD.id AND scope='group'; DELETE FROM push_deliveries WHERE message_id=OLD.id AND scope='group'; DELETE FROM message_sequences WHERE message_id=OLD.id AND scope='group'; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_group_hide AFTER UPDATE OF deleted_at ON private_group_messages WHEN NEW.deleted_at IS NOT NULL BEGIN DELETE FROM message_reactions WHERE message_id=NEW.id AND scope='group'; DELETE FROM push_deliveries WHERE message_id=NEW.id AND scope='group'; DELETE FROM message_sequences WHERE message_id=NEW.id AND scope='group'; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_group_leave AFTER DELETE ON private_group_members BEGIN DELETE FROM message_read_state WHERE scope='group' AND room=OLD.group_id AND owner_id=OLD.owner_id; DELETE FROM message_reactions WHERE scope='group' AND room=OLD.group_id AND owner_id=OLD.owner_id; DELETE FROM push_deliveries WHERE scope='group' AND room=OLD.group_id AND subscription_id IN(SELECT id FROM push_subscriptions WHERE owner_id=OLD.owner_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_chat_leave AFTER DELETE ON chat_memberships BEGIN DELETE FROM message_read_state WHERE scope IN('conference','talk') AND room=OLD.conference_id AND owner_id=OLD.owner_id; DELETE FROM message_reactions WHERE scope IN('conference','talk') AND room=OLD.conference_id AND owner_id=OLD.owner_id; DELETE FROM push_deliveries WHERE scope IN('conference','talk') AND room=OLD.conference_id AND subscription_id IN(SELECT id FROM push_subscriptions WHERE owner_id=OLD.owner_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_subscription_delete AFTER DELETE ON push_subscriptions BEGIN DELETE FROM push_deliveries WHERE subscription_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_account_closing AFTER INSERT ON account_deletions BEGIN DELETE FROM push_subscriptions WHERE owner_id=NEW.owner_id; DELETE FROM push_deliveries WHERE message_id IN(SELECT id FROM chat_messages WHERE owner_id=NEW.owner_id UNION SELECT id FROM private_group_messages WHERE owner_id=NEW.owner_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_reads_closing_insert BEFORE INSERT ON message_read_state WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_closing'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_reads_closing_update BEFORE UPDATE ON message_read_state WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_closing'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_reactions_closing BEFORE INSERT ON message_reactions WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_closing'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_push_closing_insert BEFORE INSERT ON push_subscriptions WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_closing'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_push_closing_update BEFORE UPDATE ON push_subscriptions WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_closing'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_chat_sequence AFTER INSERT ON chat_messages BEGIN INSERT INTO message_sequences(scope,room,message_id) VALUES(CASE WHEN NEW.conference_id LIKE 'talk:%' THEN 'talk' ELSE 'conference' END,NEW.conference_id,NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_group_sequence AFTER INSERT ON private_group_messages BEGIN INSERT INTO message_sequences(scope,room,message_id) VALUES('group',NEW.group_id,NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS messaging_group_readonly_reaction BEFORE INSERT ON message_reactions WHEN NEW.scope='group' AND EXISTS(SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.room) BEGIN SELECT RAISE(ABORT,'group_readonly'); END;
--> statement-breakpoint
INSERT OR IGNORE INTO message_sequences(scope,room,message_id) SELECT CASE WHEN conference_id LIKE 'talk:%' THEN 'talk' ELSE 'conference' END,conference_id,id FROM chat_messages WHERE deleted_at IS NULL ORDER BY created_at,id;
--> statement-breakpoint
INSERT OR IGNORE INTO message_sequences(scope,room,message_id) SELECT 'group',group_id,id FROM private_group_messages WHERE deleted_at IS NULL ORDER BY created_at,id;
