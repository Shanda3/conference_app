// Complete production adapters, synthetic Clerk/email, isolated local D1. No live services.
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanupFixture,fixtureOwner} from './cleanup-production-fixture.ts';
import {createCleanupProductionAdapter} from '../lib/event-cleanup-production.ts';

const dir=await mkdtemp(join(tmpdir(),'devyo-production-adapter-local-')),teardown=[];let mf;
try{
 const f=await cleanupFixture({after:fn=>teardown.push(fn)});
 f.users.set('user_Recovery',f.identity('Recovery'));
 f.sqlite.prepare('INSERT INTO planner_states(owner_id,state_json,revision,updated_at) VALUES(?,?,0,?)').run(fixtureOwner('Recovery'),JSON.stringify({conferences:[{id:'thunderplains-2026'}],sessions:[],savedSessionIds:[],sessionNotes:{},connections:[]}),'fixture');
 f.sqlite.prepare('INSERT INTO profiles(owner_id,display_name,created_at,updated_at) VALUES(?,?,?,?)').run(fixtureOwner('Recovery'),'Recovery','fixture','fixture');
 f.sqlite.exec(`CREATE TRIGGER synthetic_cleanup_interruption BEFORE DELETE ON profiles WHEN OLD.owner_id='${fixtureOwner('Recovery')}' BEGIN SELECT RAISE(ABORT,'Synthetic mid-transaction interruption'); END;`);
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:dir,outboundService:()=>{throw Error('External requests forbidden');}});
 const db=await mf.getD1Database('DB');
 // SQLite's parsed schema supplies whole trigger statements without splitting
 // their CASE/BEGIN bodies. Every row copied below is a synthetic test fixture.
 const schema=f.sqlite.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
 for(const row of schema)await db.prepare(row.sql).run();
 for(const table of schema.filter(row=>row.type==='table'))for(const row of f.sqlite.prepare(`SELECT * FROM "${table.name}"`).all()){
  const keys=Object.keys(row);await db.prepare(`INSERT OR IGNORE INTO "${table.name}"(${keys.map(key=>'"'+key+'"').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>row[key])).run();
 }
 const adapter=createCleanupProductionAdapter({db,config:f.config,protectedUserId:'user_Organizer',port:f.port,delivery:f.delivery,clock:()=>f.state.now});
 const preview=await adapter.preview();assert.equal(preview.summary.accounts,5);assert.equal(preview.summary.identityOnly,1);
 const run=await adapter.approve({scopeHash:preview.review.scopeHash,dataScopeHash:preview.dataScopeHash,allowCleanupWithoutNotice:false});
 await assert.rejects(adapter.execute(run.runId,fixtureOwner('Organizer')),/protected/);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Phone'))).status,'sms-route-unavailable');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Peer'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('IdentityOnly'))).status,'accepted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Attendee'))).status,'accepted');
 assert.equal(f.state.messages.length,3);assert.equal(f.state.deletes.includes('user_Organizer'),false);assert.equal(f.state.deletes.includes('user_Phone'),false);
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Recovery'))).status,'cleanup-unconfirmed');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM planner_states WHERE owner_id=?').bind(fixtureOwner('Recovery')).first()).n,1);
 assert.equal((await db.prepare('SELECT phase FROM account_deletions WHERE owner_id=?').bind(fixtureOwner('Recovery')).first()).phase,'identity_deleted');
 assert.equal((await adapter.execute(run.runId,fixtureOwner('Recovery'))).status,'contact-lost-after-interruption');
 await db.prepare('DROP TRIGGER synthetic_cleanup_interruption').run();
 const recovery=await adapter.preview(true),amended=await adapter.approve({scopeHash:recovery.review.scopeHash,dataScopeHash:recovery.dataScopeHash,allowCleanupWithoutNotice:true});
 f.state.now+=61000;
 assert.equal((await adapter.execute(amended.runId,fixtureOwner('Recovery'))).status,'removed-without-notice');
 assert.equal(f.state.deletes.filter(id=>id==='user_Recovery').length,1);assert.equal(f.state.messages.length,3);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM private_groups WHERE id=?').bind('organizer-group').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM private_group_messages WHERE id=?').bind('organizer-message').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM private_groups WHERE id=?').bind('attendee-group').first()).n,0);
 const metadata=[...(await db.prepare('SELECT * FROM event_cleanup_confirmations').all()).results,...(await db.prepare('SELECT * FROM event_cleanup_runs').all()).results];
 assert.doesNotMatch(JSON.stringify(metadata),/@|12025550123|Preserve organizer notes/);
 console.log(JSON.stringify({passed:true,isolatedLocalD1:true,fullProductionAdapters:true,protectedOwnerAndHistoryPreserved:true,phoneTargetBlocked:true,emptyOtherGroupPruned:true,midTransactionRollback:true,restartNoticeLossReported:true,explicitRecoveryWithoutRepeatedIdentityDelete:true,verifiedRemovalConfirmations:3,duplicateAttempts:0,storedRecipientValues:0,externalRequests:0,productionDataUsed:false}));
}finally{if(mf)await mf.dispose();for(const cleanup of teardown)cleanup();await rm(dir,{recursive:true,force:true});}
