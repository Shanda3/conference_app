import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMUNITIES,COMMUNITY_DIRECTORY,communityMatches,validateCommunities,publicCommunities,connectionMember,connectionDraft} from '../lib/attendee-social.ts';
import {emptyState} from '../lib/planner.ts';
import {readSharingBody} from '../lib/sharing.ts';
test('community choices require explicit known groups and a distinct relationship',()=>{
 assert.equal(COMMUNITIES.length,19);assert.equal(new Set(COMMUNITIES.map(g=>g.id)).size,19);
 assert.deepEqual(validateCommunities([]),[]);
 const choices=[{id:'shecodesokc',relationship:'member'},{id:'okc-coffee-and-code',relationship:'interested'}];assert.deepEqual(validateCommunities(choices),choices);
 for(const value of [null,{},[{id:'unlisted',relationship:'member'}],[{id:'shecodesokc',relationship:'verified'}],[...choices,{id:'shecodesokc',relationship:'interested'}],[{...choices[0],email:'private@example.com'}]])assert.throws(()=>validateCommunities(value));
 assert.deepEqual(publicCommunities('invalid'),[]);assert.deepEqual(publicCommunities(JSON.stringify(choices)),choices);
});
test('community URLs use verified sources, with official directory fallbacks for unavailable direct links',()=>{
 for(const group of COMMUNITIES){const url=new URL(group.url);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.ok(['www.meetup.com','shecodesokc.org','www.techlahoma.org'].includes(url.hostname))}
 for(const id of ['ux-connect-okc','tulsa-tech-entrepreneurs','urban-coders-guild'])assert.equal(COMMUNITIES.find(g=>g.id===id)?.url,COMMUNITY_DIRECTORY);
});
test('OK AI and Oklahoma AI searches find the single OklahomAI OKC choice',()=>{
 for(const query of ['OK AI','Oklahoma AI','OklahomAI']){const found=COMMUNITIES.filter(group=>communityMatches(group,query));assert.deepEqual(found.map(g=>g.id),['oklahomai-okc']);assert.equal(found[0].url,'https://www.meetup.com/oklahom_ai/')}
});
test('explicit connection requests cannot replace ownership or use unlisted conferences',()=>{
 const state={...emptyState(),conferences:[{id:'thunderplains-2026',name:'ThunderPlains',startDate:'2026-10-21',endDate:'2026-10-21',timeZone:'America/Chicago',location:'OKC',url:'https://2026.thunderplainsconf.com/',description:''}]};
 const draft={id:'member-00000000-0000-4000-8000-000000000001',conferenceId:'thunderplains-2026',name:'Chosen name',role:'',company:'',notes:'PRIVATE_NOTE',linkedInUrl:'',followUpDate:'',status:'want-to-meet' as const};
 assert.equal(connectionMember(connectionDraft(draft,state)),'00000000-0000-4000-8000-000000000001');
 assert.throws(()=>connectionDraft({...draft,ownerId:'another-owner'},state));assert.throws(()=>connectionDraft({...draft,conferenceId:'unlisted'},state));assert.throws(()=>connectionMember({...draft,id:'manual-contact'}));
});
test('larger explicit connection bodies remain bounded while legacy endpoints keep their 8 KB limit',async()=>{
 const body=JSON.stringify({notes:'n'.repeat(8000),extra:'x'.repeat(1000)});const request=()=>new Request('https://thunderplains.devyo.app/api/attendee-social',{method:'POST',headers:{'Content-Type':'application/json'},body});
 await assert.rejects(()=>readSharingBody(request()));assert.equal((await readSharingBody(request(),16384) as {notes:string}).notes.length,8000);
 await assert.rejects(()=>readSharingBody(new Request('https://thunderplains.devyo.app',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)}),16384));
});
