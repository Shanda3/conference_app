import {getAuthContext} from './auth-context.ts';
import type {AuthContext} from './auth-context.ts';
import {readAuthConfig} from './clerk-auth.ts';
import type {AuthEnv,AuthConfig} from './clerk-auth.ts';
import {assertSameOrigin,PRIVATE_RESPONSE_HEADERS,readSharingBody,objectWithKeys} from './sharing.ts';
import {reverificationErrorResponse} from '@clerk/shared/authorization-errors';
import {createCleanupProductionAdapter,nativeCleanupClerk,CleanupBlocked} from './event-cleanup-production.ts';
import type {CleanupClerkPort} from './event-cleanup-production.ts';
import type {NativeCleanupEmail} from './event-cleanup-confirmations.ts';

export type CleanupEndpointEnv=AuthEnv&{
 DB?:D1Database;DEVYO_CLEANUP_EMAIL?:NativeCleanupEmail;
 DEVYO_EVENT_CLEANUP_MODE?:string;DEVYO_EVENT_CLEANUP_SCHEMA_READY?:string;
 DEVYO_EVENT_CLEANUP_PROTECTED_USER_ID?:string;
 DEVYO_EVENT_CLEANUP_SENDER_READY?:string;DEVYO_EVENT_CLEANUP_DAILY_QUOTA?:string;
 DEVYO_EVENT_CLEANUP_PREVIEWS_DISABLED?:string;
 DEVYO_EVENT_CLEANUP_PROVIDER_RETENTION_APPROVED?:string;
};
const NORMAL_CONFIRMATION='REMOVE REVIEWED DEVYO ACCOUNTS';
const RECOVERY_CONFIRMATION='REMOVE REVIEWED ACCOUNTS WITHOUT GUARANTEED CONFIRMATIONS';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
const validHash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function expectedConfirmation(allowWithoutNotice:boolean){return allowWithoutNotice?RECOVERY_CONFIRMATION:NORMAL_CONFIRMATION;}
/** Disabled unless separately approved configuration activates the manual mode.
 * Test hooks are function arguments only; request data cannot select an actor,
 * provider, issuer, credential, readiness flag or exemption.
 */
export async function handleManualCleanupRequest(request:Request,environment:CleanupEndpointEnv,hooks:{actor?:()=>AuthContext;clerk?:(config:AuthConfig)=>CleanupClerkPort;clock?:()=>number}={}){
 if(environment.DEVYO_EVENT_CLEANUP_MODE!=='manual')return json({error:'Not found.'},404);
 try{
  const config=readAuthConfig(environment),protectedId=environment.DEVYO_EVENT_CLEANUP_PROTECTED_USER_ID;
  if(environment.DEVYO_ENVIRONMENT!=='production'||environment.DEVYO_EVENT_CLEANUP_SCHEMA_READY!=='true'||!environment.DB||!config?.instanceId||!protectedId||!/^user_[A-Za-z0-9]+$/.test(protectedId)||!config.origins.includes(new URL(request.url).origin))return json({error:'Manual cleanup is not configured.'},503);
  const actor=(hooks.actor??getAuthContext)();
  if(actor.status!=='authenticated'||actor.user?.userId!==`clerk:${config.issuer}:${protectedId}`||!actor.sessionId)return json({error:'Organizer access is required.'},403);
  if(actor.recentlyVerified!==true){const response=reverificationErrorResponse('strict');for(const[key,value]of Object.entries(PRIVATE_RESPONSE_HEADERS))response.headers.set(key,value);return response;}
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open this review from Devyo.'},403);
  const port=(hooks.clerk??nativeCleanupClerk)(config);
  const quota=Number(environment.DEVYO_EVENT_CLEANUP_DAILY_QUOTA);
  const adapter=createCleanupProductionAdapter({db:environment.DB,config,protectedUserId:protectedId,port,clock:hooks.clock,delivery:{binding:environment.DEVYO_CLEANUP_EMAIL,sender:'privacy@devyo.app',domainVerified:environment.DEVYO_EVENT_CLEANUP_SENDER_READY==='true',quotaVerified:Number.isInteger(quota)&&quota>0,previewsDisabled:environment.DEVYO_EVENT_CLEANUP_PREVIEWS_DISABLED==='true',providerRecipientLogRetentionApproved:environment.DEVYO_EVENT_CLEANUP_PROVIDER_RETENTION_APPROVED==='email-analytics-31d'}});
  if(request.method==='GET'){
   const preview=await adapter.preview();
   return json({scopeHash:preview.review.scopeHash,dataScopeHash:preview.dataScopeHash,summary:preview.summary,targets:preview.review.targets.map(row=>row.ownerId),protectedAccountPreserved:true,scope:'whole-devyo-accounts',groupPolicy:preview.manifest.groupPolicy,contactPolicy:preview.manifest.contactPolicy,providerRecipientAnalyticsDays:31,confirmation:expectedConfirmation(false),scheduled:false});
  }
  if(request.method!=='POST')return json({error:'Use a manual review action.'},405);
  assertSameOrigin(request);
  if(request.headers.get('X-Expected-Devyo-Session')!==actor.sessionId)return json({error:'Your organizer session changed. Review again.'},409);
  const body=await readSharingBody(request);if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Choose a manual review action.'},400);
  const action=(body as {action?:unknown}).action;
  if(action==='preview'){
   const input=objectWithKeys(body,['action','allowCleanupWithoutNotice']);if(typeof input.allowCleanupWithoutNotice!=='boolean')return json({error:'Choose the explicit confirmation policy.'},400);
   const preview=await adapter.preview(input.allowCleanupWithoutNotice);
   return json({scopeHash:preview.review.scopeHash,dataScopeHash:preview.dataScopeHash,summary:preview.summary,targets:preview.review.targets.map(row=>row.ownerId),confirmation:expectedConfirmation(input.allowCleanupWithoutNotice),contactPolicy:preview.manifest.contactPolicy,providerRecipientAnalyticsDays:31,scheduled:false});
  }
  if(action==='approve'){
   const input=objectWithKeys(body,['action','scopeHash','dataScopeHash','allowCleanupWithoutNotice','confirmation','acknowledgeRetainedBoundaries','acknowledgeProviderRecipientAnalytics31Days']);
   if(!validHash(input.scopeHash)||!validHash(input.dataScopeHash)||typeof input.allowCleanupWithoutNotice!=='boolean'||input.confirmation!==expectedConfirmation(input.allowCleanupWithoutNotice)||input.acknowledgeRetainedBoundaries!==true||input.acknowledgeProviderRecipientAnalytics31Days!==true)return json({error:'Confirm the exact permanent scope and retained boundaries.'},400);
   // These acknowledgements do not activate the service or override the separate
   // deployment-time permission/retention gates used before target execution.
   return json(await adapter.approve({scopeHash:input.scopeHash as string,dataScopeHash:input.dataScopeHash as string,allowCleanupWithoutNotice:input.allowCleanupWithoutNotice}));
  }
  if(action==='execute'){
   const input=objectWithKeys(body,['action','runId','ownerId']);if(typeof input.runId!=='string'||typeof input.ownerId!=='string')return json({error:'Select one reviewed target.'},400);
   return json(await adapter.execute(input.runId,input.ownerId));
  }
  if(action==='renew'){
   const input=objectWithKeys(body,['action','runId','scopeHash','dataScopeHash','allowCleanupWithoutNotice','confirmation']);
   if(typeof input.runId!=='string'||!validHash(input.scopeHash)||!validHash(input.dataScopeHash)||typeof input.allowCleanupWithoutNotice!=='boolean'||input.confirmation!==expectedConfirmation(input.allowCleanupWithoutNotice))return json({error:'Confirm the unchanged reviewed scope again.'},400);
   return json(await adapter.renew(input.runId,{scopeHash:input.scopeHash as string,dataScopeHash:input.dataScopeHash as string,allowCleanupWithoutNotice:input.allowCleanupWithoutNotice}));
  }
  return json({error:'Choose a manual review action.'},400);
 }catch(error){return json({error:error instanceof CleanupBlocked?error.code:'The manual operation could not be confirmed. Review its recorded status before retrying.'},409);}
}
