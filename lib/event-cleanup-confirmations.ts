/** Operator-only preparation. No Worker, API, CLI, migration or scheduler imports this module.
 * Approval/proof inputs must come from a trusted operator, never a request body.
 * There is deliberately no production identity-removal or inventory adapter here.
 */
import {cleanupConfirmationEligibility,verifiedCleanupContact,THUNDERPLAINS_CLEANUP} from './event-cleanup-review.ts';
import type {prepareCleanupReview} from './event-cleanup-review.ts';

type Review=Awaited<ReturnType<typeof prepareCleanupReview>>;
export const CLEANUP_CONTACT_MAX_AGE=24*60*60*1000;
export type ManualCleanupApproval={
 action:'permanently-remove-reviewed-devyo-accounts';scopeHash:string;dataScopeHash:string;
 approvedAt:number;expiresAt:number;contactRetentionMs:typeof CLEANUP_CONTACT_MAX_AGE;
 successConfirmationsApproved:true;retainedBoundariesAcknowledged:true;
};
export type FreshCleanupScope={
 review:Review;dataScopeHash:string;checkedAt:number;
 identityIdsReconciled:boolean;productionInstanceVerified:boolean;
};
export type NativeCleanupEmail={
 send(message:{from:string;to:string;subject:string;text:string;headers:Record<string,string>}):Promise<{messageId:string}>;
};
export type CleanupDeliveryReadiness={
 binding?:NativeCleanupEmail;sender:'privacy@devyo.app';
 domainVerified:boolean;quotaVerified:boolean;previewsDisabled:boolean;contactExpiryMaintenanceReady:boolean;
};
type Identity=Parameters<typeof verifiedCleanupContact>[0]&{id:string};
type RemovalProof={phase:string;identityDeletionConfirmed:boolean;remainingActiveOwnerRows:number;completedAt:number|null};
type ConfirmationRow={owner_id:string;scope_hash:string;receipt_id:string;phase:'prepared'|'dispatching'|'accepted'|'uncertain'|'expired';destination:string|null;captured_at:number;expires_at:number};
const hash=(value:string)=>/^[a-f0-9]{64}$/.test(value);
const safeEmail=(value:string)=>value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);

/** A software guard, not an authentication/consent mechanism or approval generator. */
export function assertManualCleanupApproval(approval:ManualCleanupApproval,fresh:FreshCleanupScope,owner:string,now:number){
 if(!Number.isFinite(now)||now<THUNDERPLAINS_CLEANUP.deadlineAt)throw Error('The requested removal deadline has not arrived.');
 if(approval.action!=='permanently-remove-reviewed-devyo-accounts'||!Number.isFinite(approval.approvedAt)||!Number.isFinite(approval.expiresAt)||approval.approvedAt>now||approval.expiresAt<=now||approval.expiresAt-approval.approvedAt>15*60*1000)throw Error('A current action-time approval is required.');
 if(!hash(approval.scopeHash)||!hash(approval.dataScopeHash)||approval.scopeHash!==fresh.review.scopeHash||approval.dataScopeHash!==fresh.dataScopeHash)throw Error('The reviewed account or data scope changed.');
 if(!fresh.identityIdsReconciled||!fresh.productionInstanceVerified||!Number.isFinite(fresh.checkedAt)||fresh.checkedAt>now||now-fresh.checkedAt>60000)throw Error('Reconcile and recheck the pinned production inventory first.');
 if(approval.contactRetentionMs!==CLEANUP_CONTACT_MAX_AGE||approval.successConfirmationsApproved!==true||approval.retainedBoundariesAcknowledged!==true)throw Error('Approve bounded contact retention, retained boundaries and success-only confirmations first.');
 if(!fresh.review.protectedOwners.length||fresh.review.protectedOwners.includes(owner)||!fresh.review.targets.some(target=>target.ownerId===owner))throw Error('The account is protected or outside the approved inventory.');
}
function assertDeliveryReady(readiness:CleanupDeliveryReadiness){
 if(readiness.sender!=='privacy@devyo.app'||!readiness.binding||!readiness.domainVerified||!readiness.quotaVerified||!readiness.previewsDisabled||!readiness.contactExpiryMaintenanceReady)throw Error('Verified delivery and bounded-retention maintenance must be ready before contact capture or removal.');
}
function receipt(db:D1Database,owner:string){return db.prepare('SELECT owner_id,scope_hash,receipt_id,phase,destination,captured_at,expires_at FROM event_cleanup_confirmations WHERE owner_id=?').bind(owner).first<ConfirmationRow>();}

/** Must be wired to reliable, separately approved maintenance before any contact capture.
 * This function is not scheduled or called by the deployed app.
 */
export async function purgeExpiredCleanupContacts(db:D1Database,now=Date.now()){
 if(!Number.isFinite(now))throw Error('A valid expiry clock is required.');
 const result=await db.prepare("UPDATE event_cleanup_confirmations SET destination=NULL,phase='expired' WHERE phase='prepared' AND expires_at<=?").bind(now).run();
 return result.meta.changes;
}

export type ManualCleanupDependencies={
 db:D1Database;delivery:CleanupDeliveryReadiness;clock:()=>number;
 readFreshScope:()=>Promise<FreshCleanupScope>;
 readVerifiedIdentity:(owner:string)=>Promise<Identity>;
 // A future reviewed adapter must use the existing guarded deletion engine,
 // preserve exempt relationships, and prune only explicitly approved empty groups.
 removeApprovedAccount:(owner:string)=>Promise<void>;
 // Must read the actual completed receipt, authoritative provider absence and
 // all active owner references, including group metadata; not just planner rows.
 verifyRemoval:(owner:string)=>Promise<RemovalProof>;
};

/** One operator-invoked target. No loop, production adapter, automatic recovery or entry point.
 * Every deletion needs a fresh proof matching the action-time approved manifest.
 */
export async function runManualCleanupTarget(deps:ManualCleanupDependencies,owner:string,approval:ManualCleanupApproval){
 let now=deps.clock(),fresh=await deps.readFreshScope();
 assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
 await purgeExpiredCleanupContacts(deps.db,now);
 let row=await receipt(deps.db,owner);
 if(row&&row.scope_hash!==approval.scopeHash)throw Error('An existing confirmation belongs to a different reviewed scope.');
 if(row&&row.phase!=='prepared')return{status:row.phase,receiptId:row.receipt_id};
 if(!row){
  const user=await deps.readVerifiedIdentity(owner),prefix=`clerk:${fresh.review.issuer}:`;
  if(!owner.startsWith(prefix)||owner.slice(prefix.length)!==user.id)throw Error('Confirmation identity does not match the target.');
  const contact=verifiedCleanupContact(user);
  if(!contact)return{status:'verified-contact-unavailable' as const};
  // No SMS adapter exists. Never capture its number, remove its account, or
  // silently substitute an email when the required confirmation cannot be sent.
  if(contact.channel==='sms')return{status:'sms-route-unavailable' as const};
  fresh=await deps.readFreshScope();now=deps.clock();
  assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
  await deps.db.prepare("INSERT INTO event_cleanup_confirmations(owner_id,scope_hash,receipt_id,phase,destination,captured_at,expires_at) VALUES(?,?,?,'prepared',?,?,?) ON CONFLICT(owner_id) DO NOTHING").bind(owner,approval.scopeHash,crypto.randomUUID(),contact.destination,now,now+CLEANUP_CONTACT_MAX_AGE).run();
  row=await receipt(deps.db,owner);
 }
 if(!row||row.scope_hash!==approval.scopeHash)throw Error('Confirmation staging could not be verified.');
 if(row.phase!=='prepared')return{status:row.phase,receiptId:row.receipt_id};
 // Recheck immediately before invoking any deletion adapter, including on a resume.
 fresh=await deps.readFreshScope();now=deps.clock();
 assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
 if(row.expires_at<=now){await purgeExpiredCleanupContacts(deps.db,now);return{status:'expired' as const,receiptId:row.receipt_id};}
 try{await deps.removeApprovedAccount(owner);}catch{return{status:'cleanup-unconfirmed' as const,receiptId:row.receipt_id};}
 let removal:RemovalProof;
 try{removal=await deps.verifyRemoval(owner);}catch{return{status:'cleanup-unconfirmed' as const,receiptId:row.receipt_id};}
 now=deps.clock();
 const eligible=cleanupConfirmationEligibility({...removal,contactExpiresAt:row.expires_at,now,isProtectedOwner:fresh.review.protectedOwners.includes(owner),deliveryConfigured:true});
 if(eligible!=='eligible-for-reviewed-outbox'){
  if(eligible==='contact-expired')await purgeExpiredCleanupContacts(deps.db,now);
  return{status:eligible,receiptId:row.receipt_id};
 }
 // D1 batch is transactional: one winner obtains the old destination while
 // clearing the persistent copy BEFORE the external side effect. A timeout,
 // process crash or provider exception can never make this receipt sendable again.
 const claim=await deps.db.batch([
  deps.db.prepare("SELECT destination,receipt_id FROM event_cleanup_confirmations WHERE owner_id=? AND scope_hash=? AND phase='prepared' AND expires_at>?").bind(owner,approval.scopeHash,now),
  deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='dispatching',destination=NULL,attempted_at=? WHERE owner_id=? AND scope_hash=? AND phase='prepared' AND expires_at>?").bind(now,owner,approval.scopeHash,now),
 ]);
 if(claim[1]?.meta.changes!==1)return{status:'not-claimed' as const,receiptId:row.receipt_id};
 const selected=claim[0]?.results?.[0] as {destination:string;receipt_id:string}|undefined;
 try{
  if(!selected||!safeEmail(selected.destination)||selected.receipt_id!==row.receipt_id)throw Error('Invalid staged destination.');
  const response=await deps.delivery.binding!.send({
   from:deps.delivery.sender,to:selected.destination,
   subject:'Your Devyo account data has been removed',
   text:'Your Devyo sign-in account and its active planner, notes, profile, sharing links, authored messages and app settings have been removed across Devyo conferences.\n\nMinimal deletion and confirmation receipts, anonymous cost totals, and information independently saved by other people may remain. Provider logs and backups can persist under their retention policies. This is a transactional confirmation, with no marketing or tracking. It cannot prevent unrelated third-party messages.\n\nQuestions or concerns: shandaokcwebdev@gmail.com',
   headers:{'X-Devyo-Confirmation-ID':row.receipt_id},
  });
  if(typeof response?.messageId!=='string'||!response.messageId.length||response.messageId.length>256||/[\r\n]/.test(response.messageId))throw Error('Provider acceptance is unconfirmed.');
  const saved=await deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='accepted',accepted_at=?,provider_message_id=? WHERE owner_id=? AND receipt_id=? AND phase='dispatching'").bind(deps.clock(),response.messageId,owner,row.receipt_id).run();
  if(saved.meta.changes!==1)return{status:'send-outcome-uncertain' as const,receiptId:row.receipt_id};
  return{status:'accepted' as const,receiptId:row.receipt_id};
 }catch{
  // Do not log the exception: providers may include recipient addresses in it.
  try{await deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='uncertain' WHERE owner_id=? AND receipt_id=? AND phase='dispatching'").bind(owner,row.receipt_id).run();}catch{/* Dispatching also blocks all resend paths. */}
  return{status:'send-outcome-uncertain' as const,receiptId:row.receipt_id};
 }
}
