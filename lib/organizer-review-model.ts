import {emptyState,validateState,type PlannerState,type Session} from './planner.ts';
import {PROGRAM_FIELDS,seedSessions,toPlannerSession,type ProgramField,type ProgramSeed,type PublishedSession} from './program-model.ts';
import {ORGANIZER_AFTER_PARTY,isAfterParty} from './organizer-session-extras.ts';
import {confirmedSessionRoom} from './session-rooms.ts';

export const ORGANIZER_CONFERENCE='thunderplains-2026' as const;
export const ORGANIZER_REVIEW_LIMITS={sessions:200,candidateBytes:524288,retainedCandidates:100,retainedBytes:5*1024*1024,historyBytes:5*1024*1024,revisions:100,expiryMs:36*3600000} as const;
export type ProgramRevisions={ [ORGANIZER_CONFERENCE]:number };
export type PrivateProgramIntent=Record<string,ProgramField[]>;
export class OrganizerReviewError extends Error {readonly status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export function exactObject(value:unknown,keys:readonly string[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw new OrganizerReviewError('The request has missing or unsupported fields.');
 return value as Record<string,unknown>;
}
const sessionKeys=['id','conferenceId','sourceId','status','title','start','end','room','speaker','track','description','url','sourceUrl'];
export function initialApprovedProgram(seed:ProgramSeed){return [...seedSessions(seed).filter(s=>s.conferenceId===ORGANIZER_CONFERENCE&&!isAfterParty(s)).map(confirmedSessionRoom),ORGANIZER_AFTER_PARTY];}
/** Complete public TP source only. Private descriptions/links and established source IDs never enter candidates. */
export function checkedOrganizerProgram(value:unknown,before:PublishedSession[],seed:ProgramSeed){
 if(!Array.isArray(value)||!value.length||value.length>ORGANIZER_REVIEW_LIMITS.sessions)throw new OrganizerReviewError('A complete bounded ThunderPlains program is required.');
 const oldBySource=new Map(before.map(s=>[s.sourceId,s])),oldById=new Map(before.map(s=>[s.id,s]));
 const ids=new Set<string>(),sources=new Set<string>();
 const incoming=value.map(raw=>{
  // prepAbstract is independently checked by the source job and never authorizes schedule publication.
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.hasOwn(raw,'prepAbstract')){const{prepAbstract:_,...rest}=raw;raw=rest;}
  const x=exactObject(raw,sessionKeys);
  if(sessionKeys.some(key=>typeof x[key]!=='string')||x.conferenceId!==ORGANIZER_CONFERENCE||!['scheduled','cancelled'].includes(x.status as string)||!/^[A-Za-z0-9-]{1,64}$/.test(x.sourceId as string))throw new OrganizerReviewError('The source identity or status is invalid.');
  const s=x as unknown as PublishedSession;if(ids.has(s.id)||sources.has(s.sourceId))throw new OrganizerReviewError('The source contains duplicate identities.');ids.add(s.id);sources.add(s.sourceId);
  if(isAfterParty(s))return null;
  const old=oldBySource.get(s.sourceId);
  if((old&&(old.id!==s.id||old.sourceUrl!==s.sourceUrl))||(!old&&s.id!==`${ORGANIZER_CONFERENCE}-${s.sourceId}`)||(oldById.has(s.id)&&oldById.get(s.id)!.sourceId!==s.sourceId))throw new OrganizerReviewError('Established session identities cannot be reassigned.');
  if(s.sourceUrl!=='https://sessionize.com/api/v2/xtaduary/view/GridSmart?under=True')throw new OrganizerReviewError('The public program source is not approved.');
  const next={...s,...(old?{description:old.description,url:old.url,sourceUrl:old.sourceUrl}:{} )};
  if(old&&/^Room 301 (?:AB|CD)$/.test(old.room))next.room=old.room;
  if(next.status==='cancelled'&&!next.title.startsWith('[Cancelled] '))next.title='[Cancelled] '+next.title;
  return confirmedSessionRoom(next);
 }).filter((s):s is PublishedSession=>s!==null);
 for(const old of before)if(old.id!==ORGANIZER_AFTER_PARTY.id&&!incoming.some(s=>s.id===old.id))throw new OrganizerReviewError('The source is incomplete. Keep all established entries and mark cancellations explicitly.',409);
 const conference=seed.conferences.find(c=>c.id===ORGANIZER_CONFERENCE);if(!conference)throw new OrganizerReviewError('The conference registry is unavailable.',503);
 const {id,name,startDate,endDate,timeZone,location,url,description}=conference;
 try{validateState({...emptyState(),initialized:true,conferences:[{id,name,startDate,endDate,timeZone,location,url,description}],sessions:incoming.map(toPlannerSession)})}catch{throw new OrganizerReviewError('The public source has invalid session fields, URLs or times.');}
 const sessions=[...incoming,ORGANIZER_AFTER_PARTY].sort((a,b)=>a.id.localeCompare(b.id));
 if(sessions.length>ORGANIZER_REVIEW_LIMITS.sessions)throw new OrganizerReviewError('The complete program exceeds the review limit.');
 return sessions;
}
export function organizerChanges(before:PublishedSession[],after:PublishedSession[]){
 const old=new Map(before.map(s=>[s.id,s]));return after.flatMap(s=>{const previous=old.get(s.id);const fields:string[]=previous?PROGRAM_FIELDS.filter(f=>previous[f]!==s[f]):[...PROGRAM_FIELDS];if(previous&&previous.status!==s.status)fields.push('status');return !fields.length?[]:[{id:s.id,kind:!previous?'added':previous.status===s.status?'updated':s.status==='cancelled'?'cancelled':'restored',fields,before:previous??null,after:s}];});
}
export function readPrivateIntent(value:string):PrivateProgramIntent{
 const parsed:unknown=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length>ORGANIZER_REVIEW_LIMITS.sessions)throw new OrganizerReviewError('Private program intent could not be loaded.',503);
 for(const[id,fields]of Object.entries(parsed)){if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||!Array.isArray(fields)||fields.length>PROGRAM_FIELDS.length||fields.some(f=>!PROGRAM_FIELDS.includes(f))||new Set(fields).size!==fields.length)throw new OrganizerReviewError('Private program intent could not be loaded.',503);}
 return parsed as PrivateProgramIntent;
}
/** Old snapshots cannot prove edit intent: conservatively freeze their existing shared fields. */
export function legacyPrivateIntent(state:PlannerState,approved:PublishedSession[]):PrivateProgramIntent{
 const ids=new Set(approved.map(s=>s.id));return Object.fromEntries(state.sessions.filter(s=>s.conferenceId===ORGANIZER_CONFERENCE&&ids.has(s.id)).map(s=>[s.id,[...PROGRAM_FIELDS]]));
}
export function projectApprovedPlanner(state:PlannerState,approved:PublishedSession[],intent:PrivateProgramIntent):PlannerState{
 const byId=new Map(approved.map(s=>[s.id,s])),existing=new Set(state.sessions.map(s=>s.id));
 const sessions=state.sessions.map(current=>{const next=byId.get(current.id);if(!next||current.conferenceId!==ORGANIZER_CONFERENCE)return current;const result={...current};for(const field of PROGRAM_FIELDS)if(!intent[current.id]?.includes(field))result[field]=next[field];if(Date.parse(result.end)<=Date.parse(result.start)){result.start=current.start;result.end=current.end;}return result;});
 if(state.conferences.some(c=>c.id===ORGANIZER_CONFERENCE))sessions.push(...approved.filter(s=>!existing.has(s.id)).map(toPlannerSession));
 return validateState({...state,sessions});
}
export function changedPrivateIntent(previous:PlannerState,next:PlannerState,approved:PublishedSession[],intent:PrivateProgramIntent){
 const result=structuredClone(intent),old=new Map(previous.sessions.map(s=>[s.id,s]));
 for(const official of approved){const current=next.sessions.find(s=>s.id===official.id&&s.conferenceId===ORGANIZER_CONFERENCE);if(!current)continue;const baseline=old.get(current.id)??toPlannerSession(official);const changed=PROGRAM_FIELDS.filter(field=>current[field]!==baseline[field]);if(changed.length)result[current.id]=[...new Set([...(result[current.id]??[]),...changed])];}
 return result;
}
