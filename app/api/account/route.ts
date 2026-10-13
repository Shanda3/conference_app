import {env} from 'cloudflare:workers';import {reverificationErrorResponse} from '@clerk/shared/authorization-errors';
import {getAuthContext} from '@/lib/auth-context';import {readAuthConfig} from '@/lib/clerk-auth';
import {deletionPreview,issueDeletionPreview,validateDeletionRequest,requestAccountDeletion,processAccountDeletion,deletionJob,AccountDeletionError} from '@/lib/account-deletion';
import {deleteClerkIdentity,verifyAccountDeletionInstance} from '@/lib/account-identity';import {assertSameOrigin,PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError} from '@/lib/sharing';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200,completeRequest?:Request)=>{const headers=new Headers(PRIVATE_RESPONSE_HEADERS);if(completeRequest){const origin=new URL(completeRequest.url).origin;headers.append('Set-Cookie',`devyo-account-deleted=1; Path=/sign-in; HttpOnly; SameSite=Lax; Max-Age=120${['https://devyo.app','https://thunderplains.devyo.app'].includes(origin)?'; Domain=devyo.app; Secure':''}`)}return Response.json(value,{status,headers})};
export async function GET(request:Request){
 try{if(env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY!=='true')return json({error:'Secure account deletion is being prepared. Please contact the organizer.'},503);const {user,sessionId}=getAuthContext();if(!user)return json({error:'Sign in to manage your account.'},401);
 if(!env.DB)return json({error:'Account deletion is temporarily unavailable.'},503);
 const expected=request.headers.get('X-Expected-Devyo-Session');if(expected&&expected!==sessionId)return json({error:'Your sign-in session changed. Open account settings again.'},409);
 if(new URL(request.url).search==='?status=1'){const job=await deletionJob(env.DB,user.userId);return json({status:job?.phase??'active',counts:{shareLinks:0,authoredMessages:0,noteCount:0},ownedGroups:[]},200,job?.phase==='complete'?request:undefined)}
 const details=await deletionPreview(env.DB,user.userId);return json(details,200,details.status==='complete'?request:undefined);}
 catch{return json({error:'Account deletion details could not be loaded.'},503)}
}
export async function POST(request:Request){
 try{if(env.DEVYO_ACCOUNT_DELETION_ENABLED!=='true')return json({error:'Secure account deletion is being prepared. Please contact the organizer.'},503);const auth=getAuthContext();if(!auth.user||!auth.sessionId)return json({error:'Sign in to review your account.'},401);assertSameOrigin(request);const body=await readSharingBody(request);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||(body as {action?:unknown}).action!=='preview')throw new SharingError('Choose account deletion review.');if((body as {expectedSessionId?:unknown}).expectedSessionId!==auth.sessionId)throw new AccountDeletionError('Your signed-in account changed. Open account settings again.',409);const config=readAuthConfig(env);if(!config?.instanceId||!env.DB)return json({error:'Account deletion is temporarily unavailable.'},503);await verifyAccountDeletionInstance(config);return json(await issueDeletionPreview(env.DB,auth.user.userId,auth.sessionId))}
 catch(error){return json({error:error instanceof SharingError||error instanceof AccountDeletionError?error.message:'Account deletion review could not be prepared.'},error instanceof SharingError||error instanceof AccountDeletionError?error.status:503)}
}
export async function DELETE(request:Request){
 try{
 if(env.DEVYO_ACCOUNT_DELETION_ENABLED!=='true')return json({error:'Secure account deletion is being prepared. Please contact the organizer.'},503);
  const auth=getAuthContext();if(!auth.user)return json({error:'Sign in to manage your account.'},401);
  assertSameOrigin(request);
  if(!auth.recentlyVerified){const response=reverificationErrorResponse('strict');for(const [k,v]of Object.entries(PRIVATE_RESPONSE_HEADERS))response.headers.set(k,v);return response;}
  const body=validateDeletionRequest(await readSharingBody(request));const config=readAuthConfig(env);if(!config?.instanceId||!env.DB)return json({error:'Account deletion is temporarily unavailable.'},503);
  if(!auth.sessionId)return json({error:'Verify your sign-in session again.'},403);
  await requestAccountDeletion(env.DB,auth.user.userId,body.closeOwnedGroups,body.ownedGroupIds,{previewToken:body.previewToken,sessionId:auth.sessionId});
  const status=await processAccountDeletion(env.DB,auth.user.userId,owner=>deleteClerkIdentity(config,owner));
  return json({status,deleted:status==='complete'},status==='complete'?200:202,status==='complete'?request:undefined);
 }catch(error){if(error instanceof SharingError||error instanceof AccountDeletionError)return json({error:error.message},error.status);return json({error:'Your request could not be confirmed. Check account status before retrying.'},503)}
}
