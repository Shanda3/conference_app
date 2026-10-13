/** One durable shared ledger for every Devyo AI feature. Amounts are integer micro-USD. */
export const AI_LIMITS={monthlyMicroUSD:180_000_000,reservationMicroUSD:50_000,perUserDay:8,perSessionKindDay:3,cooldownMs:5000,leaseMs:45000,maxInputBytes:20000,maxOutputTokens:400,timeoutMs:15000,cacheMs:24*60*60*1000}as const;
export class AIBudgetError extends Error{readonly code:'monthly'|'daily'|'session'|'busy'|'closed'|'unavailable'|'duplicate';constructor(code:AIBudgetError['code']){super(code);this.code=code}}
export type AIKind='prep'|'notes';
export const AI_SCHEMA=`
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
`;
export async function assertAIBudgetReady(db:D1Database){try{const row=await db.prepare("SELECT schema_version,(SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN('devyo_ai_reserve_checks','devyo_ai_reserve_charge','devyo_ai_cache_closed_insert','devyo_ai_cache_closed_update')) AS guards FROM devyo_ai_control WHERE id='guard-v1'").first<{schema_version:number;guards:number}>();if(row?.schema_version!==1||row.guards!==4)throw new AIBudgetError('unavailable')}catch{throw new AIBudgetError('unavailable')}}
function budgetError(error:unknown):AIBudgetError{const message=String(error);for(const [marker,code]of [['MONTHLY','monthly'],['DAILY','daily'],['SESSION','session'],['BUSY','busy'],['CLOSED','closed']]as const)if(message.includes('DEVYO_AI_'+marker))return new AIBudgetError(code);return new AIBudgetError('unavailable')}
export async function reserveAI(db:D1Database,owner:string,requestId:string,sessionId:string,kind:AIKind,cacheKey:string,now=Date.now()):Promise<boolean>{
 const stamp=new Date(now).toISOString(),month=stamp.slice(0,7),day=stamp.slice(0,10);
 try{
  await assertAIBudgetReady(db);
  const prior=await db.prepare('SELECT cache_key FROM devyo_ai_reservations WHERE owner_id=? AND request_id=?').bind(owner,requestId).first<{cache_key:string}>();if(prior){if(prior.cache_key!==cacheKey)throw new AIBudgetError('duplicate');return false}
  const result=await db.batch([
   db.prepare('INSERT INTO devyo_ai_monthly(month,reserved_microusd) VALUES(?,0) ON CONFLICT DO NOTHING').bind(month),
   db.prepare('INSERT INTO devyo_ai_reservations(owner_id,request_id,month,day,session_id,kind,cache_key,reserved_microusd,requested_at,lease_until) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING request_id').bind(owner,requestId,month,day,sessionId,kind,cacheKey,AI_LIMITS.reservationMicroUSD,now,now+AI_LIMITS.leaseMs),
  ]);return result[1].results.length===1;
 }catch(error){if(error instanceof AIBudgetError)throw error;throw budgetError(error)}
}
/** Reservations are never refunded, even on timeouts, crashes, refusals, or uncertain transport. */
export async function finishAI(db:D1Database,owner:string,requestId:string,status:'complete'|'failed',usage?:{input:number;output:number}){
 try{await db.prepare("UPDATE devyo_ai_reservations SET status=?,lease_until=0,input_tokens=?,output_tokens=? WHERE owner_id=? AND request_id=? AND status='reserved'").bind(status,usage?.input??null,usage?.output??null,owner,requestId).run()}catch{throw new AIBudgetError('unavailable')}
}
export async function aiCallsRemaining(db:D1Database,owner:string,now=Date.now()):Promise<number>{const row=await db.prepare('SELECT calls FROM devyo_ai_daily WHERE owner_id=? AND day=?').bind(owner,new Date(now).toISOString().slice(0,10)).first<{calls:number}>();return Math.max(0,AI_LIMITS.perUserDay-(row?.calls??0))}
export async function readAICache(db:D1Database,owner:string,key:string,now=Date.now()):Promise<string|null>{const row=await db.prepare('SELECT result_json FROM devyo_ai_cache WHERE owner_id=? AND cache_key=? AND expires_at>? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)').bind(owner,key,now,owner).first<{result_json:string}>();return row?.result_json??null}
export async function saveAICache(db:D1Database,owner:string,key:string,sessionId:string,kind:AIKind,result:unknown,now=Date.now()){
 await db.batch([db.prepare('DELETE FROM devyo_ai_cache WHERE owner_id=? AND expires_at<=?').bind(owner,now),db.prepare('INSERT INTO devyo_ai_cache(owner_id,cache_key,session_id,kind,result_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,cache_key) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at,expires_at=excluded.expires_at').bind(owner,key,sessionId,kind,JSON.stringify(result),now,now+AI_LIMITS.cacheMs)]);
}
