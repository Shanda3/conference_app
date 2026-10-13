import {env} from 'cloudflare:workers';
import {getAuthContext} from '@/lib/auth-context';
import {currentIdentity} from '@/lib/self-identity';
import {PRIVATE_RESPONSE_HEADERS} from '@/lib/sharing';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
 if(env.DEVYO_SELF_IDENTITY_ENABLED!=='true')return json({error:'Account identity review is not enabled.'},404);
 if(new URL(request.url).search)return json({error:'This endpoint accepts no account selectors.'},400);
 const auth=getAuthContext();if(auth.status!=='authenticated'||!auth.user)return json({error:'Sign in to inspect your own identity.'},401);
 if(request.headers.get('X-Expected-Devyo-Session')!==auth.sessionId)return json({error:'Your sign-in session changed.'},409);
 try{return json(await currentIdentity(env));}catch{return json({error:'Your account identity could not be verified.'},503);}
}
