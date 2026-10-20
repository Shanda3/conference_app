import{endpointId,pushEndpoint,type MessageScope}from'./messaging.ts';
import{MessagingD1,messagingReady,assertMessagingSchema,memberSQL,visibleSQL}from'./messaging-d1.ts';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function pushConfigured(env:Cloudflare.Env){return messagingReady(env)&&env.DEVYO_PUSH_ENABLED==='true'&&/^[A-Za-z0-9_-]{87}$/.test(env.DEVYO_VAPID_PUBLIC_KEY??'')&&/^[A-Za-z0-9_-]{43}$/.test(env.DEVYO_VAPID_PRIVATE_KEY??'')&&/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.DEVYO_VAPID_SUBJECT??'')}
/** RFC 8292. Keys are supplied by the operator; this code never generates or persists keys. */
export async function vapidAuthorization(endpoint:string,env:Cloudflare.Env,now=Date.now()){
 const pub=decode(env.DEVYO_VAPID_PUBLIC_KEY!),d=decode(env.DEVYO_VAPID_PRIVATE_KEY!);if(pub.length!==65||pub[0]!==4||d.length!==32)throw Error('Invalid VAPID configuration');
 const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode(pub.slice(1,33)),y:encode(pub.slice(33)),d:encode(d),ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const token=encode(new TextEncoder().encode(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+encode(new TextEncoder().encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+3600,sub:env.DEVYO_VAPID_SUBJECT})));
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(token));return`vapid t=${token}.${encode(new Uint8Array(signature))}, k=${env.DEVYO_VAPID_PUBLIC_KEY}`;
}
export async function queueMessagePush(env:Cloudflare.Env,scope:MessageScope,room:string,id:string){
 if(!pushConfigured(env)||!env.DB)return;await assertMessagingSchema(env.DB);const table=scope==='group'?'private_group_messages':'chat_messages',column=scope==='group'?'group_id':'conference_id',now=Date.now();
 await env.DB.prepare(`INSERT INTO push_deliveries(subscription_id,scope,room,message_id,created_at,expires_at) SELECT s.id,?,?,m.id,?,? FROM push_subscriptions s JOIN ${table} m ON m.id=? AND m.${column}=? WHERE s.enabled=1 AND s.expires_at>? AND s.owner_id!=m.owner_id AND m.deleted_at IS NULL AND ${memberSQL(scope,'s.owner_id',`m.${column}`)} AND ${visibleSQL(scope,'m.owner_id','s.owner_id')} AND NOT EXISTS(SELECT 1 FROM message_read_state r WHERE r.owner_id=s.owner_id AND r.scope=? AND r.room=? AND r.muted=1) ON CONFLICT DO NOTHING`).bind(scope,room,now,now+300000,id,room,now,scope,room).run();
}
/** Empty-payload Web Push: no message text, group names, sender, private links or counts leave the server. */
export async function deliverPendingPush(env:Cloudflare.Env,send:typeof fetch=fetch,now=Date.now()){
 if(!pushConfigured(env)||!env.DB)return{sent:0,removed:0};const db=env.DB;await assertMessagingSchema(db);
 await db.prepare('DELETE FROM push_subscriptions WHERE expires_at<=?').bind(now).run();await db.prepare('DELETE FROM push_deliveries WHERE expires_at<=? OR attempts>=3').bind(now).run();
 const jobs=await db.prepare('SELECT d.subscription_id,d.scope,d.room,d.message_id FROM push_deliveries d WHERE d.next_attempt_at<=? AND d.lease_until<=? ORDER BY d.created_at LIMIT 20').bind(now,now).all<{subscription_id:string;scope:MessageScope;room:string;message_id:string}>();let sent=0,removed=0;
 for(const j of jobs.results){
  const args=[j.subscription_id,j.scope,j.message_id],claim=await db.prepare('UPDATE push_deliveries SET lease_until=?,attempts=attempts+1 WHERE subscription_id=? AND scope=? AND message_id=? AND lease_until<=? RETURNING attempts').bind(now+30000,...args,now).first<{attempts:number}>();if(!claim)continue;
  const remove=()=>db.prepare('DELETE FROM push_deliveries WHERE subscription_id=? AND scope=? AND message_id=?').bind(...args).run();
  const sub=await db.prepare('SELECT owner_id,endpoint FROM push_subscriptions WHERE id=? AND enabled=1 AND expires_at>?').bind(j.subscription_id,now).first<{owner_id:string;endpoint:string}>();
  try{
   if(!sub){await remove();continue}const store=new MessagingD1(db,sub.owner_id);await store.message(j.scope,j.room,j.message_id);const c=await store.count(j.scope,j.room);if(c.muted||!c.unread){await remove();continue}
   // Recheck subscription/closing immediately before the external request. No redirect following/SSRF.
   if(!await db.prepare('SELECT 1 FROM push_subscriptions s WHERE id=? AND enabled=1 AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=s.owner_id)').bind(j.subscription_id).first()){await remove();continue}
   const endpoint=pushEndpoint(sub.endpoint),auth=await vapidAuthorization(endpoint,env,now);await store.message(j.scope,j.room,j.message_id);const response=await send(endpoint,{method:'POST',redirect:'manual',headers:{Authorization:auth,TTL:'300',Urgency:'low'},signal:AbortSignal.timeout(10000)});
   if(response.status===404||response.status===410){await db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(j.subscription_id).run();removed++}
   else if(response.ok){await remove();sent++}
   else if(response.status===429||response.status>=500)await db.prepare('UPDATE push_deliveries SET lease_until=0,next_attempt_at=? WHERE subscription_id=? AND scope=? AND message_id=?').bind(now+60000*claim.attempts,...args).run();
   else await remove();
  }catch(error){if(error instanceof Error&&'status'in error){await remove()}else await db.prepare('UPDATE push_deliveries SET lease_until=0,next_attempt_at=? WHERE subscription_id=? AND scope=? AND message_id=?').bind(now+60000*claim.attempts,...args).run()}
 }
 return{sent,removed};
}
export async function savePushSubscription(db:D1Database,owner:string,session:string,raw:unknown,now=Date.now()){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid subscription');const endpoint=pushEndpoint((raw as{endpoint?:unknown}).endpoint),id=await endpointId(endpoint);
 const old=await db.prepare('SELECT owner_id FROM push_subscriptions WHERE id=?').bind(id).first<{owner_id:string}>();if(old&&old.owner_id!==owner)throw Error('This browser is linked to another account. Turn off browser notifications, then enable them again.');
 const result=await db.prepare(`INSERT INTO push_subscriptions(id,owner_id,session_id,endpoint,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) AND(SELECT COUNT(*) FROM push_subscriptions WHERE owner_id=? AND expires_at>? AND id!=?)<10 ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,expires_at=excluded.expires_at,enabled=1 WHERE push_subscriptions.owner_id=excluded.owner_id AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=excluded.owner_id)`).bind(id,owner,session,endpoint,now,now+30*86400000,owner,owner,now,id).run();
 if(!result.meta.changes)throw Error('Notification subscription could not be saved. Remove an old device and retry.');return id;
}
