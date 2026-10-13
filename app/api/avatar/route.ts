import{photoAvatarResponse,photoFailure}from'@/lib/photo-http';
import{PhotoError}from'@/lib/photo-model';
import {sql} from "drizzle-orm";
import{env}from'cloudflare:workers';
import {getAppUser} from "@/app/auth";
import {getDb} from "@/db";
import {gravatarHash,createGravatarCache} from "@/lib/avatar";
import{accountPrimaryEmail,maskedAccountEmail}from'@/lib/clerk-email';
import {assertSameOrigin,readSharingBody,objectWithKeys,PRIVATE_RESPONSE_HEADERS,SharingError} from "@/lib/sharing";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:PRIVATE_RESPONSE_HEADERS});
const cachedGravatar=createGravatarCache();
export async function GET(request:Request){
 try{
 const user=await getAppUser();if(!user)return json({error:"Sign in to see avatars."},401);
 const q=new URL(request.url).searchParams,member=q.get('member'),db=getDb();
 if(q.has('gravatar')){if(q.get('gravatar')!=='1'||q.get('self')!=='1'||q.has('member')||[...q.keys()].some(k=>!['gravatar','self','v'].includes(k)))throw new SharingError('Avatar unavailable.',404);}else if(q.has('self')||q.has('member')){const photo=await photoAvatarResponse(request);if(photo)return photo;}
 if(member===null&&!q.has('self')){const [row]=await db.all<{email_hash:string}>(sql`SELECT email_hash FROM member_avatars WHERE owner_id=${user.userId}`);const email=await accountPrimaryEmail(user.userId,env);return json({enabled:!!row,verifiedEmailAvailable:!!email,maskedEmail:email?maskedAccountEmail(email):null,currentEmailMatches:!!row&&!!email&&row.email_hash===await gravatarHash(email)})}
 let row:{email_hash:string}|undefined;
 if(q.has('self'))[row]=await db.all<{email_hash:string}>(sql`SELECT email_hash FROM member_avatars WHERE owner_id=${user.userId}`);
 else{if(!member||!/^[a-zA-Z0-9-]{16,64}$/.test(member))return json({error:"Avatar unavailable."},404);[row]=await db.all<{email_hash:string}>(sql`SELECT a.email_hash FROM member_avatars a JOIN community_members m ON m.owner_id=a.owner_id WHERE m.id=${member}`)}
 if(!row)return json({error:"Avatar unavailable."},404);
 const response=await cachedGravatar(row.email_hash);
 const [stillAllowed]=q.has('self')?await db.all(sql`SELECT owner_id FROM member_avatars WHERE owner_id=${user.userId} AND email_hash=${row.email_hash}`):await db.all(sql`SELECT a.owner_id FROM member_avatars a JOIN community_members m ON m.owner_id=a.owner_id WHERE m.id=${member} AND a.email_hash=${row.email_hash}`);
 if(!stillAllowed)return json({error:"Avatar unavailable."},404);for(const[key,value]of Object.entries(PRIVATE_RESPONSE_HEADERS))response.headers.set(key,value);return response;
 }catch(error){if(error instanceof PhotoError)return photoFailure(error);if(error instanceof SharingError)return json({error:error.message},error.status);return json({error:"Avatar settings or image could not be loaded. Please retry."},503)}
}
export async function PUT(request:Request){
 try{
 const user=await getAppUser();if(!user)return json({error:"Sign in to set your avatar."},401);assertSameOrigin(request);const body=objectWithKeys(await readSharingBody(request),['useAccountEmail']);if(body.useAccountEmail!==true)throw new SharingError('Choose whether to use your verified account email for Gravatar.');
 const email=await accountPrimaryEmail(user.userId,env);if(!email)return json({error:'Verify your primary account email before using Gravatar.'},409);const hash=await gravatarHash(email);
 await getDb().run(sql`INSERT INTO member_avatars(owner_id,email_hash) VALUES(${user.userId},${hash}) ON CONFLICT(owner_id) DO UPDATE SET email_hash=excluded.email_hash`);
 return json({enabled:true,verifiedEmailAvailable:true,maskedEmail:maskedAccountEmail(email),currentEmailMatches:true});
 }catch(error){return json({error:error instanceof SharingError?error.message:"Your account email could not be verified. Please retry; your avatar settings have not changed."},error instanceof SharingError?error.status:503)}
}
export async function DELETE(request:Request){
 try{const user=await getAppUser();if(!user)return json({error:"Sign in to remove your avatar."},401);assertSameOrigin(request);await getDb().run(sql`DELETE FROM member_avatars WHERE owner_id=${user.userId}`);return json({enabled:false})}
 catch(error){return json({error:error instanceof SharingError?error.message:"Avatar could not be removed."},error instanceof SharingError?error.status:503)}
}
