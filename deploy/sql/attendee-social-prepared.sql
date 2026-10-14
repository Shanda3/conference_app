-- Additive local review only. No notifications are generated or features enabled by this migration.
CREATE TABLE attendee_social_settings (
 owner_id TEXT NOT NULL,event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 allow_notifications INTEGER NOT NULL DEFAULT 1 CHECK(allow_notifications IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0,change_token TEXT NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,event_id)
);
--> statement-breakpoint
CREATE TABLE attendee_communities (
 owner_id TEXT NOT NULL,event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 community_id TEXT NOT NULL,relationship TEXT NOT NULL CHECK(relationship IN('member','interested')),
 updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,event_id,community_id)
);
--> statement-breakpoint
CREATE INDEX attendee_community_filter ON attendee_communities(event_id,community_id,relationship,owner_id);
--> statement-breakpoint
CREATE TABLE attendee_blocks (
 owner_id TEXT NOT NULL,event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 blocked_owner_id TEXT NOT NULL,created_at INTEGER NOT NULL,CHECK(owner_id<>blocked_owner_id),
 PRIMARY KEY(owner_id,event_id,blocked_owner_id)
);
--> statement-breakpoint
CREATE INDEX attendee_block_target ON attendee_blocks(event_id,blocked_owner_id,owner_id);
--> statement-breakpoint
CREATE TABLE attendee_connection_events (
 id TEXT PRIMARY KEY NOT NULL,event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 conference_id TEXT NOT NULL CHECK(conference_id IN('thunderplains-2026','innotech-oklahoma-2026')),
 actor_owner_id TEXT NOT NULL,recipient_owner_id TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN('explicit','legacy')),
 notification_visible INTEGER NOT NULL CHECK(notification_visible IN(0,1)),
 created_at INTEGER NOT NULL,notified_at INTEGER,read_at INTEGER,dismissed_at INTEGER,
 CHECK(actor_owner_id<>recipient_owner_id),UNIQUE(event_id,actor_owner_id,recipient_owner_id)
);
--> statement-breakpoint
CREATE INDEX attendee_notification_recipient ON attendee_connection_events(recipient_owner_id,event_id,notification_visible,dismissed_at,created_at);
--> statement-breakpoint
CREATE INDEX attendee_connection_actor_rate ON attendee_connection_events(actor_owner_id,event_id,source,created_at);
--> statement-breakpoint
-- Owner-only activity slots have no peer ID, name, connection or notification ID.
-- Removing a peer's account therefore cannot reset this owner's rate limits.
CREATE TABLE attendee_connection_limits (
 id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL,
 event_id TEXT NOT NULL CHECK(event_id='thunderplains-2026'),
 kind TEXT NOT NULL CHECK(kind IN('sent','received')),created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX attendee_limit_owner_time ON attendee_connection_limits(owner_id,event_id,kind,created_at);
--> statement-breakpoint
CREATE TRIGGER attendee_event_eligible BEFORE INSERT ON attendee_connection_events WHEN NEW.source='explicit' AND (
 NOT EXISTS(SELECT 1 FROM community_members WHERE owner_id=NEW.actor_owner_id)
 OR NOT EXISTS(SELECT 1 FROM community_members WHERE owner_id=NEW.recipient_owner_id)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE owner_id=NEW.actor_owner_id)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE owner_id=NEW.recipient_owner_id)
 OR NOT EXISTS(SELECT 1 FROM planner_states s,json_each(CASE WHEN json_valid(s.state_json) THEN s.state_json ELSE '{}' END,'$.conferences') c WHERE s.owner_id=NEW.actor_owner_id AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id')=NEW.conference_id)
 OR NOT EXISTS(SELECT 1 FROM planner_states s,json_each(CASE WHEN json_valid(s.state_json) THEN s.state_json ELSE '{}' END,'$.conferences') c WHERE s.owner_id=NEW.recipient_owner_id AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id')=NEW.conference_id)
 OR EXISTS(SELECT 1 FROM attendee_blocks WHERE event_id=NEW.event_id AND ((owner_id=NEW.actor_owner_id AND blocked_owner_id=NEW.recipient_owner_id) OR(owner_id=NEW.recipient_owner_id AND blocked_owner_id=NEW.actor_owner_id)))
 OR(NEW.notification_visible=1 AND EXISTS(SELECT 1 FROM attendee_social_settings WHERE owner_id=NEW.recipient_owner_id AND event_id=NEW.event_id AND allow_notifications=0))
 OR EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(NEW.actor_owner_id,NEW.recipient_owner_id))
) BEGIN SELECT RAISE(ABORT,'Attendee unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_event_rate BEFORE INSERT ON attendee_connection_events WHEN NEW.source='explicit' AND (
 EXISTS(SELECT 1 FROM attendee_connection_limits WHERE owner_id=NEW.actor_owner_id AND event_id=NEW.event_id AND kind='sent' AND created_at>NEW.created_at-3000)
 OR(SELECT COUNT(*) FROM attendee_connection_limits WHERE owner_id=NEW.actor_owner_id AND event_id=NEW.event_id AND kind='sent' AND created_at>NEW.created_at-60000)>=6
 OR(SELECT COUNT(*) FROM attendee_connection_limits WHERE owner_id=NEW.actor_owner_id AND event_id=NEW.event_id AND kind='sent' AND created_at>NEW.created_at-86400000)>=50
 OR(NEW.notification_visible=1 AND(SELECT COUNT(*) FROM attendee_connection_limits WHERE owner_id=NEW.recipient_owner_id AND event_id=NEW.event_id AND kind='received' AND created_at>NEW.created_at-86400000)>=50)
) BEGIN SELECT RAISE(ABORT,'Connection limit'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_record_limits AFTER INSERT ON attendee_connection_events WHEN NEW.source='explicit' BEGIN
 DELETE FROM attendee_connection_limits WHERE created_at<=NEW.created_at-86400000;
 INSERT INTO attendee_connection_limits(id,owner_id,event_id,kind,created_at) VALUES(lower(hex(randomblob(16))),NEW.actor_owner_id,NEW.event_id,'sent',NEW.created_at);
 INSERT INTO attendee_connection_limits(id,owner_id,event_id,kind,created_at) SELECT lower(hex(randomblob(16))),NEW.recipient_owner_id,NEW.event_id,'received',NEW.created_at WHERE NEW.notification_visible=1;
END;
--> statement-breakpoint
CREATE TRIGGER attendee_notice_time_immutable BEFORE UPDATE OF notified_at ON attendee_connection_events BEGIN SELECT RAISE(ABORT,'Notification history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_settings_block_insert BEFORE INSERT ON attendee_social_settings WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_settings_block_update BEFORE UPDATE ON attendee_social_settings WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_community_block_insert BEFORE INSERT ON attendee_communities WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_community_block_update BEFORE UPDATE ON attendee_communities WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_block_guard BEFORE INSERT ON attendee_blocks WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(NEW.owner_id,NEW.blocked_owner_id)) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
--> statement-breakpoint
CREATE TRIGGER attendee_block_hide AFTER INSERT ON attendee_blocks BEGIN
 UPDATE attendee_connection_events SET notification_visible=0,dismissed_at=COALESCE(dismissed_at,NEW.created_at) WHERE event_id=NEW.event_id AND ((actor_owner_id=NEW.owner_id AND recipient_owner_id=NEW.blocked_owner_id) OR(actor_owner_id=NEW.blocked_owner_id AND recipient_owner_id=NEW.owner_id));
END;
--> statement-breakpoint
CREATE TRIGGER attendee_pause_notifications AFTER UPDATE OF allow_notifications ON attendee_social_settings WHEN NEW.allow_notifications=0 BEGIN
 UPDATE attendee_connection_events SET notification_visible=0,dismissed_at=COALESCE(dismissed_at,NEW.updated_at) WHERE event_id=NEW.event_id AND recipient_owner_id=NEW.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER attendee_pause_notifications_insert AFTER INSERT ON attendee_social_settings WHEN NEW.allow_notifications=0 BEGIN
 UPDATE attendee_connection_events SET notification_visible=0,dismissed_at=COALESCE(dismissed_at,NEW.updated_at) WHERE event_id=NEW.event_id AND recipient_owner_id=NEW.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER attendee_close_account AFTER INSERT ON account_deletions BEGIN
 DELETE FROM attendee_communities WHERE owner_id=NEW.owner_id;
 DELETE FROM attendee_social_settings WHERE owner_id=NEW.owner_id;
 DELETE FROM attendee_blocks WHERE owner_id=NEW.owner_id OR blocked_owner_id=NEW.owner_id;
 DELETE FROM attendee_connection_events WHERE actor_owner_id=NEW.owner_id OR recipient_owner_id=NEW.owner_id;
 DELETE FROM attendee_connection_limits WHERE owner_id=NEW.owner_id;
END;
--> statement-breakpoint
-- Planner writes quietly record existing/manual saves; they never generate notifications.
CREATE TRIGGER attendee_legacy_insert AFTER INSERT ON planner_states BEGIN
 INSERT INTO attendee_connection_events(id,event_id,conference_id,actor_owner_id,recipient_owner_id,source,notification_visible,created_at)
 SELECT 'legacy:'||NEW.owner_id||':'||m.id,'thunderplains-2026',json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId'),NEW.owner_id,m.owner_id,'legacy',0,0
 FROM json_each(CASE WHEN json_valid(NEW.state_json) THEN NEW.state_json ELSE '{}' END,'$.connections') c
 JOIN community_members m ON m.id=substr(json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id'),8)
 WHERE c.type='object' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id') GLOB 'member-*' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId') IN('thunderplains-2026','innotech-oklahoma-2026') AND m.owner_id<>NEW.owner_id AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(NEW.owner_id,m.owner_id))
 ON CONFLICT(event_id,actor_owner_id,recipient_owner_id) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER attendee_legacy_update AFTER UPDATE OF state_json ON planner_states BEGIN
 INSERT INTO attendee_connection_events(id,event_id,conference_id,actor_owner_id,recipient_owner_id,source,notification_visible,created_at)
 SELECT 'legacy:'||NEW.owner_id||':'||m.id,'thunderplains-2026',json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId'),NEW.owner_id,m.owner_id,'legacy',0,0
 FROM json_each(CASE WHEN json_valid(NEW.state_json) THEN NEW.state_json ELSE '{}' END,'$.connections') c
 JOIN community_members m ON m.id=substr(json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id'),8)
 WHERE c.type='object' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id') GLOB 'member-*' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId') IN('thunderplains-2026','innotech-oklahoma-2026') AND m.owner_id<>NEW.owner_id AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(NEW.owner_id,m.owner_id))
 ON CONFLICT(event_id,actor_owner_id,recipient_owner_id) DO NOTHING;
END;
--> statement-breakpoint
-- Quiet backfill protects existing saves from remove/re-save notification spam.
INSERT INTO attendee_connection_events(id,event_id,conference_id,actor_owner_id,recipient_owner_id,source,notification_visible,created_at)
 SELECT 'legacy:'||s.owner_id||':'||m.id,'thunderplains-2026',json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId'),s.owner_id,m.owner_id,'legacy',0,0
 FROM planner_states s,json_each(CASE WHEN json_valid(s.state_json) THEN s.state_json ELSE '{}' END,'$.connections') c
 JOIN community_members m ON m.id=substr(json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id'),8)
 WHERE c.type='object' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.id') GLOB 'member-*' AND json_extract(CASE WHEN c.type='object' THEN c.value ELSE '{}' END,'$.conferenceId') IN('thunderplains-2026','innotech-oklahoma-2026') AND m.owner_id<>s.owner_id AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(s.owner_id,m.owner_id))
 ON CONFLICT(event_id,actor_owner_id,recipient_owner_id) DO NOTHING;
