import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdir,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const root=new URL('../',import.meta.url).pathname;await mkdir(join(root,'.wrangler'),{recursive:true});const temp=await mkdtemp(join(root,'.wrangler/social-render-'));
try{
 await build({entryPoints:[join(root,'app/attendee-social-client.tsx')],outfile:join(temp,'components.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},tsconfig:join(root,'tsconfig.json')});
 const {CommunityBadges,ConnectionNotifications}=await import(new URL('file://'+join(temp,'components.mjs')).href);
 test('public community labels keep member/interested meanings distinct and use fixed verified links',()=>{
  const html=renderToStaticMarkup(createElement(CommunityBadges,{communities:[{id:'shecodesokc',relationship:'member'},{id:'okc-coffee-and-code',relationship:'interested'}]}));assert.match(html,/Community · SheCodesOKC/);assert.match(html,/Interested in joining · OKC Coffee and Code/);assert.match(html,/https:\/\/shecodesokc.org\//);assert.doesNotMatch(html,/verified member|<iframe|<script|email=|phone=/);
 });
 test('connection notices escape chosen names and expose only explicit profile/connect/read/dismiss actions',()=>{
  const notices={notifications:[{id:'00000000-0000-4000-8000-000000000001',memberId:'00000000-0000-4000-8000-000000000002',displayName:'Fixture <script>alert(1)</script>',conferenceId:'thunderplains-2026',createdAt:Date.UTC(2026,9,14),readAt:null,profilePath:'/?attendee=00000000-0000-4000-8000-000000000002',notes:'PRIVATE_NOTE_SENTINEL',email:'PRIVATE_EMAIL_SENTINEL'}],unreadCount:1,error:'',loading:false,busy:false,refresh(){},action(){}};
  const html=renderToStaticMarkup(createElement(ConnectionNotifications,{notices,onConnect(){},onSettings(){},savedConnectionIds:[],connectionsBusy:false}));assert.match(html,/Fixture &lt;script&gt;/);assert.match(html,/Connect back/);assert.match(html,/Mark as read/);assert.match(html,/Dismiss/);assert.match(html,/View attendee profile/);assert.doesNotMatch(html,/<script|PRIVATE_NOTE|PRIVATE_EMAIL|mailto:|sms:/);
 });
}finally{await rm(temp,{recursive:true,force:true})}
