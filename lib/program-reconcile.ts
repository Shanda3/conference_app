import{PLANNER_LIMITS,type PlannerState,type Session}from'./planner.ts';
import{toPlannerSession,type PublishedSession}from'./program-model.ts';
import{confirmedSessionRoom}from'./session-rooms.ts';
export const AUTO_PROGRAM_EVENT='thunderplains-2026';
export const OFFICIAL_SESSION_FIELDS=['title','start','end','room','speaker','track','description']as const;
/** Official ThunderPlains metadata is authoritative. Every private field and selection stays with its owner. */
export function reconcileThunderPlains(state:PlannerState,published:readonly PublishedSession[]):PlannerState{
 if(!state.initialized||!state.conferences.some(c=>c.id===AUTO_PROGRAM_EVENT))return state;
 const current=published.filter(s=>s.conferenceId===AUTO_PROGRAM_EVENT&&/^[a-z0-9-]{1,64}$/i.test(s.sourceId)&&s.id===`${AUTO_PROGRAM_EVENT}-${s.sourceId}`&&s.id!=='thunderplains-2026-organizer-after-party').map(confirmedSessionRoom);
 const byId=new Map(current.map(s=>[s.id,s])),ids=new Set(state.sessions.map(s=>s.id));let changed=false;
 const sessions=state.sessions.map(session=>{const official=byId.get(session.id);if(!official||session.conferenceId!==AUTO_PROGRAM_EVENT)return session;const next={...session};for(const field of OFFICIAL_SESSION_FIELDS)if(next[field]!==official[field]){next[field]=official[field];changed=true}return next});
 for(const official of current)if(!ids.has(official.id)&&sessions.length<PLANNER_LIMITS.sessions){sessions.push(toPlannerSession(official));ids.add(official.id);changed=true}
 return changed?{...state,sessions}:state;
}
