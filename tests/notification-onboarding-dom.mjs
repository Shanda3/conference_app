// Isolated synthetic UI checks. No real identities, browser permissions or push endpoints are used.
import assert from'node:assert/strict';
import{build}from'esbuild';
import{mkdtemp,readFile,rm,mkdir}from'node:fs/promises';
import{join}from'node:path';
import{pathToFileURL}from'node:url';
import React,{act}from'react';
import{endpointId}from'../lib/messaging.ts';

const{JSDOM}=await import(process.env.DEVYO_TOUR_JSDOM?pathToFileURL(process.env.DEVYO_TOUR_JSDOM).href:'jsdom');
const rootDir=new URL('../',import.meta.url).pathname;
await mkdir(join(rootDir,'.wrangler'),{recursive:true});
const temp=await mkdtemp(join(rootDir,'.wrangler/notification-dom-'));
let dom;
try{
 await build({stdin:{contents:`export{NotificationOnboarding}from'./app/notification-onboarding.tsx';export{PhoneAppSettings}from'./app/phone-app.tsx';`,resolveDir:rootDir,loader:'ts'},bundle:true,outfile:join(temp,'fixture.mjs'),format:'esm',platform:'node',external:['react','react/*','react-dom','react-dom/*'],loader:{'.css':'empty'},tsconfig:join(rootDir,'tsconfig.json'),plugins:[{name:'synthetic-auth-only',setup(b){
  b.onResolve({filter:/^@clerk\/react$/},()=>({path:'clerk',namespace:'synthetic'}));
  b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`const client={get user(){const a=globalThis.__notificationFixture;return a.user?{id:a.user}:null},get session(){const a=globalThis.__notificationFixture;return a.session?{id:a.session}:null}};export const useClerk=()=>client;export const useAuth=()=>{const a=globalThis.__notificationFixture;return{isLoaded:true,isSignedIn:!!a.user,userId:a.user,sessionId:a.session}};`,loader:'js'}));
 }}]});
 dom=new JSDOM('<!doctype html><html><head></head><body><main class="main"><header class="topbar">Navigation</header><div id="root"></div></main></body></html>',{url:'https://notification-fixture.invalid/',pretendToBeVisual:true});
 const w=dom.window;
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,HTMLElement:w.HTMLElement,Event:w.Event,StorageEvent:w.StorageEvent,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
 const state=globalThis.__notificationFixture={user:null,session:null};
 let standalone=false,supported=true,ready=true,getFailure=false,postFailure=false,subscribed=null,permissionRequests=0,browserSubscriptions=0,browserUnsubscribes=0,settingsOpened=0,nextPermission='granted',permissionGate=null;
 const requests=[],devices=new Map();
 const publicBytes=Buffer.alloc(65);publicBytes[0]=4;const publicKey=publicBytes.toString('base64url');
 const notification={permission:'default',requestPermission:async()=>{permissionRequests++;const result=permissionGate?await permissionGate:nextPermission;notification.permission=result;return result;}};
 w.Notification=notification;globalThis.Notification=notification;w.PushManager=function(){};
 Object.defineProperty(w,'isSecureContext',{configurable:true,get:()=>supported});
 Object.defineProperty(w.navigator,'userAgent',{configurable:true,value:'iPhone'});
 Object.defineProperty(w.navigator,'standalone',{configurable:true,get:()=>false});
 w.matchMedia=query=>({get matches(){return query==='(display-mode: standalone)'&&standalone;},addEventListener(){},removeEventListener(){}});
 const subscription=()=>({endpoint:'https://fcm.googleapis.com/notification-fixture',toJSON(){return{endpoint:this.endpoint};},unsubscribe:async()=>{browserUnsubscribes++;subscribed=null;return true;}});
 const registration={active:{postMessage(){}},pushManager:{getSubscription:async()=>subscribed,subscribe:async options=>{assert.equal(options.userVisibleOnly,true);assert.equal(options.applicationServerKey.byteLength,65);browserSubscriptions++;subscribed=subscription();return subscribed;}}};
 Object.defineProperty(w.navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)}});
 globalThis.fetch=async(path,options={})=>{
  assert.equal(path,'/api/push');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  const headers=new Headers(options.headers),user=headers.get('X-Expected-Devyo-User');assert.equal(user,state.user);assert.equal(headers.get('X-Expected-Devyo-Session'),state.session);
  const body=options.body?JSON.parse(options.body):null;requests.push({method:options.method??'GET',action:body?.action,user});
  if(!body){if(getFailure)throw Error('Offline fixture');return Response.json({ready,publicKey,devices:devices.get(user)??[]});}
  if(postFailure)return Response.json({error:'Fixture save failed'},{status:503});
  if(body.action==='subscribe'){const id=await endpointId(body.subscription.endpoint);devices.set(user,[{id,enabled:1}]);return Response.json({id,enabled:true});}
  if(body.action==='mute'){devices.set(user,[{id:body.id,enabled:body.muted?0:1}]);return Response.json({saved:true});}
  if(body.action==='unsubscribe'){devices.set(user,[]);return Response.json({saved:true});}
  throw Error('Unexpected fixture action');
 };
 const style=w.document.createElement('style');style.textContent=await readFile(join(rootDir,'app/notification-onboarding.css'),'utf8');w.document.head.append(style);
 const{createRoot}=await import('react-dom/client'),{NotificationOnboarding,PhoneAppSettings}=await import(pathToFileURL(join(temp,'fixture.mjs')).href);
 let root=createRoot(w.document.getElementById('root'));
 const wait=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,35));});
 const render=async(component=NotificationOnboarding)=>{await act(async()=>root.render(React.createElement(component,{onOpenSettings:()=>settingsOpened++})));await wait();};
 const remount=async(component=NotificationOnboarding)=>{await act(async()=>root.unmount());root=createRoot(w.document.getElementById('root'));await render(component);};
 const card=()=>w.document.querySelector('.notification-onboarding');
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
 const click=async b=>{assert.ok(b);await act(async()=>b.click());await wait();};
 const event=async name=>{await act(async()=>w.dispatchEvent(new w.Event(name)));await wait();};
 const user=async name=>{state.user='user_FixtureNotification'+name;state.session='session_NotificationFixture'+name;await remount();};
 const key=()=> 'devyo-notification-onboarding:v1:'+encodeURIComponent(state.user);
 const posts=()=>requests.filter(r=>r.method==='POST');

 standalone=true;await render();assert.equal(card(),null);assert.equal(requests.length,0,'Signed-out users never load notification configuration');
 standalone=false;await user('Browser');await event('appinstalled');await event('focus');assert.equal(card(),null);assert.equal(requests.length,0,'A browser tab is not an installed app window');
 standalone=true;await event('focus');assert.ok(card());assert.equal(button('Enable notifications').disabled,false);assert.equal(permissionRequests,0);assert.equal(browserSubscriptions,0);assert.equal(posts().length,0);
 for(const width of [320,390]){Object.defineProperty(w,'innerWidth',{configurable:true,value:width});await event('scroll');assert.equal(w.getComputedStyle(card()).position,'static');for(let a=card();a;a=a.parentElement)assert.ok(!['sticky','fixed'].includes(w.getComputedStyle(a).position));assert.equal(w.getComputedStyle(button('Enable notifications')).minHeight,'44px');assert.equal(w.getComputedStyle(button('Not now')).minHeight,'44px');}
 await click(button('Notification options in Account settings'));assert.equal(settingsOpened,1);
 await click(button('Not now'));assert.equal(card(),null);assert.equal(w.localStorage.getItem(key()),'dismissed');await remount();await event('focus');assert.equal(card(),null);assert.equal(permissionRequests,0);
 state.session='session_FreshLogin';await render();assert.equal(card(),null,'Dismissal survives a new login session for the same attendee');

 await user('StoredChoice');await click(button('Not now'));const storedKey=key();assert.equal(w.localStorage.getItem(storedKey),'dismissed');
 state.user='user_FixtureNotificationPreexistingChoice';state.session='session_PreexistingChoice';w.localStorage.setItem(key(),'dismissed');await remount();assert.equal(card(),null,'A stored choice is read before any offer');

 subscribed=subscription();const existingId=await endpointId(subscribed.endpoint);
 state.user='user_FixtureNotificationEnabled';state.session='session_Enabled';devices.set(state.user,[{id:existingId,enabled:1}]);await remount();assert.equal(card(),null,'Already enabled devices are not prompted');
 state.user='user_FixtureNotificationPaused';state.session='session_Paused';devices.set(state.user,[{id:existingId,enabled:0}]);await remount();assert.equal(card(),null,'Paused devices are not asked to opt in again');assert.equal(posts().length,0);subscribed=null;

 notification.permission='denied';await user('Blocked');assert.ok(card());assert.equal(button('Enable notifications').disabled,true);assert.match(card().textContent,/phone or browser settings/);assert.equal(permissionRequests,0);await click(button('Not now'));notification.permission='default';
 supported=false;await user('Unsupported');assert.ok(card());assert.equal(button('Enable notifications').disabled,true);assert.match(card().textContent,/does not offer notifications/);assert.equal(permissionRequests,0);await click(button('Not now'));supported=true;

 const localDescriptor=Object.getOwnPropertyDescriptor(w,'localStorage');Object.defineProperty(w,'localStorage',{configurable:true,get(){throw Error('Storage blocked fixture');}});
 await user('StorageFallback');await click(button('Not now'));assert.equal(w.sessionStorage.getItem(key()),'dismissed');await remount();assert.equal(card(),null);Object.defineProperty(w,'localStorage',localDescriptor);
 ready=false;await user('NotReady');assert.match(card().textContent,/being prepared/);assert.equal(button('Enable notifications').disabled,true);assert.equal(permissionRequests,0);ready=true;
 getFailure=true;await user('Offline');assert.match(card().textContent,/could not be loaded/);assert.equal(button('Enable notifications').disabled,true);getFailure=false;

 await user('EnabledByClick');const beforeEnable=posts().length;await click(button('Enable notifications'));assert.equal(permissionRequests,1);assert.equal(browserSubscriptions,1);assert.equal(posts().length,beforeEnable+1);assert.equal(posts().at(-1).action,'subscribe');assert.equal(card(),null);assert.match(w.document.body.textContent,/Notifications enabled on this device/);await remount();assert.equal(card(),null);
 await render(PhoneAppSettings);await click(button('Pause notifications on this device'));assert.equal(devices.get(state.user)[0].enabled,0);await click(button('Resume notifications on this device'));assert.equal(devices.get(state.user)[0].enabled,1);await click(button('Turn off device notifications'));assert.equal(subscribed,null);await render();assert.equal(card(),null,'Turning notifications off later does not restart onboarding');

 notification.permission='default';nextPermission='default';await user('PermissionDismissed');const beforeDismiss=posts().length;await click(button('Enable notifications'));assert.equal(card(),null);assert.match(w.document.body.textContent,/Notifications stay off/);assert.equal(posts().length,beforeDismiss);assert.equal(browserSubscriptions,1);await remount();assert.equal(card(),null);
 nextPermission='denied';await user('PermissionDenied');await click(button('Enable notifications'));assert.equal(card(),null);assert.match(w.document.body.textContent,/Notifications are blocked/);await remount();assert.equal(card(),null);notification.permission='default';nextPermission='granted';

 await user('SessionRace');let resolvePermission;permissionGate=new Promise(resolve=>resolvePermission=resolve);const beforeRacePosts=posts().length,beforeRaceSubscriptions=browserSubscriptions;await click(button('Enable notifications'));assert.equal(button('Enable notifications').disabled,true);await click(button('Enable notifications'));
 state.user='user_FixtureNotificationReplacement';state.session='session_Replacement';await render();await act(async()=>resolvePermission('granted'));await wait();permissionGate=null;assert.equal(posts().length,beforeRacePosts);assert.equal(browserSubscriptions,beforeRaceSubscriptions,'An old account consent cannot create a subscription after an account switch');assert.doesNotMatch(w.document.body.textContent,/Notifications enabled on this device/);

 notification.permission='granted';postFailure=true;await user('SaveFailure');const unsubscribesBefore=browserUnsubscribes;await click(button('Enable notifications'));assert.ok(card());assert.match(w.document.body.textContent,/Fixture save failed/);assert.equal(browserUnsubscribes,unsubscribesBefore+1);assert.equal(subscribed,null,'A newly created subscription is revoked when saving fails');assert.equal(button('Enable notifications').disabled,false);
 subscribed=subscription();await user('ExistingSubscriptionFailure');const existingUnsubscribes=browserUnsubscribes;await click(button('Enable notifications'));assert.equal(browserUnsubscribes,existingUnsubscribes,'A failed save does not revoke an existing subscription belonging to another attempt');postFailure=false;
 assert.ok(posts().every(r=>['subscribe','mute','unsubscribe'].includes(r.action)),'No message, membership or broadcast actions');
 await act(async()=>root.unmount());
 console.log(JSON.stringify({passed:true,signedInStandaloneOnly:true,noAutomaticPermissionOrSubscription:true,normalDocumentFlow:true,structuralViewportWidths:[320,390],minimumTargets44px:true,settingsAccessPreserved:true,dismissalStoredPerAccountAndDevice:true,dismissalSurvivesNewSession:true,storageFallback:true,enabledAndPausedSuppressed:true,deniedAndUnsupportedTruthful:true,unavailableAndOfflineTruthful:true,explicitEnableUsesExistingFlow:true,settingsPauseResumeUnsubscribe:true,permissionDismissalNotNagged:true,accountSwitchCannotSubscribe:true,failedSaveRevokesOnlyNewSubscription:true,privatePushPayloadsSent:0,realNotifications:0,realBrowserSubscriptions:0,syntheticOnly:true}));
}finally{delete globalThis.__notificationFixture;dom?.window.close();await rm(temp,{recursive:true,force:true});}
