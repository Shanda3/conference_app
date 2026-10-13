import {createClerkClient} from '@clerk/backend';
import {deletionClerkUserId} from './account-deletion.ts';import type {AuthConfig} from './clerk-auth.ts';
import type {EventIdentityService} from './event-retention.ts';
async function deletionClient(config:AuthConfig){
 if(!config.instanceId)throw Error('Account deletion instance is not pinned.');const client=createClerkClient({publishableKey:config.publishableKey,secretKey:config.secretKey});const instance=await client.instance.get();if(instance.id!==config.instanceId||instance.environmentType!=='production')throw Error('Account deletion instance mismatch.');return client;
}
export async function verifyAccountDeletionInstance(config:AuthConfig){await deletionClient(config)}
export async function deleteClerkIdentity(config:AuthConfig,owner:string){
 const id=deletionClerkUserId(owner,config.issuer),client=await deletionClient(config);
 try{await client.users.deleteUser(id);}
 catch(error){if((error as {status?:number}).status===404)return;throw error;}
}
/** Read-only instance check for a future event-scoped review; no user enumeration/deletion. */
export function eventIdentityService(config:AuthConfig):EventIdentityService{
 const client=createClerkClient({publishableKey:config.publishableKey,secretKey:config.secretKey});
 return{async verifyInstance(id){const instance=await client.instance.get();if(instance.id!==id||instance.environmentType!=='production')throw Error('Event retention instance mismatch')}};
}
