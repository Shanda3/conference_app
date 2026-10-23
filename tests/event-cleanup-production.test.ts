import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupFixture,fixtureOwner} from './cleanup-production-fixture.ts';
import {recoverAccountDeletions} from '../lib/account-deletion.ts';
import {handleManualCleanupRequest} from '../lib/event-cleanup-endpoint.ts';
import type {CleanupEndpointEnv} from '../lib/event-cleanup-endpoint.ts';

test('production preview reconciles identity-only accounts and counts private other-conference use without copying contacts',async t=>{
 const f=await cleanupFixture(t),preview=await f.adapter().preview();
 assert.equal(preview.summary.accounts,4);assert.equal(preview.summary.identityOnly,1);assert.equal(preview.summary.phoneOnlyBlocked,1);assert.equal(preview.summary.savedOtherConferenceChoices,1);assert.equal(preview.summary.groupBlockedOwners,0);
 assert.equal(preview.review.protectedOwners[0],fixtureOwner('Organizer'));
 assert.doesNotMatch(JSON.stringify(preview.manifest),/@|12025550123|Preserve organizer notes|private group/);
 assert.ok(f.state.listCalls>=2);assert.equal(f.state.deletes.length+f.state.messages.length,0);
});

test('untrusted metadata cannot copy a contact-shaped identifier into the durable scope manifest',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter();
 f.sqlite.prepare("UPDATE planner_states SET state_json=json_set(state_json,'$.sessions[0].conferenceId',?) WHERE owner_id=?").run('private-contact@example.com',fixtureOwner('Attendee'));
 const preview=await adapter.preview();assert.doesNotMatch(JSON.stringify(preview.manifest),/@/);
 assert.equal(preview.manifest.facts.find(fact=>fact.ownerId===fixtureOwner('Attendee'))!.privateCounts['saved:unmapped'],1);
 f.sqlite.prepare('UPDATE private_groups SET id=? WHERE id=?').run('private-contact@example.com','attendee-group');
 await assert.rejects(adapter.preview(),/group-identity-invalid/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM event_cleanup_runs').get()!.n,0);
});

test('wrong instance, issuer and noncanonical owner cannot reach removal',async t=>{
 const f=await cleanupFixture(t);
 await assert.rejects(f.adapter({port:{...f.port,async instance(){return{id:'ins_Wrong',environmentType:'production'};}}}).preview(),/instance-mismatch/);
 await assert.rejects(f.adapter({port:{...f.port,async domains(){return[{frontendApiUrl:'https://other.example.com',isSatellite:false}];}}}).preview(),/issuer-mismatch/);
 f.sqlite.prepare('UPDATE planner_states SET owner_id=? WHERE owner_id=?').run('foreign-owner',fixtureOwner('Peer'));
 await assert.rejects(f.adapter().preview(),/identity/);assert.equal(f.state.deletes.length+f.state.messages.length,0);
});

test('manual production removal preserves organizer data and group while pruning only an approved empty unprotected group',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter(),run=await f.approve(adapter);
 const preserved=f.sqlite.prepare('SELECT state_json FROM planner_states WHERE owner_id=?').get(fixtureOwner('Organizer'))!.state_json;
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.deepEqual(f.state.deletes,['user_Attendee']);assert.equal(f.state.messages.length,1);
 assert.equal(f.sqlite.prepare('SELECT state_json FROM planner_states WHERE owner_id=?').get(fixtureOwner('Organizer'))!.state_json,preserved);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM private_groups WHERE id=?').get('organizer-group')!.n,1);
 assert.equal(f.sqlite.prepare('SELECT body FROM private_group_messages WHERE id=?').get('organizer-message')!.body,'Preserve organizer conversation');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM private_groups WHERE id=?').get('attendee-group')!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM private_group_members WHERE group_id=?').get('attendee-group')!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM planner_states WHERE owner_id=?').get(fixtureOwner('Attendee'))!.n,0);
 assert.equal(f.sqlite.prepare('SELECT phase FROM account_deletions WHERE owner_id=?').get(fixtureOwner('Attendee'))!.phase,'complete');
 assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM event_cleanup_confirmations').all()),/@|12025550123/);
 assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM event_cleanup_runs').all()),/@|12025550123|Preserve organizer notes/);
 assert.equal(f.bound.some(value=>typeof value==='string'&&(value.includes('@')||value.includes('+12025550123'))),false);
});

test('reviewed batch progress permits subsequent targets and identity-only cleanup without repeating earlier sends',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter(),run=await f.approve(adapter);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Peer'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('IdentityOnly'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.equal(f.state.messages.length,3);assert.deepEqual(f.state.deletes,['user_Attendee','user_Peer','user_IdentityOnly']);
});

test('protected and phone-only targets stay intact even when missing-notice recovery is approved',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter(),run=await f.approve(adapter,true);
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Organizer')),/protected/);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Phone'))).status,'sms-route-unavailable');
 f.users.get('user_Phone')!.phoneNumbers[0].verification.status='unverified';
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Phone'))).status,'sms-route-unavailable');
 assert.equal(f.users.has('user_Phone'),true);assert.equal(f.state.deletes.length+f.state.messages.length,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_deletions').get()!.n,0);
});

test('new identities, increased private data, and unknown owner storage invalidate an approved run',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter(),run=await f.approve(adapter);
 f.users.set('user_LateSignup',f.identity('LateSignup'));
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Attendee')),/new-identity/);f.users.delete('user_LateSignup');
 f.sqlite.prepare("UPDATE planner_states SET state_json=json_set(state_json,'$.sessionNotes.new','New private note') WHERE owner_id=?").run(fixtureOwner('Peer'));
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Attendee')),/private-data-scope-increased/);
 f.sqlite.exec('CREATE TABLE unreviewed_private_data(owner_id TEXT)');
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Attendee')),/unreviewed-owner-storage/);
 assert.equal(f.state.deletes.length+f.state.messages.length,0);
});

test('group with protected membership or messages blocks its creator before any account intent',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter();
 f.sqlite.prepare('INSERT INTO private_group_members(group_id,owner_id,joined_at) VALUES(?,?,0)').run('attendee-group',fixtureOwner('Organizer'));
 const run=await f.approve(adapter);assert.equal(run.preview.summary.groupBlockedOwners,1);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'cleanup-unconfirmed');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_deletions').get()!.n,0);assert.equal(f.state.deletes.length,0);
});

test('a protected message arriving between review and intent atomically prevents identity removal',async t=>{
 const f=await cleanupFixture(t),realBatch=f.db.batch.bind(f.db);let injected=false;
 const db=new Proxy(f.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{if(!injected&&statements.some(statement=>(statement as unknown as {sql:string}).sql.startsWith('INSERT INTO account_deletions'))){injected=true;f.sqlite.prepare('INSERT INTO private_group_messages(id,group_id,owner_id,display_name,body,created_at) VALUES(?,?,?,?,?,0)').run('racing-protected-message','attendee-group',fixtureOwner('Organizer'),'Organizer','Preserve this racing message');}return realBatch(statements);};return Reflect.get(target,key);}});
 const adapter=f.adapter({db}),run=await f.approve(adapter);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'cleanup-unconfirmed');
 assert.equal(injected,true);assert.equal(f.state.deletes.length+f.state.messages.length,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_deletions').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT body FROM private_group_messages WHERE id=?').get('racing-protected-message')!.body,'Preserve this racing message');
});

test('identity mismatch and unconfirmed provider deletion cannot lead to app deletion or confirmation',async t=>{
 const f=await cleanupFixture(t),base=f.adapter(),run=await f.approve(base);
 const mismatched=f.adapter({port:{...f.port,async get(){return f.identity('Peer');}}});
 await assert.rejects(mismatched.execute(run.runId,fixtureOwner('Attendee')),/identity.*match/);
 assert.equal(f.state.deletes.length,0);
 const uncertain=f.adapter({port:{...f.port,async remove(id){f.state.deletes.push(id);throw Error('Synthetic failure before provider execution');}}});
 assert.equal((await uncertain.execute(run.runId,fixtureOwner('Attendee'))).status,'cleanup-unconfirmed');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM planner_states WHERE owner_id=?').get(fixtureOwner('Attendee'))!.n,1);
 assert.equal(f.state.messages.length,0);
 let automatic=0;f.state.now+=120000;await recoverAccountDeletions(f.db,async()=>{automatic++;},f.state.now);
 assert.equal(automatic,0,'manual intents are never claimed by the existing scheduled recovery');
});

test('uncertain provider deletion is reconciled by authoritative absence before app cleanup',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter({port:{...f.port,async remove(id){f.state.deletes.push(id);f.users.delete(id);throw Error('Synthetic response lost after deletion');}}}),run=await f.approve(adapter);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.equal(f.state.deletes.length,1);assert.equal(f.state.messages.length,1);
});

test('interrupted D1 cleanup rolls back, does not auto-recover, and needs explicit missing-notice recovery after restart',async t=>{
 const f=await cleanupFixture(t);
 f.sqlite.exec(`CREATE TRIGGER synthetic_cleanup_interruption BEFORE DELETE ON profiles WHEN OLD.owner_id='${fixtureOwner('Attendee')}' BEGIN SELECT RAISE(ABORT,'Synthetic interruption in the middle of cleanup'); END;`);
 const first=f.adapter(),run=await f.approve(first);
 assert.equal((await first.execute(run.runId,fixtureOwner('Attendee'))).status,'cleanup-unconfirmed');
 assert.equal(f.users.has('user_Attendee'),false);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM planner_states WHERE owner_id=?').get(fixtureOwner('Attendee'))!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM private_group_members WHERE owner_id=?').get(fixtureOwner('Attendee'))!.n,2,'earlier membership deletes in the same D1 batch roll back');
 assert.equal(f.sqlite.prepare('SELECT phase FROM account_deletions WHERE owner_id=?').get(fixtureOwner('Attendee'))!.phase,'identity_deleted');
 f.state.now+=61000;let automatic=0;await recoverAccountDeletions(f.db,async()=>{automatic++;},f.state.now);assert.equal(automatic,0);
 const restarted=f.adapter();assert.equal((await restarted.execute(run.runId,fixtureOwner('Attendee'))).status,'contact-lost-after-interruption');
 assert.equal(f.state.messages.length,0);assert.equal(f.state.deletes.length,1);
 f.sqlite.exec('DROP TRIGGER synthetic_cleanup_interruption');
 const amended=await f.approve(restarted,true);
 assert.equal((await restarted.execute(amended.runId,fixtureOwner('Attendee'))).status,'removed-without-notice');
 assert.equal(f.state.deletes.length,1);assert.equal(f.state.messages.length,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM planner_states WHERE owner_id=?').get(fixtureOwner('Attendee'))!.n,0);
});

test('uncertain email remains terminal across a production-adapter restart',async t=>{
 const f=await cleanupFixture(t),delivery={...f.delivery,binding:{async send(message:unknown){f.state.messages.push(message);throw Error('Synthetic delivery timeout');}}},adapter=f.adapter({delivery}),run=await f.approve(adapter);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'send-outcome-uncertain');
 assert.equal((await f.adapter({delivery}).execute(run.runId,fixtureOwner('Attendee'))).status,'uncertain');
 assert.equal(f.state.messages.length,1);assert.equal(f.state.deletes.length,1);
});

test('expired approval cannot remove accounts; renewal requires unchanged scope and the same notice policy',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter(),run=await f.approve(adapter);
 f.state.now+=15*60000;
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Attendee')),/approval/);
 await assert.rejects(adapter.renew(run.runId,{scopeHash:run.preview.review.scopeHash,dataScopeHash:run.preview.dataScopeHash,allowCleanupWithoutNotice:true}),/scope-changed/);
 await adapter.renew(run.runId,{scopeHash:run.preview.review.scopeHash,dataScopeHash:run.preview.dataScopeHash,allowCleanupWithoutNotice:false});
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
});

test('provider-log retention permission is an independent execution gate, not implied by code or scope approval',async t=>{
 const f=await cleanupFixture(t),adapter=f.adapter({delivery:{...f.delivery,providerRecipientLogRetentionApproved:false}}),run=await f.approve(adapter);
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Attendee')),/recipient-log retention approval/);
 assert.equal(f.state.deletes.length+f.state.messages.length,0);
});

test('endpoint stays disabled and rejects non-owner, cross-site, unverified or stale-session operations before provider access',async t=>{
 let providerAccess=0;
 const disabled=await handleManualCleanupRequest(new Request('https://thunderplains.example.com/api/event-cleanup'),{},{clerk(){providerAccess++;throw Error('Must not initialize provider');}});
 assert.equal(disabled.status,404);assert.equal(providerAccess,0);
 const f=await cleanupFixture(t),env:CleanupEndpointEnv={DEVYO_ENVIRONMENT:'production',DEVYO_EVENT_CLEANUP_MODE:'manual',DEVYO_EVENT_CLEANUP_SCHEMA_READY:'true',DEVYO_EVENT_CLEANUP_PROTECTED_USER_ID:'user_Organizer',CLERK_PUBLISHABLE_KEY:'pk_live_fixture',CLERK_SECRET_KEY:'sk_live_fixture',CLERK_ISSUER:f.config.issuer,DEVYO_CLERK_INSTANCE_ID:f.config.instanceId,DEVYO_ORIGIN:f.config.origin,DEVYO_ACCESS_POLICY:'registered',DB:f.db};
 const actor={status:'authenticated' as const,user:{userId:fixtureOwner('Organizer'),displayName:'Organizer'},sessionId:'sess_Fixture',recentlyVerified:true};
 const hooks={actor:()=>actor,clerk:()=>{providerAccess++;return f.port;},clock:()=>f.state.now};
 const request=(headers:Record<string,string>={})=>new Request(f.config.origin+'/api/event-cleanup',{method:'POST',headers:{'Content-Type':'application/json',Origin:f.config.origin,'X-Expected-Devyo-Session':'sess_Fixture',...headers},body:JSON.stringify({action:'execute',runId:'fixture',ownerId:fixtureOwner('Attendee')})});
 assert.equal((await handleManualCleanupRequest(request(),env,{...hooks,actor:()=>({...actor,user:{userId:fixtureOwner('Attendee'),displayName:'Attendee'}})})).status,403);
 assert.equal((await handleManualCleanupRequest(request(),env,{...hooks,actor:()=>({...actor,recentlyVerified:false})})).ok,false);
 assert.equal((await handleManualCleanupRequest(request({'Sec-Fetch-Site':'cross-site'}),env,hooks)).status,403);
 assert.equal((await handleManualCleanupRequest(request({'X-Expected-Devyo-Session':'sess_Wrong'}),env,hooks)).status,409);
 assert.equal(f.state.listCalls+f.state.deletes.length+f.state.messages.length,0);
});

test('configured synthetic endpoint requires explicit scope acknowledgement and executes one manually selected target',async t=>{
 const f=await cleanupFixture(t),origin=f.config.origin;
 const env:CleanupEndpointEnv={DEVYO_ENVIRONMENT:'production',DEVYO_EVENT_CLEANUP_MODE:'manual',DEVYO_EVENT_CLEANUP_SCHEMA_READY:'true',DEVYO_EVENT_CLEANUP_PROTECTED_USER_ID:'user_Organizer',CLERK_PUBLISHABLE_KEY:'pk_live_fixture',CLERK_SECRET_KEY:'sk_live_fixture',CLERK_ISSUER:f.config.issuer,DEVYO_CLERK_INSTANCE_ID:f.config.instanceId,DEVYO_ORIGIN:origin,DEVYO_ACCESS_POLICY:'registered',DB:f.db,DEVYO_CLEANUP_EMAIL:f.delivery.binding,DEVYO_EVENT_CLEANUP_SENDER_READY:'true',DEVYO_EVENT_CLEANUP_DAILY_QUOTA:'100',DEVYO_EVENT_CLEANUP_PREVIEWS_DISABLED:'true',DEVYO_EVENT_CLEANUP_PROVIDER_RETENTION_APPROVED:'email-analytics-31d'};
 const hooks={actor:()=>({status:'authenticated' as const,user:{userId:fixtureOwner('Organizer'),displayName:'Organizer'},sessionId:'sess_Fixture',recentlyVerified:true}),clerk:()=>f.port,clock:()=>f.state.now};
 const call=(body?:unknown)=>handleManualCleanupRequest(new Request(origin+'/api/event-cleanup',body?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Expected-Devyo-Session':'sess_Fixture'},body:JSON.stringify(body)}:undefined),env,hooks);
 const previewResponse=await call();assert.equal(previewResponse.status,200);assert.match(previewResponse.headers.get('Cache-Control')! ,/no-store/);
 const preview=await previewResponse.json() as {scopeHash:string;dataScopeHash:string;confirmation:string;summary:{accounts:number}};
 assert.equal(preview.summary.accounts,4);
 const approve={action:'approve',scopeHash:preview.scopeHash,dataScopeHash:preview.dataScopeHash,allowCleanupWithoutNotice:false,confirmation:preview.confirmation,acknowledgeRetainedBoundaries:true,acknowledgeProviderRecipientAnalytics31Days:true};
 assert.equal((await call({...approve,acknowledgeProviderRecipientAnalytics31Days:false})).status,400);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM event_cleanup_runs').get()!.n,0);
 const approved=await call(approve);assert.equal(approved.status,200);const run=await approved.json() as {runId:string};
 assert.equal(f.state.deletes.length+f.state.messages.length,0,'approval alone neither removes nor sends');
 const executed=await call({action:'execute',runId:run.runId,ownerId:fixtureOwner('Attendee')});
 assert.equal(executed.status,200);assert.equal((await executed.json() as {status:string}).status,'accepted');
 assert.equal(f.state.messages.length,1);assert.equal(f.users.has('user_Organizer'),true);
});
