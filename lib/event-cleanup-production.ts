/** Production adapters for the explicitly enabled, organizer-only manual endpoint.
 * No scheduler imports this module. No recipient value is persisted or logged.
 */
import {createClerkClient} from '@clerk/backend';
import type {AuthConfig} from './clerk-auth.ts';
import {cleanupAccountData,deletionJob,deletionClerkUserId} from './account-deletion.ts';
import {prepareCleanupReview,verifiedCleanupContact} from './event-cleanup-review.ts';
import {runManualCleanupTarget,CLEANUP_CONTACT_MAX_AGE} from './event-cleanup-confirmations.ts';
import type {ManualCleanupApproval,CleanupDeliveryReadiness,FreshCleanupScope} from './event-cleanup-confirmations.ts';

type Identity=Parameters<typeof verifiedCleanupContact>[0]&{id:string};
export type CleanupClerkPort={
 instance:()=>Promise<{id:string;environmentType:string}>;
 domains:()=>Promise<{frontendApiUrl:string;isSatellite:boolean}[]>;
 list:(offset:number,limit:number)=>Promise<{data:Identity[];totalCount:number}>;
 get:(id:string)=>Promise<Identity>;remove:(id:string)=>Promise<unknown>;
};
export function nativeCleanupClerk(config:AuthConfig):CleanupClerkPort{
 const client=createClerkClient({publishableKey:config.publishableKey,secretKey:config.secretKey});
 return{instance:()=>client.instance.get(),async domains(){const result=await client.domains.list();if(result.data.length!==result.totalCount)throw Error('Incomplete identity domain inventory.');return result.data;},list:(offset,limit)=>client.users.getUserList({offset,limit,orderBy:'+created_at'}),get:id=>client.users.getUser(id),remove:id=>client.users.deleteUser(id)};
}
export class CleanupBlocked extends Error{readonly code:string;constructor(code:string){super(code);this.code=code;}}
function fail(code:string):never{throw new CleanupBlocked(code);}
const sha=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');
const canonicalUser=(id:string)=>/^user_[A-Za-z0-9]+$/.test(id);
const ownerFor=(issuer:string,id:string)=>`clerk:${issuer}:${id}`;
const MAX_MANUAL_RETRY_AT=Number.MAX_SAFE_INTEGER; // Excluded by existing automatic self-service recovery.
const OWNER_COLUMNS:Record<string,string[]>={
 planner_states:['owner_id'],profiles:['owner_id'],schedule_shares:['owner_id'],community_members:['owner_id'],member_plans:['owner_id'],member_avatars:['owner_id'],private_groups:['owner_id'],private_group_members:['owner_id'],private_group_messages:['owner_id'],chat_messages:['owner_id'],chat_memberships:['owner_id'],chat_flags:['owner_id'],account_deletion_previews:['owner_id'],member_profile_photos:['owner_id'],profile_photo_daily:['owner_id'],profile_photo_work:['owner_id'],message_read_state:['owner_id'],message_reactions:['owner_id'],push_subscriptions:['owner_id'],attendee_social_settings:['owner_id'],attendee_communities:['owner_id'],attendee_blocks:['owner_id','blocked_owner_id'],attendee_connection_events:['actor_owner_id','recipient_owner_id'],attendee_connection_limits:['owner_id'],devyo_ai_daily:['owner_id'],devyo_ai_reservations:['owner_id'],devyo_ai_session_daily:['owner_id'],devyo_ai_cache:['owner_id'],talk_discussion_moderation:['moderator_owner_id'],
};
const RECEIPT_TABLES=new Set(['account_deletions','event_cleanup_confirmations','event_cleanup_runs']);
type Group={id:string;owner:string;messages:number;invites:number;members:string[]};
type OwnerFacts={ownerId:string;rows:Record<string,number>;conferences:string[];privateCounts:Record<string,number>;groups:Group[];channel:'email'|'sms'|'none'|'missing'};
export type CleanupManifest={issuer:string;instanceId:string;protectedOwner:string;schemaHash:string;facts:OwnerFacts[];allowCleanupWithoutNotice:boolean;groupPolicy:'remove-empty-unprotected-groups';contactPolicy:'invocation-memory-only';providerPolicy:'email-analytics-31d';};
type Run={id:string;actor_owner_id:string;scope_hash:string;data_scope_hash:string;manifest_json:string;approved_at:number;expires_at:number};
type Snapshot={schemaHash:string;facts:Map<string,OwnerFacts>;jobs:Map<string,{phase:string;next_attempt_at:number}>};

async function verifyInstance(port:CleanupClerkPort,config:AuthConfig){
 if(!config.instanceId||!/^ins_[A-Za-z0-9]+$/.test(config.instanceId)||new URL(config.issuer).origin!==config.issuer||!config.issuer.startsWith('https://'))fail('identity-configuration-invalid');
 const instance=await port.instance();if(instance.id!==config.instanceId||instance.environmentType!=='production')fail('identity-instance-mismatch');
 const domains=await port.domains();if(!domains.some(domain=>!domain.isSatellite&&domain.frontendApiUrl===config.issuer))fail('identity-issuer-mismatch');
}
async function identityInventory(port:CleanupClerkPort){
 async function scan(){
  const records=new Map<string,OwnerFacts['channel']>();let total:number|null=null;
  for(let offset=0;offset<5000;offset+=100){
   const page=await port.list(offset,100);
   if(!Number.isInteger(page.totalCount)||page.totalCount<1||page.totalCount>5000||(total!==null&&total!==page.totalCount))fail('identity-inventory-changing');
   total=page.totalCount;
   for(const user of page.data){if(!canonicalUser(user.id)||records.has(user.id))fail('identity-inventory-invalid');const contact=verifiedCleanupContact(user);records.set(user.id,contact?.channel==='email'?'email':user.phoneNumbers.length?'sms':'none');}
   if(records.size===total)return records;
   if(!page.data.length||records.size>total)fail('identity-inventory-incomplete');
  }
  return fail('identity-inventory-too-large');
 }
 const first=await scan(),second=await scan();
 if(JSON.stringify([...first].sort())!==JSON.stringify([...second].sort()))fail('identity-inventory-changing');
 return second;
}
function emptyFacts(ownerId:string):OwnerFacts{return{ownerId,rows:{},conferences:[],privateCounts:{},groups:[],channel:'missing'};}
async function snapshot(db:D1Database):Promise<Snapshot>{
 const schema=(await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE type IN('table','trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' ORDER BY name").all<{name:string;type:string;sql:string}>()).results;
 const tables=new Set(schema.filter(row=>row.type==='table').map(row=>row.name));
 for(const required of['planner_states','profiles','schedule_shares','member_plans','member_avatars','community_members','chat_messages','chat_flags','chat_memberships','private_groups','private_group_members','private_group_messages','private_group_invites','account_deletions','event_cleanup_confirmations','event_cleanup_runs'])if(!tables.has(required))fail('cleanup-schema-not-ready');
 for(const table of tables){
  if(!/^[a-zA-Z0-9_]+$/.test(table))fail('unreviewed-schema-name');
  const columns=(await db.prepare(`PRAGMA table_info("${table}")`).all<{name:string}>()).results.map(row=>row.name).filter(name=>name.endsWith('owner_id'));
  if(!RECEIPT_TABLES.has(table)&&columns.some(column=>!OWNER_COLUMNS[table]?.includes(column)))fail('unreviewed-owner-storage');
 }
 if(tables.has('push_deliveries'))for(const name of['messaging_subscription_delete','messaging_chat_delete','messaging_group_delete'])if(!schema.some(row=>row.name===name&&row.type==='trigger'))fail('messaging-cleanup-trigger-missing');
 const facts=new Map<string,OwnerFacts>(),ensure=(owner:string)=>{if(!facts.has(owner))facts.set(owner,emptyFacts(owner));return facts.get(owner)!;};
 for(const [table,columns]of Object.entries(OWNER_COLUMNS))if(tables.has(table))for(const column of columns){
  const rows=(await db.prepare(`SELECT "${column}" AS owner,COUNT(*) AS n FROM "${table}" GROUP BY "${column}"`).all<{owner:string;n:number}>()).results;
  for(const row of rows)ensure(row.owner).rows[`${table}.${column}`]=row.n;
 }
 const conferences=(await db.prepare("SELECT p.owner_id AS owner,json_extract(c.value,'$.id') AS conference FROM planner_states p,json_each(p.state_json,'$.conferences') c").all<{owner:string;conference:string}>()).results;
 for(const row of conferences)ensure(row.owner).conferences.push(row.conference);
 const saved=(await db.prepare("SELECT p.owner_id AS owner,COALESCE(json_extract(s.value,'$.conferenceId'),'unmapped') AS conference,COUNT(*) AS n FROM planner_states p,json_each(p.state_json,'$.savedSessionIds') v LEFT JOIN json_each(p.state_json,'$.sessions') s ON json_extract(s.value,'$.id')=v.value GROUP BY p.owner_id,conference").all<{owner:string;conference:string;n:number}>()).results;
 for(const row of saved){const key=`saved:${/^[-a-z0-9]{1,100}$/.test(row.conference)?row.conference:'unmapped'}`;const counts=ensure(row.owner).privateCounts;counts[key]=(counts[key]??0)+row.n;}
 const notes=(await db.prepare("SELECT p.owner_id AS owner,COUNT(*) AS n FROM planner_states p,json_each(p.state_json,'$.sessionNotes') n WHERE typeof(n.value)='text' AND trim(n.value)!='' GROUP BY p.owner_id").all<{owner:string;n:number}>()).results;
 for(const row of notes)ensure(row.owner).privateCounts.notes=row.n;
 const connections=(await db.prepare("SELECT p.owner_id AS owner,COALESCE(json_extract(c.value,'$.conferenceId'),'unmapped') AS conference,COUNT(*) AS n FROM planner_states p,json_each(p.state_json,'$.connections') c GROUP BY p.owner_id,conference").all<{owner:string;conference:string;n:number}>()).results;
 for(const row of connections){const key=`connections:${/^[-a-z0-9]{1,100}$/.test(row.conference)?row.conference:'unmapped'}`;const counts=ensure(row.owner).privateCounts;counts[key]=(counts[key]??0)+row.n;}
 const groups=(await db.prepare('SELECT g.id,g.owner_id AS owner,(SELECT COUNT(*) FROM private_group_messages WHERE group_id=g.id) AS messages,(SELECT COUNT(*) FROM private_group_invites WHERE group_id=g.id) AS invites FROM private_groups g ORDER BY g.id').all<{id:string;owner:string;messages:number;invites:number}>()).results;
 const memberships=(await db.prepare('SELECT group_id,owner_id FROM private_group_members ORDER BY owner_id').all<{group_id:string;owner_id:string}>()).results;
 for(const group of groups){if(!/^[A-Za-z0-9-]{1,64}$/.test(group.id))fail('group-identity-invalid');ensure(group.owner).groups.push({...group,members:memberships.filter(row=>row.group_id===group.id).map(row=>row.owner_id)});}
 for(const fact of facts.values()){fact.conferences=[...new Set(fact.conferences)].sort();fact.rows=Object.fromEntries(Object.entries(fact.rows).sort());fact.privateCounts=Object.fromEntries(Object.entries(fact.privateCounts).sort());}
 const jobs=new Map((await db.prepare('SELECT owner_id,phase,next_attempt_at FROM account_deletions').all<{owner_id:string;phase:string;next_attempt_at:number}>()).results.map(row=>[row.owner_id,row]));
 return{schemaHash:await sha(schema),facts,jobs};
}
async function hashes(manifest:CleanupManifest){
 const review=await prepareCleanupReview({issuer:manifest.issuer,instanceId:manifest.instanceId,protectedOwners:[manifest.protectedOwner],scope:'whole-devyo-accounts',owners:manifest.facts.map(fact=>({ownerId:fact.ownerId,conferenceIds:fact.conferences}))});
 return{review,dataScopeHash:await sha(manifest)};
}
function validateOwner(owner:string,config:AuthConfig,protectedOwner:string){if(owner===protectedOwner)fail('protected-account');return deletionClerkUserId(owner,config.issuer);}
function validateEmptyGroups(manifest:CleanupManifest,fact:OwnerFacts){
 const targets=new Set(manifest.facts.filter(row=>row.ownerId!==manifest.protectedOwner).map(row=>row.ownerId));
 for(const group of fact.groups)if(group.messages!==0||group.members.some(owner=>!targets.has(owner)))fail('group-preservation-review-required');
}
export function createCleanupProductionAdapter(input:{db:D1Database;config:AuthConfig;protectedUserId:string;port:CleanupClerkPort;delivery:CleanupDeliveryReadiness;clock?:()=>number}){
 const {db,config,port}=input,clock=input.clock??Date.now;
 if(!canonicalUser(input.protectedUserId))fail('protected-identity-invalid');
 const protectedOwner=ownerFor(config.issuer,input.protectedUserId);
 async function preview(allowCleanupWithoutNotice=false){
  await verifyInstance(port,config);const identities=await identityInventory(port),data=await snapshot(db);
  if(!identities.has(input.protectedUserId))fail('protected-identity-missing');
  for(const id of identities.keys()){const owner=ownerFor(config.issuer,id);if(!data.facts.has(owner))data.facts.set(owner,emptyFacts(owner));data.facts.get(owner)!.channel=identities.get(id)!;}
  for(const owner of data.facts.keys())deletionClerkUserId(owner,config.issuer);
  const manifest:CleanupManifest={issuer:config.issuer,instanceId:config.instanceId!,protectedOwner,schemaHash:data.schemaHash,facts:[...data.facts.values()].sort((a,b)=>a.ownerId.localeCompare(b.ownerId)),allowCleanupWithoutNotice,groupPolicy:'remove-empty-unprotected-groups',contactPolicy:'invocation-memory-only',providerPolicy:'email-analytics-31d'};
  const calculated=await hashes(manifest);
  const targets=manifest.facts.filter(fact=>fact.ownerId!==protectedOwner);
  return{manifest,...calculated,summary:{accounts:targets.length,email:targets.filter(fact=>fact.channel==='email').length,phoneOnlyBlocked:targets.filter(fact=>fact.channel==='sms').length,missingVerifiedContact:targets.filter(fact=>fact.channel==='none'||fact.channel==='missing').length,identityOnly:targets.filter(fact=>!Object.keys(fact.rows).length).length,d1Only:targets.filter(fact=>fact.channel==='missing').length,savedOtherConferenceChoices:targets.reduce((sum,fact)=>sum+Object.entries(fact.privateCounts).filter(([key])=>key.startsWith('saved:')&&key!=='saved:thunderplains-2026').reduce((n,[,value])=>n+value,0),0),groupBlockedOwners:targets.filter(fact=>{try{validateEmptyGroups(manifest,fact);return false;}catch{return true;}}).length}};
 }
 async function readRun(runId:string){
  if(!/^[a-f0-9-]{36}$/.test(runId))fail('run-id-invalid');
  const run=await db.prepare('SELECT * FROM event_cleanup_runs WHERE id=? AND actor_owner_id=?').bind(runId,protectedOwner).first<Run>();
  if(!run)fail('reviewed-run-not-found');return run;
 }
 async function fresh(run:Run):Promise<FreshCleanupScope>{
  await verifyInstance(port,config);const manifest=JSON.parse(run.manifest_json) as CleanupManifest;
  if(manifest.protectedOwner!==protectedOwner||manifest.issuer!==config.issuer||manifest.instanceId!==config.instanceId||manifest.contactPolicy!=='invocation-memory-only'||manifest.providerPolicy!=='email-analytics-31d')fail('reviewed-instance-changed');
  const actual=await hashes(manifest);if(actual.review.scopeHash!==run.scope_hash||actual.dataScopeHash!==run.data_scope_hash)fail('reviewed-manifest-corrupt');
  const identities=await identityInventory(port),data=await snapshot(db),expected=new Map(manifest.facts.map(fact=>[fact.ownerId,fact]));
  if(data.schemaHash!==manifest.schemaHash||!identities.has(input.protectedUserId))fail('reviewed-schema-or-exemption-changed');
  for(const id of identities.keys())if(!expected.has(ownerFor(config.issuer,id)))fail('new-identity-requires-review');
  const confirmations=new Map((await db.prepare('SELECT owner_id,scope_hash FROM event_cleanup_confirmations').all<{owner_id:string;scope_hash:string}>()).results.map(row=>[row.owner_id,row.scope_hash]));
  for(const owner of data.facts.keys())if(!expected.has(owner))fail('new-data-owner-requires-review');
  for(const fact of manifest.facts){
   const id=deletionClerkUserId(fact.ownerId,config.issuer);
   if(fact.ownerId===protectedOwner)continue;
   if(!identities.has(id)&&fact.channel!=='missing'){
    const job=data.jobs.get(fact.ownerId);if(!job||confirmations.get(fact.ownerId)!==run.scope_hash||(job.phase!=='complete'&&job.next_attempt_at!==MAX_MANUAL_RETRY_AT))fail('unexplained-identity-removal');
   }
   const current=data.facts.get(fact.ownerId);
   if(!current)continue;
   for(const [key,value]of Object.entries(current.rows))if(value>(fact.rows[key]??0))fail('data-scope-increased');
   for(const [key,value]of Object.entries(current.privateCounts))if(value>(fact.privateCounts[key]??0))fail('private-data-scope-increased');
   if(current.conferences.some(id=>!fact.conferences.includes(id)))fail('conference-scope-increased');
   for(const group of current.groups){const original=fact.groups.find(row=>row.id===group.id);if(!original||group.messages>original.messages||group.invites>original.invites||group.members.some(owner=>!original.members.includes(owner)))fail('group-scope-changed');}
  }
  // Recomputed immutable scope caps plus verified reductions from this run make
  // progress resumable without silently adding identities or increasing scope.
  return{...actual,checkedAt:clock(),identityIdsReconciled:true,productionInstanceVerified:true};
 }
 function approval(run:Run,manifest:CleanupManifest):ManualCleanupApproval{return{action:'permanently-remove-reviewed-devyo-accounts',scopeHash:run.scope_hash,dataScopeHash:run.data_scope_hash,approvedAt:run.approved_at,expiresAt:run.expires_at,contactRetentionMs:CLEANUP_CONTACT_MAX_AGE,successConfirmationsApproved:true,retainedBoundariesAcknowledged:true,recipientMemoryOnly:true,allowCleanupWithoutNotice:manifest.allowCleanupWithoutNotice};}
 async function approve(expected:{scopeHash:string;dataScopeHash:string;allowCleanupWithoutNotice:boolean}){
  const current=await preview(expected.allowCleanupWithoutNotice);
  if(current.review.scopeHash!==expected.scopeHash||current.dataScopeHash!==expected.dataScopeHash)fail('scope-changed-review-again');
  const now=clock(),id=crypto.randomUUID();
  const targets=current.review.targets.map(target=>target.ownerId);
  await db.batch([
   db.prepare('INSERT INTO event_cleanup_runs(id,actor_owner_id,scope_hash,data_scope_hash,manifest_json,approved_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,protectedOwner,current.review.scopeHash,current.dataScopeHash,JSON.stringify(current.manifest),now,now+15*60000),
   // A new explicit review may adopt an unattempted partial removal. Its original
   // receipt and time limit survive; started/accepted/uncertain attempts never reset.
   db.prepare("UPDATE event_cleanup_confirmations SET scope_hash=? WHERE owner_id<>? AND owner_id IN(SELECT value FROM json_each(?)) AND phase IN('prepared','expired','unavailable')").bind(current.review.scopeHash,protectedOwner,JSON.stringify(targets)),
  ]);
  return{runId:id,expiresAt:now+15*60000,summary:current.summary};
 }
 async function readIdentity(owner:string){
  const id=validateOwner(owner,config,protectedOwner);
  try{const user=await port.get(id);if(user.id!==id)fail('identity-user-mismatch');return user;}catch(error){if((error as {status?:number}).status===404)return null;throw error;}
 }
 async function remove(run:Run,manifest:CleanupManifest,owner:string){
  const id=validateOwner(owner,config,protectedOwner),fact=manifest.facts.find(row=>row.ownerId===owner);if(!fact)fail('target-outside-review');
  validateEmptyGroups(manifest,fact);await fresh(run);
  const now=clock();if(run.expires_at<=now)fail('action-time-approval-expired');
  const existing=await deletionJob(db,owner);
  if(existing&&existing.phase!=='complete'&&existing.next_attempt_at!==MAX_MANUAL_RETRY_AT)fail('different-deletion-already-in-progress');
  if(!existing){
   await db.batch([
    db.prepare("INSERT INTO account_deletions(owner_id,phase,close_owned_groups,owned_group_count,requested_at,next_attempt_at) SELECT ?,'requested',1,?,?,? WHERE ?<>? AND EXISTS(SELECT 1 FROM event_cleanup_runs WHERE id=? AND actor_owner_id=? AND scope_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM event_cleanup_confirmations WHERE owner_id=? AND scope_hash=? AND phase='prepared') AND (SELECT COUNT(*) FROM private_groups WHERE owner_id=?)=? AND NOT EXISTS(SELECT 1 FROM private_groups WHERE owner_id=? AND id NOT IN(SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM private_group_messages m JOIN private_groups g ON g.id=m.group_id WHERE g.owner_id=?) AND NOT EXISTS(SELECT 1 FROM private_group_members m JOIN private_groups g ON g.id=m.group_id WHERE g.owner_id=? AND m.owner_id NOT IN(SELECT value FROM json_each(?))) ON CONFLICT(owner_id) DO NOTHING").bind(owner,fact.groups.length,now,MAX_MANUAL_RETRY_AT,owner,protectedOwner,run.id,protectedOwner,run.scope_hash,now,owner,run.scope_hash,owner,fact.groups.length,owner,JSON.stringify(fact.groups.map(group=>group.id)),owner,owner,JSON.stringify(manifest.facts.filter(row=>row.ownerId!==protectedOwner).map(row=>row.ownerId))),
    ...['schedule_shares','member_plans','member_avatars','community_members'].map(table=>db.prepare(`DELETE FROM ${table} WHERE owner_id=? AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=? AND next_attempt_at=?)`).bind(owner,owner,MAX_MANUAL_RETRY_AT)),
    db.prepare('DELETE FROM private_group_invites WHERE group_id IN(SELECT id FROM private_groups WHERE owner_id=?) AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=? AND next_attempt_at=?)').bind(owner,owner,MAX_MANUAL_RETRY_AT),
   ]);
  }
  const job=await deletionJob(db,owner);if(!job)fail('manual-intent-not-confirmed');
  if(job.phase!=='complete'){
   const lease=await db.prepare("UPDATE account_deletions SET lease_until=?,attempts=attempts+1 WHERE owner_id=? AND owner_id<>? AND phase!='complete' AND next_attempt_at=? AND lease_until<=? RETURNING *").bind(now+60000,owner,protectedOwner,MAX_MANUAL_RETRY_AT,now).first<import('./account-deletion.ts').DeletionJob>();
   if(!lease)fail('manual-operation-busy');
   if(lease.phase==='requested'){
    await verifyInstance(port,config);
    // Reconcile a prior interrupted attempt before issuing another provider call.
    if(await readIdentity(owner))try{await port.remove(id);}catch{/* A timeout is not proof of failure. Reconcile below; never blindly repeat. */}
    if(await readIdentity(owner))fail('identity-removal-unconfirmed');
    const updated=await db.prepare("UPDATE account_deletions SET phase='identity_deleted' WHERE owner_id=? AND phase='requested' AND next_attempt_at=? AND lease_until=? AND attempts=?").bind(owner,MAX_MANUAL_RETRY_AT,lease.lease_until,lease.attempts).run();
    if(updated.meta.changes!==1)fail('manual-operation-lease-changed');
   }else if(await readIdentity(owner))fail('identity-removal-unconfirmed');
   await cleanupAccountData(db,owner,clock(),lease.lease_until);
  }
  const targets=manifest.facts.filter(row=>row.ownerId!==protectedOwner).map(row=>row.ownerId);
  for(const group of fact.groups){
   const safe="EXISTS(SELECT 1 FROM private_groups g WHERE g.id=? AND g.owner_id=? AND g.owner_id<>? AND NOT EXISTS(SELECT 1 FROM private_group_messages WHERE group_id=g.id) AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE group_id=g.id AND owner_id NOT IN(SELECT value FROM json_each(?)))) AND EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=? AND phase='complete')";
   const args=[group.id,owner,protectedOwner,JSON.stringify(targets),owner];
   await db.batch([
    db.prepare(`DELETE FROM private_group_members WHERE group_id=? AND ${safe}`).bind(group.id,...args),
    db.prepare(`DELETE FROM private_group_invites WHERE group_id=? AND ${safe}`).bind(group.id,...args),
    db.prepare(`DELETE FROM private_groups WHERE id=? AND ${safe} AND NOT EXISTS(SELECT 1 FROM private_group_members WHERE group_id=?) AND NOT EXISTS(SELECT 1 FROM private_group_invites WHERE group_id=?)`).bind(group.id,...args,group.id,group.id),
   ]);
  }
 }
 async function verifyRemoval(owner:string){
  validateOwner(owner,config,protectedOwner);await verifyInstance(port,config);
  const absent=(await readIdentity(owner))===null,job=await deletionJob(db,owner),data=await snapshot(db),fact=data.facts.get(owner);
  return{phase:job?.phase??'active',identityDeletionConfirmed:absent,remainingActiveOwnerRows:fact?Object.values(fact.rows).reduce((sum,n)=>sum+n,0):0,completedAt:job?.completed_at??null};
 }
 async function execute(runId:string,owner:string){
  const run=await readRun(runId),manifest=JSON.parse(run.manifest_json) as CleanupManifest;
  return runManualCleanupTarget({db,delivery:input.delivery,clock,readFreshScope:()=>fresh(run),readVerifiedIdentity:readIdentity,removeApprovedAccount:owner=>remove(run,manifest,owner),verifyRemoval},owner,approval(run,manifest));
 }
 async function renew(runId:string,expected:{scopeHash:string;dataScopeHash:string;allowCleanupWithoutNotice:boolean}){
  const run=await readRun(runId);await fresh(run);if(run.scope_hash!==expected.scopeHash||run.data_scope_hash!==expected.dataScopeHash||(JSON.parse(run.manifest_json) as CleanupManifest).allowCleanupWithoutNotice!==expected.allowCleanupWithoutNotice)fail('scope-changed-review-again');
  const now=clock();await db.prepare('UPDATE event_cleanup_runs SET approved_at=?,expires_at=? WHERE id=? AND actor_owner_id=?').bind(now,now+15*60000,runId,protectedOwner).run();return{runId,expiresAt:now+15*60000};
 }
 return{preview,approve,execute,renew};
}
