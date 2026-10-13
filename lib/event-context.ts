import type{PlannerState,Session}from'./planner.ts';
/** Fixed event registry; neither query strings nor forwarded Host headers select an event. */
export function eventContextForOrigin(origin:string,approvedOrigins:string[]):'thunderplains-2026'|undefined{
 return origin==='https://thunderplains.devyo.app'&&approvedOrigins.includes(origin)?'thunderplains-2026':undefined;
}
export function canInitializeEventPlanner(eventId:string|undefined,state:PlannerState,revision:number){
 return eventId==='thunderplains-2026'&&revision===0&&state.initialized===false&&state.conferences.length===0&&state.sessions.length===0&&state.savedSessionIds.length===0&&state.connections.length===0&&Object.keys(state.sessionNotes).length===0;
}

export type EventPlannerSnapshot={state:PlannerState;revision:number;programRevisions?:Record<string,number>;programSessions?:Session[]};
export type EventPlannerIdentity={userId:string;sessionId:string;isCurrent?:()=>boolean};
/** Seed only a missing empty owner row. An atomic conflict reloads the winner; never retry the write. */
export async function loadPlannerForEvent(eventId:string|undefined,starter:()=>PlannerState,fetcher:typeof fetch=fetch,identity?:EventPlannerIdentity):Promise<EventPlannerSnapshot>{
 const check=()=>{if(identity?.isCurrent&&!identity.isCurrent())throw Error('Your sign-in session changed. Reload before opening your planner.');};
 const identityHeaders:Record<string,string>=identity?{'X-Expected-Devyo-User':identity.userId,'X-Expected-Devyo-Session':identity.sessionId}:{};
 async function read(response:Response){check();const data=await response.json() as EventPlannerSnapshot&{error?:string};check();if(!response.ok)throw Error(data.error||'Your planner could not be opened.');return data;}
 check();const current=await read(await fetcher('/api/planner',{cache:'no-store',headers:identityHeaders}));
 if(!canInitializeEventPlanner(eventId,current.state,current.revision))return current;
 const initial=starter();if(current.programSessions?.length){const ids=new Set(current.programSessions.map(s=>s.conferenceId));initial.sessions=[...initial.sessions.filter(s=>!ids.has(s.conferenceId)),...current.programSessions.map(({id,conferenceId,title,start,end,speaker,room,track,description,url,sourceUrl})=>({id,conferenceId,title,start,end,speaker,room,track,description,url,sourceUrl}))];}
 check();const created=await fetcher('/api/planner',{method:'PUT',headers:{'Content-Type':'application/json',...identityHeaders},body:JSON.stringify({state:initial,revision:0,...(current.programRevisions?{programRevisions:current.programRevisions}:{})})});
 check();return created.status===409?read(await fetcher('/api/planner',{cache:'no-store',headers:identityHeaders})):read(created);
}
