import type {Conference, PlannerState, Session} from './planner.ts';

export const PROGRAM_EVENT_DATE='2026-10-21';
export const PROGRAM_END='2026-10-22T01:00:00.000Z';
export const PROGRAM_CRON='0 14 * * *'; // 9 AM America/Chicago through the October 21 event; fetching stops at event end.
export const PROGRAM_FIELDS=['title','start','end','room','speaker','track'] as const;
export type ProgramField=typeof PROGRAM_FIELDS[number];
export type PublishedSession=Session & {sourceId:string;status:'scheduled'|'cancelled';prepAbstract?:{status:'ok'|'failed';hash:string;checkedAt:string}};
export type SourceStatus={conferenceId:string;name:string;sourceUrl:string;status:'ok'|'failed'|'not-checked';checkedAt:string|null;lastSuccessAt:string|null;message:string;sessionCount:number;changeCount:number};
export type ThunderPlainsUpdate={version:string;previousSessions:Session[];movedSessionIds:string[]};
export type ProgramPayload={programUpdate?:ThunderPlainsUpdate;thunderPlainsUpdate?:ThunderPlainsUpdate;sessions:PublishedSession[];knownSessions:Session[];sources:SourceStatus[];stopped:boolean;stopAt:string;cadence:string};
export type ProgramReview={added:Session[];updates:Array<{session:Session;fields:ProgramField[];before:Session}>;keptPrivateFields:number};

/** Only organizer-owned fields are candidates. Applying this review never changes choices, notes, connections, or private edits. */
export function reviewProgram(state:PlannerState,published:Session[],known:Session[]):ProgramReview {
 const existing=new Map(state.sessions.map(s=>[s.id,s]));const history=new Map<string,Session[]>();
 for(const s of known){const entries=history.get(s.id)??[];entries.push(s);history.set(s.id,entries)}
 const added:Session[]=[],updates:ProgramReview['updates']=[];let keptPrivateFields=0;
 const conferences=new Set(state.conferences.map(c=>c.id));
 for(const next of published){
  if(!conferences.has(next.conferenceId))continue;
  const current=existing.get(next.id);if(!current){added.push(toPlannerSession(next));continue}
  if(current.conferenceId!==next.conferenceId){keptPrivateFields++;continue}
  const result={...current};const fields:ProgramField[]=[];
  for(const field of PROGRAM_FIELDS){if(current[field]===next[field])continue;
   // An attendee's field edit is left alone, including descriptions and custom links.
   if((history.get(next.id)??[]).some(p=>p.conferenceId===current.conferenceId&&p[field]===current[field])){result[field]=next[field];fields.push(field)}else keptPrivateFields++;
  }
  // Never combine one preserved private time with a source time into an invalid interval.
  if(Date.parse(result.end)<=Date.parse(result.start)){for(const field of ['start','end'] as const){const i=fields.indexOf(field);if(i>=0){fields.splice(i,1);result[field]=current[field];keptPrivateFields++}}}
  if(fields.length)updates.push({session:result,fields,before:current});
 }
 return{added,updates,keptPrivateFields};
}
export function applyProgramReview(state:PlannerState,review:ProgramReview):PlannerState {
 const updates=new Map(review.updates.map(u=>[u.session.id,u.session]));
 return{...state,sessions:[...state.sessions.map(s=>updates.get(s.id)??s),...review.added]};
}
export function toPlannerSession(s:Session):Session{return{id:s.id,conferenceId:s.conferenceId,title:s.title,start:s.start,end:s.end,speaker:s.speaker,room:s.room,track:s.track,description:s.description,url:s.url,sourceUrl:s.sourceUrl}}
export function seedSessions(seed:{sessions:unknown[]}):PublishedSession[]{return(seed.sessions as Array<Session&{sourceId:string;status?:'scheduled'|'cancelled'}>).map(s=>({...toPlannerSession(s),start:new Date(s.start).toISOString(),end:new Date(s.end).toISOString(),sourceId:s.sourceId,status:s.status==='cancelled'?'cancelled':'scheduled'}))}
export type ProgramSeed={sessions:Array<Session&{sourceId:string;status?:'scheduled'|'cancelled'}>;referenceWindows:Array<Record<string,unknown>>;conferences:Conference[]};
