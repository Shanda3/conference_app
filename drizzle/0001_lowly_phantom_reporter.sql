CREATE TABLE `chat_flags` (
	`owner_id` text NOT NULL,
	`message_id` text NOT NULL,
	`conference_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_memberships` (
	`owner_id` text NOT NULL,
	`conference_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `conference_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conference_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `chat_room_time` ON `chat_messages` (`conference_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_owner_time` ON `chat_messages` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_shares` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_shares_share_id_unique` ON `schedule_shares` (`share_id`);--> statement-breakpoint
CREATE INDEX `schedule_shares_owner_created_idx` ON `schedule_shares` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `schedule_shares_owner_revoked_idx` ON `schedule_shares` (`owner_id`,`revoked_at`);