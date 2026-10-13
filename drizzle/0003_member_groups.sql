CREATE TABLE `community_members` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_members_owner_id_unique` ON `community_members` (`owner_id`);--> statement-breakpoint
CREATE TABLE `member_plans` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `private_group_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_group_invites_token_hash_unique` ON `private_group_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `group_invites_group` ON `private_group_invites` (`group_id`);--> statement-breakpoint
CREATE TABLE `private_group_members` (
	`group_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `owner_id`)
);
--> statement-breakpoint
CREATE TABLE `private_group_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `group_message_time` ON `private_group_messages` (`group_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `group_message_owner_time` ON `private_group_messages` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `private_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO community_members (id, owner_id) SELECT lower(hex(randomblob(16))), owner_id FROM profiles;
