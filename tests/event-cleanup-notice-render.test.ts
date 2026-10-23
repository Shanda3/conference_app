import test from'node:test';import assert from'node:assert/strict';
import{build}from'esbuild';import{mkdir,mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{pathToFileURL}from'node:url';import{createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';
import{THUNDERPLAINS_CLEANUP}from'../lib/event-cleanup-review.ts';
const root=new URL('../',import.meta.url).pathname;await mkdir(join(root,'.wrangler'),{recursive:true});const temp=await mkdtemp(join(root,'.wrangler/cleanup-render-'));
try{
 await build({entryPoints:[join(root,'app/event-cleanup-notice.tsx')],outfile:join(temp,'notice.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},tsconfig:join(root,'tsconfig.json')});
 const{EventCleanupNoticeView}=await import(pathToFileURL(join(temp,'notice.mjs')).href);
 test('notice exposes the exact requested deadline without claiming scheduled or completed deletion',()=>{
  const html=renderToStaticMarkup(createElement(EventCleanupNoticeView,{now:THUNDERPLAINS_CLEANUP.deadlineAt-1}));assert.match(html,/October 23, 2026 at 5:30 p.m. CDT/);assert.match(html,/not yet scheduled/);assert.match(html,/not a deletion confirmation/);assert.match(html,/href="\/notes"/);assert.match(html,/provider backups and logs/);assert.doesNotMatch(html,/your account has been deleted|will be deleted automatically|position:fixed|position:sticky/);
 });
 test('crossing the deadline reports unconfirmed cleanup, with an in-flow notes action',()=>{
  const html=renderToStaticMarkup(createElement(EventCleanupNoticeView,{now:THUNDERPLAINS_CLEANUP.deadlineAt,onOpenNotes(){}}));assert.match(html,/requested deadline has passed/);assert.match(html,/Cleanup has not been confirmed/);assert.match(html,/<button type="button"/);assert.doesNotMatch(html,/href="\/notes"/);
 });
}finally{await rm(temp,{recursive:true,force:true})}
