import {createClerkClient} from '@clerk/backend';
import{readAuthConfig,type AuthEnv}from './clerk-auth.ts';
export function normalizedAccountEmail(value:unknown){if(typeof value!=='string')return null;const email=value.trim().toLowerCase();return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null}
export function verifiedPrimaryEmail(user:{id?:string;primaryEmailAddressId?:string|null;emailAddresses?:Array<{id:string;emailAddress:string;verification?:{status?:string}|null}>},expectedId:string){
 if(user.id!==expectedId||!user.primaryEmailAddressId)return null;const entries=(user.emailAddresses??[]).filter(e=>e.id===user.primaryEmailAddressId);if(entries.length!==1||entries[0].verification?.status!=='verified')return null;return normalizedAccountEmail(entries[0].emailAddress);
}
export function maskedAccountEmail(email:string){const [name,domain]=email.split('@');return name.slice(0,Math.min(3,name.length))+'***@'+domain}
/** Identity is the verified Clerk subject, never a request body/email/name fallback. */
export async function accountPrimaryEmail(owner:string,environment:AuthEnv):Promise<string|null>{
 const config=readAuthConfig(environment);if(!config)throw Error('Account email unavailable');const prefix=`clerk:${config.issuer}:`;if(!owner.startsWith(prefix))throw Error('Account identity mismatch');const id=owner.slice(prefix.length);if(!/^user_[A-Za-z0-9]+$/.test(id))throw Error('Account identity mismatch');
 const user=await createClerkClient({publishableKey:config.publishableKey,secretKey:config.secretKey}).users.getUser(id);return verifiedPrimaryEmail(user,id);
}
