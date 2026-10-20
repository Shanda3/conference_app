import type {Session} from './planner.ts';
import type {PublishedSession} from './program-model.ts';
import {isNonTalk,TALK_GUIDES,talkPrepFor,PREP_EVENT_END} from './talk-prep.ts';

export type AISourceBasis='reviewed-guide'|'official-description'|'title-only';
export type AIPrepSource={id:string;title:string;catalogDescription:string;sourceUrl:string;abstractHash:string;basis?:AISourceBasis};
export type AISessionSource={eligible:true;source:AIPrepSource;basis:AISourceBasis;limitation:string}|{eligible:false;reason:string};
const whova='https://whova.com/embedded/session/8DafSwBx7usrDvwSDIsZZFzlUZta5B%40sh3%40JWy6Q6sY%3D/';
const sessionize='https://sessionize.com/api/v2/xtaduary/view/GridSmart?under=True';
const invalidText=(s:string)=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
/** Select only server-published canonical program metadata. Never read a planner's edited fields. */
export function aiSessionSource(session:Pick<Session,'id'|'conferenceId'>,published:readonly PublishedSession[],now=Date.now()):AISessionSource {
 const current=published.find(s=>s.id===session.id&&s.conferenceId===session.conferenceId);
 const denied=(reason='AI questions are available only for supported, active official sessions.'):AISessionSource=>({eligible:false,reason});
 if(!current||current.status!=='scheduled'||!Number.isFinite(now)||now>=Date.parse(PREP_EVENT_END))return denied();
 const tp=current.conferenceId==='thunderplains-2026'&&/^(?:\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(current.sourceId)&&current.id==='thunderplains-2026-'+current.sourceId&&current.sourceUrl===sessionize;
 const inno=current.conferenceId==='innotech-oklahoma-2026'&&/^\d+$/.test(current.sourceId)&&current.id==='innotech-oklahoma-2026-whova-'+current.sourceId&&current.sourceUrl===whova+current.sourceId+'/';
 if(!tp&&!inno)return denied();
 // This named executive luncheon has a separately described talk; generic meals and breaks do not.
 const executiveTalk=inno&&current.sourceId==='5479389'&&/^IT Executive Luncheon - .+/.test(current.title);
 if((isNonTalk(current)&&!executiveTalk)||/^Lightning Talks?(?:\s*\(Round \d+\))?$/i.test(current.title.trim()))return denied('AI questions are unavailable for breaks, meals, receptions and lightning-round listings without individual topics.');
 if(typeof current.title!=='string'||!current.title.trim()||current.title.length>240||invalidText(current.title)||typeof current.description!=='string'||current.description.length>8000||invalidText(current.description))return denied('This official entry is missing usable session metadata.');
 if(TALK_GUIDES.some(g=>g.id===current.id&&g.conferenceId===current.conferenceId)){
  const prep=talkPrepFor(current,published,now);if(prep.status!=='ready')return denied('This abstract needs a fresh review before AI preparation.');
  return{eligible:true,source:prep.guide,basis:'reviewed-guide',limitation:'Based on the reviewed public abstract. Suggested questions are not a record or promise of speaker coverage.'};
 }
 // Ticket and timing notices are not descriptions of a talk's subject matter.
 const description=current.description.split(/\n\s*\n/).filter(p=>! /^(?:Separate Women in Tech Summit ticket required|Separately ticketed premium program|Timing note:)/.test(p.trim())).join('\n\n').trim();
 const basis=description?'official-description':'title-only',sourceUrl=inno?whova+current.sourceId+'/':'https://2026.thunderplainsconf.com/#sz-session-'+current.sourceId;
 return{eligible:true,basis,source:{id:current.id,title:current.title.trim(),catalogDescription:description,sourceUrl,abstractHash:JSON.stringify([current.id,current.conferenceId,current.title,current.description,sourceUrl,basis]),basis},limitation:basis==='title-only'?'The official program has no detailed description. Questions use only this title and any notes you explicitly select; they cannot describe what the speaker will cover.':'Based on the official program description, without a reviewed preparation guide. Questions are suggestions, not a record or promise of speaker coverage.'};
}
export async function aiContextHash(source:AIPrepSource):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([source.id,source.title,source.catalogDescription,source.sourceUrl,source.abstractHash,source.basis??'reviewed-guide'])));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
