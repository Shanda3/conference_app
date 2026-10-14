import {discussionModerators} from '../lib/talk-discussion.ts';
import{generalHomeResponse}from'../lib/general-home.ts';
import{publicPlanPath,publicPlanResponse}from'../lib/public-plan.ts';
import{publicVenuePath}from'../lib/venue.ts';
import handler from "vinext/server/fetch-handler";
import {authenticate,privateAccessResponse,stripLegacyIdentity,readAuthConfig} from "../lib/clerk-auth.ts";
import{deletionJob,recoverAccountDeletions}from'../lib/account-deletion.ts';
import{deleteClerkIdentity}from'../lib/account-identity.ts';
import {runWithAuth} from "../lib/auth-context.ts";
import {hostedHttpsRedirect} from "../lib/hosted-redirect.ts";
import {runProgramCheck,readProgram} from '../lib/program-sync.ts';
import type {ProgramSeed} from '../lib/program-model.ts';
import programSeed from '../lib/event-data.json';
const seed=programSeed as unknown as ProgramSeed;
declare global {namespace Cloudflare {interface Env {DEVYO_PROGRAM_SYNC_ENABLED?:string;DEVYO_ACCOUNT_DELETION_ENABLED?:string;DEVYO_ACCOUNT_DELETION_SCHEMA_READY?:string}}}
const programHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export default {async fetch(incoming:Request,env:Cloudflare.Env,ctx:ExecutionContext){
 const upgrade=hostedHttpsRedirect(incoming,env);if(upgrade)return upgrade;

 const pathname=new URL(incoming.url).pathname;
 const trusted=[env.DEVYO_ORIGIN,...(env.DEVYO_ADDITIONAL_ORIGINS??'').split(',')].includes(new URL(incoming.url).origin);
 if(trusted&&env.DEVYO_PROGRAM_SYNC_ENABLED==='true'&&env.DB&&incoming.method==='GET'&&['/','/api/program/status'].includes(pathname)){
  // Only fills missing initial public snapshots, under a database lease and hourly retry cap.
  ctx.waitUntil(runProgramCheck(env.DB,seed,new Date(),{bootstrap:true}).catch(()=>undefined));
  if(pathname==='/api/program/status'&&incoming.method==='GET'){
   try{const{sources,stopped,stopAt,cadence}=await readProgram(env.DB,seed);return Response.json({sources,stopped,stopAt,cadence},{headers:programHeaders})}
   catch{return Response.json({error:'Daily schedule verification is temporarily unavailable.'},{status:503,headers:programHeaders})}
  }
 }
 // Exact static social previews carry public conference branding only.
 if(trusted){const card=publicPlanResponse(incoming);if(card)return card;}
 // Exact public venue paths contain no account data and work independently of sign-in.
 if(trusted&&['GET','HEAD'].includes(incoming.method)&&(publicVenuePath(pathname)||publicPlanPath(pathname))){
  const response=await runWithAuth({user:null,status:'anonymous'},()=>handler.fetch(stripLegacyIdentity(incoming),env,ctx));const headers=new Headers(response.headers);headers.delete('Set-Cookie');headers.set('Cache-Control','public, max-age=300');headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
 if(trusted&&!new URL(incoming.url).search){const home=generalHomeResponse(incoming);if(home)return home;}
 const request=stripLegacyIdentity(incoming),auth=await authenticate(request,env);
 if(auth.handshake&&auth.headers.has("location")){auth.headers.set("Cache-Control","private, no-store");return new Response(null,{status:307,headers:auth.headers})}
 auth.context={...auth.context,talkDiscussionsEnabled:discussionModerators(env.DEVYO_TALK_MODERATOR_USER_IDS).size>0&&trusted&&auth.context.eventId==='thunderplains-2026'&&env.DEVYO_TALK_DISCUSSIONS_ENABLED==='true'&&env.DEVYO_TALK_DISCUSSIONS_SCHEMA_READY==='true'&&env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY==='true',profilePhotosEnabled:trusted&&auth.context.eventId==='thunderplains-2026'&&env.DEVYO_PROFILE_PHOTOS_ENABLED==='true'&&env.DEVYO_PROFILE_PHOTOS_SCHEMA_READY==='true',accountDeletionEnabled:trusted&&env.DEVYO_ACCOUNT_DELETION_ENABLED==='true',accountDeletionSchemaReady:trusted&&env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY==='true',accountDeletedNotice:pathname==='/sign-in'&&request.headers.get('Cookie')?.split(';').some(value=>value.trim()==='devyo-account-deleted=1')};
 if(trusted&&env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY==='true'&&auth.context.user&&pathname!=='/api/account'){
  try{if(!env.DB)throw Error('Missing database');const job=await deletionJob(env.DB,auth.context.user.userId);if(job){const identity={userId:auth.context.user.userId.slice(auth.context.user.userId.lastIndexOf(':')+1),sessionId:auth.context.sessionId!};auth.context={...auth.context,user:pathname==='/settings'?auth.context.user:null,status:job.phase==='complete'&&pathname==='/sign-in'?'anonymous':'deleting',deletionStatus:job.phase,deletionIdentity:identity,accountDeletedNotice:job.phase==='complete'&&pathname==='/sign-in'}}}
  catch{return Response.json({error:'Account status could not be checked. Please retry.'},{status:503,headers:programHeaders})}
 }
 if(trusted){const home=generalHomeResponse(incoming);if(home)return home;}
 const denied=privateAccessResponse(request,auth.context);if(denied)return denied;
 let response:Response;
 if(pathname==='/api/program'){
  if(request.method!=='GET')response=Response.json({error:'This program endpoint is read-only.'},{status:405,headers:programHeaders});
  else try{if(!env.DB)throw new Error('Missing database');response=Response.json(await readProgram(env.DB,seed),{headers:programHeaders})}
  catch{response=Response.json({error:'The last program could not be loaded. Your planner has not changed.'},{status:503,headers:programHeaders})}
 }else response=await runWithAuth(auth.context,()=>handler.fetch(request,env,ctx));const headers=new Headers(response.headers);
 for(const cookie of auth.headers.getSetCookie())headers.append("Set-Cookie",cookie);
 if(pathname==='/sign-in'&&auth.context.accountDeletedNotice){headers.append('Set-Cookie',`devyo-account-deleted=; Path=/sign-in; Domain=devyo.app; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)}
 headers.set("Cache-Control","private, no-store");headers.set("X-Robots-Tag","noindex, nofollow");headers.set("Referrer-Policy","no-referrer");
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
},async scheduled(event:ScheduledController,env:Cloudflare.Env,ctx:ExecutionContext){
 if((!event.cron||event.cron==='0 14 * * *')&&env.DEVYO_PROGRAM_SYNC_ENABLED==='true'&&env.DB)ctx.waitUntil(runProgramCheck(env.DB,seed));
 if(env.DB&&(env.OPENAI_API_KEY||env.OPEN_API_KEY))ctx.waitUntil(env.DB.prepare('DELETE FROM devyo_ai_cache WHERE expires_at<=?').bind(Date.now()).run().catch(()=>undefined));
 if(env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY==='true'&&env.DB){const config=readAuthConfig(env);if(config)ctx.waitUntil(recoverAccountDeletions(env.DB,owner=>deleteClerkIdentity(config,owner)).catch(()=>undefined))}
}};
