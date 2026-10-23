// In-memory/synthetic account adapters; isolated local D1 only. No remote binding or network.
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareCleanupReview,THUNDERPLAINS_CLEANUP} from '../lib/event-cleanup-review.ts';
import {runManualCleanupTarget,purgeExpiredCleanupContacts,CLEANUP_CONTACT_MAX_AGE} from '../lib/event-cleanup-confirmations.ts';

const dir=await mkdtemp(join(tmpdir(),'devyo-cleanup-local-d1-'));let mf;
try{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:dir,outboundService:()=>{throw Error('External requests forbidden in cleanup tests');}});
 const db=await mf.getD1Database('DB');
 for(const statement of(await readFile(new URL('../deploy/sql/event-cleanup-confirmations-prepared.sql',import.meta.url),'utf8')).split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
 const issuer='https://auth.example.com',owner=id=>`clerk:${issuer}:user_${id}`;
 const review=await prepareCleanupReview({issuer,instanceId:'ins_Fixture',protectedOwners:[owner('Organizer')],scope:'whole-devyo-accounts',owners:['Organizer','Attendee','Timeout','Partial'].map(id=>({ownerId:owner(id),conferenceIds:['thunderplains-2026']}))});
 let now=THUNDERPLAINS_CLEANUP.deadlineAt+1000,sends=0,removals=0;
 const dataScopeHash='d'.repeat(64),approval={action:'permanently-remove-reviewed-devyo-accounts',scopeHash:review.scopeHash,dataScopeHash,approvedAt:now,expiresAt:now+15*60*1000,contactRetentionMs:CLEANUP_CONTACT_MAX_AGE,successConfirmationsApproved:true,retainedBoundariesAcknowledged:true};
 const deps={db,clock:()=>now,readFreshScope:async()=>({review,dataScopeHash,checkedAt:now,identityIdsReconciled:true,productionInstanceVerified:true}),readVerifiedIdentity:async target=>({id:target.split(':').at(-1),emailAddresses:[{id:'verified',emailAddress:'fixture@example.com',verification:{status:'verified'}}],phoneNumbers:[]}),removeApprovedAccount:async()=>{removals++;},verifyRemoval:async()=>({phase:'complete',identityDeletionConfirmed:true,remainingActiveOwnerRows:0,completedAt:now}),delivery:{sender:'privacy@devyo.app',domainVerified:true,quotaVerified:true,previewsDisabled:true,contactExpiryMaintenanceReady:true,binding:{send:async()=>{
  sends++;assert.equal((await db.prepare('SELECT COUNT(*) n FROM event_cleanup_confirmations WHERE destination IS NOT NULL').first()).n,0);
  return{messageId:'fixture-accepted'};
 }}}};
 await assert.rejects(runManualCleanupTarget(deps,owner('Organizer'),approval),/protected/);assert.equal(removals,0);
 await Promise.all([runManualCleanupTarget(deps,owner('Attendee'),approval),runManualCleanupTarget(deps,owner('Attendee'),approval)]);
 assert.equal(sends,1);assert.equal((await db.prepare('SELECT phase,destination FROM event_cleanup_confirmations WHERE owner_id=?').bind(owner('Attendee')).first()).phase,'accepted');
 await runManualCleanupTarget(deps,owner('Attendee'),approval);assert.equal(sends,1);
 deps.delivery.binding.send=async()=>{sends++;throw Error('Synthetic provider timeout');};
 assert.equal((await runManualCleanupTarget(deps,owner('Timeout'),approval)).status,'send-outcome-uncertain');
 assert.equal((await runManualCleanupTarget(deps,owner('Timeout'),approval)).status,'uncertain');assert.equal(sends,2);
 deps.verifyRemoval=async()=>({phase:'identity_deleted',identityDeletionConfirmed:true,remainingActiveOwnerRows:1,completedAt:null});
 assert.equal((await runManualCleanupTarget(deps,owner('Partial'),approval)).status,'cleanup-unconfirmed');assert.equal(sends,2);
 now+=CLEANUP_CONTACT_MAX_AGE;assert.equal(await purgeExpiredCleanupContacts(db,now),1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM event_cleanup_confirmations WHERE destination IS NOT NULL').first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM event_cleanup_confirmations').first()).n,3);
 console.log(JSON.stringify({passed:true,isolatedLocalD1:true,protectedOwnerBlocked:true,concurrentProviderCalls:1,uncertainRetryBlocked:true,partialCleanupEmailBlocked:true,expiredContactsRemaining:0,externalRequests:0,productionDataUsed:false}));
}finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
