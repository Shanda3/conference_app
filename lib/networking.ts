import {validateSharedSchedule,type SharedSchedule,type VerifiedCatalog} from './sharing.ts';
export const NETWORKING_EVENT = 'thunderplains-2026' as const;
export const NETWORKING_OPTIONS = {
 interests:[['ai-agents','AI agents'],['web-apps','Web development'],['data','Data & analytics'],['security','Security'],['accessibility','Accessibility'],['testing','Testing & quality'],['cloud','Cloud & DevOps'],['leadership','Engineering leadership'],['open-source','Open source'],['career','Career growth']],
 stack:[['javascript','JavaScript'],['typescript','TypeScript'],['react','React'],['node','Node.js'],['python','Python'],['php-laravel','PHP / Laravel'],['dotnet','C# / .NET'],['java','Java'],['go','Go'],['sql','SQL'],['cloud-platforms','Cloud platforms'],['exploring','Still exploring']],
 goals:[['meet-peers','Meet peers'],['find-collaborators','Find collaborators'],['learn-together','Learn together'],['find-mentor','Find a mentor'],['offer-mentoring','Offer mentoring'],['discuss-projects','Discuss projects'],['meet-local','Meet local developers'],['open-source','Join open source']],
} as const;
export type NetworkingCategory=keyof typeof NETWORKING_OPTIONS;
export const NETWORKING_CATEGORIES:NetworkingCategory[]=['interests','stack','goals'];
export const NETWORKING_MAX=6;
export type NetworkingDraft=Record<NetworkingCategory,string[]>;
export type NetworkingProfile={draft:NetworkingDraft;visible:boolean;revision:number};
export type NetworkingReview={displayName:string;networking:NetworkingDraft;reviewHash:string;revision:number};
export type NetworkingMember={id:string;displayName:string;me:number;shared:number;linkedInUrl?:string;networking:NetworkingDraft;sharedInterests:number};
export type NetworkingPage={members:NetworkingMember[];nextCursor:string|null;hasMore:boolean;sort:'name'|'shared';sharedSortAvailable:boolean;epoch:number};
export class NetworkingError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export const emptyNetworking=():NetworkingDraft=>({interests:[],stack:[],goals:[]});
export const networkingLabel=(category:NetworkingCategory,id:string)=>NETWORKING_OPTIONS[category].find(([key])=>key===id)?.[1]??'';
export function networkingObject(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw new NetworkingError('Choose valid networking settings.');return value as Record<string,unknown>;
}
function selected(category:NetworkingCategory,value:unknown):string[]{
 if(!Array.isArray(value)||value.length>NETWORKING_MAX||value.some(id=>typeof id!=='string'||!NETWORKING_OPTIONS[category].some(([key])=>key===id))||new Set(value).size!==value.length)throw new NetworkingError('Choose up to six valid options in each group.');return [...value].sort();
}
export function validateNetworkingDraft(value:unknown):NetworkingDraft{const b=networkingObject(value,NETWORKING_CATEGORIES);return{interests:selected('interests',b.interests),stack:selected('stack',b.stack),goals:selected('goals',b.goals)}}
export function networkingRevision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>=Number.MAX_SAFE_INTEGER)throw new NetworkingError('Reload your networking settings before saving.');return value as number}
export function networkingQuery(params:URLSearchParams){
 if([...params.keys()].some(k=>!['interests','stack','goals','sort','cursor','limit'].includes(k))||['sort','cursor','limit'].some(k=>params.getAll(k).length>1))throw new NetworkingError('Unsupported attendee filter.');
 const sort=params.get('sort')??'name',limit=Number(params.get('limit')??20),cursor=params.get('cursor');
 if(!['name','shared'].includes(sort)||!Number.isSafeInteger(limit)||limit<1||limit>50||cursor!==null&&cursor.length>1024)throw new NetworkingError('Choose valid attendee filters and sort.');
 return{...validateNetworkingDraft(Object.fromEntries(NETWORKING_CATEGORIES.map(k=>[k,params.getAll(k)]))),sort:sort as 'name'|'shared',limit,cursor};
}
/** Do not republish or trim mixed legacy plans. Only an entirely canonical TP snapshot is eligible. */
export function canonicalThunderPlainsPlan(raw:string|undefined|null,catalog:VerifiedCatalog):SharedSchedule|null{
 try{if(!raw)return null;const plan=validateSharedSchedule(JSON.parse(raw));if(!plan.sessions.length)return null;
 const event=catalog.conferences.find(c=>c.id===NETWORKING_EVENT);if(!event)return null;
 const signature=(s:SharedSchedule['sessions'][number])=>JSON.stringify([s.title,s.conferenceName,new Date(s.start).toISOString(),new Date(s.end).toISOString(),s.timeZone,s.room,s.speaker,s.url]);
 const canonical=new Set(catalog.sessions.filter(s=>s.conferenceId===event.id).map(s=>signature({title:s.title,conferenceName:event.name,start:s.start,end:s.end,timeZone:event.timeZone,room:s.room,speaker:s.speaker,url:s.url})));
 if(plan.sessions.some(s=>!canonical.has(signature(s))))return null;return plan;
 }catch{return null}
}
