import{endpointId,badgeCount}from'./messaging.ts';
/** Permission and browser subscription are changed only by an explicit UI action. */
export async function enableDeviceNotifications(registration:ServiceWorkerRegistration,publicKey:string,api:(path:string,body:unknown)=>Promise<unknown>,current:()=>boolean){
 if(!current())throw Error('Your account changed. Reload notification settings.');
 const bytes=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 if(bytes.length!==65||bytes[0]!==4)throw Error('Notifications are being prepared.');
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 if(permission!=='granted')return permission;
 if(!current())throw Error('Your account changed. Reload notification settings.');
 let created=false,subscription=await registration.pushManager.getSubscription();
 if(!current())throw Error('Your account changed. Reload notification settings.');
 try{
  if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes.buffer});created=true;}
  if(!current())throw Error('Your account changed. Reload notification settings.');
  await api('/api/push',{action:'subscribe',subscription:subscription.toJSON()});
  if(!current())throw Error('Your account changed. Reload notification settings.');
 }catch(error){if(created)await subscription?.unsubscribe();throw error;}
 if(typeof window!=='undefined')window.dispatchEvent(new Event('devyo-device-notifications'));
 return permission;
}
export async function updateAppBadge(total:number){if(typeof navigator==='undefined')return;const n=navigator as Navigator&{setAppBadge?:(n:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};try{if(badgeCount(total))await n.setAppBadge?.(badgeCount(total));else await n.clearAppBadge?.()}catch{}}
export async function forgetDeviceNotifications(api?:(path:string,body:unknown)=>Promise<unknown>,current:()=>boolean=()=>true){try{if(typeof navigator==='undefined'||!current())return;const registration=await navigator.serviceWorker?.getRegistration('/');if(!current())return;const sub=await registration?.pushManager?.getSubscription();if(!current())return;if(sub){try{if(api)await api('/api/push',{action:'unsubscribe',id:await endpointId(sub.endpoint)})}catch{/* Browser revocation still stops delivery when the server is unreachable. */}if(current())await sub.unsubscribe()}if(current())registration?.active?.postMessage({type:'devyo-clear-notifications'})}finally{if(current())await updateAppBadge(0)}}
