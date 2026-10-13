import type{PlannerState}from'./planner.ts';
/** Fixed event registry; neither query strings nor forwarded Host headers select an event. */
export function eventContextForOrigin(origin:string,approvedOrigins:string[]):'thunderplains-2026'|undefined{
 return origin==='https://thunderplains.devyo.app'&&approvedOrigins.includes(origin)?'thunderplains-2026':undefined;
}
export function canInitializeEventPlanner(eventId:string|undefined,state:PlannerState,revision:number){
 return eventId==='thunderplains-2026'&&revision===0&&state.initialized===false&&state.conferences.length===0&&state.sessions.length===0&&state.savedSessionIds.length===0&&state.connections.length===0&&Object.keys(state.sessionNotes).length===0;
}

export type EventPlannerSnapshot={state:PlannerState;revision:number};
/** Seed only a missing empty owner row. An atomic conflict reloads the winner; never retry the write. */
export async function loadPlannerForEvent(eventId:string|undefined,starter:()=>PlannerState,fetcher:typeof fetch=fetch):Promise<EventPlannerSnapshot>{
 async function read(response:Response){const data=await response.json() as EventPlannerSnapshot&{error?:string};if(!response.ok)throw Error(data.error||'Your planner could not be opened.');return data;}
 const current=await read(await fetcher('/api/planner',{cache:'no-store'}));
 if(!canInitializeEventPlanner(eventId,current.state,current.revision))return current;
 const created=await fetcher('/api/planner',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:starter(),revision:0})});
 return created.status===409?read(await fetcher('/api/planner',{cache:'no-store'})):read(created);
}
