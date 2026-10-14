import{mergeAfterParty,ORGANIZER_AFTER_PARTY}from'./organizer-session-extras.ts';
import{confirmedSessionRoom}from'./session-rooms.ts';
import {emptyState,validateState,dateInZone} from './planner.ts';
import {PROGRAM_EVENT_DATE} from './program-model.ts';
import type {VerifiedCatalog} from './sharing.ts';
export type ShareProgramRow={conference_id:string;last_success_at:string|null;sessions_json:string|null};
const keys=['id','conferenceId','sourceId','status','title','start','end','room','speaker','track','description','url','sourceUrl'];
const publicOrigins=new Set(['https://2026.thunderplainsconf.com','https://whova.com','https://sessionize.com']);
function timestamp(value:unknown,now:number):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value&&Date.parse(value)<=now+300_000}
function publisherUrl(value:string){if(!value)return;const u=new URL(value);if(!publicOrigins.has(u.origin)||u.username||u.password)throw Error('Invalid publisher URL')}
/** Reads only the canonical public snapshot. Attendee state is never an input, except saved IDs to the later projection. */
function supplemented(input:VerifiedCatalog){const bundled={...input,sessions:input.sessions.filter(s=>(s as {status?:string}).status!=='cancelled')};if(!bundled.conferences.some(c=>c.id==='thunderplains-2026'))return bundled;const s=ORGANIZER_AFTER_PARTY;return{...bundled,sessions:mergeAfterParty(bundled.sessions,{id:s.id,conferenceId:s.conferenceId,title:s.title,start:s.start,end:s.end,room:s.room,speaker:s.speaker,url:s.url,verifiedAt:'2026-10-12T00:00:00.000Z'}).map(confirmedSessionRoom)}}
export async function latestShareCatalog(bundled:VerifiedCatalog,readRows:()=>Promise<ShareProgramRow[]>,now=Date.now()):Promise<VerifiedCatalog>{
 let rows:ShareProgramRow[];try{rows=await readRows();if(!Array.isArray(rows))return supplemented(bundled)}catch{return supplemented(bundled)}
 const sessions:VerifiedCatalog['sessions']=[];
 for(const conference of bundled.conferences){
  const fallback=bundled.sessions.filter(s=>s.conferenceId===conference.id),matches=rows.filter(r=>r?.conference_id===conference.id);let selected=fallback.filter(s=>(s as {status?:string}).status!=='cancelled');
  try{
   if(matches.length!==1)throw Error('Missing snapshot');const row=matches[0];if(!timestamp(row.last_success_at,now)||typeof row.sessions_json!=='string'||row.sessions_json.length>1_000_000)throw Error('Unverified snapshot');
   const parsed:unknown=JSON.parse(row.sessions_json);if(!Array.isArray(parsed)||!parsed.length||parsed.length>500)throw Error('Invalid snapshot');
   const ids=new Set<string>(),removed=new Set<string>();
   const values=parsed.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid session');const s=value as Record<string,unknown>;
    if(Object.keys(s).some(k=>!keys.includes(k)&&k!=='prepAbstract')||keys.some(k=>!Object.hasOwn(s,k)))throw Error('Invalid session fields');
    if(Object.hasOwn(s,'prepAbstract')){const p=s.prepAbstract as Record<string,unknown>;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='checkedAt,hash,status'||!['ok','failed'].includes(String(p.status))||typeof p.hash!=='string'||!(/^[a-f0-9]{64}$/.test(p.hash)||(p.status==='failed'&&p.hash===''))||!timestamp(p.checkedAt,now))throw Error('Invalid abstract metadata')}
    if(keys.some(k=>typeof s[k]!=='string')||s.conferenceId!==conference.id||!['scheduled','cancelled'].includes(String(s.status))||!/^[A-Za-z0-9-]{1,64}$/.test(String(s.sourceId)))throw Error('Invalid source identity');
    const id=String(s.id);if(s.status==='cancelled')removed.add(id);if(ids.has(id))throw Error('Duplicate ID');ids.add(id);
    const original=fallback.find(p=>p.id===id) as (VerifiedCatalog['sessions'][number]&{sourceId?:string})|undefined;
    if(original?.sourceId&&original.sourceId!==s.sourceId)throw Error('Changed source ID');
    const expected=conference.id==='innotech-oklahoma-2026'?`${conference.id}-whova-${s.sourceId}`:`${conference.id}-${s.sourceId}`;
    if(!original&&id!==expected)throw Error('Unrecognized session ID');
    if(dateInZone(String(s.start),conference.timeZone)!==PROGRAM_EVENT_DATE||dateInZone(String(s.end),conference.timeZone)!==PROGRAM_EVENT_DATE)throw Error('Wrong event date');
    publisherUrl(String(s.url));publisherUrl(String(s.sourceUrl));
    return{id,conferenceId:conference.id,title:String(s.title),start:String(s.start),end:String(s.end),speaker:String(s.speaker),room:String(s.room),track:String(s.track),description:String(s.description),url:String(s.url),sourceUrl:String(s.sourceUrl)};
   });
   if(fallback.some(s=>!ids.has(s.id)))throw Error('Incomplete snapshot');
   const validated=validateState({...emptyState(),initialized:true,conferences:[{id:conference.id,name:conference.name,startDate:PROGRAM_EVENT_DATE,endDate:PROGRAM_EVENT_DATE,timeZone:conference.timeZone,location:'',url:'',description:''}],sessions:values});
   selected=validated.sessions.filter(s=>!removed.has(s.id)).map(s=>({id:s.id,conferenceId:s.conferenceId,title:s.title,start:s.start,end:s.end,room:s.room,speaker:s.speaker,url:s.url,verifiedAt:row.last_success_at!}));
  }catch{/* Invalid/unavailable source falls back as a whole; no partial, personal, or unverified fields escape. */}
  sessions.push(...selected);
 }
 return supplemented({conferences:bundled.conferences,sessions});
}
