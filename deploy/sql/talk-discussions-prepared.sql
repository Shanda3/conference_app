-- Additive, reviewed migration only. Does not enable discussions or grant a role.
CREATE TABLE talk_discussion_rooms (
 room_key TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 conference_id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(event_id,conference_id,session_id)
);
--> statement-breakpoint
CREATE TABLE talk_discussion_moderation (
 id TEXT PRIMARY KEY NOT NULL,
 room_key TEXT NOT NULL,
 message_id TEXT NOT NULL,
 moderator_owner_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('remove','resolve')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX talk_moderation_owner ON talk_discussion_moderation(moderator_owner_id,created_at);
--> statement-breakpoint
CREATE INDEX talk_moderation_message ON talk_discussion_moderation(message_id);
--> statement-breakpoint
CREATE INDEX talk_report_queue ON chat_flags(conference_id,kind,message_id) WHERE conference_id GLOB 'talk:*' AND kind='report';
--> statement-breakpoint
CREATE INDEX talk_personal_flags ON chat_flags(owner_id,conference_id,created_at) WHERE conference_id GLOB 'talk:*';
--> statement-breakpoint
CREATE TRIGGER talk_message_insert AFTER INSERT ON chat_messages WHEN NEW.conference_id GLOB 'talk:*' BEGIN UPDATE talk_discussion_rooms SET revision=revision+1 WHERE room_key=NEW.conference_id; END;
--> statement-breakpoint
CREATE TRIGGER talk_message_update AFTER UPDATE ON chat_messages WHEN OLD.conference_id GLOB 'talk:*' BEGIN UPDATE talk_discussion_rooms SET revision=revision+1 WHERE room_key=OLD.conference_id; END;
--> statement-breakpoint
CREATE TRIGGER talk_message_delete AFTER DELETE ON chat_messages WHEN OLD.conference_id GLOB 'talk:*' BEGIN UPDATE talk_discussion_rooms SET revision=revision+1 WHERE room_key=OLD.conference_id; DELETE FROM talk_discussion_moderation WHERE message_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER talk_audit_block_insert BEFORE INSERT ON talk_discussion_moderation WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.moderator_owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER talk_audit_block_update BEFORE UPDATE ON talk_discussion_moderation WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.moderator_owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER talk_close_account AFTER INSERT ON account_deletions BEGIN UPDATE talk_discussion_rooms SET revision=revision+1 WHERE room_key IN(SELECT DISTINCT conference_id FROM chat_messages WHERE owner_id=NEW.owner_id AND conference_id GLOB 'talk:*'); END;
