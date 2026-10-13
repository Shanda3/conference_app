import{sql}from'drizzle-orm';import type{getDb}from'../db/index.ts';import{validateLinkedInUrl}from './sharing.ts';
type VisibilityDb=Pick<ReturnType<typeof getDb>,'all'|'run'|'$client'>;
const ready=new WeakSet<object>();
/** Additive opt-in column only: existing private URLs get false, never automatic publication. */
export async function ensureLinkedInVisibility(db:VisibilityDb){
 const key=db.$client??db;if(ready.has(key))return;
 // A pending D1 operation belongs to its request. Cache completed readiness only.
 const columns=await db.all<{name:string}>(sql`PRAGMA table_info(profiles)`);if(!columns.some(c=>c.name==='linkedin_visible')){
  try{await db.run(sql`ALTER TABLE profiles ADD COLUMN linkedin_visible INTEGER NOT NULL DEFAULT 0`)}catch(error){const latest=await db.all<{name:string}>(sql`PRAGMA table_info(profiles)`);if(!latest.some(c=>c.name==='linkedin_visible'))throw error}
 }ready.add(key);
}
export function publicLinkedIn(value:unknown){try{const url=validateLinkedInUrl(value);return url||undefined}catch{return undefined}}
