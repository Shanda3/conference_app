import {createClerkClient} from '@clerk/backend';
import {getAuthContext} from './auth-context.ts';
import {readAuthConfig,type AuthEnv} from './clerk-auth.ts';
type IdentityUser={id:string;primaryEmailAddressId:string|null;emailAddresses:{id:string;emailAddress:string;verification?:{status:string}|null}[]};
/** Current subject only. There is deliberately no user/name/email search parameter. */
export async function currentIdentity(env:AuthEnv,load?:(id:string)=>Promise<IdentityUser>){
 const auth=getAuthContext();if(auth.status!=='authenticated'||!auth.user||!auth.sessionId)throw Error('Sign in to inspect your account.');
 const config=readAuthConfig(env);if(!config)throw Error('Account identity is not configured.');
 const prefix='clerk:'+config.issuer+':';if(!auth.user.userId.startsWith(prefix))throw Error('Account issuer mismatch.');
 const userId=auth.user.userId.slice(prefix.length);if(!/^user_[A-Za-z0-9]+$/.test(userId))throw Error('Account subject is invalid.');
 const user=await (load??(id=>createClerkClient({secretKey:config.secretKey}).users.getUser(id)))(userId);
 if(user.id!==userId)throw Error('Account identity could not be verified.');
 const primary=user.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 return {userId,displayName:auth.user.displayName,verifiedPrimaryEmail:primary?.verification?.status==='verified'?primary.emailAddress:null,issuer:config.issuer};
}
