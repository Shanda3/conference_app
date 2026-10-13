import {dateInZone, type Conference, type Session} from './planner.ts';
export type SessionGroup = {key:string;date:string;conferenceName?:string;sessions:Session[]};
/** Browsing groups official conferences first; agendas always retain time order. */
export function sessionGroups(sessions:readonly Session[], conferences:readonly Conference[], conferenceFirst:boolean):SessionGroup[] {
  const byId=new Map(conferences.map(c=>[c.id,c]));
  const ordered=[...sessions].sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  const dates=(items:Session[])=>[...new Set(items.map(s=>dateInZone(s.start,byId.get(s.conferenceId)?.timeZone||'UTC')))].sort();
  const onDate=(items:Session[],date:string)=>items.filter(s=>dateInZone(s.start,byId.get(s.conferenceId)?.timeZone||'UTC')===date);
  if(!conferenceFirst)return dates(ordered).map(date=>({key:date,date,sessions:onDate(ordered,date)}));
  const priority=(id:string)=>id==='thunderplains-2026'?0:id==='innotech-oklahoma-2026'?1:2;
  return [...conferences].sort((a,b)=>priority(a.id)-priority(b.id)).flatMap(conference=>{
    const items=ordered.filter(s=>s.conferenceId===conference.id);
    return dates(items).map(date=>({key:conference.id+':'+date,date,conferenceName:conference.name,sessions:onDate(items,date)}));
  });
}
