import {env} from 'cloudflare:workers';
import {getAppUser} from '@/app/auth';
import {getAuthContext} from '@/lib/auth-context';
import {plannerIdentityMatches} from '@/lib/talk-preferences';
import {PRIVATE_RESPONSE_HEADERS,readSharingBody,SharingError} from '@/lib/sharing';
import {OrganizerReviewStore} from '@/lib/organizer-review-store';
import {OrganizerReviewError} from '@/lib/organizer-review-model';
import programSeed from '@/lib/event-data.json';import type {ProgramSeed} from '@/lib/program-model';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
async function store(request:Request){
 const user=await getAppUser();if(!user)throw new OrganizerReviewError('Sign in to review the shared conference program.',401);
 if(new URL(request.url).search)throw new OrganizerReviewError('Account and conference selectors are not accepted.');
 const expectedUser=request.headers.get('X-Expected-Devyo-User'),expectedSession=request.headers.get('X-Expected-Devyo-Session');
 if(!expectedUser||!expectedSession||!plannerIdentityMatches(expectedUser,expectedSession,user.userId,getAuthContext().sessionId))throw new OrganizerReviewError('Your sign-in session changed. Reload the organizer review.',409);
 if(env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY!=='true'||!env.DB)throw new OrganizerReviewError('Organizer schedule review is not enabled.',503);
 return new OrganizerReviewStore(env.DB,user.userId,programSeed as unknown as ProgramSeed);
}
function failure(error:unknown){return json({error:error instanceof OrganizerReviewError||error instanceof SharingError?error.message:'The organizer review could not be completed. Private records are not returned.'},error instanceof OrganizerReviewError||error instanceof SharingError?error.status:503);}
export async function GET(request:Request){try{const s=await store(request);return json({...await s.review(),paused:env.DEVYO_ORGANIZER_REVIEW_ENABLED!=='true',...(env.DEVYO_ORGANIZER_REVIEW_ENABLED!=='true'?{canApply:false}:{})});}catch(error){return failure(error);}}
export async function POST(request:Request){try{const s=await store(request);if(env.DEVYO_ORGANIZER_REVIEW_ENABLED!=='true')throw new OrganizerReviewError('New organizer approvals are paused.',503);if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new OrganizerReviewError('Program approval must come from this site.',403);return json(await s.apply(await readSharingBody(request)));}catch(error){return failure(error);}}
export const PUT=()=>json({error:'This endpoint cannot create roles or candidates.'},405);
export const DELETE=PUT;
