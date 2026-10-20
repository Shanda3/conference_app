import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import catalog from '../lib/event-data.json' with {type:'json'};
import {seedSessions,toPlannerSession} from '../lib/program-model.ts';
import {TALK_GUIDES,talkPrepFor,prepUnavailableFor,type TalkGuide} from '../lib/talk-prep.ts';
import {prepCacheKey,providerPrepBody,generateAIPrep,type AIPrepRequest} from '../lib/ai-prep.ts';
import {emptyTalkPreferences} from '../lib/talk-preferences.ts';
const published=seedSessions(catalog),panel=published.find(s=>s.sourceId==='d83eb1e9-4bf2-46c4-89ba-59ead52e773c')!,rag=published.find(s=>s.sourceId==='1242850')!,guide=TALK_GUIDES.find(g=>g.sourceId==='1252756')!,now=Date.parse('2026-10-15T00:10:00Z');
const reviewed={...published.find(s=>s.id===guide.id)!,prepAbstract:{status:'ok' as const,hash:guide.abstractHash,checkedAt:new Date(now).toISOString()}};
const request=(sessionId=guide.id):AIPrepRequest=>({requestId:'00000000-0000-4000-8000-000000000001',sessionId,kind:'prep',preferences:emptyTalkPreferences(),selectedNotes:'',consent:true,regenerate:false});

test('the new panel has its own canonical identity and no borrowed reviewed guide',()=>{
 assert.equal(panel.title,'Panel Discussion: AI Implementation Stories');assert.notEqual(panel.id,rag.id);assert.equal(talkPrepFor(panel,published,now).status,'unreviewed');assert.equal(talkPrepFor(rag,published,now).status,'changed');
 const result=prepUnavailableFor({...panel,title:rag.title,description:'PRIVATE_DESCRIPTION'},published,'unreviewed');assert.equal(result.kind,'panel');assert.equal(result.entry?.title,panel.title);assert.equal(result.entry?.description,'');assert.match(result.message,/not available for this panel/);assert.doesNotMatch(JSON.stringify(result),/Lightning|RAG for|PRIVATE_/);
});
test('panel fallback follows the matching published description after a program update',()=>{
 const changed={...panel,title:'Panel Discussion: Current Implementation Stories',description:'Public panel description from the updated program.'};const result=prepUnavailableFor(panel,[changed],'unreviewed');assert.equal(result.entry?.title,changed.title);assert.equal(result.entry?.description,changed.description);
});
test('lightning wording is confined to actual published lightning rounds',()=>{
 for(const round of published.filter(s=>/^Lightning Talks \(Round/.test(s.title)))assert.equal(prepUnavailableFor(round,published,'unreviewed').kind,'lightning');
 const unknown={...panel,id:'custom-lightning',title:'Lightning Talks (Round 1)'};const missing=prepUnavailableFor(unknown,published,'unreviewed');assert.equal(missing.kind,'session');assert.equal(missing.entry,null);assert.doesNotMatch(missing.message,/lightning/i);
 const ordinary={...panel,title:'Building a lightning-fast application'};assert.equal(prepUnavailableFor(ordinary,[ordinary],'unreviewed').kind,'session');
});
test('unknown sessions get a neutral fallback without another session or private context',()=>{
 const unknown={...panel,id:'unknown-guide',title:rag.title,description:'PRIVATE_NOTES'};const result=prepUnavailableFor(unknown,published,'unreviewed');assert.equal(result.entry,null);assert.match(result.message,/not available for this session/);assert.doesNotMatch(JSON.stringify(result),/RAG for|Lightning|PRIVATE_/);
});
test('time moves preserve reviewed eligibility but changed title, description or abstract hide old guides',async()=>{
 assert.equal(talkPrepFor(reviewed,[reviewed],now).status,'ready');const moved={...reviewed,start:'2026-10-21T21:30:00.000Z',end:'2026-10-21T22:30:00.000Z'};assert.equal(talkPrepFor(moved,[moved],now).status,'ready');
 for(const changed of [{...reviewed,title:'Updated official title'},{...reviewed,description:'Updated official description'},{...reviewed,prepAbstract:{...reviewed.prepAbstract,hash:'changed'}}])assert.equal(talkPrepFor(changed,[changed],now).status,'changed');
 assert.equal(await prepCacheKey(request(),guide),await prepCacheKey({...request(),requestId:'00000000-0000-4000-8000-000000000002'},guide));
});
test('cache identity changes with public title, description, source, abstract or opted-in labels',async()=>{
 const key=await prepCacheKey(request(),guide);
 for(const changed of [{...guide,title:'Updated public title'},{...guide,catalogDescription:'Updated public description'},{...guide,sourceUrl:guide.sourceUrl+'-updated'},{...guide,abstractHash:'updated-abstract'}])assert.notEqual(await prepCacheKey(request(),changed),key);
 assert.notEqual(await prepCacheKey({...request(),preferences:{stack:['python'],interests:[],personalizationOptIn:true}},guide),key);
});
test('a panel request cannot use the removed RAG guide or reach cache/provider through a mismatched guide',async()=>{
 const old=TALK_GUIDES.find(g=>g.id===rag.id)!;assert.throws(()=>providerPrepBody(request(panel.id),old),/invalid/);await assert.rejects(prepCacheKey(request(panel.id),old),/invalid/);
 let databaseCalls=0,providerCalls=0;const db={prepare(){databaseCalls++;throw Error('Unexpected cache access')}} as unknown as D1Database;
 await assert.rejects(generateAIPrep(db,'fixture-owner','fixture-not-a-key',request(panel.id),old,now,async()=>{providerCalls++;throw Error('Unexpected provider call')}),/invalid/);assert.equal(databaseCalls,0);assert.equal(providerCalls,0);
});
test('provider context uses the supplied matching public panel title and description without borrowing another talk',()=>{
 // This synthetic context tests the provider contract, not production guide approval.
 const synthetic:TalkGuide={id:panel.id,conferenceId:panel.conferenceId,sourceId:panel.sourceId,title:panel.title,speaker:'',catalogDescription:'SYNTHETIC_PUBLIC_PANEL_DESCRIPTION',abstractHash:'synthetic-panel-hash',reviewedAt:new Date(now).toISOString(),sourceUrl:panel.url,detailUrl:panel.sourceUrl,primer:'Synthetic test only',terms:[],background:'',questions:[],readings:[]};
 const body=providerPrepBody(request(panel.id),synthetic),payload=JSON.parse(body.input[1].content);assert.equal(payload.context.publicSession.title,panel.title);assert.equal(payload.context.publicSession.description,synthetic.catalogDescription);assert.doesNotMatch(JSON.stringify(body),/RAG for Data Engineers|PRIVATE_/);
});

const root=new URL('../',import.meta.url).pathname;await mkdir(join(root,'.wrangler'),{recursive:true});const dir=await mkdtemp(join(root,'.wrangler/panel-render-'));
try{
 await build({entryPoints:[join(root,'app/talk-prep-unavailable.tsx')],outfile:join(dir,'fallback.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',tsconfig:join(root,'tsconfig.json')});const{TalkPrepUnavailable}=await import(new URL('file://'+join(dir,'fallback.mjs')).href);
 test('panel UI renders a truthful missing-description state without lightning or reviewed-guide claims',()=>{
  const html=renderToStaticMarkup(createElement(TalkPrepUnavailable,{session:toPlannerSession(panel),published,status:'unreviewed'}));assert.match(html,/Panel Discussion: AI Implementation Stories/);assert.match(html,/does not include a detailed panel description/);assert.match(html,/AI questions stay unavailable/);assert.doesNotMatch(html,/lightning|reviewed October 13|RAG for Data Engineers/i);
 });
 test('lightning description updates and changed/stale messages remain truthful in rendered UI',()=>{
  const round=published.find(s=>/^Lightning Talks \(Round/.test(s.title))!,withTopics={...round,description:'Published individual topics.'};const html=renderToStaticMarkup(createElement(TalkPrepUnavailable,{session:round,published:[withTopics],status:'unreviewed'}));assert.match(html,/Published individual topics/);assert.doesNotMatch(html,/topics are not listed/);
  for(const status of ['changed','stale']){const html=renderToStaticMarkup(createElement(TalkPrepUnavailable,{session:reviewed,published:[reviewed],status}));assert.match(html,/hidden/);assert.doesNotMatch(html,/Lightning|reviewed October 13/)}
 });
}finally{await rm(dir,{recursive:true,force:true})}
