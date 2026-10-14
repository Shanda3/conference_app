import {validateState,type Connection,type PlannerState} from './planner.ts';
export const SOCIAL_EVENT='thunderplains-2026';
export const SOCIAL_CONFERENCES=['thunderplains-2026','innotech-oklahoma-2026'] as const;
export const CONNECTION_LIMITS={minimumIntervalMs:3000,perMinute:6,perDay:50,recipientPerDay:50,pollMs:60000} as const;
export class AttendeeSocialError extends Error {readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function socialId(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(value))throw new AttendeeSocialError('Attendee or notification unavailable.',404);return value}
export function socialRevision(value:unknown){if(!Number.isSafeInteger(value)||(value as number)<0||(value as number)>=Number.MAX_SAFE_INTEGER)throw new AttendeeSocialError('Reload before saving.',409);return value as number}
export function connectionDraft(value:unknown,state:PlannerState):Connection{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AttendeeSocialError('Review the connection before saving.');
 try{return validateState({...state,connections:[value]}).connections[0]}catch{throw new AttendeeSocialError('Check your connection details and conference.')}
}
export function connectionMember(connection:Connection){if(!connection.id.startsWith('member-'))throw new AttendeeSocialError('Choose an attendee from the directory.');return socialId(connection.id.slice(7))}
export type PublicCommunity={id:string;relationship:'member'|'interested'};
export type CommunityChoice=PublicCommunity;
export type CommunityDefinition={id:string;name:string;url:string;linkLabel?:string;aliases?:readonly string[]};
export const COMMUNITY_DIRECTORY='https://www.techlahoma.org/user-groups/';
/** Verified public links, October 14, 2026. Choices are self-selected, never verified memberships. */
export const COMMUNITIES:readonly CommunityDefinition[]=[
 {id:'shecodesokc',name:'SheCodesOKC',url:'https://shecodesokc.org/'},
 {id:'okc-coffee-and-code',name:'OKC Coffee and Code',url:'https://www.meetup.com/okccoffeeandcode/'},
 {id:'okc-web-devs',name:'OKC Web Devs',url:'https://www.meetup.com/okcwebdevs/'},
 {id:'okc-lugnuts',name:'OKC LUGnuts',url:'https://www.meetup.com/okc-lugnuts/'},
 {id:'okc-java',name:'Oklahoma City Java User’s Group',url:'https://www.meetup.com/oklahoma-city-java-user-group/'},
 {id:'okc-open-source-hardware',name:'Oklahoma City Open Source Hardware',url:'https://www.meetup.com/okc-osh/'},
 {id:'oklahoma-game-developers',name:'Oklahoma Game Developers',url:'https://www.meetup.com/oklahoma-game-developers/'},
 {id:'oklahoma-salesforce',name:'Oklahoma Salesforce Community',url:'https://www.meetup.com/salesforce-meetup-group/'},
 {id:'pythonistas',name:'Pythonistas',url:'https://www.meetup.com/pythonistas/'},
 {id:'ux-connect-okc',name:'UX Connect OKC',url:COMMUNITY_DIRECTORY,linkLabel:'View the official group directory'},
 {id:'aws-tulsa',name:'AWS Tulsa',url:'https://www.meetup.com/tulsa-aws/'},
 {id:'tulsa-agile',name:'Tulsa Agile Practitioners',url:'https://www.meetup.com/tulsaagilepractitioners/'},
 {id:'tulsa-game-devs',name:'Tulsa Game Devs',url:'https://www.meetup.com/tulsa-game-developers/'},
 {id:'tulsa-tech-entrepreneurs',name:'Tulsa Tech Entrepreneurs',url:COMMUNITY_DIRECTORY,linkLabel:'View the official group directory'},
 {id:'tulsa-ux',name:'Tulsa UX',url:'https://www.meetup.com/tulsa-ux-user-group/'},
 {id:'tulsa-web-devs',name:'Tulsa Web Devs',url:'https://www.meetup.com/tulsa-web-devs/'},
 {id:'tulsa-developers',name:'Tulsa Developers Association / Tulsa.Net',url:'https://www.meetup.com/tulsadevelopers-net/'},
 {id:'urban-coders-guild',name:'Urban Coders Guild Professional',url:COMMUNITY_DIRECTORY,linkLabel:'View the official group directory'},
 {id:'oklahomai-okc',name:'OklahomAI OKC',aliases:['OK AI','Oklahoma AI'],url:'https://www.meetup.com/oklahom_ai/'},
];
export function communityDefinition(id:unknown){return COMMUNITIES.find(c=>c.id===id)}
export function communityMatches(group:CommunityDefinition,query:string){const normalize=(text:string)=>text.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g,'');return [group.name,group.id,...group.aliases??[]].some(label=>normalize(label).includes(normalize(query)))}
export function validateCommunities(value:unknown):CommunityChoice[]{
 if(!Array.isArray(value)||value.length>COMMUNITIES.length)throw new AttendeeSocialError('Choose communities from the list.');
 const seen=new Set<string>();return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['id','relationship'].includes(k))||!communityDefinition(item.id)||!['member','interested'].includes(item.relationship)||seen.has(item.id))throw new AttendeeSocialError('Choose one relationship for each listed community.');
  seen.add(item.id);return{id:item.id,relationship:item.relationship};
 });
}
export function publicCommunities(value:unknown):PublicCommunity[]{try{return validateCommunities(typeof value==='string'?JSON.parse(value):value)}catch{return []}}
