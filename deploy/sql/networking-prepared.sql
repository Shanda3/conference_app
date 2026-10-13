-- LOCAL PROPOSAL ONLY. Do not apply to production without review and approval.
-- Existing community_members/profiles/account_deletions/member_plans are not recreated here.
CREATE TABLE networking_event_attendees (
  event_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  PRIMARY KEY(event_id,owner_id)
);
--> statement-breakpoint
CREATE TABLE networking_directory_revision (
  event_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
--> statement-breakpoint
CREATE TABLE member_networking_profiles (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0 CHECK(visible IN(0,1)),
  revision INTEGER NOT NULL CHECK(revision>0),
  change_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,event_id)
);
--> statement-breakpoint
CREATE TABLE member_networking_tags (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN('interests','stack','goals')),
  tag TEXT NOT NULL,
  PRIMARY KEY(owner_id,event_id,category,tag)
);
--> statement-breakpoint
CREATE INDEX networking_filter_idx ON member_networking_tags(event_id,category,tag,owner_id);
--> statement-breakpoint
CREATE TRIGGER networking_tags_insert AFTER INSERT ON member_networking_tags BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id=NEW.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER networking_tags_delete AFTER DELETE ON member_networking_tags BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id=OLD.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER attendance_insert AFTER INSERT ON networking_event_attendees BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id=NEW.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER attendance_delete AFTER DELETE ON networking_event_attendees BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id=OLD.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER directory_name_update AFTER UPDATE OF display_name ON profiles
WHEN OLD.display_name<>NEW.display_name BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER directory_name_insert AFTER INSERT ON profiles BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER directory_name_delete AFTER DELETE ON profiles BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=OLD.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER directory_member_insert AFTER INSERT ON community_members BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER directory_member_delete AFTER DELETE ON community_members BEGIN
  UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=OLD.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER networking_block_insert BEFORE INSERT ON member_networking_profiles
WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN
  SELECT RAISE(ABORT,'account unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER networking_block_update BEFORE UPDATE ON member_networking_profiles
WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) AND NEW.visible<>0 BEGIN
  SELECT RAISE(ABORT,'account unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER networking_block_tag BEFORE INSERT ON member_networking_tags
WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN
  SELECT RAISE(ABORT,'account unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER networking_delete_intent AFTER INSERT ON account_deletions BEGIN
 DELETE FROM member_networking_tags WHERE owner_id=NEW.owner_id;
 UPDATE member_networking_profiles SET visible=0 WHERE owner_id=NEW.owner_id;
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER networking_visibility_update AFTER UPDATE OF visible ON member_networking_profiles WHEN OLD.visible<>NEW.visible BEGIN
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id=NEW.event_id;
END;
--> statement-breakpoint
CREATE TRIGGER networking_linkedin_update AFTER UPDATE OF linkedin_visible,linkedin_url ON profiles WHEN OLD.linkedin_visible<>NEW.linkedin_visible OR(NEW.linkedin_visible=1 AND OLD.linkedin_url<>NEW.linkedin_url) BEGIN
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER networking_plan_insert AFTER INSERT ON member_plans BEGIN
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER networking_plan_update AFTER UPDATE ON member_plans BEGIN
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER networking_plan_delete AFTER DELETE ON member_plans BEGIN
 UPDATE networking_directory_revision SET revision=revision+1 WHERE event_id IN(SELECT event_id FROM networking_event_attendees WHERE owner_id=OLD.owner_id);
END;
--> statement-breakpoint
INSERT INTO networking_directory_revision(event_id,revision) VALUES('thunderplains-2026',0);
