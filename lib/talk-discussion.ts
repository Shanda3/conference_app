import source from './event-data.json' with {type:'json'};
import {isNonTalk} from './talk-prep.ts';
export const DISCUSSION_EVENT='thunderplains-2026';
export const DISCUSSION_LIMITS={message:1500,reason:300,bodyBytes:8192,page:60,perMinute:6,perDay:300,minInterval:2000,reportsPerDay:30,flagsPerMinute:10,poll:15000,idlePoll:30000,maxPoll:60000} as const;
export type DiscussionTalk={id:string;conferenceId:string;conferenceName:string;title:string;timeZone:string};
export const DISCUSSION_TALKS:DiscussionTalk[]=source.sessions.filter(s=>!isNonTalk(s)).map(s=>({id:s.id,conferenceId:s.conferenceId,conferenceName:source.conferences.find(c=>c.id===s.conferenceId)!.name,title:s.title,timeZone:source.conferences.find(c=>c.id===s.conferenceId)!.timeZone}));
export class DiscussionError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function discussionTalk(id:unknown,conferenceId?:unknown){const talk=DISCUSSION_TALKS.find(t=>t.id===id&&(conferenceId===undefined||conferenceId===t.conferenceId));if(!talk)throw new DiscussionError('Discussion not found in the verified conference program.',404);return talk;}
export const discussionRoom=(talk:DiscussionTalk)=>`talk:${talk.conferenceId}:${talk.id}`;
export const discussionPath=(talk:DiscussionTalk)=>`/discussions/${encodeURIComponent(talk.id)}`;
export function discussionForSession(s:{id:string;conferenceId:string}){return DISCUSSION_TALKS.find(t=>t.id===s.id&&t.conferenceId===s.conferenceId)}
export function discussionText(value:unknown,max:number=DISCUSSION_LIMITS.message,required=true){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||required&&!value.trim())throw new DiscussionError(`Use plain text, up to ${max} characters.`);return value.trim()}
export function discussionModerators(value:unknown){if(typeof value!=='string'||!value)return new Set<string>();const ids=value.split(',').map(v=>v.trim());if(ids.length>20||ids.some(v=>!/^user_[A-Za-z0-9]{1,80}$/.test(v)))return new Set<string>();return new Set(ids)}
export function isDiscussionModerator(owner:string,value:unknown){return discussionModerators(value).has(owner.slice(owner.lastIndexOf(':')+1))}
export function safeDiscussionLink(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/[\u0000-\u0020\u007f]/.test(value)?url.href:null}catch{return null}}
export function discussionParts(text:string):Array<{text:string;href?:string}>{const parts:Array<{text:string;href?:string}>=[];let end=0;for(const match of text.matchAll(/https:\/\/[^\s<>"']+/g)){const start=match.index!,raw=match[0],clean=raw.replace(/[.,;!?\)\]]+$/,'');if(start>end)parts.push({text:text.slice(end,start)});const href=safeDiscussionLink(clean);parts.push({text:clean,...(href?{href}:{})});if(clean.length<raw.length)parts.push({text:raw.slice(clean.length)});end=start+raw.length}if(end<text.length)parts.push({text:text.slice(end)});return parts}
export function discussionPollDelay(quiet:number,failures:number,jitter=.5){return Math.min(DISCUSSION_LIMITS.maxPoll,(failures?DISCUSSION_LIMITS.poll*2**Math.min(failures,2):quiet>=3?DISCUSSION_LIMITS.idlePoll:DISCUSSION_LIMITS.poll))*(.9+.2*Math.max(0,Math.min(1,jitter)))}
export type DiscussionMessage={id:string;displayName:string;body:string;createdAt:number;isOwn:boolean};
export type DiscussionSnapshot={talk:DiscussionTalk;joined:boolean;displayName:string|null;moderator:boolean;messages:DiscussionMessage[]};
export type DiscussionReport={talk:DiscussionTalk;message:DiscussionMessage;reasons:string[];reportCount:number};
