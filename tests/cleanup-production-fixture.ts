// Test-only adapter. All accounts, contacts and data are synthetic; no network.
import {DatabaseSync} from 'node:sqlite';
import type {SQLInputValue} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import type {TestContext} from 'node:test';
import type {AuthConfig} from '../lib/clerk-auth.ts';
import {createCleanupProductionAdapter} from '../lib/event-cleanup-production.ts';
import type {CleanupClerkPort} from '../lib/event-cleanup-production.ts';
import type {CleanupDeliveryReadiness} from '../lib/event-cleanup-confirmations.ts';
import {THUNDERPLAINS_CLEANUP} from '../lib/event-cleanup-review.ts';

export const fixtureIssuer='https://auth.example.com';
export const fixtureOwner=(id:string)=>`clerk:${fixtureIssuer}:user_${id}`;
type Statement={sql:string;values:SQLInputValue[];bind:(...values:SQLInputValue[])=>Statement;first:<T>()=>Promise<T|null>;all:<T>()=>Promise<{results:T[]}>;run:()=>Promise<unknown>};
export async function cleanupFixture(t:TestContext){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const name of(await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>/^000[0-5]_.*\.sql$/.test(name)).sort())sqlite.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 for(const name of['manual-account-deletion-prepared.sql','profile-photos-local.sql','attendee-social-prepared.sql','messaging-local-prepared.sql','talk-discussions-prepared.sql','devyo-ai-prepared.sql','event-cleanup-confirmations-prepared.sql'])sqlite.exec(await readFile(new URL('../deploy/sql/'+name,import.meta.url),'utf8'));
 const bound:SQLInputValue[]=[],make=(sql:string,values:SQLInputValue[]=[]):Statement=>({sql,values,bind(...next){bound.push(...next);return make(sql,next);},async first<T>(){const row=sqlite.prepare(sql).get(...values);return row?{...row} as T:null;},async all<T>(){return{results:sqlite.prepare(sql).all(...values).map(row=>({...row})) as T[]};},async run(){const result=sqlite.prepare(sql).run(...values);return{results:[],meta:{changes:Number(result.changes)}};}});
 const db={prepare:make,async batch(statements:Statement[]){sqlite.exec('BEGIN');try{const results=statements.map(stmt=>{if(/^\s*(?:SELECT|PRAGMA)\b/i.test(stmt.sql))return{results:sqlite.prepare(stmt.sql).all(...stmt.values).map(row=>({...row})),meta:{changes:0}};return{results:[],meta:{changes:Number(sqlite.prepare(stmt.sql).run(...stmt.values).changes)}};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 const config:AuthConfig={issuer:fixtureIssuer,instanceId:'ins_Fixture',origin:'https://thunderplains.example.com',origins:['https://thunderplains.example.com'],allowedUsers:new Set(),accessPolicy:'registered',publishableKey:'fixture-public-key'};
 const identity=(id:string,phoneOnly=false)=>({id:'user_'+id,primaryEmailAddressId:'email',emailAddresses:phoneOnly?[]:[{id:'email',emailAddress:id.toLowerCase()+'@example.com',verification:{status:'verified'}}],phoneNumbers:phoneOnly?[{id:'phone',phoneNumber:'+12025550123',verification:{status:'verified'}}]:[]});
 const users=new Map(['Organizer','Attendee','Peer','Phone','IdentityOnly'].map(id=>['user_'+id,identity(id,id==='Phone')]));
 const state={now:THUNDERPLAINS_CLEANUP.deadlineAt+1000,deletes:[] as string[],messages:[] as unknown[],listCalls:0};
 const port:CleanupClerkPort={async instance(){return{id:'ins_Fixture',environmentType:'production'};},async domains(){return[{frontendApiUrl:fixtureIssuer,isSatellite:false}];},async list(offset,limit){state.listCalls++;return{data:[...users.values()].slice(offset,offset+limit),totalCount:users.size};},async get(id){const user=users.get(id);if(!user)throw Object.assign(Error('Synthetic user not found'),{status:404});return user;},async remove(id){state.deletes.push(id);users.delete(id);return{id,deleted:true};}};
 const delivery:CleanupDeliveryReadiness={sender:'privacy@devyo.app',domainVerified:true,quotaVerified:true,previewsDisabled:true,providerRecipientLogRetentionApproved:true,binding:{async send(message){state.messages.push(message);return{messageId:'fixture-message-'+state.messages.length};}}};
 for(const id of['Organizer','Attendee','Peer','Phone']){
  const owner=fixtureOwner(id),planner={conferences:[{id:'thunderplains-2026'},{id:'innotech-oklahoma-2026'}],sessions:[{id:'other',conferenceId:'innotech-oklahoma-2026'}],savedSessionIds:id==='Attendee'?['other']:[],sessionNotes:id==='Organizer'?{other:'Preserve organizer notes'}:{},connections:[]};
  sqlite.prepare('INSERT INTO planner_states(owner_id,state_json,revision,updated_at) VALUES(?,?,0,?)').run(owner,JSON.stringify(planner),'fixture');
  sqlite.prepare('INSERT INTO community_members(id,owner_id) VALUES(?,?)').run('member-'+id,owner);
  sqlite.prepare('INSERT INTO profiles(owner_id,display_name,created_at,updated_at) VALUES(?,?,?,?)').run(owner,id,'fixture','fixture');
 }
 sqlite.prepare('INSERT INTO private_groups(id,owner_id,name,created_at) VALUES(?,?,?,0)').run('organizer-group',fixtureOwner('Organizer'),'Organizer private group');
 sqlite.prepare('INSERT INTO private_groups(id,owner_id,name,created_at) VALUES(?,?,?,0)').run('attendee-group',fixtureOwner('Attendee'),'Attendee private group');
 for(const id of['Organizer','Attendee','Peer'])sqlite.prepare('INSERT INTO private_group_members(group_id,owner_id,joined_at) VALUES(?,?,0)').run('organizer-group',fixtureOwner(id));
 for(const id of['Attendee','Peer'])sqlite.prepare('INSERT INTO private_group_members(group_id,owner_id,joined_at) VALUES(?,?,0)').run('attendee-group',fixtureOwner(id));
 sqlite.prepare('INSERT INTO private_group_messages(id,group_id,owner_id,display_name,body,created_at) VALUES(?,?,?,?,?,0)').run('organizer-message','organizer-group',fixtureOwner('Organizer'),'Organizer','Preserve organizer conversation');
 const adapter=(override:{db?:D1Database;port?:CleanupClerkPort;delivery?:CleanupDeliveryReadiness}={})=>createCleanupProductionAdapter({db:override.db??db,config,protectedUserId:'user_Organizer',port:override.port??port,delivery:override.delivery??delivery,clock:()=>state.now});
 const approve=async(instance=adapter(),allowCleanupWithoutNotice=false)=>{const preview=await instance.preview(allowCleanupWithoutNotice);return{...await instance.approve({scopeHash:preview.review.scopeHash,dataScopeHash:preview.dataScopeHash,allowCleanupWithoutNotice}),preview};};
 return{sqlite,db,bound,config,users,state,port,delivery,adapter,approve,identity};
}
