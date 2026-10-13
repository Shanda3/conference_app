// Drafts and public branding only. No provider SDK, tracking or automatic posting.
export const SOCIAL_PLAN_TEXT='Here are my conference plans on Devyo. Sign in to see the sessions I’m attending.';
export const EVENT_ORIGIN='https://thunderplains.devyo.app';
export const PLAN_BRANDS={thunderplains:{name:'ThunderPlains',caption:'Here are my ThunderPlains conference plans.',logo:true},innotech:{name:'InnoTech Oklahoma',caption:'Here are my InnoTech Oklahoma conference plans.',logo:false},'thunderplains-innotech':{name:'ThunderPlains + InnoTech',caption:'Here are my ThunderPlains and InnoTech conference plans.',logo:true},conference:{name:'Conference',caption:'Here are my conference plans on Devyo.',logo:false}} as const;
export type PlanBrand=keyof typeof PLAN_BRANDS;
export function eventHomeUrl(origin?:string){return origin&&['https://devyo.app',EVENT_ORIGIN].includes(origin)?EVENT_ORIGIN+'/':'/'}
export function eventShareOrigin(origin:string){return['https://devyo.app',EVENT_ORIGIN].includes(origin)?EVENT_ORIGIN:origin}
/** Only names returned by the reviewed public schedule are recognized; arbitrary private fields cannot enter captions. */
export function planBrand(sessions:ReadonlyArray<{conferenceName:string}>):PlanBrand{
 const names=new Set(sessions.map(session=>session.conferenceName));const tp=names.has('ThunderPlains 2026'),ino=names.has('InnoTech Oklahoma 2026');
 return tp&&ino?'thunderplains-innotech':tp?'thunderplains':ino?'innotech':'conference';
}
export function planCaption(brand:PlanBrand){return PLAN_BRANDS[brand].caption+' Sign in to see the sessions I’m attending.'}
export function validPrivateShareLink(link:string){try{const url=new URL(link);if(url.protocol!=='https:'||!['devyo.app','thunderplains.devyo.app'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!/^\/share\/[A-Za-z0-9_-]{43}$/.test(url.pathname))return null;return url}catch{return null}}
/** Fragment keeps the capability out of public card/image requests and crawler metadata. */
export function socialCardLink(link:string,brand:PlanBrand){const url=validPrivateShareLink(link);return url?`${EVENT_ORIGIN}/plan/${brand}#plan=${url.pathname.slice('/share/'.length)}`:null}
export function socialPlanLinks(link:string,brand:PlanBrand='conference'){
 const url=socialCardLink(link,brand);if(!url)return[];const text=planCaption(brand);
 return[{name:'Bluesky',href:'https://bsky.app/intent/compose?'+new URLSearchParams({text:text+'\n'+url})},{name:'X',href:'https://x.com/intent/tweet?'+new URLSearchParams({text,url})},{name:'LinkedIn',href:'https://www.linkedin.com/sharing/share-offsite/?'+new URLSearchParams({url})}];
}
