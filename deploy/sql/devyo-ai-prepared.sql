-- Scoped AI accounting and private cache. No credentials or attendee row changes.

CREATE TABLE IF NOT EXISTS devyo_ai_monthly(month TEXT PRIMARY KEY,reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0 AND reserved_microusd<=180000000));
CREATE TABLE IF NOT EXISTS devyo_ai_daily(owner_id TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL,last_call_at INTEGER NOT NULL,PRIMARY KEY(owner_id,day));
CREATE TABLE IF NOT EXISTS devyo_ai_session_daily(owner_id TEXT NOT NULL,day TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('prep','notes')),calls INTEGER NOT NULL,PRIMARY KEY(owner_id,day,session_id,kind));
CREATE TABLE IF NOT EXISTS devyo_ai_reservations(owner_id TEXT NOT NULL,request_id TEXT NOT NULL,month TEXT NOT NULL,day TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('prep','notes')),cache_key TEXT NOT NULL,reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd=50000),requested_at INTEGER NOT NULL,lease_until INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','complete','failed')),input_tokens INTEGER,output_tokens INTEGER,PRIMARY KEY(owner_id,request_id));
CREATE INDEX IF NOT EXISTS devyo_ai_reservation_pending ON devyo_ai_reservations(owner_id,status,lease_until);
CREATE TABLE IF NOT EXISTS devyo_ai_cache(owner_id TEXT NOT NULL,cache_key TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(owner_id,cache_key));
CREATE TRIGGER IF NOT EXISTS devyo_ai_reserve_checks BEFORE INSERT ON devyo_ai_reservations WHEN NOT EXISTS(SELECT 1 FROM devyo_ai_reservations WHERE owner_id=NEW.owner_id AND request_id=NEW.request_id) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) THEN RAISE(ABORT,'DEVYO_AI_CLOSED') END;
 SELECT CASE WHEN COALESCE((SELECT reserved_microusd FROM devyo_ai_monthly WHERE month=NEW.month),180000000)+NEW.reserved_microusd>180000000 THEN RAISE(ABORT,'DEVYO_AI_MONTHLY') END;
 SELECT CASE WHEN COALESCE((SELECT calls FROM devyo_ai_daily WHERE owner_id=NEW.owner_id AND day=NEW.day),0)>=8 THEN RAISE(ABORT,'DEVYO_AI_DAILY') END;
 SELECT CASE WHEN COALESCE((SELECT calls FROM devyo_ai_session_daily WHERE owner_id=NEW.owner_id AND day=NEW.day AND session_id=NEW.session_id AND kind=NEW.kind),0)>=3 THEN RAISE(ABORT,'DEVYO_AI_SESSION') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM devyo_ai_reservations WHERE owner_id=NEW.owner_id AND status='reserved' AND lease_until>NEW.requested_at) OR EXISTS(SELECT 1 FROM devyo_ai_daily WHERE owner_id=NEW.owner_id AND day=NEW.day AND last_call_at>NEW.requested_at-5000) THEN RAISE(ABORT,'DEVYO_AI_BUSY') END;
END;
CREATE TRIGGER IF NOT EXISTS devyo_ai_reserve_charge AFTER INSERT ON devyo_ai_reservations BEGIN
 UPDATE devyo_ai_monthly SET reserved_microusd=reserved_microusd+NEW.reserved_microusd WHERE month=NEW.month;
 INSERT INTO devyo_ai_daily(owner_id,day,calls,last_call_at) VALUES(NEW.owner_id,NEW.day,1,NEW.requested_at) ON CONFLICT(owner_id,day) DO UPDATE SET calls=calls+1,last_call_at=excluded.last_call_at;
 INSERT INTO devyo_ai_session_daily(owner_id,day,session_id,kind,calls) VALUES(NEW.owner_id,NEW.day,NEW.session_id,NEW.kind,1) ON CONFLICT(owner_id,day,session_id,kind) DO UPDATE SET calls=calls+1;
END;
CREATE TRIGGER IF NOT EXISTS devyo_ai_cache_closed_insert BEFORE INSERT ON devyo_ai_cache WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'DEVYO_AI_CLOSED'); END;
CREATE TRIGGER IF NOT EXISTS devyo_ai_cache_closed_update BEFORE UPDATE ON devyo_ai_cache WHEN EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'DEVYO_AI_CLOSED'); END;
CREATE TABLE IF NOT EXISTS devyo_ai_control(id TEXT PRIMARY KEY,schema_version INTEGER NOT NULL);
INSERT INTO devyo_ai_control(id,schema_version) SELECT 'guard-v1',1 WHERE (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN('devyo_ai_reserve_checks','devyo_ai_reserve_charge','devyo_ai_cache_closed_insert','devyo_ai_cache_closed_update'))=4 ON CONFLICT(id) DO NOTHING;
