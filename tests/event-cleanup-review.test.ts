import test from'node:test';
import assert from'node:assert/strict';
import{THUNDERPLAINS_CLEANUP,prepareCleanupReview,verifiedCleanupContact,cleanupConfirmationEligibility}from'../lib/event-cleanup-review.ts';
const issuer='https://auth.example.com',owner=(id:string)=>`clerk:${issuer}:user_${id}`;
const review=()=>({issuer,instanceId:'ins_Fixture',protectedOwners:[owner('Organizer')],scope:'whole-devyo-accounts' as const,owners:[{ownerId:owner('Attendee'),conferenceIds:['thunderplains-2026','other-conference']},{ownerId:owner('Organizer'),conferenceIds:['thunderplains-2026']},{ownerId:owner('IdentityOnly'),conferenceIds:[]}]});
test('requested deadline is exactly 48 hours after the conference in Central daylight time',()=>{
 assert.equal(THUNDERPLAINS_CLEANUP.deadlineAt-THUNDERPLAINS_CLEANUP.endsAt,48*3600000);
 assert.equal(new Date(THUNDERPLAINS_CLEANUP.deadlineAt).toISOString(),'2026-10-23T22:30:00.000Z');
});
test('review excludes the pinned organizer, includes identity-only accounts, and makes other-conference scope explicit',async()=>{
 const result=await prepareCleanupReview(review());assert.equal(result.mode,'review-only');assert.deepEqual(result.targets.map(x=>x.ownerId),[owner('Attendee'),owner('IdentityOnly')]);assert.deepEqual(result.summary,{targetAccounts:2,exemptAccounts:1,multiConferenceAccounts:1,accountsWithOtherConferences:1});
});
test('review fails closed without a matching verified exemption or with a different issuer',async()=>{
 await assert.rejects(prepareCleanupReview({...review(),protectedOwners:[]}),/exemption/);
 await assert.rejects(prepareCleanupReview({...review(),protectedOwners:[owner('Missing')]}),/exempt account/);
 await assert.rejects(prepareCleanupReview({...review(),protectedOwners:['clerk:https://other.example.com:user_Organizer']}),/issuer/);
 await assert.rejects(prepareCleanupReview({...review(),owners:[...review().owners,review().owners[0]]}),/Duplicate/);
 await assert.rejects(prepareCleanupReview({...review(),issuer:'http://auth.example.com'}),/instance/);
});
test('scope hash is stable across input ordering and changes when the target inventory changes',async()=>{
 const a=await prepareCleanupReview(review()),b=await prepareCleanupReview({...review(),owners:[...review().owners].reverse()});assert.equal(a.scopeHash,b.scopeHash);
 const changed=await prepareCleanupReview({...review(),owners:[...review().owners,{ownerId:owner('LateSignup'),conferenceIds:[]}]});assert.notEqual(a.scopeHash,changed.scopeHash);assert.equal(changed.summary.targetAccounts,3);
});
test('recipient selection prefers a verified primary email and never accepts unverified email or phone',()=>{
 const user={primaryEmailAddressId:'primary',primaryPhoneNumberId:'phone',emailAddresses:[{id:'other',emailAddress:'other@example.com',verification:{status:'verified'}},{id:'primary',emailAddress:'primary@example.com',verification:{status:'verified'}}],phoneNumbers:[{id:'phone',phoneNumber:'+12025550123',verification:{status:'verified'}}]};
 assert.deepEqual(verifiedCleanupContact(user),{channel:'email',destination:'primary@example.com'});
 assert.deepEqual(verifiedCleanupContact({...user,emailAddresses:user.emailAddresses.map(x=>({...x,verification:{status:'unverified'}}))}),{channel:'sms',destination:'+12025550123'});
 assert.equal(verifiedCleanupContact({...user,emailAddresses:[],phoneNumbers:[{id:'bad',phoneNumber:'+12025550123',verification:{status:'unverified'}}]}),null);
 assert.equal(verifiedCleanupContact({...user,emailAddresses:[{id:'bad',emailAddress:'test@example.com\r\nBcc:other@example.com',verification:{status:'verified'}}],phoneNumbers:[]}),null);
});
test('confirmation remains ineligible for partial cleanup, retained owner data, exempt accounts or expired contacts',()=>{
 const now=THUNDERPLAINS_CLEANUP.deadlineAt,complete={phase:'complete',identityDeletionConfirmed:true,remainingActiveOwnerRows:0,completedAt:now-1,contactExpiresAt:now+60000,now,isProtectedOwner:false,deliveryConfigured:true};
 assert.equal(cleanupConfirmationEligibility(complete),'eligible-for-reviewed-outbox');
 for(const partial of[{phase:'requested'},{phase:'identity_deleted'},{identityDeletionConfirmed:false},{remainingActiveOwnerRows:1},{completedAt:null},{completedAt:now+1}])assert.equal(cleanupConfirmationEligibility({...complete,...partial}),'cleanup-unconfirmed');
 assert.equal(cleanupConfirmationEligibility({...complete,isProtectedOwner:true}),'protected-account');
 assert.equal(cleanupConfirmationEligibility({...complete,contactExpiresAt:now}),'contact-expired');
 assert.equal(cleanupConfirmationEligibility({...complete,now:NaN}),'contact-expired');
 assert.equal(cleanupConfirmationEligibility({...complete,deliveryConfigured:false}),'delivery-unconfigured');
});
