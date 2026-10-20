'use client';
import{useEffect,useRef,useState}from'react';
import{useAuth,useClerk}from'@clerk/react';
import{endpointId}from'@/lib/messaging';
import{enableDeviceNotifications}from'@/lib/device-notifications';
import{useMessagingApi}from'./messaging-client';
import'./notification-onboarding.css';

type Mode='hidden'|'loading'|'ready'|'blocked'|'unsupported'|'unavailable'|'error';
type Offer={identity:string;mode:Mode;registration?:ServiceWorkerRegistration;publicKey?:string};
const dismissedInMemory=new Set<string>();
const dismissalKey=(user:string)=>'devyo-notification-onboarding:v1:'+encodeURIComponent(user);
function wasDismissed(key:string){
 if(dismissedInMemory.has(key))return true;
 for(const name of ['localStorage','sessionStorage']as const)try{if(window[name].getItem(key)==='dismissed')return true;}catch{}
 return false;
}
function rememberDismissal(key:string){
 dismissedInMemory.add(key);
 for(const name of ['localStorage','sessionStorage']as const)try{window[name].setItem(key,'dismissed');return;}catch{}
}

export function NotificationOnboarding({onOpenSettings}:{onOpenSettings:()=>void}){
 const auth=useAuth(),clerk=useClerk(),api=useMessagingApi();
 const identity=auth.isLoaded&&auth.isSignedIn&&auth.userId&&auth.sessionId?auth.userId+':'+auth.sessionId:'';
 const key=auth.userId?dismissalKey(auth.userId):'';
 const[offer,setOffer]=useState<Offer>({identity:'',mode:'hidden'}),[busy,setBusy]=useState(false),[message,setMessage]=useState({identity:'',text:''});
 const generation=useRef(0),enabling=useRef(false);
 useEffect(()=>{
  const n=++generation.current,user=auth.userId,session=auth.sessionId;
  setOffer({identity,mode:'hidden'});setBusy(false);enabling.current=false;setMessage({identity,text:''});
  if(!identity||!user||!session)return;
  let probe=0;
  const media=['standalone','minimal-ui','window-controls-overlay'].map(mode=>window.matchMedia(`(display-mode: ${mode})`));
  const current=()=>generation.current===n&&clerk.user?.id===user&&clerk.session?.id===session;
  const installed=()=>media.some(m=>m.matches)||!!(navigator as Navigator&{standalone?:boolean}).standalone;
  const refresh=async()=>{
   const request=++probe;
   const update=(next:Omit<Offer,'identity'>)=>{if(current()&&request===probe)setOffer({identity,...next});};
   if(!current())return;
   if(!installed()||wasDismissed(key)){update({mode:'hidden'});return;}
   if(!window.isSecureContext||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){update({mode:'unsupported'});return;}
   if(Notification.permission==='denied'){update({mode:'blocked'});return;}
   update({mode:'loading'});
   try{
    const config=await api<{ready:boolean;publicKey?:string;devices?:{id:string;enabled:number}[]}>('/api/push');
    if(!current()||request!==probe||wasDismissed(key))return;
    if(!config.ready||!config.publicKey){update({mode:'unavailable'});return;}
    let registration=await navigator.serviceWorker.getRegistration('/');
    if(!current()||request!==probe||wasDismissed(key))return;
    if(!registration){await navigator.serviceWorker.register('/devyo-sw.js',{scope:'/'});registration=await navigator.serviceWorker.ready;}
    const subscription=await registration.pushManager.getSubscription(),id=subscription?await endpointId(subscription.endpoint):'';
    if(!current()||request!==probe||wasDismissed(key))return;
    // Pausing notifications is an existing choice too; onboarding must not undo it.
    if(config.devices?.some(device=>device.id===id)){rememberDismissal(key);update({mode:'hidden'});return;}
    update({mode:'ready',registration,publicKey:config.publicKey});
   }catch{if(!wasDismissed(key))update({mode:'error'});}
  };
  const visible=()=>{if(document.visibilityState==='visible'&&!enabling.current)void refresh();};
  const storage=(event:StorageEvent)=>{if(event.key===key&&wasDismissed(key))setOffer({identity,mode:'hidden'});};
  void refresh();
  for(const m of media)m.addEventListener?.('change',visible);
  window.addEventListener('focus',visible);window.addEventListener('online',visible);window.addEventListener('devyo-device-notifications',visible);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visible);
  return()=>{generation.current++;probe++;for(const m of media)m.removeEventListener?.('change',visible);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);window.removeEventListener('devyo-device-notifications',visible);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible);};
 },[api,identity,key,auth.userId,auth.sessionId,clerk]);

 function dismiss(){rememberDismissal(key);setOffer({identity,mode:'hidden'});}
 async function enable(){
  if(enabling.current||offer.identity!==identity||offer.mode!=='ready'||!offer.registration||!offer.publicKey)return;
  const n=generation.current,user=auth.userId,session=auth.sessionId;
  const current=()=>generation.current===n&&clerk.user?.id===user&&clerk.session?.id===session;
  enabling.current=true;setBusy(true);setMessage({identity,text:''});
  try{
   const permission=await enableDeviceNotifications(offer.registration,offer.publicKey,api,current);
   if(!current())return;
   rememberDismissal(key);setOffer({identity,mode:'hidden'});
   setMessage({identity,text:permission==='granted'?'Notifications enabled on this device. You can change them in Account settings.':permission==='denied'?'Notifications are blocked. You can change this in your phone or browser settings.':'Notifications stay off. You can enable them later in Account settings.'});
  }catch(error){if(current())setMessage({identity,text:error instanceof Error?error.message:'Notifications could not be enabled. Please try again.'});}
  finally{if(current()){enabling.current=false;setBusy(false);}}
 }
 const visible=offer.identity===identity&&identity&&offer.mode!=='hidden';
 return<>{message.identity===identity&&message.text&&<p className="notification-onboarding-result" role="status">{message.text}</p>}{visible&&<aside className="notification-onboarding" aria-labelledby="notification-onboarding-title">
  <div className="notification-onboarding-copy"><span className="eyebrow">YOUR APP, YOUR CHOICE</span><h2 id="notification-onboarding-title">Stay in the conversation</h2><p>Want a discreet alert for new messages in chats you’ve joined? Notifications are optional. Private message text and names stay off your lock screen.</p>
   {offer.mode==='loading'&&<p role="status">Checking notification support…</p>}
   {offer.mode==='blocked'&&<p>Notifications are blocked for Devyo. You can allow them in your phone or browser settings, or keep checking Chat here.</p>}
   {offer.mode==='unsupported'&&<p>This browser does not offer notifications here. You can still check every conversation in Chat.</p>}
   {offer.mode==='unavailable'&&<p>Notifications are being prepared. Your in-app conversations still work.</p>}
   {offer.mode==='error'&&<p role="status">Notification options could not be loaded. Reopen the app or try Account settings.</p>}
   <button className="notification-settings-link" type="button" onClick={onOpenSettings}>Notification options in Account settings</button>
  </div>
  <div className="notification-onboarding-actions"><button className="button primary" type="button" disabled={busy||offer.mode!=='ready'} onClick={()=>void enable()}>Enable notifications</button><button className="button secondary" type="button" disabled={busy} onClick={dismiss}>Not now</button></div>
 </aside>}</>;
}
