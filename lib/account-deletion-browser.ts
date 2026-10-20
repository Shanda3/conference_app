import{forgetDeviceNotifications,updateAppBadge}from'./device-notifications.ts';
export type DeletionIdentity={userId:string;sessionId:string};
export type DeletionPhase='requested'|'identity_deleted'|'complete';
export const ACCOUNT_CLOSED_EVENT='devyo-account-closed';
const finishing=new Set<string>();
export function deletionPrincipalMatches(client:{loaded?:boolean;user?:{id:string}|null;session?:{id:string}|null},identity:DeletionIdentity,allowEnded=false){
 if(client.loaded===false)return false;const user=client.user?.id,session=client.session?.id;
 return (user===identity.userId&&session===identity.sessionId)||(allowEnded&&!session&&(!user||user===identity.userId));
}
export function deletionSignInUrl(origin:string){
 return ['https://devyo.app','https://thunderplains.devyo.app'].includes(origin)?'https://thunderplains.devyo.app/sign-in':'/sign-in';
}
export function clearDeletionLocalData(browser:Pick<Window,'localStorage'|'sessionStorage'>){
 for(const key of ['devyo.remembered-email.v1','devyo.remember-email-choice.v1'])try{browser.localStorage.removeItem(key)}catch{}
 try{for(let i=browser.localStorage.length-1;i>=0;i--){const key=browser.localStorage.key(i);if(key?.startsWith('devyo-schedule-announcement:')||key?.startsWith('devyo-screen-tour:'))browser.localStorage.removeItem(key)}}catch{}
 for(const key of ['devyo-shared-plan-intent.v1','devyo-group-invite','devyo-login-refresh'])try{browser.sessionStorage.removeItem(key)}catch{}
}
export function installPrivateHistoryGuard(browser:Pick<Window,'addEventListener'|'removeEventListener'|'location'>,doc:Pick<Document,'querySelector'>){
 const hide=()=>doc.querySelector<HTMLElement>('[data-private-workspace]')?.setAttribute('hidden','');
 const restore=(event:PageTransitionEvent)=>{if(event.persisted){hide();browser.location.reload()}};
 browser.addEventListener('pagehide',hide);browser.addEventListener('pageshow',restore);
 return()=>{browser.removeEventListener('pagehide',hide);browser.removeEventListener('pageshow',restore)};
}
export function closeDeletedWorkspace(identity:DeletionIdentity,status:DeletionPhase,clearLocal=true){
 if(clearLocal)clearDeletionLocalData(window);
 void updateAppBadge(0);window.dispatchEvent(new CustomEvent(ACCOUNT_CLOSED_EVENT,{detail:{identity,status}}));
}
/** Called only after a canonical server status is complete. No browser identity is used to select a deletion target. */
export async function finishDeletedAccount(client:{loaded?:boolean;user?:{id:string}|null;session?:{id:string}|null;signOut:(callback:()=>void,options:{sessionId:string})=>Promise<unknown>},identity:DeletionIdentity,browser:Pick<Window,'localStorage'|'sessionStorage'|'location'>=window){
 if(!deletionPrincipalMatches(client,identity,true)||finishing.has(identity.sessionId))return false;
 finishing.add(identity.sessionId);clearDeletionLocalData(browser);if(typeof window!=='undefined'&&browser===window)void forgetDeviceNotifications(undefined,()=>deletionPrincipalMatches(client,identity,true)).catch(()=>undefined);
 if(typeof window!=='undefined'&&browser===window){closeDeletedWorkspace(identity,'complete');document.querySelector<HTMLElement>('[data-private-workspace]')?.setAttribute('hidden','');}
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{if(client.session?.id===identity.sessionId)await Promise.race([client.signOut(()=>undefined,{sessionId:identity.sessionId}),new Promise(resolve=>{timer=setTimeout(resolve,1000)})])}catch{/* Clerk may already have removed this identity and session. The server has confirmed completion. */}finally{if(timer)clearTimeout(timer)}
 if(!deletionPrincipalMatches(client,identity,true)){finishing.delete(identity.sessionId);return false}
 browser.location.replace(deletionSignInUrl(browser.location.origin));return true;
}
