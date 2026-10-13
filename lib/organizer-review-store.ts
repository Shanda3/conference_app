import {emptyState,validateState,type PlannerState} from './planner.ts';
import {type ProgramSeed,type PublishedSession} from './program-model.ts';
import {ORGANIZER_CONFERENCE,ORGANIZER_REVIEW_LIMITS,OrganizerReviewError,exactObject,initialApprovedProgram,checkedOrganizerProgram,organizerChanges,readPrivateIntent,legacyPrivateIntent,projectApprovedPlanner,changedPrivateIntent,type ProgramRevisions} from './organizer-review-model.ts';
import {ORGANIZER_AFTER_PARTY} from './organizer-session-extras.ts';
import {TALK_GUIDES} from './talk-prep.ts';

type Head={conference_id:string;revision:number;sessions_json:string;history_json:string;approved_at:string;last_operation:string|null};
type Candidate={id:string;conference_id:string;base_revision:number;preview_hash:string;sessions_json:string;checked_at:string;expires_at:string;applied_at:string|null};
type Check={status:'ok'|'failed';checked_at:string;message:string;candidate_id:string|null};
export async function organizerReviewHash(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validatedHead(row:Head|undefined,seed:ProgramSeed){if(!row||!Number.isSafeInteger(row.revision)||row.revision<1)throw new OrganizerReviewError('The approved shared program is unavailable. Your private planner has not changed.',503);return{...row,sessions:checkedOrganizerProgram(JSON.parse(row.sessions_json),JSON.parse(row.sessions_json),seed)};}
/** Trusted initialization only; reads the existing last-success snapshot, never attendee data and never grants a role. */
export async function initializeOrganizerReview(db:D1Database,seed:ProgramSeed,now=new Date()){
 if(await db.prepare('SELECT conference_id FROM organizer_review_heads WHERE conference_id=?').bind(ORGANIZER_CONFERENCE).first())return;
 const base=initialApprovedProgram(seed),source=await db.prepare('SELECT last_success_at,sessions_json FROM public_program_sources WHERE conference_id=?').bind(ORGANIZER_CONFERENCE).first<{last_success_at:string|null;sessions_json:string|null}>();
 const sessions=source?.last_success_at&&source.sessions_json?checkedOrganizerProgram(JSON.parse(source.sessions_json),base,seed):base;
 await db.prepare('INSERT INTO organizer_review_heads(conference_id,revision,sessions_json,history_json,approved_at) VALUES(?,1,?,?,?) ON CONFLICT(conference_id) DO NOTHING').bind(ORGANIZER_CONFERENCE,JSON.stringify(sessions),'[]',source?.last_success_at??now.toISOString()).run();
}
export async function readOrganizerApproved(db:D1Database,seed:ProgramSeed){return validatedHead(await db.prepare('SELECT * FROM organizer_review_heads WHERE conference_id=?').bind(ORGANIZER_CONFERENCE).first<Head>()??undefined,seed);}
export async function failedOrganizerCheck(db:D1Database,checkedAt:string,message='Public source verification failed. The approved shared program is kept.'){
 await db.prepare("INSERT INTO organizer_review_checks(conference_id,status,checked_at,message) VALUES(?,'failed',?,?) ON CONFLICT(conference_id) DO UPDATE SET status='failed',checked_at=excluded.checked_at,message=excluded.message WHERE excluded.checked_at>=organizer_review_checks.checked_at").bind(ORGANIZER_CONFERENCE,checkedAt,message.slice(0,500)).run();
}
export async function recordOrganizerAbstractChecks(db:D1Database,sessions:PublishedSession[],checkedAt:string){
 const relevant=sessions.filter(s=>s.conferenceId===ORGANIZER_CONFERENCE&&TALK_GUIDES.some(guide=>guide.id===s.id&&guide.conferenceId===s.conferenceId&&guide.sourceId===s.sourceId));if(!relevant.length)return;
 await db.batch(relevant.map(s=>{
  const check=s.prepAbstract,ok=check?.status==='ok'&&/^[a-f0-9]{64}$/.test(check.hash)&&check.checkedAt===checkedAt&&s.status==='scheduled';
  return db.prepare("INSERT INTO organizer_review_abstract_checks(session_id,source_title,source_status,status,hash,checked_at) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET source_title=excluded.source_title,source_status=excluded.source_status,status=excluded.status,hash=excluded.hash,checked_at=excluded.checked_at WHERE excluded.checked_at>=organizer_review_abstract_checks.checked_at").bind(s.id,s.title,s.status,ok?'ok':'failed',ok?check!.hash:'',checkedAt);
 }));
}
export async function overlayOrganizerAbstractChecks(db:D1Database,sessions:PublishedSession[]){
 const checks=(await db.prepare('SELECT * FROM organizer_review_abstract_checks').all<{session_id:string;source_title:string;source_status:string;status:'ok'|'failed';hash:string;checked_at:string}>()).results;
 return sessions.map(s=>{if(s.conferenceId!==ORGANIZER_CONFERENCE||s.id===ORGANIZER_AFTER_PARTY.id)return s;const check=checks.find(c=>c.session_id===s.id),ok=check?.status==='ok'&&check.source_status==='scheduled'&&check.source_title===s.title&&s.status==='scheduled';return{...s,prepAbstract:{status:ok?'ok' as const:'failed' as const,hash:ok?check!.hash:'',checkedAt:check?.checked_at??''}};});
}
/** Only the fixed, validated source scheduler calls this function. There is no HTTP candidate or role creation route. */
export async function stageOrganizerCandidate(db:D1Database,seed:ProgramSeed,value:unknown,checkedAt=new Date().toISOString()){
 const head=await readOrganizerApproved(db,seed);
 try{
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(checkedAt)||!Number.isFinite(Date.parse(checkedAt)))throw new OrganizerReviewError('The source check time is invalid.');
  const sessions=checkedOrganizerProgram(value,head.sessions,seed),serialized=JSON.stringify(sessions),bytes=new TextEncoder().encode(serialized).byteLength;
  if(bytes>ORGANIZER_REVIEW_LIMITS.candidateBytes)throw new OrganizerReviewError('The checked source exceeds the bounded review size.');
  const id=crypto.randomUUID(),hash=await organizerReviewHash({conferenceId:ORGANIZER_CONFERENCE,revision:head.revision,sessions}),expires=new Date(Date.parse(checkedAt)+ORGANIZER_REVIEW_LIMITS.expiryMs).toISOString();
  const results=await db.batch([
   db.prepare('INSERT INTO organizer_review_candidates(id,conference_id,base_revision,preview_hash,sessions_json,checked_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM organizer_review_heads WHERE conference_id=? AND revision=?) AND (SELECT COUNT(*) FROM organizer_review_candidates)<? AND COALESCE((SELECT SUM(length(CAST(sessions_json AS BLOB))) FROM organizer_review_candidates),0)+?<=?').bind(id,ORGANIZER_CONFERENCE,head.revision,hash,serialized,checkedAt,expires,ORGANIZER_CONFERENCE,head.revision,ORGANIZER_REVIEW_LIMITS.retainedCandidates,bytes,ORGANIZER_REVIEW_LIMITS.retainedBytes),
   db.prepare("INSERT INTO organizer_review_checks(conference_id,status,checked_at,message,candidate_id) SELECT ?,'ok',?,'Complete public source checked; changes are held for organizer approval.',? WHERE EXISTS(SELECT 1 FROM organizer_review_candidates WHERE id=?) ON CONFLICT(conference_id) DO UPDATE SET status='ok',checked_at=excluded.checked_at,message=excluded.message,candidate_id=excluded.candidate_id WHERE excluded.checked_at>=organizer_review_checks.checked_at").bind(ORGANIZER_CONFERENCE,checkedAt,id,id)
  ]);
  if(results[0].meta.changes!==1)throw new OrganizerReviewError('The program changed or retained review limits were reached.',409);
  return{id,previewHash:hash,baseRevision:head.revision,expiresAt:expires};
 }catch(error){await failedOrganizerCheck(db,checkedAt,error instanceof OrganizerReviewError?error.message:undefined);throw error;}
}
export class OrganizerReviewStore{
 readonly db:D1Database;readonly owner:string;readonly seed:ProgramSeed;
 constructor(db:D1Database,owner:string,seed:ProgramSeed){this.db=db;this.owner=owner;this.seed=seed;}
 async permission(apply=false){const grant=await this.db.prepare('SELECT can_apply FROM organizer_review_grants WHERE conference_id=? AND owner_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)').bind(ORGANIZER_CONFERENCE,this.owner,this.owner).first<{can_apply:number}>();if(!grant)throw new OrganizerReviewError('Organizer review is not available for this account.',404);if(apply&&grant.can_apply!==1)throw new OrganizerReviewError('This account can review but cannot apply program changes.',403);return grant;}
 async review(){const grant=await this.permission(),head=await readOrganizerApproved(this.db,this.seed),check=await this.db.prepare('SELECT * FROM organizer_review_checks WHERE conference_id=?').bind(ORGANIZER_CONFERENCE).first<Check>();const candidate=check?.candidate_id?await this.db.prepare('SELECT * FROM organizer_review_candidates WHERE id=? AND conference_id=?').bind(check.candidate_id,ORGANIZER_CONFERENCE).first<Candidate>():null;const sessions=candidate?JSON.parse(candidate.sessions_json) as PublishedSession[]:null;const changes=sessions?organizerChanges(head.sessions,sessions):[];
  return{conferenceId:ORGANIZER_CONFERENCE,revision:head.revision,approvedAt:head.approved_at,canApply:grant.can_apply===1,check:check?{status:check.status,checkedAt:check.checked_at,message:check.message}:null,candidate:candidate?{id:candidate.id,baseRevision:candidate.base_revision,previewHash:candidate.preview_hash,checkedAt:candidate.checked_at,expiresAt:candidate.expires_at,appliedAt:candidate.applied_at,changes,applicable:check?.status==='ok'&&!candidate.applied_at&&candidate.base_revision===head.revision&&candidate.expires_at>new Date().toISOString()&&changes.length>0}:null};
 }
 async apply(value:unknown){await this.permission(true);const input=exactObject(value,['candidateId','revision','previewHash','reviewed']);if(typeof input.candidateId!=='string'||!/^[a-f0-9-]{36}$/.test(input.candidateId))throw new OrganizerReviewError('Choose the reviewed program candidate.');const head=await readOrganizerApproved(this.db,this.seed),candidate=await this.db.prepare('SELECT * FROM organizer_review_candidates WHERE id=? AND conference_id=?').bind(input.candidateId,ORGANIZER_CONFERENCE).first<Candidate>(),now=new Date().toISOString();
  if(!candidate||input.reviewed!==true||input.revision!==head.revision||candidate.base_revision!==head.revision||candidate.applied_at||candidate.expires_at<=now||input.previewHash!==candidate.preview_hash)throw new OrganizerReviewError('This review is stale, expired or already applied. Reload before approval.',409);
  const sessions=checkedOrganizerProgram(JSON.parse(candidate.sessions_json),head.sessions,this.seed);
  if(await organizerReviewHash({conferenceId:ORGANIZER_CONFERENCE,revision:head.revision,sessions})!==candidate.preview_hash)throw new OrganizerReviewError('The reviewed program could not be verified.',409);
  const changes=organizerChanges(head.sessions,sessions);if(!changes.length)throw new OrganizerReviewError('There are no new program changes to apply.',409);
  const historyJson=JSON.stringify([...JSON.parse(head.history_json),...head.sessions]);if(new TextEncoder().encode(historyJson).byteLength>ORGANIZER_REVIEW_LIMITS.historyBytes||head.revision>=ORGANIZER_REVIEW_LIMITS.revisions)throw new OrganizerReviewError('Program history is full. Review archival before continuing.',409);
  const operation=crypto.randomUUID(),fence='EXISTS(SELECT 1 FROM organizer_review_heads WHERE conference_id=? AND last_operation=?)';
  const results=await this.db.batch([
   this.db.prepare("UPDATE organizer_review_heads SET sessions_json=?,history_json=?,revision=revision+1,last_operation=?,approved_at=? WHERE conference_id=? AND revision=? AND EXISTS(SELECT 1 FROM organizer_review_grants WHERE conference_id=? AND owner_id=? AND can_apply=1) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) AND EXISTS(SELECT 1 FROM organizer_review_checks WHERE conference_id=? AND status='ok' AND candidate_id=?) AND EXISTS(SELECT 1 FROM organizer_review_candidates WHERE id=? AND conference_id=? AND applied_at IS NULL AND expires_at>?)").bind(JSON.stringify(sessions),historyJson,operation,now,ORGANIZER_CONFERENCE,head.revision,ORGANIZER_CONFERENCE,this.owner,this.owner,ORGANIZER_CONFERENCE,candidate.id,candidate.id,ORGANIZER_CONFERENCE,now),
   this.db.prepare('UPDATE organizer_review_candidates SET applied_at=? WHERE id=? AND '+fence).bind(now,candidate.id,ORGANIZER_CONFERENCE,operation),
   this.db.prepare('INSERT INTO organizer_review_approvals(operation_id,conference_id,candidate_id,reviewer_id,revision,preview_hash,approved_at) SELECT ?,?,?,?,?,?,? WHERE '+fence).bind(operation,ORGANIZER_CONFERENCE,candidate.id,this.owner,head.revision+1,candidate.preview_hash,now,ORGANIZER_CONFERENCE,operation)
   ,this.db.prepare("INSERT INTO public_program_sources(conference_id,checked_at,last_success_at,status,message,sessions_json,reference_json,hash,changes_json,changed_at) SELECT ?,?,?,'ok','Organizer-approved shared program.',?,'[]',?,?,? WHERE "+fence+" ON CONFLICT(conference_id) DO UPDATE SET checked_at=excluded.checked_at,last_success_at=excluded.last_success_at,status='ok',message=excluded.message,sessions_json=excluded.sessions_json,hash=excluded.hash,changes_json=excluded.changes_json,changed_at=excluded.changed_at").bind(ORGANIZER_CONFERENCE,candidate.checked_at,candidate.checked_at,JSON.stringify(sessions.filter(s=>s.id!==ORGANIZER_AFTER_PARTY.id)),candidate.preview_hash,JSON.stringify(changes),now,ORGANIZER_CONFERENCE,operation)
  ]);if(results[0].meta.changes!==1)throw new OrganizerReviewError('The program, latest check or permission changed. Nothing was applied; reload.',409);
  return{revision:head.revision+1,changedCount:changes.length,appliedForEveryone:true};
 }
}
type PlannerRow={state_json:string;revision:number};type IntentRow={planner_revision:number;overrides_json:string};
/** A D1 batch gives state, head and intent one consistent snapshot, including its revision pins. */
export async function readOrganizerPlanner(db:D1Database,owner:string,seed:ProgramSeed){
 const results=await db.batch([db.prepare('SELECT state_json,revision FROM planner_states WHERE owner_id=?').bind(owner),db.prepare('SELECT * FROM organizer_review_heads WHERE conference_id=?').bind(ORGANIZER_CONFERENCE),db.prepare('SELECT planner_revision,overrides_json FROM organizer_review_intents WHERE owner_id=?').bind(owner)]);
 const row=results[0].results[0] as PlannerRow|undefined,head=validatedHead(results[1].results[0] as Head|undefined,seed),stored=results[2].results[0] as IntentRow|undefined;
 if(stored&&(!row||stored.planner_revision!==row.revision))throw new OrganizerReviewError('Private program intent and planner revisions do not match. Your saved data has not changed.',503);
 const raw=row?validateState(JSON.parse(row.state_json)):emptyState(),intent=stored?readPrivateIntent(stored.overrides_json):row?legacyPrivateIntent(raw,head.sessions):{};
 return{state:projectApprovedPlanner(raw,head.sessions,intent),revision:row?.revision??0,programRevisions:{[ORGANIZER_CONFERENCE]:head.revision} as ProgramRevisions,programSessions:head.sessions,intent};
}
export async function saveOrganizerPlanner(db:D1Database,owner:string,seed:ProgramSeed,state:PlannerState,revision:number,pin:unknown){
 const snapshot=await readOrganizerPlanner(db,owner,seed),provided=exactObject(pin,[ORGANIZER_CONFERENCE]);if(snapshot.revision!==revision||provided[ORGANIZER_CONFERENCE]!==snapshot.programRevisions[ORGANIZER_CONFERENCE])throw new OrganizerReviewError('Your private planner or the shared program changed. Reload before saving.',409);
 const intent=changedPrivateIntent(snapshot.state,state,snapshot.programSessions,snapshot.intent),payload=JSON.stringify(state),intentJson=JSON.stringify(intent),next=revision+1,now=new Date().toISOString(),headRevision=snapshot.programRevisions[ORGANIZER_CONFERENCE];
 const guard='EXISTS(SELECT 1 FROM organizer_review_heads WHERE conference_id=? AND revision=?)';
 const results=await db.batch([
  db.prepare('INSERT INTO planner_states(owner_id,state_json,revision,updated_at) SELECT ?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM planner_states WHERE owner_id=? AND revision=?)) AND '+guard+' ON CONFLICT(owner_id) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision,updated_at=excluded.updated_at WHERE planner_states.revision=? AND '+guard).bind(owner,payload,next,now,revision,owner,revision,ORGANIZER_CONFERENCE,headRevision,revision,ORGANIZER_CONFERENCE,headRevision),
  // A losing identical-payload CAS may repeat this deterministic same-base intent; it cannot change the winner's intent.
  db.prepare('INSERT INTO organizer_review_intents(owner_id,conference_id,planner_revision,overrides_json,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM planner_states WHERE owner_id=? AND revision=? AND state_json=?) AND '+guard+' ON CONFLICT(owner_id) DO UPDATE SET planner_revision=excluded.planner_revision,overrides_json=excluded.overrides_json,updated_at=excluded.updated_at').bind(owner,ORGANIZER_CONFERENCE,next,intentJson,now,owner,next,payload,ORGANIZER_CONFERENCE,headRevision)
 ]);if(results[0].meta.changes!==1||results[1].meta.changes!==1)throw new OrganizerReviewError('Your planner or shared program changed in another request. Reload before saving.',409);
 return{state:projectApprovedPlanner(state,snapshot.programSessions,intent),revision:next,programRevisions:snapshot.programRevisions};
}
