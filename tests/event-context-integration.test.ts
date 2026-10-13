import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadPlannerForEvent} from '../lib/event-context.ts';import {emptyState} from '../lib/planner.ts';
const tp={id:'thunderplains-2026-101',conferenceId:'thunderplains-2026',title:'Approved',start:'2026-10-21T14:15:00Z',end:'2026-10-21T15:15:00Z',speaker:'Public speaker',room:'301CD',track:'Web',description:'',url:'',sourceUrl:''};
test('new event planner uses approved sessions and sends both program and SDK revision pins',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[],starter={...emptyState(),initialized:true,sessions:[{...tp,title:'Old seed'}, {...tp,id:'inno',conferenceId:'innotech-oklahoma-2026',title:'Keep InnoTech'}]};
 const transport=async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(url),init});return calls.length===1?Response.json({state:emptyState(),revision:0,programSessions:[tp],programRevisions:{'thunderplains-2026':2}}):Response.json({state:JSON.parse(String(init!.body)).state,revision:1,programRevisions:{'thunderplains-2026':2}})};
 const result=await loadPlannerForEvent('thunderplains-2026',()=>structuredClone(starter),transport as typeof fetch,{userId:'user_synthetic',sessionId:'sess_synthetic',isCurrent:()=>true});assert.equal(result.state.sessions.find(s=>s.conferenceId==='thunderplains-2026')!.title,'Approved');assert.ok(result.state.sessions.some(s=>s.id==='inno'));assert.deepEqual(result.programRevisions,{'thunderplains-2026':2});
 for(const c of calls){assert.equal(new Headers(c.init?.headers).get('X-Expected-Devyo-User'),'user_synthetic');assert.equal(new Headers(c.init?.headers).get('X-Expected-Devyo-Session'),'sess_synthetic');}assert.deepEqual(JSON.parse(String(calls[1].init!.body)).programRevisions,{'thunderplains-2026':2});
});
test('session replacement during a planner read cannot initialize or show the old account',async()=>{
 let active=true,calls=0;const transport=async()=>{calls++;active=false;return Response.json({state:emptyState(),revision:0})};await assert.rejects(loadPlannerForEvent('thunderplains-2026',emptyState,transport as typeof fetch,{userId:'user_synthetic',sessionId:'sess_synthetic',isCurrent:()=>active}),/session changed/);assert.equal(calls,1);
});
test('an existing private planner is never seeded or sent back automatically',async()=>{
 const state={...emptyState(),initialized:true,sessionNotes:{private:'Synthetic private note'}};let calls=0;const result=await loadPlannerForEvent('thunderplains-2026',()=>{throw Error('Must not initialize')},(async()=>{calls++;return Response.json({state,revision:7,programRevisions:{'thunderplains-2026':2}})}) as typeof fetch);assert.deepEqual(result.state,state);assert.equal(calls,1);
});
