import{getAuthContext}from'@/lib/auth-context';
import {eq}from'drizzle-orm';
import {getAppUser}from'@/app/auth';
import {getDb}from'@/db';
import {plannerStates}from'@/db/schema';
import {validateState}from'@/lib/planner';
import {privateNotesText}from'@/lib/notes-export';
import {PRIVATE_RESPONSE_HEADERS}from'@/lib/sharing';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const json=(value:unknown,status:number)=>Response.json(value,{status,headers:PRIVATE_RESPONSE_HEADERS});
 try{const user=await getAppUser();if(!user)return json({error:'Sign in to download your private notes.'},401);const expectedSession=request.headers.get('X-Expected-Devyo-Session');if(expectedSession&&expectedSession!==getAuthContext().sessionId)return json({error:'Your signed-in account changed. Start the notes download again.'},409);if(new URL(request.url).search) return json({error:'Download uses only your signed-in account; no account selectors are accepted.'},400);
 const[row]=await getDb().select({stateJson:plannerStates.stateJson}).from(plannerStates).where(eq(plannerStates.ownerId,user.userId)).limit(1);const result=row?privateNotesText(validateState(JSON.parse(row.stateJson))):null;
 if(!result)return new Response(null,{status:204,headers:{...PRIVATE_RESPONSE_HEADERS,'X-Notes-Count':'0'}});
 return new Response(result.text,{headers:{...PRIVATE_RESPONSE_HEADERS,'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${result.filename}"`,'X-Notes-Count':String(result.count)}});
 }catch{return json({error:'Your saved notes could not be downloaded. They have not been changed; please try again.'},503)}
}
