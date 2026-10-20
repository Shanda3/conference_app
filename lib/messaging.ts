export const REACTION_EMOJIS=['👍','❤️','🎉','😂','👀'] as const;
export type ReactionEmoji=typeof REACTION_EMOJIS[number];
export type MessageScope='group'|'conference'|'talk';
export type ReactionCount={emoji:ReactionEmoji;count:number;mine:boolean};
export type ChatActivityRoom={id:string;name:string;scope:MessageScope;unread:number;muted:boolean;archived?:boolean};
export type ChatActivity={enabled:boolean;groups:ChatActivityRoom[];rooms:ChatActivityRoom[];total:number};
export const EMPTY_CHAT_ACTIVITY:ChatActivity={enabled:false,groups:[],rooms:[],total:0};
export class MessagingError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function messageScope(value:unknown):MessageScope{if(typeof value!=='string'||!['group','conference','talk'].includes(value))throw new MessagingError('Choose a supported conversation.');return value as MessageScope}
export function messageRoom(value:unknown){if(typeof value!=='string'||!value||value.length>240||!/^[A-Za-z0-9:_-]+$/.test(value))throw new MessagingError('Choose a valid conversation.');return value}
export function reactionEmoji(value:unknown):ReactionEmoji{if(!REACTION_EMOJIS.includes(value as ReactionEmoji))throw new MessagingError('Choose one of the listed reactions.');return value as ReactionEmoji}
export function messageId(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value))throw new MessagingError('Choose a valid message.');return value}
export function pushEndpoint(value:unknown){if(typeof value!=='string'||value.length>4096)throw new MessagingError('Use this browser’s notification subscription.');let u:URL;try{u=new URL(value)}catch{throw new MessagingError('Use a valid notification endpoint.')}
 const h=u.hostname,known=h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com');
 if(!known||u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')throw new MessagingError('This notification service is not supported.');return u.href;
}
export async function endpointId(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),b=>b.toString(16).padStart(2,'0')).join('')}
export const badgeCount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?Math.min(value,9999):0;
