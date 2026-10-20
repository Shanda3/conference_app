import{env}from'cloudflare:workers';import{getAuthContext}from'@/lib/auth-context';import{assertSameOrigin,PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError}from'@/lib/sharing';
import{AI_MODEL,AI_PRICE_REVIEW_END,validateAIPrepRequest,generateAIPrep,AIPrepError}from'@/lib/ai-prep';import{AIBudgetError,AI_LIMITS,aiCallsRemaining,assertAIBudgetReady}from'@/lib/ai-budget';import{plannerIdentityMatches}from'@/lib/talk-preferences';import{aiSessionSource,aiContextHash}from'@/lib/ai-session';import{readProgram}from'@/lib/program-sync';import type{ProgramSeed}from'@/lib/program-model';import seedData from'@/lib/event-data.json';
export const dynamic='force-dynamic';const json=(value:unknown,status=200)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
// The attendee saved this dedicated secret under OPEN_API_KEY. Keep it server-only.
const apiKey=()=>env.OPENAI_API_KEY??env.OPEN_API_KEY;
export async function GET(request?:Request){try{
 const auth=getAuthContext();if(!auth.user)return json({error:'Sign in to use AI preparation.'},401);
 const sessionId=request?new URL(request.url).searchParams.get('sessionId'):null;let context;
 if(sessionId){
  if(!plannerIdentityMatches(request!.headers.get('X-Expected-Devyo-User'),request!.headers.get('X-Expected-Devyo-Session'),auth.user.userId,auth.sessionId))return json({error:'Your sign-in session changed. Reopen this page.'},409);
  if(!env.DB)return json({enabled:false});const program=await readProgram(env.DB,seedData as unknown as ProgramSeed),session=program.sessions.find(s=>s.id===sessionId);const selected=session?aiSessionSource(session,program.sessions):null;
  if(!selected?.eligible)return json({enabled:false,error:selected&&!selected.eligible?selected.reason:'This session has no verified preparation source.'});
  context={title:selected.source.title,description:selected.source.catalogDescription,sourceUrl:selected.source.sourceUrl,basis:selected.basis,limitation:selected.limitation,contextHash:await aiContextHash(selected.source)};
 }
 if(!env.DB||!apiKey()||Date.now()>=AI_PRICE_REVIEW_END)return json({enabled:false});await assertAIBudgetReady(env.DB);return json({enabled:true,model:AI_MODEL,remaining:await aiCallsRemaining(env.DB,auth.user.userId),perDay:AI_LIMITS.perUserDay,perSessionKindDay:AI_LIMITS.perSessionKindDay,...(context?{context}:{})});
 }catch{return json({enabled:false})}}
export async function POST(request:Request){try{
 const auth=getAuthContext();if(!auth.user)return json({error:'Sign in to use AI preparation.'},401);assertSameOrigin(request);
 if(!request.headers.has('X-Expected-Devyo-User')||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),auth.user.userId,auth.sessionId))return json({error:'Your sign-in session changed. Reopen this page.'},409);
 if(!env.DB||!apiKey())return json({error:'AI preparation is not configured. The shared guide is still available.'},503);
 const body=validateAIPrepRequest(await readSharingBody(request)),program=await readProgram(env.DB,seedData as unknown as ProgramSeed),session=program.sessions.find(s=>s.id===body.sessionId);if(!session)return json({error:'This session has no verified preparation source.'},400);
 const selected=aiSessionSource(session,program.sessions);if(!selected.eligible)return json({error:selected.reason},409);
 const contextHash=await aiContextHash(selected.source);if((body.contextHash&&body.contextHash!==contextHash)||(!body.contextHash&&selected.basis!=='reviewed-guide'))return json({error:'The public session information changed or has not been reviewed. Review the AI request again.'},409);
 const result=await generateAIPrep(env.DB,auth.user.userId,apiKey()!,body,selected.source);return json({...result,model:AI_MODEL,remaining:await aiCallsRemaining(env.DB,auth.user.userId)});
 }catch(error){
  if(error instanceof SharingError)return json({error:error.message},error.status);
  if(error instanceof AIBudgetError){const message={monthly:'The shared monthly AI allowance is reached. Use the shared guide.',daily:'Your daily AI allowance is reached. Try again tomorrow.',session:'This session has reached its daily regeneration limit.',busy:'Another request is running. Wait a moment before trying again.',closed:'Your account is closing.',unavailable:'AI accounting is unavailable. No further request will be sent.',duplicate:'This request changed. Please start a new request.'}[error.code];return json({error:message},['monthly','daily','session','busy'].includes(error.code)?429:503)}
  if(error instanceof AIPrepError)return json({error:{invalid:'Check the selected labels and select up to 3,000 characters of notes.',consent:'Review and approve what will be sent first.',contact:'Remove email addresses, phone numbers, and other contact details from the selected text.',provider:'OpenAI could not complete this request. The shared guide remains available.',provider_auth:'The organizer must check OpenAI key permissions. The shared guide remains available.',provider_quota:'OpenAI API credits or billing are needed. Please contact the organizer; the shared guide remains available.',provider_rate:'OpenAI is temporarily rate-limited. No automatic retry will be made.',provider_schema:'The AI output format needs an organizer update. The shared guide remains available.',provider_model:'This OpenAI project does not have access to the selected model. Please contact the organizer.',output:'The AI response could not be safely used. The shared guide remains available.',price:'AI pricing needs a fresh review before more requests.',pending:'This request is already recorded. Wait, then explicitly try again if needed.'}[error.code],code:error.code},error.code.startsWith('provider')||error.code==='output'?502:400);
  return json({error:'AI preparation is unavailable. No automatic retry will be made.'},503);
 }
}
