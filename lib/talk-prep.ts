import data from './talk-prep-data.json' with {type:'json'};
import type {Session} from './planner.ts';
import type {PublishedSession} from './program-model.ts';
import {STACK_CHOICES,INTEREST_CHOICES,validateTalkPreferences} from './talk-preferences.ts';
export type TalkGuide={id:string;conferenceId:string;sourceId:string;title:string;speaker:string;catalogDescription:string;abstractHash:string;reviewedAt:string;sourceUrl:string;detailUrl:string;primer:string;terms:[string,string][];background:string;questions:string[];readings:[string,string][]};
export const TALK_GUIDES=data as TalkGuide[];
export const PREP_MAX_AGE_MS=36*60*60*1000;
export const PREP_EVENT_END='2026-10-22T00:30:00.000Z';
export type PrepResult={status:'ready';guide:TalkGuide;verifiedAt:string;dailyVerified:boolean}|{status:'excluded'|'unreviewed'|'changed'|'stale'};
export function isNonTalk(session:Pick<Session,'title'|'id'>):boolean {
  return /(?:^|\b)(registration|check.in|lunch(?:eon)?|breakfast|after.party|break|reception)(?:\b|$)/i.test(session.title)||session.id==='thunderplains-2026-organizer-after-party';
}
export function hasReviewedTalk(session:Session):boolean{return!isNonTalk(session)&&TALK_GUIDES.some(g=>g.id===session.id&&g.conferenceId===session.conferenceId)}
/** Missing guides are described from the matching published entry, never a private edit or another guide. */
export function prepUnavailableFor(session:Session,published:readonly PublishedSession[],status:'unreviewed'|'changed'|'stale'){
  const current=published.find(s=>s.id===session.id&&s.conferenceId===session.conferenceId&&s.status==='scheduled');
  const canonical=current?.conferenceId==='thunderplains-2026'&&current.id==='thunderplains-2026-'+current.sourceId;
  const kind=canonical&&/^Lightning Talks? \(Round \d+\)$/i.test(current.title)?'lightning':canonical&&/^Panel(?:\s+Discussion)?\s*:/i.test(current.title)?'panel':'session';
  const message=status==='changed'?'This session or its source changed, so the older guide is hidden until reviewed.':status==='stale'?'The abstract check is out of date, so the guide is hidden until it can be verified again.':kind==='lightning'?'A reviewed guide is not available for this lightning round yet. Check the official program for details.':kind==='panel'?'A reviewed preparation guide is not available for this panel yet. Check the official program for panel details and speaker updates.':'A reviewed preparation guide is not available for this session yet. Check the official program for details.';
  return{kind,message,entry:current?{id:current.id,title:current.title,description:current.description.trim()}:null};
}
/** Only a pinned public talk can supply context. A private edit never replaces it. */
export function talkPrepFor(session:Session,published:readonly PublishedSession[],now=Date.now()):PrepResult {
  if(isNonTalk(session))return{status:'excluded'};
  const guide=TALK_GUIDES.find(g=>g.id===session.id&&g.conferenceId===session.conferenceId);
  if(!guide)return{status:'unreviewed'};
  const current=published.find(s=>s.id===guide.id&&s.conferenceId===guide.conferenceId);
  if(!current||current.status!=='scheduled'||current.sourceId!==guide.sourceId||current.title!==guide.title||current.speaker!==guide.speaker||current.description!==guide.catalogDescription||session.title!==guide.title||session.speaker!==guide.speaker||session.description!==guide.catalogDescription)return{status:'changed'};
  const check=current.prepAbstract;
  if(check&&(check.status!=='ok'||check.hash!==guide.abstractHash))return{status:'changed'};
  const verifiedAt=check?.checkedAt??guide.reviewedAt,stamp=Date.parse(verifiedAt);
  if(!Number.isFinite(now)||!Number.isFinite(stamp)||stamp>now+60_000||now-stamp>PREP_MAX_AGE_MS||now>=Date.parse(PREP_EVENT_END))return{status:'stale'};
  return{status:'ready',guide,verifiedAt,dailyVerified:!!check};
}
/** A data contract for future opt-in personalization. It performs no API call. */
export function buildFuturePrepInput(result:PrepResult,preferences:unknown) {
  const chosen=validateTalkPreferences(preferences);
  if(result.status!=='ready'||!chosen.personalizationOptIn||!(chosen.stack.length+chosen.interests.length))return null;
  const labels=(ids:string[],choices:ReadonlyArray<readonly [string,string]>)=>choices.filter(([id])=>ids.includes(id)).map(([,label])=>label);
  return{version:1 as const,publicSession:{id:result.guide.id,title:result.guide.title,summary:result.guide.primer,sourceUrl:result.guide.sourceUrl},selectedStack:labels(chosen.stack,STACK_CHOICES),selectedInterests:labels(chosen.interests,INTEREST_CHOICES)};
}
// No credential, provider, model call, or spend ledger is configured here.
export const LIVE_PREP_PERSONALIZATION_ENABLED=false;
