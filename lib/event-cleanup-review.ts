/** Review-only helpers. Not imported by the Worker or any API; no writes or delivery. */
export const THUNDERPLAINS_CLEANUP = Object.freeze({
 eventId: 'thunderplains-2026',
 timeZone: 'America/Chicago',
 endsAt: Date.parse('2026-10-21T17:30:00-05:00'),
 deadlineAt: Date.parse('2026-10-23T17:30:00-05:00'),
 deadlineLabel: 'Friday, October 23, 2026 at 5:30 p.m. CDT',
});

export type CleanupOwnerInventory = {ownerId:string;conferenceIds:readonly string[]};
export type CleanupReviewInput = {
 issuer:string;instanceId:string;protectedOwners:readonly string[];
 owners:readonly CleanupOwnerInventory[];
 scope:'whole-devyo-accounts';
};
function canonicalOwner(owner:string,issuer:string){
 const prefix=`clerk:${issuer}:`;
 if(!owner.startsWith(prefix)||!/^user_[A-Za-z0-9]+$/.test(owner.slice(prefix.length)))throw Error('Owner does not belong to the reviewed Clerk issuer.');
 return owner;
}
/** A verified owner ID must be supplied by the operator; display names/email guesses are not accepted. */
export async function prepareCleanupReview(input:CleanupReviewInput){
 const url=new URL(input.issuer);
 if(url.protocol!=='https:'||url.origin!==input.issuer||!/^ins_[A-Za-z0-9]+$/.test(input.instanceId))throw Error('Pin the production identity instance and issuer before review.');
 if(input.scope!=='whole-devyo-accounts'||!input.protectedOwners.length)throw Error('Review account-wide scope and at least one verified account exemption first.');
 const protectedOwners=[...new Set(input.protectedOwners.map(owner=>canonicalOwner(owner,input.issuer)))].sort();
 const seen=new Set<string>();
 const owners=input.owners.map(owner=>{
  canonicalOwner(owner.ownerId,input.issuer);
  if(seen.has(owner.ownerId))throw Error('Duplicate account in cleanup inventory.');
  seen.add(owner.ownerId);
  if(owner.conferenceIds.some(id=>typeof id!=='string'||!/^[-a-z0-9]{1,100}$/.test(id)))throw Error('Invalid conference inventory.');
  return{ownerId:owner.ownerId,conferenceIds:[...new Set(owner.conferenceIds)].sort()};
 }).sort((a,b)=>a.ownerId.localeCompare(b.ownerId));
 // The inventory must include identity-only accounts as well as D1 data owners.
 if(protectedOwners.some(owner=>!seen.has(owner)))throw Error('The verified exempt account must be present in the combined identity/data inventory.');
 const exempt=new Set(protectedOwners),targets=owners.filter(owner=>!exempt.has(owner.ownerId));
 const manifest={mode:'review-only' as const,eventId:THUNDERPLAINS_CLEANUP.eventId,deadlineAt:THUNDERPLAINS_CLEANUP.deadlineAt,scope:input.scope,issuer:input.issuer,instanceId:input.instanceId,protectedOwners,targets};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(manifest)));
 const scopeHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 return{...manifest,scopeHash,summary:{targetAccounts:targets.length,exemptAccounts:protectedOwners.length,multiConferenceAccounts:targets.filter(owner=>owner.conferenceIds.length>1).length,accountsWithOtherConferences:targets.filter(owner=>owner.conferenceIds.some(id=>id!==THUNDERPLAINS_CLEANUP.eventId)).length}};
}

type VerifiedEmail={id:string;emailAddress:string;verification?:{status:string}|null};
type VerifiedPhone={id:string;phoneNumber:string;verification?:{status:string}|null};
export type CleanupContact={channel:'email'|'sms';destination:string};
/** In-memory selection only. Never persist a recipient until a bounded retention policy is approved. */
export function verifiedCleanupContact(user:{primaryEmailAddressId?:string|null;primaryPhoneNumberId?:string|null;emailAddresses:readonly VerifiedEmail[];phoneNumbers:readonly VerifiedPhone[]}):CleanupContact|null{
 const emails=user.emailAddresses.filter(email=>email.verification?.status==='verified'&&email.emailAddress.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email.emailAddress));
 const email=emails.find(item=>item.id===user.primaryEmailAddressId)??emails[0];
 if(email)return{channel:'email',destination:email.emailAddress};
 const phones=user.phoneNumbers.filter(phone=>phone.verification?.status==='verified'&&/^\+[1-9]\d{7,14}$/.test(phone.phoneNumber));
 const phone=phones.find(item=>item.id===user.primaryPhoneNumberId)??phones[0];
 return phone?{channel:'sms',destination:phone.phoneNumber}:null;
}

/** This cannot send anything. Provider acceptance/delivery and deduplication require a reviewed outbox. */
export function cleanupConfirmationEligibility(input:{phase:string;identityDeletionConfirmed:boolean;remainingActiveOwnerRows:number;completedAt:number|null;contactExpiresAt:number;now:number;isProtectedOwner:boolean;deliveryConfigured:boolean}){
 if(input.isProtectedOwner)return'protected-account';
 if(input.phase!=='complete'||!input.identityDeletionConfirmed||input.completedAt===null||!Number.isFinite(input.completedAt)||input.completedAt>input.now||input.remainingActiveOwnerRows!==0)return'cleanup-unconfirmed';
 if(!Number.isFinite(input.now)||!Number.isFinite(input.contactExpiresAt)||input.contactExpiresAt<=input.now)return'contact-expired';
 return input.deliveryConfigured?'eligible-for-reviewed-outbox':'delivery-unconfigured';
}
