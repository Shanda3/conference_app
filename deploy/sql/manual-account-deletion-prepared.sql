CREATE TABLE `account_deletions` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`close_owned_groups` integer NOT NULL,
	`owned_group_count` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`completed_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `account_deletion_pending` ON `account_deletions` (`phase`,`next_attempt_at`);
--> statement-breakpoint
CREATE TRIGGER planner_states_deletion_insert BEFORE INSERT ON planner_states WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER planner_states_deletion_update BEFORE UPDATE ON planner_states WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER profiles_deletion_insert BEFORE INSERT ON profiles WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER profiles_deletion_update BEFORE UPDATE ON profiles WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER schedule_shares_deletion_insert BEFORE INSERT ON schedule_shares WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER schedule_shares_deletion_update BEFORE UPDATE ON schedule_shares WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER community_members_deletion_insert BEFORE INSERT ON community_members WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER community_members_deletion_update BEFORE UPDATE ON community_members WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER member_plans_deletion_insert BEFORE INSERT ON member_plans WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER member_plans_deletion_update BEFORE UPDATE ON member_plans WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER member_avatars_deletion_insert BEFORE INSERT ON member_avatars WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER member_avatars_deletion_update BEFORE UPDATE ON member_avatars WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_memberships_deletion_insert BEFORE INSERT ON chat_memberships WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_memberships_deletion_update BEFORE UPDATE ON chat_memberships WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_messages_deletion_insert BEFORE INSERT ON chat_messages WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_messages_deletion_update BEFORE UPDATE ON chat_messages WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_flags_deletion_insert BEFORE INSERT ON chat_flags WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER chat_flags_deletion_update BEFORE UPDATE ON chat_flags WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_groups_deletion_insert BEFORE INSERT ON private_groups WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_groups_deletion_update BEFORE UPDATE ON private_groups WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_members_deletion_insert BEFORE INSERT ON private_group_members WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_members_deletion_update BEFORE UPDATE ON private_group_members WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_messages_deletion_insert BEFORE INSERT ON private_group_messages WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_messages_deletion_update BEFORE UPDATE ON private_group_messages WHEN EXISTS (SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_invites_deletion_insert BEFORE INSERT ON private_group_invites WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TRIGGER private_group_invites_deletion_update BEFORE UPDATE ON private_group_invites WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER closing_groups_members_insert BEFORE INSERT ON private_group_members WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER closing_groups_members_update BEFORE UPDATE ON private_group_members WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER closing_groups_messages_insert BEFORE INSERT ON private_group_messages WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=NEW.group_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER closing_groups_messages_update BEFORE UPDATE ON private_group_messages WHEN EXISTS (SELECT 1 FROM private_groups g JOIN account_deletions d ON d.owner_id=g.owner_id WHERE g.id=OLD.group_id) AND NOT (NEW.body='' AND NEW.deleted_at IS NOT NULL AND NEW.id=OLD.id AND NEW.group_id=OLD.group_id AND NEW.owner_id=OLD.owner_id AND NEW.display_name=OLD.display_name AND NEW.created_at=OLD.created_at) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;

--> statement-breakpoint
CREATE TABLE account_deletion_previews(owner_id TEXT PRIMARY KEY NOT NULL,session_id TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);
