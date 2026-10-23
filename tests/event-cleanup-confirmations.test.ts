// Synthetic identities, in-memory SQLite and mocked native binding only. No network.
import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import type {SQLInputValue} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {prepareCleanupReview,THUNDERPLAINS_CLEANUP} from '../lib/event-cleanup-review.ts';
import {assertManualCleanupApproval,CLEANUP_CONTACT_MAX_AGE,expireCleanupAttempts,runManualCleanupTarget} from '../lib/event-cleanup-confirmations.ts';
import type {ManualCleanupApproval,ManualCleanupDependencies,FreshCleanupScope} from '../lib/event-cleanup-confirmations.ts';

const schema=await readFile(new URL('../deploy/sql/event-cleanup-confirmations-prepared.sql',import.meta.url),'utf8');
const issuer='https://auth.example.com',owner=(id:string)=>`clerk:${issuer}:user_${id}`;
const attendee=owner('Attendee'),organizer=owner('Organizer');
const dataScopeHash='a'.repeat(64);
type FixtureStatement={sql:string;values:SQLInputValue[];bind:(...values:SQLInputValue[])=>FixtureStatement;first:<T>()=>Promise<T|null>;run:()=>Promise<unknown>};
async function fixture(t:TestContext){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema);
 const execute=(stmt:FixtureStatement)=>{
  const prepared=sqlite.prepare(stmt.sql);
  if(/^SELECT\b/.test(stmt.sql))return{results:prepared.all(...stmt.values).map(row=>({...row})),meta:{changes:0}};
  return{results:[],meta:{changes:Number(prepared.run(...stmt.values).changes)}};
 };
 const statement=(sql:string,values:SQLInputValue[]=[]):FixtureStatement=>({sql,values,bind:(...next)=>statement(sql,next),async first<T>(){const row=sqlite.prepare(sql).get(...values);return row?{...row} as T:null;},async run(){return execute(statement(sql,values));}});
 const db={prepare:statement,async batch(statements:FixtureStatement[]){sqlite.exec('BEGIN');try{const output=statements.map(execute);sqlite.exec('COMMIT');return output;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 const review=await prepareCleanupReview({issuer,instanceId:'ins_Fixture',protectedOwners:[organizer],scope:'whole-devyo-accounts',owners:[{ownerId:organizer,conferenceIds:['thunderplains-2026']},{ownerId:attendee,conferenceIds:['thunderplains-2026','another-event']}]});
 const state={now:THUNDERPLAINS_CLEANUP.deadlineAt+1000,identityReads:0,removals:0,verifications:0,sends:0};
 const proof=():FreshCleanupScope=>({review,dataScopeHash,checkedAt:state.now,identityIdsReconciled:true,productionInstanceVerified:true});
 const approval:ManualCleanupApproval={action:'permanently-remove-reviewed-devyo-accounts',scopeHash:review.scopeHash,dataScopeHash,approvedAt:state.now,expiresAt:state.now+15*60*1000,contactRetentionMs:CLEANUP_CONTACT_MAX_AGE,successConfirmationsApproved:true,retainedBoundariesAcknowledged:true,recipientMemoryOnly:true};
 const identity={id:'user_Attendee',primaryEmailAddressId:'verified',emailAddresses:[{id:'verified',emailAddress:'attendee@example.com',verification:{status:'verified'}}],phoneNumbers:[]};
 const deps:ManualCleanupDependencies={db,clock:()=>state.now,delivery:{binding:{async send(){state.sends++;return{messageId:'fixture-message-id'};}},sender:'privacy@devyo.app',domainVerified:true,quotaVerified:true,previewsDisabled:true,providerRecipientLogRetentionApproved:true},async readFreshScope(){return proof();},async readVerifiedIdentity(){state.identityReads++;return identity;},async removeApprovedAccount(){state.removals++;},async verifyRemoval(){state.verifications++;return{phase:'complete',identityDeletionConfirmed:true,remainingActiveOwnerRows:0,completedAt:state.now};}};
 const row=()=>sqlite.prepare('SELECT * FROM event_cleanup_confirmations').get();
 const count=()=>Number(sqlite.prepare('SELECT COUNT(*) n FROM event_cleanup_confirmations').get()!.n);
 return{sqlite,db,deps,approval,state,proof,row,count,identity};
}

test('manual gate rejects stale scope, unverified inventory, early time, protected accounts and absent retention approval before effects',async t=>{
 const f=await fixture(t),now=f.state.now;
 const invalid:[ManualCleanupApproval,FreshCleanupScope,string,number][]=[
  [{...f.approval,scopeHash:'b'.repeat(64)},f.proof(),attendee,now],
  [{...f.approval,dataScopeHash:'b'.repeat(64)},f.proof(),attendee,now],
  [f.approval,{...f.proof(),identityIdsReconciled:false},attendee,now],
  [f.approval,{...f.proof(),productionInstanceVerified:false},attendee,now],
  [f.approval,{...f.proof(),checkedAt:now-60001},attendee,now],
  [f.approval,{...f.proof(),checkedAt:now+1},attendee,now],
  [f.approval,f.proof(),organizer,now],
  [f.approval,f.proof(),owner('Unreviewed'),now],
  [{...f.approval,expiresAt:now},f.proof(),attendee,now],
  [{...f.approval,contactRetentionMs:1},f.proof(),attendee,now],
  [{...f.approval,successConfirmationsApproved:false} as unknown as ManualCleanupApproval,f.proof(),attendee,now],
  [{...f.approval,retainedBoundariesAcknowledged:false} as unknown as ManualCleanupApproval,f.proof(),attendee,now],
  [f.approval,f.proof(),attendee,THUNDERPLAINS_CLEANUP.deadlineAt-1],
 ];
 for(const args of invalid)assert.throws(()=>assertManualCleanupApproval(...args));
 await assert.rejects(runManualCleanupTarget(f.deps,organizer,f.approval),/protected/);
 assert.equal(f.count(),0);assert.equal(f.state.removals+f.state.sends+f.state.identityReads,0);
});

test('delivery readiness blocks contact capture and removal, even if approval is otherwise current',async t=>{
 const f=await fixture(t);
 for(const patch of[{binding:undefined},{domainVerified:false},{quotaVerified:false},{previewsDisabled:false},{providerRecipientLogRetentionApproved:false}]){
  await assert.rejects(runManualCleanupTarget({...f.deps,delivery:{...f.deps.delivery,...patch}},attendee,f.approval),/delivery/);
 }
 assert.equal(f.count(),0);assert.equal(f.state.removals+f.state.sends+f.state.identityReads,0);
});

test('phone-only, unverified contacts and mismatched identities cannot be captured or removed',async t=>{
 const f=await fixture(t);
 f.deps.readVerifiedIdentity=async()=>({...f.identity,emailAddresses:[],phoneNumbers:[{id:'phone',phoneNumber:'+12025550123',verification:{status:'verified'}}]});
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'sms-route-unavailable');
 f.deps.readVerifiedIdentity=async()=>({...f.identity,emailAddresses:[{...f.identity.emailAddresses[0],verification:{status:'unverified'}}]});
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'verified-contact-unavailable');
 f.deps.readVerifiedIdentity=async()=>({...f.identity,id:'user_Wrong'});
 await assert.rejects(runManualCleanupTarget(f.deps,attendee,f.approval),/identity/);
 assert.equal(f.count(),0);assert.equal(f.state.removals+f.state.sends,0);
});

test('changed inventory after contact verification prevents staging and deletion',async t=>{
 const f=await fixture(t);let reads=0;
 f.deps.readFreshScope=async()=>({...f.proof(),dataScopeHash:++reads===1?dataScopeHash:'b'.repeat(64)});
 await assert.rejects(runManualCleanupTarget(f.deps,attendee,f.approval),/scope changed/);
 assert.equal(f.count(),0);assert.equal(f.state.removals+f.state.sends,0);
});

test('verified removal sends one private plain-text confirmation without ever storing its destination',async t=>{
 const f=await fixture(t);
 f.deps.delivery.binding={async send(message){
  f.state.sends++;assert.equal(f.state.removals,1);assert.equal(f.state.verifications,1);
  assert.equal('destination' in f.row()!,false);assert.equal(f.row()!.phase,'dispatching');
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM event_cleanup_confirmations').all()),/@|12025550123/);
  assert.equal(message.to,'attendee@example.com');assert.equal(message.from,'privacy@devyo.app');
  assert.deepEqual(Object.keys(message).sort(),['from','headers','subject','text','to']);
  assert.match(message.text,/across Devyo conferences/);assert.match(message.text,/receipts/);assert.match(message.text,/backups/);assert.match(message.text,/independently saved/);
  assert.doesNotMatch(JSON.stringify(message),/user_Attendee|scope_hash|unsubscribe|<img|https:\/\//);
  return{messageId:'fixture-accepted'};
 }};
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'accepted');
 assert.equal('destination' in f.row()!,false);assert.equal(f.row()!.provider_message_id,'fixture-accepted');
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'accepted');
 assert.equal(f.state.sends,1);assert.equal(f.state.removals,1);assert.equal(f.state.identityReads,1);
});

test('partial identity/app cleanup or residual group metadata never sends; expiry erases contact without extending its lifetime',async t=>{
 const f=await fixture(t);
 for(const patch of[{phase:'identity_deleted'},{identityDeletionConfirmed:false},{remainingActiveOwnerRows:1},{completedAt:null}]){
  f.deps.verifyRemoval=async()=>({phase:'complete',identityDeletionConfirmed:true,remainingActiveOwnerRows:0,completedAt:f.state.now,...patch});
  assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'cleanup-unconfirmed');
  f.state.now+=1000;
 }
 const capturedAt=f.row()!.captured_at,expiresAt=f.row()!.expires_at;
 assert.equal(Number(expiresAt)-Number(capturedAt),CLEANUP_CONTACT_MAX_AGE);assert.equal(f.state.identityReads,4);assert.equal(f.state.sends,0);
 f.state.now=Number(expiresAt);assert.equal(await expireCleanupAttempts(f.db,f.state.now),1);
 assert.equal('destination' in f.row()!,false);assert.equal(f.row()!.phase,'expired');
 const renewed={...f.approval,approvedAt:f.state.now,expiresAt:f.state.now+60000};
 assert.equal((await runManualCleanupTarget(f.deps,attendee,renewed)).status,'expired');assert.equal(f.row()!.captured_at,capturedAt);
});

test('provider timeout is uncertain, retains no contact and is never automatically resent',async t=>{
 const f=await fixture(t);
 f.deps.delivery.binding={async send(){f.state.sends++;throw Error('Synthetic timeout containing attendee@example.com');}};
 const result=await runManualCleanupTarget(f.deps,attendee,f.approval);
 assert.equal(result.status,'send-outcome-uncertain');assert.doesNotMatch(JSON.stringify(result),/@/);
 assert.equal(f.row()!.phase,'uncertain');assert.equal('destination' in f.row()!,false);
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'uncertain');assert.equal(f.state.sends,1);
});

test('cleanup finishing after the contact deadline erases the address and does not send',async t=>{
 const f=await fixture(t);
 f.deps.removeApprovedAccount=async()=>{f.state.removals++;f.state.now+=CLEANUP_CONTACT_MAX_AGE;};
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'contact-expired');
 assert.equal(f.state.removals,1);assert.equal(f.state.sends,0);assert.equal('destination' in f.row()!,false);assert.equal(f.row()!.phase,'expired');
});

test('crash after durable dispatch claim cannot trigger a later send',async t=>{
 const f=await fixture(t),realPrepare=f.db.prepare.bind(f.db);
 f.deps.db=new Proxy(f.db,{get(target,key){if(key==='prepare')return(sql:string)=>sql.startsWith("UPDATE event_cleanup_confirmations SET phase='dispatching'")?{bind:(...values:SQLInputValue[])=>({async first(){await realPrepare(sql).bind(...values).first();throw Error('Synthetic process disconnect after commit');}})}:realPrepare(sql);return Reflect.get(target,key);}});
 await assert.rejects(runManualCleanupTarget(f.deps,attendee,f.approval),/disconnect/);
 assert.equal(f.row()!.phase,'dispatching');assert.equal('destination' in f.row()!,false);assert.equal(f.state.sends,0);
 f.deps.db=f.db;assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'dispatching');assert.equal(f.state.sends,0);
});

test('provider acceptance followed by receipt-write failure never duplicates the message',async t=>{
 const f=await fixture(t),realPrepare=f.db.prepare.bind(f.db);
 f.deps.db=new Proxy(f.db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.startsWith("UPDATE event_cleanup_confirmations SET phase='accepted'"))throw Error('Synthetic database outage');return realPrepare(sql);};return Reflect.get(target,key);}});
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'send-outcome-uncertain');
 assert.equal(f.state.sends,1);assert.equal('destination' in f.row()!,false);
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'uncertain');assert.equal(f.state.sends,1);
});

test('concurrent invocations share a single durable confirmation receipt and make at most one provider call',async t=>{
 const f=await fixture(t);
 const results=await Promise.all([runManualCleanupTarget(f.deps,attendee,f.approval),runManualCleanupTarget(f.deps,attendee,f.approval)]);
 assert.equal(f.state.sends,1);assert.equal(f.count(),1);assert.equal('destination' in f.row()!,false);
 assert.equal(new Set(results.map(result=>'receiptId' in result?result.receiptId:null)).size,1);
});

test('prepared schema cannot store destinations and enforces the maximum attempt lifetime',async t=>{
 const f=await fixture(t),sql='INSERT INTO event_cleanup_confirmations(owner_id,scope_hash,receipt_id,phase,captured_at,expires_at) VALUES(?,?,?,?,?,?)';
 assert.throws(()=>f.sqlite.prepare(sql).run(attendee,f.approval.scopeHash,'fixture','prepared',0,CLEANUP_CONTACT_MAX_AGE+1),/CHECK/);
 assert.throws(()=>f.sqlite.prepare('INSERT INTO event_cleanup_confirmations(destination) VALUES(?)').run('attendee@example.com'),/no column/);
 assert.equal(f.count(),0);
});

test('later restart after identity removal reports the lost notice instead of recovering contacts from durable storage',async t=>{
 const f=await fixture(t);
 f.deps.removeApprovedAccount=async()=>{f.state.removals++;throw Error('Synthetic interruption after identity removal');};
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'cleanup-unconfirmed');
 f.deps.readVerifiedIdentity=async()=>null;
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'contact-lost-after-interruption');
 assert.equal(f.state.removals,1);assert.equal(f.state.sends,0);assert.doesNotMatch(JSON.stringify(f.row()),/@/);
});

test('a hung provider attempt times out without retaining an address or enabling a resend',async t=>{
 const f=await fixture(t);f.deps.stepTimeoutMs=10;
 f.deps.delivery.binding={async send(){f.state.sends++;return new Promise<{messageId:string}>(()=>{});}};
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'send-outcome-uncertain');
 assert.equal(f.row()!.phase,'uncertain');assert.doesNotMatch(JSON.stringify(f.row()),/@/);
 assert.equal((await runManualCleanupTarget(f.deps,attendee,f.approval)).status,'uncertain');assert.equal(f.state.sends,1);
});
