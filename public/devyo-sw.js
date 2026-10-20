/* No fetch handler and no Cache API: authenticated pages and APIs always use the network. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>event.waitUntil((async()=>{
 // Empty push messages deliberately carry no private content or deep links.
 let total=0;try{const r=await fetch('/api/messaging?view=badge',{credentials:'same-origin',cache:'no-store'});if(r.ok){const d=await r.json();if(Number.isSafeInteger(d.total)&&d.total>0)total=Math.min(d.total,9999)}}catch{}
 try{if(total&&self.navigator.setAppBadge)await self.navigator.setAppBadge(total);else if(self.navigator.clearAppBadge)await self.navigator.clearAppBadge()}catch{}
 await self.registration.showNotification('Devyo',{body:'New activity in your chats. Open Devyo to catch up.',icon:'/devyo-icon-192.png',badge:'/devyo-badge.png',tag:'devyo-chat-activity',data:{path:'/?open=chat'}});
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'devyo-chat-activity'});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true}),client=clients.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.focus();client.postMessage({type:'devyo-open-chat'})}else await self.clients.openWindow('/?open=chat')})())});
self.addEventListener('message',event=>{if(event.data?.type==='devyo-clear-notifications')event.waitUntil((async()=>{for(const n of await self.registration.getNotifications({tag:'devyo-chat-activity'}))n.close();try{await self.navigator.clearAppBadge?.()}catch{}})())});
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{try{await self.navigator.clearAppBadge?.()}catch{}for(const c of await self.clients.matchAll({type:'window'}))c.postMessage({type:'devyo-push-expired'})})()));
