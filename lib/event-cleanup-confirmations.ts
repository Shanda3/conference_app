/** Manual core. Recipient values are kept only in invocation-local memory.
 * Production adapters must authenticate the organizer and construct fresh proofs;
 * raw approval/proof objects from request bodies are never trusted.
 */
import {cleanupConfirmationEligibility,verifiedCleanupContact,THUNDERPLAINS_CLEANUP} from './event-cleanup-review.ts';
import type {prepareCleanupReview} from './event-cleanup-review.ts';

type Review=Awaited<ReturnType<typeof prepareCleanupReview>>;
export const CLEANUP_CONTACT_MAX_AGE=24*60*60*1000;
export type ManualCleanupApproval={
 action:'permanently-remove-reviewed-devyo-accounts';scopeHash:string;dataScopeHash:string;
 approvedAt:number;expiresAt:number;contactRetentionMs:typeof CLEANUP_CONTACT_MAX_AGE;
 successConfirmationsApproved:true;retainedBoundariesAcknowledged:true;recipientMemoryOnly:true;
 allowCleanupWithoutNotice?:boolean;
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
 domainVerified:boolean;quotaVerified:boolean;previewsDisabled:boolean;providerRecipientLogRetentionApproved:boolean;
};
type Identity=Parameters<typeof verifiedCleanupContact>[0]&{id:string};
type RemovalProof={phase:string;identityDeletionConfirmed:boolean;remainingActiveOwnerRows:number;completedAt:number|null};
type ConfirmationRow={owner_id:string;scope_hash:string;receipt_id:string;phase:'prepared'|'dispatching'|'accepted'|'uncertain'|'expired'|'unavailable';captured_at:number;expires_at:number};
const hash=(value:string)=>/^[a-f0-9]{64}$/.test(value);
const safeEmail=(value:string)=>value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);

/** A software guard, not an authentication/consent mechanism or approval generator. */
export function assertManualCleanupApproval(approval:ManualCleanupApproval,fresh:FreshCleanupScope,owner:string,now:number){
 if(!Number.isFinite(now)||now<THUNDERPLAINS_CLEANUP.deadlineAt)throw Error('The requested removal deadline has not arrived.');
 if(approval.action!=='permanently-remove-reviewed-devyo-accounts'||!Number.isFinite(approval.approvedAt)||!Number.isFinite(approval.expiresAt)||approval.approvedAt>now||approval.expiresAt<=now||approval.expiresAt-approval.approvedAt>15*60*1000)throw Error('A current action-time approval is required.');
 if(!hash(approval.scopeHash)||!hash(approval.dataScopeHash)||approval.scopeHash!==fresh.review.scopeHash||approval.dataScopeHash!==fresh.dataScopeHash)throw Error('The reviewed account or data scope changed.');
 if(!fresh.identityIdsReconciled||!fresh.productionInstanceVerified||!Number.isFinite(fresh.checkedAt)||fresh.checkedAt>now||now-fresh.checkedAt>60000)throw Error('Reconcile and recheck the pinned production inventory first.');
 if(approval.contactRetentionMs!==CLEANUP_CONTACT_MAX_AGE||approval.successConfirmationsApproved!==true||approval.retainedBoundariesAcknowledged!==true||approval.recipientMemoryOnly!==true)throw Error('Approve memory-only contact handling, retained boundaries and success-only confirmations first.');
 if(!fresh.review.protectedOwners.length||fresh.review.protectedOwners.includes(owner)||!fresh.review.targets.some(target=>target.ownerId===owner))throw Error('The account is protected or outside the approved inventory.');
}
function assertDeliveryReady(readiness:CleanupDeliveryReadiness){
 if(readiness.sender!=='privacy@devyo.app'||!readiness.binding||!readiness.domainVerified||!readiness.quotaVerified||!readiness.previewsDisabled||!readiness.providerRecipientLogRetentionApproved)throw Error('Verified delivery and explicit provider recipient-log retention approval are required before removal.');
}
function receipt(db:D1Database,owner:string){return db.prepare('SELECT owner_id,scope_hash,receipt_id,phase,captured_at,expires_at FROM event_cleanup_confirmations WHERE owner_id=?').bind(owner).first<ConfirmationRow>();}

/** Expires metadata only. No stored contacts or contact-expiry scheduler exists. */
export async function expireCleanupAttempts(db:D1Database,now=Date.now()){
 if(!Number.isFinite(now))throw Error('A valid expiry clock is required.');
 const result=await db.prepare("UPDATE event_cleanup_confirmations SET phase='expired' WHERE phase='prepared' AND expires_at<=?").bind(now).run();
 return result.meta.changes;
}

export type ManualCleanupDependencies={
 db:D1Database;delivery:CleanupDeliveryReadiness;clock:()=>number;
 stepTimeoutMs?:number; // Test hook; production uses the bounded 30-second default.
 readFreshScope:()=>Promise<FreshCleanupScope>;
 readVerifiedIdentity:(owner:string)=>Promise<Identity|null>;
 // A future reviewed adapter must use the existing guarded deletion engine,
 // preserve exempt relationships, and prune only explicitly approved empty groups.
 removeApprovedAccount:(owner:string)=>Promise<void>;
 // Must read the actual completed receipt, authoritative provider absence and
 // all active owner references, including group metadata; not just planner rows.
 verifyRemoval:(owner:string)=>Promise<RemovalProof>;
};

/** One manually approved target. Every deletion needs a fresh matching proof. */
export async function runManualCleanupTarget(deps:ManualCleanupDependencies,owner:string,approval:ManualCleanupApproval){
 const timeoutMs=deps.stepTimeoutMs??30000;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid manual-operation timeout.');
 async function step<T>(operation:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The manual step timed out. Check its recorded outcome before retrying.')),timeoutMs);})]);}
  finally{if(timer)clearTimeout(timer);}
 }
 let now=deps.clock(),fresh=await step(deps.readFreshScope());
 assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
 await expireCleanupAttempts(deps.db,now);
 let row=await receipt(deps.db,owner);
 if(row&&row.scope_hash!==approval.scopeHash)throw Error('An existing confirmation belongs to a different reviewed scope.');
 if(row&&row.phase!=='prepared'&&!(approval.allowCleanupWithoutNotice&&['expired','unavailable'].includes(row.phase)))return{status:row.phase,receiptId:row.receipt_id};
 let user=await step(deps.readVerifiedIdentity(owner));const prefix=`clerk:${fresh.review.issuer}:`;
 if(user&&(!owner.startsWith(prefix)||owner.slice(prefix.length)!==user.id))throw Error('Confirmation identity does not match the target.');
 let contact=user?verifiedCleanupContact(user):null;
 // SMS remains blocked regardless of the missing-notice recovery option.
 if(contact?.channel==='sms'||(user&&contact?.channel!=='email'&&user.phoneNumbers.length))return{status:'sms-route-unavailable' as const};
 if(!contact&&!approval.allowCleanupWithoutNotice)return{status:row?'contact-lost-after-interruption' as const:'verified-contact-unavailable' as const};
 const capturedAt=now;
 try{
 if(!row){
  fresh=await step(deps.readFreshScope());now=deps.clock();
  assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
  await step(deps.db.prepare("INSERT INTO event_cleanup_confirmations(owner_id,scope_hash,receipt_id,phase,captured_at,expires_at) VALUES(?,?,?,'prepared',?,?) ON CONFLICT(owner_id) DO NOTHING").bind(owner,approval.scopeHash,crypto.randomUUID(),now,now+CLEANUP_CONTACT_MAX_AGE).run());
  row=await step(receipt(deps.db,owner));
 }
 if(!row||row.scope_hash!==approval.scopeHash)throw Error('Confirmation staging could not be verified.');
 if(row.phase!=='prepared'&&!(approval.allowCleanupWithoutNotice&&['expired','unavailable'].includes(row.phase)))return{status:row.phase,receiptId:row.receipt_id};
 // Recheck immediately before invoking any deletion adapter, including on a resume.
 fresh=await step(deps.readFreshScope());now=deps.clock();
 assertManualCleanupApproval(approval,fresh,owner,now);assertDeliveryReady(deps.delivery);
 if(row.expires_at<=now&&!approval.allowCleanupWithoutNotice){await step(expireCleanupAttempts(deps.db,now));return{status:'expired' as const,receiptId:row.receipt_id};}
 try{await step(deps.removeApprovedAccount(owner));}catch{return{status:'cleanup-unconfirmed' as const,receiptId:row.receipt_id};}
 let removal:RemovalProof;
 try{removal=await step(deps.verifyRemoval(owner));}catch{return{status:'cleanup-unconfirmed' as const,receiptId:row.receipt_id};}
 now=deps.clock();
 if(!contact||row.expires_at<=now){
  if(removal.phase!=='complete'||!removal.identityDeletionConfirmed||removal.remainingActiveOwnerRows!==0||removal.completedAt===null||removal.completedAt>now)return{status:'cleanup-unconfirmed' as const,receiptId:row.receipt_id};
  await step(deps.db.prepare("UPDATE event_cleanup_confirmations SET phase=? WHERE owner_id=? AND phase IN('prepared','expired','unavailable')").bind(contact?'expired':'unavailable',owner).run());
  return{status:contact?'contact-expired' as const:'removed-without-notice' as const,receiptId:row.receipt_id};
 }
 const eligible=cleanupConfirmationEligibility({...removal,contactExpiresAt:Math.min(row.expires_at,capturedAt+CLEANUP_CONTACT_MAX_AGE),now,isProtectedOwner:fresh.review.protectedOwners.includes(owner),deliveryConfigured:true});
 if(eligible!=='eligible-for-reviewed-outbox'){
  if(eligible==='contact-expired')await step(expireCleanupAttempts(deps.db,now));
  return{status:eligible,receiptId:row.receipt_id};
 }
 // An atomic metadata claim permits at most one attempt. No destination,
 // ciphertext, address hash or message body is ever bound to a SQL statement.
 const claim=await step(deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='dispatching',attempted_at=? WHERE owner_id=? AND scope_hash=? AND phase='prepared' AND expires_at>? RETURNING receipt_id").bind(now,owner,approval.scopeHash,now).first<{receipt_id:string}>());
 if(!claim)return{status:'not-claimed' as const,receiptId:row.receipt_id};
 try{
  if(!safeEmail(contact.destination)||claim.receipt_id!==row.receipt_id)throw Error('Invalid in-memory destination.');
  const response=await step(deps.delivery.binding!.send({
   from:deps.delivery.sender,to:contact.destination,
   subject:'Your Devyo account data has been removed',
   text:'Your Devyo sign-in account and its active planner, notes, profile, sharing links, authored messages and app settings have been removed across Devyo conferences.\n\nMinimal deletion and confirmation receipts, anonymous cost totals, and information independently saved by other people may remain. Provider logs and backups can persist under their retention policies. This is a transactional confirmation, with no marketing or tracking. It cannot prevent unrelated third-party messages.\n\nQuestions or concerns: shandaokcwebdev@gmail.com',
   headers:{'X-Devyo-Confirmation-ID':row.receipt_id},
  }));
  if(typeof response?.messageId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(response.messageId))throw Error('Provider acceptance is unconfirmed.');
  const saved=await step(deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='accepted',accepted_at=?,provider_message_id=? WHERE owner_id=? AND receipt_id=? AND phase='dispatching'").bind(deps.clock(),response.messageId,owner,row.receipt_id).run());
  if(saved.meta.changes!==1)return{status:'send-outcome-uncertain' as const,receiptId:row.receipt_id};
  return{status:'accepted' as const,receiptId:row.receipt_id};
 }catch{
  // Do not log the exception: providers may include recipient addresses in it.
  try{await step(deps.db.prepare("UPDATE event_cleanup_confirmations SET phase='uncertain' WHERE owner_id=? AND receipt_id=? AND phase='dispatching'").bind(owner,row.receipt_id).run());}catch{/* Dispatching also blocks all resend paths. */}
  return{status:'send-outcome-uncertain' as const,receiptId:row.receipt_id};
 }
 }finally{contact=null;user=null;}
}
