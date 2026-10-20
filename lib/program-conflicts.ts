import{getConflicts,type PlannerState,type Session}from'./planner.ts';
import type{PublishedSession,ThunderPlainsUpdate}from'./program-model.ts';
import{reconcileOfficialProgram}from'./program-reconcile.ts';
import{isNonTalk}from'./talk-prep.ts';
const pairKey=(pair:Session[])=>pair.map(s=>s.id).sort().join('\u0000');
/** Compare the previous public intervals with the current plan; choices are never changed. */
export function newScheduleConflicts(state:PlannerState,published:readonly PublishedSession[],update?:ThunderPlainsUpdate):[Session,Session][]{
 if(!update?.version||!state.initialized||!update.movedSessionIds.length)return[];
 const current=reconcileOfficialProgram(state,published),removed=new Set(published.filter(s=>s.status==='cancelled').map(s=>s.id)),eligible=current.sessions.filter(s=>!removed.has(s.id)&&!isNonTalk(s)),previous=new Map(update.previousSessions.map(s=>[s.id,s])),moved=new Set(update.movedSessionIds);
 const oldPairs=new Set(getConflicts(eligible.map(s=>previous.has(s.id)?{...s,start:previous.get(s.id)!.start,end:previous.get(s.id)!.end}:s),state.savedSessionIds).map(pairKey));
 return getConflicts(eligible,state.savedSessionIds).filter(pair=>pair.some(s=>moved.has(s.id))&&!oldPairs.has(pairKey(pair)));
}
