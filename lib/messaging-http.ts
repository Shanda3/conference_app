import{env}from'cloudflare:workers';
import{getAuthContext}from'./auth-context';
import{plannerIdentityMatches}from'./talk-preferences';
import{PRIVATE_RESPONSE_HEADERS,readSharingBody,objectWithKeys,SharingError,assertSameOrigin}from'./sharing';
import{MessagingError,messageScope,messageRoom,messageId,reactionEmoji}from'./messaging.ts';
import{MessagingD1,messagingReady,assertMessagingSchema}from'./messaging-d1.ts';
export const messagingJSON=(data:unknown,status=200)=>Response.json(data,{status,headers:PRIVATE_RESPONSE_HEADERS});
export const messagingFailure=(e:unknown)=>messagingJSON({error:e instanceof MessagingError||e instanceof SharingError?e.message:'Chat updates could not be loaded. Please retry.'},e instanceof MessagingError||e instanceof SharingError?e.status:503);
export async function messagingPrincipal(request:Request,mutation=false,badge=false){
 const auth=getAuthContext();if(auth.status!=='authenticated'||!auth.user||!auth.sessionId)throw new MessagingError('Sign in to open your chats.',401);
 if(auth.eventId!=='thunderplains-2026'||new URL(request.url).origin!=='https://thunderplains.devyo.app'&&env.DEVYO_ENVIRONMENT!=='local')throw new MessagingError('Open this on the ThunderPlains site.',404);
 if(mutation)assertSameOrigin(request);else if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)throw new MessagingError('Use this site to open your chats.',403);
 if(!badge&&!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),auth.user.userId,auth.sessionId))throw new MessagingError('Your sign-in session changed. Reload.',409);
 if(!env.DB)throw new MessagingError('Chat updates are being prepared.',503);const store=new MessagingD1(env.DB,auth.user.userId);await store.active();return{store,auth};
}
export async function messagingGET(request:Request){try{
 const q=new URL(request.url).searchParams;if(q.size!==1||!['summary','badge'].includes(q.get('view')??''))throw new MessagingError('Choose a chat summary.');const badge=q.get('view')==='badge',{store}=await messagingPrincipal(request,false,badge);
 if(!messagingReady(env))return messagingJSON(badge?{total:0}:{enabled:false,groups:await store.groups(),rooms:[],total:0});await assertMessagingSchema(store.db);const result=await store.summary();return messagingJSON(badge?{total:result.total}:result);
 }catch(e){return messagingFailure(e)}}
export async function messagingPOST(request:Request){try{
 if(new URL(request.url).search)throw new MessagingError('Send chat actions as JSON.');const{store}=await messagingPrincipal(request,true);if(!messagingReady(env))throw new MessagingError('Chat updates are being prepared.',503);await assertMessagingSchema(store.db);
 const raw=await readSharingBody(request,4096);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new MessagingError('Choose a chat action.');const action=(raw as{action?:unknown}).action;
 const fields=action==='read'?['action','scope','room','messageId']:action==='mute'?['action','scope','room','muted']:action==='react'?['action','scope','room','messageId','emoji','active']:null;if(!fields)throw new MessagingError('Choose a supported chat action.');const b=objectWithKeys(raw,fields),scope=messageScope(b.scope),room=messageRoom(b.room);
 if(action==='read')await store.read(scope,room,messageId(b.messageId));else if(action==='mute'){if(typeof b.muted!=='boolean')throw new MessagingError('Choose whether to mute this chat.');await store.mute(scope,room,b.muted)}else{if(typeof b.active!=='boolean')throw new MessagingError('Choose whether to add or remove this reaction.');await store.react(scope,room,messageId(b.messageId),reactionEmoji(b.emoji),b.active)}
 return messagingJSON({saved:true});
 }catch(e){return messagingFailure(e)}}
