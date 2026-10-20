import {env} from 'cloudflare:workers';
import{messagingReady,MessagingD1,assertMessagingSchema}from'./messaging-d1';
import{queueMessagePush}from'./push-delivery';
import {getAuthContext} from './auth-context.ts';
import {plannerIdentityMatches} from './talk-preferences.ts';
import {PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError} from './sharing.ts';
import {chatId} from './chat.ts';
import {DISCUSSION_EVENT,DiscussionError,discussionTalk,discussionText,isDiscussionModerator,discussionModerators,discussionRoom} from './talk-discussion.ts';
import {assertDiscussionSchema,DiscussionD1} from './talk-discussion-d1.ts';
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{...PRIVATE_RESPONSE_HEADERS,...extra}});
const failure=(error:unknown)=>json({error:error instanceof DiscussionError||error instanceof SharingError?error.message:'Discussion could not be updated. Reload before trying again.'},error instanceof DiscussionError||error instanceof SharingError?error.status:503);
export async function discussionService(request:Request,mutation=false){
 const auth=getAuthContext();
 if(!auth.user||auth.status!=='authenticated'||!auth.sessionId)throw new DiscussionError('Sign in to open attendee discussions.',401);
 if(auth.eventId!==DISCUSSION_EVENT||(new URL(request.url).origin!=='https://thunderplains.devyo.app'&&env.DEVYO_ENVIRONMENT!=='local'))throw new DiscussionError('Open discussions on the ThunderPlains conference site.',404);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)||(mutation&&request.headers.get('Origin')!==new URL(request.url).origin))throw new DiscussionError('Discussion changes require this site’s exact origin.',403);
 if(!request.headers.get('X-Expected-Devyo-User')||!request.headers.get('X-Expected-Devyo-Session')||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),auth.user.userId,auth.sessionId))throw new DiscussionError('Your sign-in session changed. Reload this discussion.',409);
 if(env.DEVYO_TALK_DISCUSSIONS_ENABLED!=='true'||env.DEVYO_TALK_DISCUSSIONS_SCHEMA_READY!=='true'||env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY!=='true'||!env.DB)throw new DiscussionError('Talk discussions are being prepared.',503);
 if(!discussionModerators(env.DEVYO_TALK_MODERATOR_USER_IDS).size)throw new DiscussionError('Discussion moderation is being prepared.',503);
 await assertDiscussionSchema(env.DB);
 const store=new DiscussionD1(env.DB,auth.user.userId);await store.active();
 return{store,moderator:isDiscussionModerator(auth.user.userId,env.DEVYO_TALK_MODERATOR_USER_IDS)};
}
export async function discussionGET(request:Request){
 try{
  const {store,moderator}=await discussionService(request);const q=new URL(request.url).searchParams;
  if([...new Set(q.keys())].some(k=>q.getAll(k).length!==1))throw new DiscussionError('Use one discussion selector.');
  if(q.get('mode')==='reports'){
   if(q.size!==1)throw new DiscussionError('Unsupported report query.');
   if(!moderator)throw new DiscussionError('Only an approved discussion moderator can review reports.',403);
   return json({reports:await store.reports()});
  }
  if(q.size!==2||!q.has('sessionId')||!q.has('conferenceId'))throw new DiscussionError('Choose a verified talk and conference.');
  const talk=discussionTalk(q.get('sessionId'),q.get('conferenceId'));
  const result=await store.read(talk,messagingReady(env)?null:request.headers.get('If-None-Match'),moderator);
  if(!result.data)return new Response(null,{status:304,headers:{...PRIVATE_RESPONSE_HEADERS,ETag:result.etag!}});
  if(messagingReady(env)&&result.data?.joined){await assertMessagingSchema(env.DB!);return json({...result.data,messagingEnabled:true,messages:await new MessagingD1(env.DB!,getAuthContext().user!.userId).decorate("talk",discussionRoom(talk),result.data.messages)})}
  return json(result.data,200,result.etag?{ETag:result.etag}:{});
 }catch(error){return failure(error)}
}
export async function discussionPOST(request:Request){
 try{
  if(new URL(request.url).search)throw new DiscussionError('Discussion actions use a JSON body.');
  const {store,moderator}=await discussionService(request,true);
  const body=await readSharingBody(request) as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body))throw new DiscussionError('Use a discussion action.');
  const action=body.action;
  const extras=action==='join'?[]:action==='send'?['message','requestId']:action==='delete'?['messageId']:['hide','report','moderate-remove','resolve-reports'].includes(String(action))?['messageId','reason']:null;
  if(!extras)throw new DiscussionError('Unsupported discussion action.');
  const keys=['action','conferenceId','sessionId',...extras];
  const required=['action','conferenceId','sessionId',...(action==='send'?['message','requestId']:action!=='join'?['messageId']:[])];
  if(Object.keys(body).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(body,k)))throw new DiscussionError('The request has missing or unsupported fields.');
  const talk=discussionTalk(body.sessionId,body.conferenceId);
  if(action==='join'){await store.join(talk);return json({joined:true})}
  if(action==='moderate-remove'||action==='resolve-reports'){
   if(!moderator)throw new DiscussionError('Only an approved discussion moderator can do that.',403);
   await store.moderate(talk,chatId(body.messageId),action==='moderate-remove'?'remove':'resolve',discussionText(body.reason,300));
   return json({reviewed:true,removed:action==='moderate-remove'});
  }
  if(action==='send'){const result=await store.send(talk,discussionText(body.message),body.requestId);if(!result.replayed)try{await queueMessagePush(env,'talk',discussionRoom(talk),result.message.id)}catch{/* Optional push is independent of message persistence. */}return json(result,result.replayed?200:201)}
  if(action==='delete'){await store.ownRemove(talk,chatId(body.messageId));return json({deleted:true})}
  return json(await store.flag(talk,chatId(body.messageId),action as 'hide'|'report',discussionText(body.reason??'',300,false)));
 }catch(error){if(error instanceof Error&&error.message.startsWith('Invalid message'))return json({error:error.message},400);return failure(error)}
}
