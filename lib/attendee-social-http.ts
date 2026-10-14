import seed from'./event-data.json'with{type:'json'};
import{readProgram}from'./program-sync.ts';
import type{ProgramSeed}from'./program-model.ts';
import {env} from 'cloudflare:workers';
import {getAuthContext} from './auth-context.ts';
import {plannerIdentityMatches} from './talk-preferences.ts';
import {PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError} from './sharing.ts';
import {SOCIAL_EVENT,AttendeeSocialError,socialId,socialRevision,validateCommunities} from './attendee-social.ts';
import {AttendeeSocialD1,assertSocialSchema} from './attendee-social-d1.ts';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:PRIVATE_RESPONSE_HEADERS});
export async function attendeeSocialService(request:Request,mutation=false){
 const auth=getAuthContext();if(!auth.user||auth.status!=='authenticated'||!auth.sessionId)throw new AttendeeSocialError('Sign in to use conference connections.',401);
 if(auth.eventId!==SOCIAL_EVENT||(new URL(request.url).origin!=='https://thunderplains.devyo.app'&&env.DEVYO_ENVIRONMENT!=='local'))throw new AttendeeSocialError('Open this on the ThunderPlains conference site.',404);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin||mutation&&request.headers.get('Origin')!==new URL(request.url).origin)throw new AttendeeSocialError('Changes require this conference’s exact origin.',403);
 if(!request.headers.get('X-Expected-Devyo-User')||!request.headers.get('X-Expected-Devyo-Session')||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),auth.user.userId,auth.sessionId))throw new AttendeeSocialError('Your sign-in session changed. Reload before continuing.',409);
 if(env.DEVYO_ATTENDEE_SOCIAL_SCHEMA_READY!=='true'||env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY!=='true'||!env.DB)throw new AttendeeSocialError('Conference connections are being prepared.',503);
 await assertSocialSchema(env.DB);const store=new AttendeeSocialD1(env.DB,auth.user.userId);await store.active();return store;
}
function keys(body:Record<string,unknown>,required:string[],optional:string[]=[]){if(required.some(k=>!Object.hasOwn(body,k))||Object.keys(body).some(k=>![...required,...optional].includes(k)))throw new AttendeeSocialError('The request has missing or unsupported fields.')}
function notificationsEnabled(){if(env.DEVYO_CONNECTION_NOTIFICATIONS_ENABLED!=='true')throw new AttendeeSocialError('Connection notifications are being prepared.',503)}
function failure(error:unknown){if(error instanceof AttendeeSocialError||error instanceof SharingError)return json({error:error.message},error.status);if(error instanceof Error&&error.message.includes('Connection limit'))return json({error:'Connection saving is limited to one new attendee every 3 seconds, 6 per minute, and 50 per day. An attendee can receive up to 50 notices per day. Try again later; your connection was not saved.'},429);if(error instanceof Error&&error.message.includes('Attendee unavailable'))return json({error:'Attendee unavailable.'},404);return json({error:'Conference connections could not be updated. Reload before trying again.'},503)}
export async function attendeeSocialGET(request:Request){try{
 const store=await attendeeSocialService(request),q=new URL(request.url).searchParams;if(q.size!==1||!q.has('mode')||q.getAll('mode').length!==1)throw new AttendeeSocialError('Choose one view.');
 if(q.get('mode')==='notifications'){notificationsEnabled();return json(await store.notifications())}
 if(q.get('mode')==='settings')return json({...await store.settings(),communitiesEnabled:env.DEVYO_COMMUNITIES_ENABLED==='true',notificationsEnabled:env.DEVYO_CONNECTION_NOTIFICATIONS_ENABLED==='true'});
 throw new AttendeeSocialError('Unsupported view.');
 }catch(e){return failure(e)}}
export async function attendeeSocialPOST(request:Request){try{
 if(new URL(request.url).search)throw new AttendeeSocialError('Use a JSON action.');const store=await attendeeSocialService(request,true),body=await readSharingBody(request,16384) as Record<string,unknown>;if(!body||typeof body!=='object'||Array.isArray(body))throw new AttendeeSocialError('Use a valid action.');
 if(body.action==='save-connection'){notificationsEnabled();keys(body,['action','connection','revision']);const official=env.DEVYO_PROGRAM_SYNC_ENABLED==='true'?(await readProgram(env.DB!,seed as unknown as ProgramSeed)).sessions:undefined;return json(await store.saveConnection(body.connection,socialRevision(body.revision),Date.now(),official))}
 if(body.action==='read'||body.action==='dismiss'){notificationsEnabled();keys(body,['action','id']);return json(await store.notificationAction(socialId(body.id),body.action))}
 if(body.action==='block'||body.action==='unblock'){keys(body,['action','memberId']);return json({...await store.block(socialId(body.memberId),body.action==='block'),communitiesEnabled:env.DEVYO_COMMUNITIES_ENABLED==='true',notificationsEnabled:env.DEVYO_CONNECTION_NOTIFICATIONS_ENABLED==='true'})}
 if(body.action==='settings'){
  keys(body,['action','revision'],['communities','allowNotifications']);if(!Object.hasOwn(body,'communities')&&!Object.hasOwn(body,'allowNotifications'))throw new AttendeeSocialError('Choose a setting to update.');
  if(Object.hasOwn(body,'allowNotifications')&&typeof body.allowNotifications!=='boolean')throw new AttendeeSocialError('Choose whether to allow notifications.');
  const choices=Object.hasOwn(body,'communities')?validateCommunities(body.communities):undefined;
  if(env.DEVYO_COMMUNITIES_ENABLED!=='true'&&choices?.length)throw new AttendeeSocialError('Community badges are being prepared.',503);
  return json({...await store.updateSettings(socialRevision(body.revision),{...(choices?{communities:choices}:{}),...(typeof body.allowNotifications==='boolean'?{allowNotifications:body.allowNotifications}:{})}),communitiesEnabled:env.DEVYO_COMMUNITIES_ENABLED==='true',notificationsEnabled:env.DEVYO_CONNECTION_NOTIFICATIONS_ENABLED==='true'});
 }
 throw new AttendeeSocialError('Unsupported action.');
 }catch(e){return failure(e)}}
