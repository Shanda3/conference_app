import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{emptyState}from'../lib/planner.ts';import{toPlannerSession,type ProgramSeed}from'../lib/program-model.ts';
import{initialApprovedProgram,checkedOrganizerProgram,legacyPrivateIntent,projectApprovedPlanner,changedPrivateIntent}from'../lib/organizer-review-model.ts';
import{ORGANIZER_AFTER_PARTY}from'../lib/organizer-session-extras.ts';
const seed=JSON.parse(await readFile(new URL('../lib/event-data.json',import.meta.url),'utf8')) as ProgramSeed,base=initialApprovedProgram(seed),talk=base.find(s=>s.sourceId==='1353991')!;
test('local live adapter accepts only complete fixed-source identities and exact statuses',()=>{
 const changed=base.filter(s=>s.id!==ORGANIZER_AFTER_PARTY.id).map(s=>s.id===talk.id?{...s,title:'Synthetic updated public title',room:'Wrong feed room',status:'cancelled' as const}:s);
 const result=checkedOrganizerProgram(changed,base,seed);assert.equal(result.find(s=>s.id===talk.id)!.room,'Room 301 AB');assert.match(result.find(s=>s.id===talk.id)!.title,/^\[Cancelled\]/);assert.deepEqual(result.find(s=>s.id===ORGANIZER_AFTER_PARTY.id),ORGANIZER_AFTER_PARTY);
 for(const status of [['cancelled'],{status:'cancelled'},null])assert.throws(()=>checkedOrganizerProgram(changed.map(s=>s.id===talk.id?{...s,status}:s),base,seed));
 assert.throws(()=>checkedOrganizerProgram(changed.filter(s=>s.id!==talk.id),base,seed));assert.throws(()=>checkedOrganizerProgram(changed.map(s=>s.id===talk.id?{...s,sourceId:'new-source'}:s),base,seed));
});
test('legacy intent is conservative and new explicit historical-value edits stay durable',()=>{
 const state={...emptyState(),initialized:true,conferences:seed.conferences.map(({id,name,startDate,endDate,timeZone,location,url,description})=>({id,name,startDate,endDate,timeZone,location,url,description})),sessions:base.map(toPlannerSession),savedSessionIds:[talk.id],sessionNotes:{[talk.id]:'SYNTHETIC_PRIVATE_NOTE'}};
 const updated=base.map(s=>s.id===talk.id?{...s,title:'New public title'}:s),legacy=legacyPrivateIntent(state,base);
 assert.deepEqual(projectApprovedPlanner(state,updated,legacy).sessions.find(s=>s.id===talk.id),state.sessions.find(s=>s.id===talk.id));
 const projected=projectApprovedPlanner(state,updated,{}),edited=structuredClone(projected);edited.sessions.find(s=>s.id===talk.id)!.title=talk.title;
 const intent=changedPrivateIntent(projected,edited,updated,{});assert.deepEqual(intent[talk.id],['title']);
 const later=updated.map(s=>s.id===talk.id?{...s,title:'Next public title'}:s),result=projectApprovedPlanner(edited,later,intent);
 assert.equal(result.sessions.find(s=>s.id===talk.id)!.title,talk.title);assert.deepEqual(result.sessionNotes,state.sessionNotes);assert.deepEqual(result.savedSessionIds,state.savedSessionIds);
});
