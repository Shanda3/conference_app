import{env}from'cloudflare:workers';import{getAppUser}from'../app/auth';import{getAuthContext}from'./auth-context';import{assertSameOrigin,PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError}from'./sharing';import{plannerIdentityMatches}from'./talk-preferences';import{NETWORKING_EVENT,NetworkingError}from'./networking';import{NetworkingD1,assertNetworkingReady}from'./networking-d1';import catalog from'./event-data.json';import{latestShareCatalog,type ShareProgramRow}from'./share-program';
export const networkingResponse=(value:unknown,status=200)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
export async function networkingService(request:Request,mutation=false){
 const user=await getAppUser(),auth=getAuthContext();if(!user||!auth.sessionId||auth.status!=='authenticated')throw new NetworkingError('Sign in to see conference attendees.',401);
 if(auth.eventId!==NETWORKING_EVENT)throw new NetworkingError('Conference networking is unavailable here.',404);
 if(!request.headers.get('X-Expected-Devyo-User')||!request.headers.get('X-Expected-Devyo-Session')||!plannerIdentityMatches(request.headers.get('X-Expected-Devyo-User'),request.headers.get('X-Expected-Devyo-Session'),user.userId,auth.sessionId))throw new NetworkingError('Your sign-in session changed. Reload before continuing.',409);
 if(mutation)assertSameOrigin(request);else if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new NetworkingError('Open networking from this conference site.',403);
 if(env.DEVYO_NETWORKING_ENABLED!=='true')return null;
 if(env.DEVYO_NETWORKING_SCHEMA_READY!=='true'||!env.DB)throw new NetworkingError('Networking is being prepared.',503);
 const db=env.DB;await assertNetworkingReady(db);
 const canonical=await latestShareCatalog(catalog,async()=>(await db.prepare('SELECT conference_id,last_success_at,sessions_json FROM public_program_sources').all<ShareProgramRow>()).results);
 const service=new NetworkingD1(db,user.userId,canonical);await service.register();return service;
}
export async function networkingBody(request:Request){const length=request.headers.get('Content-Length');if(length&&Number(length)>4096)throw new NetworkingError('Networking settings are too large.',413);const value=await readSharingBody(request);if(new TextEncoder().encode(JSON.stringify(value)).length>4096)throw new NetworkingError('Networking settings are too large.',413);return value}
export function networkingFailure(error:unknown){return networkingResponse({error:error instanceof NetworkingError||error instanceof SharingError?error.message:'Networking could not be loaded. Please try again; your selections have not changed.'},error instanceof NetworkingError||error instanceof SharingError?error.status:503)}
