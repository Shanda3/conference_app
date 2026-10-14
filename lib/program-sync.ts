import{mergeAfterParty,ORGANIZER_AFTER_PARTY}from'./organizer-session-extras.ts';
import{confirmedSessionRoom}from'./session-rooms.ts';
import {localToUtc,dateInZone,validateState,emptyState} from './planner.ts';
import type {Session} from './planner.ts';
import {PROGRAM_END,PROGRAM_EVENT_DATE,PROGRAM_FIELDS,seedSessions,toPlannerSession} from './program-model.ts';
import type {ProgramSeed,PublishedSession,ProgramPayload,SourceStatus} from './program-model.ts';
import {refreshTalkAbstracts} from './talk-prep-source.ts';

export const PROGRAM_SOURCES=[
 {conferenceId:'thunderplains-2026',name:'ThunderPlains',sourceUrl:'https://sessionize.com/api/v2/xtaduary/view/GridSmart?under=True',format:'sessionize'},
 {conferenceId:'innotech-oklahoma-2026',name:'InnoTech',sourceUrl:'https://whova.com/xems/apis/event_webpage/agenda/public/get_agendas/?event_id=8DafSwBx7usrDvwSDIsZZFzlUZta5B%40sh3%40JWy6Q6sY%3D',format:'whova'},
] as const;
type Source=typeof PROGRAM_SOURCES[number];
type Parsed={sessions:PublishedSession[];references:PublishedSession[]};
type SourceRow={conference_id:string;checked_at:string;last_success_at:string|null;status:'ok'|'failed';message:string;sessions_json:string|null;reference_json:string|null;hash:string|null;changes_json:string;changed_at:string|null};
export type ProgramChange={id:string;kind:'added'|'updated'|'cancelled'|'restored';fields:string[];before:PublishedSession|null;after:PublishedSession};
class SourceError extends Error{}
const plain=(value:string)=>value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi,(_,entity:string)=>{
 if(entity.startsWith('#')){const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}
 return({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'} as Record<string,string>)[entity.toLowerCase()];
}).replace(/\s+/g,' ').trim();
function text(value:unknown,max:number,required=false):string{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw new SourceError('An organizer record has an invalid field.');return plain(value)}
function cancelled(value:Record<string,unknown>):boolean{return value.cancelled===true||value.canceled===true||['cancelled','canceled'].includes(String(value.status??'').toLowerCase())||/^(?:\[?cancelled\]?|\[?canceled\]?)\s*[:–-]/i.test(String(value.name??value.title??''))}
function finish(session:PublishedSession):PublishedSession {
 if(dateInZone(session.start,'America/Chicago')!==PROGRAM_EVENT_DATE||dateInZone(session.end,'America/Chicago')!==PROGRAM_EVENT_DATE||Date.parse(session.end)<=Date.parse(session.start))throw new SourceError('A session is outside the event date or has invalid times.');
 if(session.status==='cancelled'&&!/^\[(?:Cancelled|Removed from current program)\] /i.test(session.title))session.title=`[Cancelled] ${session.title}`;
 return session;
}
function deduplicate(values:PublishedSession[]):PublishedSession[]{const found=new Map<string,PublishedSession>();for(const s of values){const previous=found.get(s.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(s))throw new SourceError('Conflicting copies of the same organizer session were returned.');found.set(s.id,s)}return [...found.values()].sort((a,b)=>a.id.localeCompare(b.id))}

export function parseSessionize(html:string,previous:PublishedSession[]):Parsed {
 if(!html.includes('id="sessionize"')||!html.includes("sessionize.eventTimezone = 'UTC-05'")||!html.includes('id="sz-modal-container"'))throw new SourceError('The complete ThunderPlains grid could not be verified.');
 const matches=[...html.matchAll(/<div\b[^>]*\bdata-sessionid="([a-z0-9-]+)"[^>]*>/gi)];const sessions:PublishedSession[]=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],block=html.slice(m.index!,matches[i+1]?.index??html.length),sourceId=m[1];
  const t=block.match(/data-sztz="TimeWithDuration\|[^|"]+\|([^|"]+)\|([^|"]+)"/);const title=block.match(/<h3\b[^>]*class="[^"]*sz-session__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
  const room=block.match(/<div\b[^>]*class="[^"]*sz-session__room[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if(!t||!title||!room)throw new SourceError('A ThunderPlains session is incomplete.');
  const start=new Date(t[1]),end=new Date(t[2]);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw new SourceError('A ThunderPlains time is invalid.');
  const speakerBlock=block.match(/<ul\b[^>]*class="[^"]*sz-session__speakers[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1]??'';
  const speaker=[...speakerBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(x=>plain(x[1])).join(', ');
  const old=previous.find(s=>s.sourceId===sourceId),id=old?.id??`thunderplains-2026-${sourceId}`,name=text(plain(title[1]),240,true),place=text(plain(room[1]),160,true);
  sessions.push(finish({id,sourceId,conferenceId:'thunderplains-2026',title:name,start:start.toISOString(),end:end.toISOString(),speaker:text(speaker,300),room:place,track:place,description:old?.description??'',url:old?.url??`https://2026.thunderplainsconf.com/#sz-session-${sourceId}`,sourceUrl:PROGRAM_SOURCES[0].sourceUrl,status:cancelled({title:name})||/data-status="cancel(?:led|ed)"/i.test(m[0])?'cancelled':'scheduled'}));
 }
 // A previously reviewed removal keeps its original identity and any private references.
 // Newly missing scheduled records still fail completeness validation.
 for(const old of previous)if(old.status==='cancelled'&&!sessions.some(s=>s.sourceId===old.sourceId))sessions.push({...old});
 return{sessions:deduplicate(sessions),references:[]};
}

export function parseWhova(raw:string,previous:PublishedSession[],references:PublishedSession[]):Parsed {
 let body:any;try{body=JSON.parse(raw)}catch{throw new SourceError('The InnoTech feed is not valid JSON.')}
 if(body?.result!=='success'||body.data?.event_basics?.event_name!=='InnoTech Oklahoma'||body.data.event_basics.timezone!=='America/Chicago'||!Array.isArray(body.data.agenda))throw new SourceError('The InnoTech event or timezone could not be verified.');
 const day=body.data.agenda.filter((d:any)=>d.date==='Oct 21, 2026');if(day.length!==1||!Array.isArray(day[0].time_ranges))throw new SourceError('The InnoTech event day could not be verified.');
 const rawSessions:Record<string,unknown>[]=[];
 function collect(value:unknown,depth=0){if(depth>12)throw new SourceError('Unexpected InnoTech agenda structure.');if(Array.isArray(value)){for(const v of value)collect(v,depth+1)}else if(value&&typeof value==='object'){const o=value as Record<string,unknown>;if('sessions'in o){if(!Array.isArray(o.sessions))throw new SourceError('An InnoTech session block is incomplete.');for(const s of o.sessions){if(!s||typeof s!=='object'||Array.isArray(s))throw new SourceError('An InnoTech session is invalid.');rawSessions.push(s as Record<string,unknown>)}}else for(const v of Object.values(o))collect(v,depth+1)}}
 collect(day[0].time_ranges);const sessions:PublishedSession[]=[],refs:PublishedSession[]=[];const allPrevious=[...previous,...references];
 for(const value of rawSessions){
  if(!Number.isSafeInteger(value.id)||(value.id as number)<=0)throw new SourceError('An InnoTech session ID is invalid.');const sourceId=String(value.id),old=allPrevious.find(s=>s.sourceId===sourceId),id=old?.id??`innotech-oklahoma-2026-whova-${sourceId}`;
  const stamp=(v:unknown)=>{const s=text(v,19,true);if(!/^2026-10-21 \d{2}:\d{2}:\d{2}$/.test(s))throw new SourceError('An InnoTech timestamp is invalid.');return localToUtc(s.replace(' ','T'),'America/Chicago')};
  const speakerObject=value.speaker;if(!speakerObject||typeof speakerObject!=='object'||Array.isArray(speakerObject))throw new SourceError('The InnoTech speaker data is incomplete.');
  const names=Object.values(speakerObject).flatMap(v=>{if(!Array.isArray(v))throw new SourceError('Unexpected InnoTech speaker structure.');return v.map(p=>text(p?.name,160,true))});
  if(!Array.isArray(value.tracks))throw new SourceError('The InnoTech track data is incomplete.');
  const tracks=(value.tracks as any[]).map(t=>text(t?.name,160,true));
  const session=finish({id,sourceId,conferenceId:'innotech-oklahoma-2026',title:text(value.name,240,true),start:stamp(value.calendar_stime),end:stamp(value.calendar_etime),speaker:text([...new Set(names)].join(', '),300),room:text(value.place,160),track:text(tracks.join(' / ')||'InnoTech',160),description:old?.description??'',url:old?.url??`https://whova.com/embedded/session/8DafSwBx7usrDvwSDIsZZFzlUZta5B%40sh3%40JWy6Q6sY%3D/${sourceId}/`,sourceUrl:old?.sourceUrl??`https://whova.com/embedded/session/8DafSwBx7usrDvwSDIsZZFzlUZta5B%40sh3%40JWy6Q6sY%3D/${sourceId}/`,status:cancelled(value)?'cancelled':'scheduled'});
  // Existing all-day exhibit hours remain a flexible reference, never an attendance commitment.
  if(references.some(s=>s.id===id)||/exhibits.*all day/i.test(session.title))refs.push(session);else sessions.push(session);
 }
 return{sessions:deduplicate(sessions),references:deduplicate(refs)};
}

export function validateComplete(parsed:Parsed,previous:Parsed,seed:ProgramSeed):void {
 if(!parsed.sessions.length||parsed.sessions.length>500)throw new SourceError('The organizer agenda is empty or unexpectedly large.');
 const ids=new Set([...parsed.sessions,...parsed.references].map(s=>s.id));const missing=[...previous.sessions,...previous.references].filter(s=>!ids.has(s.id));
 if(missing.length)throw new SourceError(`${missing.length} previously verified organizer entries are missing. Last complete program kept; removals need organizer confirmation.`);
 // Reuse private planner validation for bounds, URLs, date ranges and referenced conference IDs.
 validateState({...emptyState(),initialized:true,conferences:seed.conferences.map(c=>({id:c.id,name:c.name,startDate:c.startDate,endDate:c.endDate,timeZone:c.timeZone,location:c.location,url:c.url,description:c.description})),sessions:[...parsed.sessions,...parsed.references].map(toPlannerSession)});
}
export function diffProgram(before:PublishedSession[],after:PublishedSession[]):ProgramChange[]{const old=new Map(before.map(s=>[s.id,s]));return after.flatMap<ProgramChange>(s=>{const p=old.get(s.id);if(!p)return[{id:s.id,kind:'added' as const,fields:[...PROGRAM_FIELDS],before:null,after:s}];const fields:string[]=PROGRAM_FIELDS.filter(f=>p[f]!==s[f]);if(p.status!==s.status)fields.push('status');if(!fields.length)return[];return[{id:s.id,kind:s.status!==p.status?(s.status==='cancelled'?'cancelled' as const:'restored' as const):'updated' as const,fields,before:p,after:s}]})}
async function hash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function boundedFetch(url:string,fetcher:typeof fetch):Promise<string>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20_000);
 try{const response=await fetcher(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'application/json,text/html'}});if(!response.ok)throw new SourceError(`Organizer feed returned HTTP ${response.status}.`);
  if(!/^(?:application\/json|text\/html)/i.test(response.headers.get('Content-Type')??''))throw new SourceError('Unexpected organizer feed content type.');
  const advertised=response.headers.get('Content-Length');if(advertised&&Number(advertised)>1_000_000)throw new SourceError('Organizer feed exceeds the size limit.');
  if(!response.body)throw new SourceError('Organizer feed returned no body.');const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();throw new SourceError('Organizer feed exceeds the size limit.')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch(e){if(e instanceof SourceError)throw e;throw new SourceError('Organizer feed could not be reached or decoded. Last complete program kept.')}finally{clearTimeout(timeout)}
}
function seedReference(seed:ProgramSeed):PublishedSession[]{return seed.referenceWindows.filter(s=>typeof s.sourceId==='string').map(s=>({...toPlannerSession(s as unknown as Session),start:new Date(String(s.start)).toISOString(),end:new Date(String(s.end)).toISOString(),sourceId:String(s.sourceId),status:'scheduled'}))}
export const PROGRAM_SCHEMA="-- Additive public organizer schedule data ONLY. No attendee tables, identity, credentials, or deletion migrations.\nCREATE TABLE IF NOT EXISTS public_program_control (id TEXT PRIMARY KEY, last_attempt TEXT NOT NULL, lease_until TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS public_program_sources (\n conference_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, last_success_at TEXT,\n status TEXT NOT NULL CHECK(status IN ('ok','failed')), message TEXT NOT NULL,\n sessions_json TEXT, reference_json TEXT, hash TEXT, changes_json TEXT NOT NULL DEFAULT '[]', changed_at TEXT\n);\nCREATE TABLE IF NOT EXISTS public_program_checks (\n conference_id TEXT NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL,\n session_count INTEGER NOT NULL, changed_count INTEGER NOT NULL, message TEXT NOT NULL,\n PRIMARY KEY(conference_id,checked_at)\n);\nCREATE TABLE IF NOT EXISTS public_program_changes (\n conference_id TEXT NOT NULL, session_id TEXT NOT NULL, checked_at TEXT NOT NULL,\n kind TEXT NOT NULL, fields_json TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL,\n PRIMARY KEY(conference_id,session_id,checked_at)\n);\n";
export async function ensureProgramSchema(db:D1Database){const statements=PROGRAM_SCHEMA.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);await db.batch(statements.map(s=>db.prepare(s)))}
async function rows(db:D1Database):Promise<SourceRow[]>{return(await db.prepare('SELECT * FROM public_program_sources').all<SourceRow>()).results}

export async function runProgramCheck(db:D1Database,seed:ProgramSeed,now=new Date(),options:{bootstrap?:boolean;fetcher?:typeof fetch}={}):Promise<{ran:boolean;stopped:boolean}> {
 if(now.getTime()>=Date.parse(PROGRAM_END))return{ran:false,stopped:true};
 let existing:SourceRow[];try{existing=await rows(db)}catch(error){if(!String(error).includes('no such table: public_program_sources'))throw error;await ensureProgramSchema(db);existing=await rows(db)}
 if(options.bootstrap&&PROGRAM_SOURCES.every(s=>existing.some(r=>r.conference_id===s.conferenceId&&r.last_success_at)))return{ran:false,stopped:false};
 const checkedAt=now.toISOString(),cooldown=new Date(now.getTime()-(options.bootstrap?3_600_000:60_000)).toISOString(),lease=new Date(now.getTime()+180_000).toISOString();
 await db.prepare("INSERT INTO public_program_control (id,last_attempt,lease_until) VALUES ('official-program-v2','1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z') ON CONFLICT DO NOTHING").run();
 const claim=await db.prepare("UPDATE public_program_control SET last_attempt=?,lease_until=? WHERE id='official-program-v2' AND lease_until<=? AND last_attempt<? RETURNING id").bind(checkedAt,lease,checkedAt,cooldown).first();if(!claim)return{ran:false,stopped:false};
 try{await Promise.all(PROGRAM_SOURCES.map(async(source:Source)=>{
  const row=existing.find(r=>r.conference_id===source.conferenceId);const previous:Parsed={sessions:row?.sessions_json?JSON.parse(row.sessions_json):seedSessions(seed).filter(s=>s.conferenceId===source.conferenceId),references:row?.reference_json?JSON.parse(row.reference_json):seedReference(seed).filter(s=>s.conferenceId===source.conferenceId)};
  try{
   const raw=await boundedFetch(source.sourceUrl,options.fetcher??fetch),parsed=source.format==='sessionize'?parseSessionize(raw,previous.sessions):parseWhova(raw,previous.sessions,previous.references);validateComplete(parsed,previous,seed);
   if(source.format==='sessionize')await refreshTalkAbstracts(parsed.sessions,checkedAt,options.fetcher??fetch);
   const changes=diffProgram([...previous.sessions,...previous.references],[...parsed.sessions,...parsed.references]);const fingerprint=await hash({...parsed,sessions:parsed.sessions.map(({prepAbstract,...session})=>session)});const message=source.format==='sessionize'?'Complete grid checked: titles, exact times, rooms and speakers. Reviewed talk abstracts checked for preparation-guide freshness; private descriptions are not changed.':'Complete public October 21 agenda checked: titles, exact times, rooms, tracks and speakers. Ticket access and separate organizer pages are not refreshed.';
   const writes=[db.prepare(`INSERT INTO public_program_sources (conference_id,checked_at,last_success_at,status,message,sessions_json,reference_json,hash,changes_json,changed_at) VALUES (?,?,?,'ok',?,?,?,?,?,?) ON CONFLICT(conference_id) DO UPDATE SET checked_at=excluded.checked_at,last_success_at=excluded.last_success_at,status='ok',message=excluded.message,sessions_json=excluded.sessions_json,reference_json=excluded.reference_json,hash=excluded.hash,changes_json=CASE WHEN COALESCE(public_program_sources.hash,'')<>excluded.hash THEN excluded.changes_json ELSE public_program_sources.changes_json END,changed_at=CASE WHEN COALESCE(public_program_sources.hash,'')<>excluded.hash THEN excluded.changed_at ELSE public_program_sources.changed_at END`).bind(source.conferenceId,checkedAt,checkedAt,message,JSON.stringify(parsed.sessions),JSON.stringify(parsed.references),fingerprint,JSON.stringify(changes),changes.length?checkedAt:row?.changed_at??null),db.prepare('INSERT INTO public_program_checks (conference_id,checked_at,status,session_count,changed_count,message) VALUES (?,?,\'ok\',?,?,?) ON CONFLICT DO NOTHING').bind(source.conferenceId,checkedAt,parsed.sessions.length,changes.length,message)];
   for(const change of changes)writes.push(db.prepare('INSERT INTO public_program_changes (conference_id,session_id,checked_at,kind,fields_json,before_json,after_json) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(source.conferenceId,change.id,checkedAt,change.kind,JSON.stringify(change.fields),change.before?JSON.stringify(change.before):null,JSON.stringify(change.after)));
   await db.batch(writes);
  }catch(error){const message=error instanceof SourceError?error.message:'Schedule verification failed. Last complete program kept.';await db.batch([db.prepare(`INSERT INTO public_program_sources (conference_id,checked_at,status,message) VALUES (?,?,'failed',?) ON CONFLICT(conference_id) DO UPDATE SET checked_at=excluded.checked_at,status='failed',message=excluded.message`).bind(source.conferenceId,checkedAt,message),db.prepare("INSERT INTO public_program_checks (conference_id,checked_at,status,session_count,changed_count,message) VALUES (?,?,'failed',?,0,?) ON CONFLICT DO NOTHING").bind(source.conferenceId,checkedAt,previous.sessions.length,message)])}
 }));return{ran:true,stopped:false};}finally{await db.prepare("UPDATE public_program_control SET lease_until=? WHERE id='official-program-v2' AND last_attempt=?").bind(checkedAt,checkedAt).run()}
}
export async function readProgram(db:D1Database,seed:ProgramSeed,now=new Date()):Promise<ProgramPayload>{
 const sources=await rows(db),sessions:PublishedSession[]=[],knownSessions:Session[]=seedSessions(seed).map(toPlannerSession);
 for(const source of PROGRAM_SOURCES){const row=sources.find(r=>r.conference_id===source.conferenceId);sessions.push(...(row?.sessions_json?JSON.parse(row.sessions_json):seedSessions(seed).filter(s=>s.conferenceId===source.conferenceId)))}
 const changes=(await db.prepare('SELECT before_json,after_json FROM public_program_changes ORDER BY checked_at').all<{before_json:string|null;after_json:string}>()).results;
 for(const c of changes){if(c.before_json)knownSessions.push(toPlannerSession(JSON.parse(c.before_json)));knownSessions.push(toPlannerSession(JSON.parse(c.after_json)))}
 const statuses:SourceStatus[]=PROGRAM_SOURCES.map(s=>{const row=sources.find(r=>r.conference_id===s.conferenceId);return{conferenceId:s.conferenceId,name:s.name,sourceUrl:s.sourceUrl,status:row?.status??'not-checked',checkedAt:row?.checked_at??null,lastSuccessAt:row?.last_success_at??null,message:row?.message??'Daily verification has not completed. The bundled organizer snapshot is shown.',sessionCount:sessions.filter(q=>q.conferenceId===s.conferenceId).length,changeCount:row?JSON.parse(row.changes_json).length:0}});
 return{sessions:mergeAfterParty(sessions,ORGANIZER_AFTER_PARTY).map(confirmedSessionRoom),knownSessions:[...knownSessions,...knownSessions.map(confirmedSessionRoom),ORGANIZER_AFTER_PARTY],sources:statuses,stopped:now.getTime()>=Date.parse(PROGRAM_END),stopAt:PROGRAM_END,cadence:'Daily at 9 AM America/Chicago through October 21, 2026'};
}
