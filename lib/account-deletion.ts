export type DeletionJob={owner_id:string;phase:'requested'|'identity_deleted'|'complete';close_owned_groups:number;owned_group_count:number;requested_at:number;completed_at:number|null;attempts:number;next_attempt_at:number;lease_until:number;error_code:string|null};
export class AccountDeletionError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export const ACCOUNT_DELETE_CONFIRMATION='DELETE MY ACCOUNT';
type PreviewProof={previewToken:string;sessionId:string};
const previewHash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function issueDeletionPreview(db:D1Database,owner:string,sessionId:string,now=Date.now()){
 if(!/^sess_[A-Za-z0-9]+$/.test(sessionId))throw new AccountDeletionError('Verify this sign-in session before reviewing deletion.',403);
 const preview=await deletionPreview(db,owner);if(preview.status!=='active')return preview;
 const previewToken=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),hash=await previewHash(previewToken),expiresAt=now+300000;
 const result=await db.prepare("INSERT INTO account_deletion_previews(owner_id,session_id,token_hash,expires_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) ON CONFLICT(owner_id) DO UPDATE SET session_id=excluded.session_id,token_hash=excluded.token_hash,expires_at=excluded.expires_at WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=excluded.owner_id)").bind(owner,sessionId,hash,expiresAt,owner).run();
 if(result.meta.changes!==1)return deletionPreview(db,owner);
 return{...preview,previewToken,expiresAt};
}
export async function deletionJob(db:D1Database,owner:string):Promise<DeletionJob|null>{return db.prepare('SELECT * FROM account_deletions WHERE owner_id=?').bind(owner).first<DeletionJob>();}
export async function deletionPreview(db:D1Database,owner:string){
 const counts=await db.prepare(`SELECT
 (SELECT COUNT(*) FROM planner_states WHERE owner_id=?) AS planners,
 (SELECT COUNT(*) FROM schedule_shares WHERE owner_id=?) AS shareLinks,
 (SELECT COUNT(*) FROM chat_messages WHERE owner_id=?) + (SELECT COUNT(*) FROM private_group_messages WHERE owner_id=?) AS authoredMessages,
 (SELECT COUNT(*) FROM planner_states s,json_each(CASE WHEN json_valid(s.state_json) THEN s.state_json ELSE '{}' END,'$.sessionNotes') n WHERE s.owner_id=? AND typeof(n.value)='text' AND trim(n.value)!='') AS noteCount`).bind(owner,owner,owner,owner,owner).first();
 const groups=await db.prepare('SELECT id,name FROM private_groups WHERE owner_id=? ORDER BY created_at,id').bind(owner).all<{id:string;name:string}>();
 const job=await deletionJob(db,owner);
 return {counts,ownedGroups:groups.results,status:job?.phase??'active'};
}
export function validateDeletionRequest(body:unknown){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AccountDeletionError('Confirm account deletion.');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['confirmation','closeOwnedGroups','ownedGroupIds','previewToken'].includes(k))||b.confirmation!==ACCOUNT_DELETE_CONFIRMATION||typeof b.previewToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.previewToken)||typeof b.closeOwnedGroups!=='boolean'||!Array.isArray(b.ownedGroupIds)||b.ownedGroupIds.length>10||b.ownedGroupIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(id))||new Set(b.ownedGroupIds).size!==b.ownedGroupIds.length)throw new AccountDeletionError('Confirm account deletion and review your groups.');
 return {closeOwnedGroups:b.closeOwnedGroups,ownedGroupIds:b.ownedGroupIds as string[],previewToken:b.previewToken};
}
export async function requestAccountDeletion(db:D1Database,owner:string,closeOwnedGroups:boolean,ownedGroupIds:string[],proof:PreviewProof,now=Date.now()){
 if(!proof||!/^[A-Za-z0-9_-]{43}$/.test(proof.previewToken)||!/^sess_[A-Za-z0-9]+$/.test(proof.sessionId))throw new AccountDeletionError('Review deletion again in this account.',409);
 const existing=await deletionJob(db,owner);if(existing)return existing;
 const hash=await previewHash(proof.previewToken);
 const ownedGroupCount=ownedGroupIds.length;
 if(ownedGroupCount>0&&!closeOwnedGroups)throw new AccountDeletionError('Confirm making your groups read-only for remaining members.',409);
 await db.batch([
  db.prepare(`INSERT INTO account_deletions(owner_id,phase,close_owned_groups,owned_group_count,requested_at)
  SELECT ?,'requested',?,?,? WHERE EXISTS(SELECT 1 FROM account_deletion_previews WHERE owner_id=? AND session_id=? AND token_hash=? AND expires_at>?) AND (SELECT COUNT(*) FROM private_groups WHERE owner_id=?)=? AND NOT EXISTS(SELECT 1 FROM private_groups WHERE owner_id=? AND id NOT IN(SELECT value FROM json_each(?))) ON CONFLICT(owner_id) DO NOTHING`).bind(owner,closeOwnedGroups?1:0,ownedGroupCount,now,owner,proof.sessionId,hash,now,owner,ownedGroupCount,owner,JSON.stringify(ownedGroupIds)),
  db.prepare('DELETE FROM account_deletion_previews WHERE owner_id=? AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)').bind(owner,owner),
  db.prepare('DELETE FROM private_group_invites WHERE group_id IN(SELECT id FROM private_groups WHERE owner_id=?) AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)').bind(owner,owner),
  ...['schedule_shares','member_plans','member_avatars','community_members'].map(table=>db.prepare(`DELETE FROM ${table} WHERE owner_id=? AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)`).bind(owner,owner)),
 ]); // Revoke published projections with the intent, even during a provider outage.
 const job=await deletionJob(db,owner);if(!job)throw new AccountDeletionError('Your account, session, review or groups changed. Review deletion again.',409);return job;
}
/** Clerk user IDs are always derived from the verified, issuer-namespaced owner. */
export function deletionClerkUserId(owner:string,issuer:string){
 const prefix=`clerk:${issuer}:`;if(!owner.startsWith(prefix))throw new AccountDeletionError('Account identity could not be verified.',403);
 const id=owner.slice(prefix.length);if(!/^user_[A-Za-z0-9]+$/.test(id))throw new AccountDeletionError('Account identity could not be verified.',403);return id;
}
async function retryLater(db:D1Database,job:DeletionJob,errorCode:string,now:number){
 const delay=Math.min(3600000,30000*2**Math.min(job.attempts,7));
 await db.prepare('UPDATE account_deletions SET error_code=?,next_attempt_at=?,lease_until=0 WHERE owner_id=? AND phase!=\'complete\' AND lease_until=? AND attempts=?').bind(errorCode,now+delay,job.owner_id,job.lease_until,job.attempts).run();
}
export async function cleanupAccountData(db:D1Database,owner:string,now=Date.now(),expectedLease?:number){
 const job=await deletionJob(db,owner);if(job?.phase!=='identity_deleted'||(expectedLease!==undefined&&job.lease_until!==expectedLease))throw new AccountDeletionError('Identity deletion must be confirmed before app cleanup.',409);
 const sql=[
 'DELETE FROM chat_flags WHERE owner_id=? OR message_id IN (SELECT id FROM chat_messages WHERE owner_id=?)',
 'DELETE FROM private_group_messages WHERE owner_id=?',
 'DELETE FROM private_group_members WHERE owner_id=?',
 'DELETE FROM private_group_invites WHERE group_id IN (SELECT id FROM private_groups WHERE owner_id=?)',
 'DELETE FROM chat_messages WHERE owner_id=?','DELETE FROM chat_memberships WHERE owner_id=?',
 'DELETE FROM member_avatars WHERE owner_id=?','DELETE FROM member_plans WHERE owner_id=?',
 'DELETE FROM schedule_shares WHERE owner_id=?','DELETE FROM profiles WHERE owner_id=?',
 'DELETE FROM planner_states WHERE owner_id=?','DELETE FROM community_members WHERE owner_id=?',
 'DELETE FROM account_deletion_previews WHERE owner_id=?',
 ];
 // Talk messages, memberships and flags already use the shared chat cleanup above.
 const discussionAudit=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='talk_discussion_moderation'").first();
 if(discussionAudit)sql.unshift('DELETE FROM talk_discussion_moderation WHERE moderator_owner_id=? OR message_id IN (SELECT id FROM chat_messages WHERE owner_id=?)');
 const socialTables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('attendee_social_settings','attendee_communities','attendee_blocks','attendee_connection_events','attendee_connection_limits')").all<{name:string}>()).results;
 for(const {name}of socialTables)sql.unshift(name==='attendee_connection_events'?'DELETE FROM attendee_connection_events WHERE actor_owner_id=? OR recipient_owner_id=?':name==='attendee_blocks'?'DELETE FROM attendee_blocks WHERE owner_id=? OR blocked_owner_id=?':`DELETE FROM ${name} WHERE owner_id=?`);
 // AI data is owner-bound. The shared monthly money total contains no owner data and is never refunded.
 const aiTables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('devyo_ai_cache','devyo_ai_reservations','devyo_ai_daily','devyo_ai_session_daily')").all<{name:string}>()).results;
 for(const {name}of aiTables)sql.push(`DELETE FROM ${name} WHERE owner_id=?`);
 const photoTables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('member_profile_photos','profile_photo_daily','profile_photo_work')").all<{name:string}>()).results;
 for(const {name}of photoTables)sql.push(`DELETE FROM ${name} WHERE owner_id=?`);
 const statements=sql.map(query=>db.prepare(query.replace(' WHERE ',' WHERE (')+") AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=? AND phase='identity_deleted' AND lease_until=? AND attempts=?)").bind(...Array((query.match(/\?/g)||[]).length).fill(owner),owner,job.lease_until,job.attempts));
 statements.push(db.prepare("UPDATE account_deletions SET phase='complete',completed_at=?,error_code=NULL,next_attempt_at=0,lease_until=0 WHERE owner_id=? AND phase='identity_deleted' AND lease_until=? AND attempts=?").bind(now,owner,job.lease_until,job.attempts));
 const result=await db.batch(statements);if(result.at(-1)?.meta.changes!==1)throw new AccountDeletionError('Cleanup lease changed; recovery will continue.',409); // D1 batch is transactional: partial cleanup never reports completion.
}
export async function processAccountDeletion(db:D1Database,owner:string,deleteIdentity:(owner:string)=>Promise<void>,now=Date.now()){
 const claimed=await db.prepare("UPDATE account_deletions SET lease_until=?,attempts=attempts+1 WHERE owner_id=? AND phase!='complete' AND lease_until<=? AND next_attempt_at<=? RETURNING *").bind(now+60000,owner,now,now).first<DeletionJob>();
 if(!claimed)return (await deletionJob(db,owner))?.phase??'active';
 if(claimed.phase==='requested'){
  try{await deleteIdentity(owner);const updated=await db.prepare("UPDATE account_deletions SET phase='identity_deleted' WHERE owner_id=? AND phase='requested' AND lease_until=? AND attempts=?").bind(owner,claimed.lease_until,claimed.attempts).run();if(updated.meta.changes!==1)return(await deletionJob(db,owner))?.phase??'requested';}
  catch{await retryLater(db,claimed,'identity_retry',now);return 'requested';}
 }
 try{await cleanupAccountData(db,owner,now,claimed.lease_until);return 'complete';}
 catch{await retryLater(db,claimed,'cleanup_retry',now);return (await deletionJob(db,owner))?.phase??'identity_deleted';}
}
export async function recoverAccountDeletions(db:D1Database,deleteIdentity:(owner:string)=>Promise<void>,now=Date.now()){
 const pending=await db.prepare("SELECT owner_id FROM account_deletions WHERE phase!='complete' AND next_attempt_at<=? AND lease_until<=? ORDER BY requested_at LIMIT 2").bind(now,now).all<{owner_id:string}>();
 for(const job of pending.results)await processAccountDeletion(db,job.owner_id,deleteIdentity,now);
}
