import{publicLinkedIn}from'./profile-visibility.ts';
import{validateDisplayName,type VerifiedCatalog}from'./sharing.ts';
import{NETWORKING_EVENT,NETWORKING_CATEGORIES,NETWORKING_OPTIONS,NETWORKING_MAX,NetworkingError,emptyNetworking,validateNetworkingDraft,networkingObject,networkingRevision,networkingQuery,canonicalThunderPlainsPlan,type NetworkingDraft,type NetworkingProfile,type NetworkingReview,type NetworkingMember,type NetworkingPage}from'./networking.ts';
type Args=(string|number|null)[];
type Cursor={v:number;epoch:number;fingerprint:string;score:number;name:string;id:string};
type Candidate={id:string;displayName:string;nameKey:string;me:number;internal_owner:string;legacyPlan:string|null;publicLinkedIn:string|null;sharedInterests:number};
export const NETWORKING_CLEANUP_SQL=['DELETE FROM member_networking_tags WHERE owner_id=?','DELETE FROM member_networking_profiles WHERE owner_id=?','DELETE FROM networking_event_attendees WHERE owner_id=?'] as const;
export async function assertNetworkingReady(db:D1Database){
 const expected=['networking_event_attendees','networking_directory_revision','member_networking_profiles','member_networking_tags','networking_filter_idx','networking_block_insert','networking_block_update','networking_block_tag','networking_delete_intent','networking_tags_insert','networking_tags_delete','attendance_insert','attendance_delete','directory_name_update','directory_name_insert','directory_name_delete','directory_member_insert','directory_member_delete','networking_visibility_update','networking_linkedin_update','networking_plan_insert','networking_plan_update','networking_plan_delete'];
 const rows=await db.prepare(`SELECT name FROM sqlite_master WHERE name IN(${expected.map(()=>'?').join(',')})`).bind(...expected).all<{name:string}>();
 if(expected.some(name=>!rows.results.some(row=>row.name===name)))throw new NetworkingError('Networking is being prepared. Your existing connections are still available.',503);
 const epoch=await db.prepare('SELECT revision FROM networking_directory_revision WHERE event_id=?').bind(NETWORKING_EVENT).first();if(!epoch)throw new NetworkingError('Networking is being prepared.',503);
}
async function sha(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('')}
export class NetworkingD1{
 constructor(readonly db:D1Database,readonly owner:string,readonly catalog:VerifiedCatalog){}
 private get<T>(sql:string,args:Args=[]){return this.db.prepare(sql).bind(...args).first<T>()}
 private async all<T>(sql:string,args:Args=[]){return(await this.db.prepare(sql).bind(...args).all<T>()).results}
 /** Called only after authenticated TP context, strict session pin and feature checks. */
 async register(){
  await this.db.batch([
   this.db.prepare('INSERT INTO community_members(id,owner_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) ON CONFLICT(owner_id) DO NOTHING').bind(crypto.randomUUID(),this.owner,this.owner),
   this.db.prepare('INSERT INTO networking_event_attendees(event_id,owner_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM community_members WHERE owner_id=?) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) ON CONFLICT(event_id,owner_id) DO NOTHING').bind(NETWORKING_EVENT,this.owner,this.owner,this.owner),
  ]);await this.active();
 }
 async active(){if(!await this.get(`SELECT 1 AS ok FROM networking_event_attendees WHERE owner_id=? AND event_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)`,[this.owner,NETWORKING_EVENT,this.owner]))throw new NetworkingError('Your conference account is unavailable.',403)}
 async profile():Promise<NetworkingProfile>{await this.active();const row=await this.get<{draft_json:string;visible:number;revision:number}>('SELECT draft_json,visible,revision FROM member_networking_profiles WHERE owner_id=? AND event_id=?',[this.owner,NETWORKING_EVENT]);return row?{draft:validateNetworkingDraft(JSON.parse(row.draft_json)),visible:row.visible===1,revision:row.revision}:{draft:emptyNetworking(),visible:false,revision:0}}
 private reviewHash(revision:number,draft:NetworkingDraft,name:string){return sha(JSON.stringify([NETWORKING_EVENT,this.owner,revision,name,draft]))}
 async preview(raw:unknown):Promise<NetworkingReview>{
  const body=networkingObject(raw,['draft','expectedRevision']),draft=validateNetworkingDraft(body.draft),revision=networkingRevision(body.expectedRevision),own=await this.profile();
  if(own.revision!==revision)throw new NetworkingError('Your settings changed. Reload before reviewing.',409);
  const row=await this.get<{display_name:string}>('SELECT display_name FROM profiles WHERE owner_id=?',[this.owner]);if(!row)throw new NetworkingError('Choose a display name in Profile & sharing first.',409);
  const displayName=validateDisplayName(row.display_name);return{displayName,networking:draft,reviewHash:await this.reviewHash(revision,draft,displayName),revision};
 }
 async save(raw:unknown):Promise<NetworkingProfile>{
  await this.active();const body=networkingObject(raw,['draft','expectedRevision','visibility'],['reviewHash']),draft=validateNetworkingDraft(body.draft),revision=networkingRevision(body.expectedRevision);
  if(body.visibility!=='private'&&body.visibility!=='attendees')throw new NetworkingError('Choose who can see your networking details.');const visible=body.visibility==='attendees';
  const nameRow=visible?await this.get<{display_name:string}>('SELECT display_name FROM profiles WHERE owner_id=?',[this.owner]):null;
  const name=nameRow?validateDisplayName(nameRow.display_name):null;
  if(visible&&(!NETWORKING_CATEGORIES.some(c=>draft[c].length)||!name))throw new NetworkingError('Choose a display name and at least one networking label before showing details.');
  if(visible&&body.reviewHash!==await this.reviewHash(revision,draft,name!))throw new NetworkingError('Review these exact details before showing them to attendees.',409);
  const token=crypto.randomUUID(),json=JSON.stringify(draft),next=revision+1,now=Date.now();
  const active=`EXISTS(SELECT 1 FROM networking_event_attendees WHERE owner_id=? AND event_id=?) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)`,args:Args=[this.owner,NETWORKING_EVENT,this.owner];
  const nameGuard=visible?'AND EXISTS(SELECT 1 FROM profiles WHERE owner_id=? AND display_name=?)':'',nameArgs:Args=visible?[this.owner,name!]:[];
  const writes=[
   this.db.prepare(`UPDATE member_networking_profiles SET draft_json=?,visible=?,revision=?,change_token=?,updated_at=? WHERE owner_id=? AND event_id=? AND revision=? AND ${active} ${nameGuard} RETURNING change_token`).bind(json,Number(visible),next,token,now,this.owner,NETWORKING_EVENT,revision,...args,...nameArgs),
   this.db.prepare(`INSERT INTO member_networking_profiles(owner_id,event_id,draft_json,visible,revision,change_token,updated_at) SELECT ?,?,?,?,?,?,? WHERE ?=0 AND ${active} ${nameGuard} ON CONFLICT(owner_id,event_id) DO NOTHING RETURNING change_token`).bind(this.owner,NETWORKING_EVENT,json,Number(visible),next,token,now,revision,...args,...nameArgs),
   this.db.prepare('DELETE FROM member_networking_tags WHERE owner_id=? AND event_id=? AND EXISTS(SELECT 1 FROM member_networking_profiles WHERE owner_id=? AND event_id=? AND change_token=?)').bind(this.owner,NETWORKING_EVENT,this.owner,NETWORKING_EVENT,token),
  ];
  if(visible)for(const category of NETWORKING_CATEGORIES)for(const tag of draft[category])writes.push(this.db.prepare('INSERT INTO member_networking_tags(owner_id,event_id,category,tag) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM member_networking_profiles WHERE owner_id=? AND event_id=? AND change_token=? AND visible=1)').bind(this.owner,NETWORKING_EVENT,category,tag,this.owner,NETWORKING_EVENT,token));
  const results=await this.db.batch<{change_token?:string}>(writes);if(![...results[0].results,...results[1].results].some(row=>row.change_token===token))throw new NetworkingError('Your settings changed. Reload and review before saving.',409);
  const after=await this.get<{change_token:string}>('SELECT change_token FROM member_networking_profiles WHERE owner_id=? AND event_id=?',[this.owner,NETWORKING_EVENT]);if(after?.change_token!==token)throw new NetworkingError('Your settings changed again. Reload before saving.',409);return this.profile();
 }
 async sharedPlan(member:string){
  await this.active();if(!/^[a-zA-Z0-9-]{16,64}$/.test(member))throw new NetworkingError('Shared plan unavailable.',404);
  const row=await this.get<{payload_json:string}>(`SELECT s.payload_json FROM member_plans s JOIN community_members m ON m.owner_id=s.owner_id JOIN networking_event_attendees a ON a.owner_id=m.owner_id AND a.event_id=? WHERE m.id=? AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.owner_id=m.owner_id)`,[NETWORKING_EVENT,member]);
  const plan=canonicalThunderPlainsPlan(row?.payload_json,this.catalog);if(!plan)throw new NetworkingError('This attendee has not shared a current ThunderPlains-only plan. They can review and share again.',404);await this.active();return{plan};
 }
 async directory(params:URLSearchParams):Promise<NetworkingPage>{
  await this.active();const query=networkingQuery(params),epoch=(await this.get<{revision:number}>('SELECT revision FROM networking_directory_revision WHERE event_id=?',[NETWORKING_EVENT]))!.revision;
  const own=(await this.all<{tag:string}>(`SELECT t.tag FROM member_networking_tags t JOIN member_networking_profiles p ON p.owner_id=t.owner_id AND p.event_id=t.event_id AND p.visible=1 WHERE t.owner_id=? AND t.event_id=? AND t.category='interests'`,[this.owner,NETWORKING_EVENT])).map(r=>r.tag).sort();
  if(query.sort==='shared'&&!own.length)throw new NetworkingError('Show at least one networking interest to use shared-interest sorting.');
  const fingerprint=await sha(JSON.stringify([NETWORKING_EVENT,this.owner,query.interests,query.stack,query.goals,query.sort,query.limit,own]));let cursor:Cursor|null=null;
  if(query.cursor){try{const raw=networkingObject(JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8')),['v','epoch','fingerprint','score','name','id']);if(raw.v!==1||raw.epoch!==epoch||raw.fingerprint!==fingerprint||!Number.isSafeInteger(raw.score)||Number(raw.score)<0||Number(raw.score)>NETWORKING_MAX||typeof raw.name!=='string'||raw.name.length>100||typeof raw.id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(raw.id))throw Error();cursor=raw as Cursor}catch{throw new NetworkingError('Attendees or filters changed. Refresh results.',409)}}
  const args:Args=[this.owner,NETWORKING_EVENT,...own,NETWORKING_EVENT],where:string[]=[];
  for(const category of NETWORKING_CATEGORIES)if(query[category].length){where.push(`EXISTS(SELECT 1 FROM member_networking_tags f JOIN member_networking_profiles fp ON fp.owner_id=f.owner_id AND fp.event_id=f.event_id AND fp.visible=1 WHERE f.owner_id=m.owner_id AND f.event_id=a.event_id AND f.category=? AND f.tag IN(${query[category].map(()=>'?').join(',')}))`);args.push(category,...query[category])}
  const score=own.length?`SELECT COUNT(*) FROM member_networking_tags t JOIN member_networking_profiles sp ON sp.owner_id=t.owner_id AND sp.event_id=t.event_id AND sp.visible=1 WHERE t.owner_id=m.owner_id AND t.event_id=? AND t.category='interests' AND t.tag IN(${own.map(()=>'?').join(',')})`:'SELECT 0 WHERE ? IS NOT NULL';
  let sql=`WITH candidates AS(SELECT m.id,COALESCE(p.display_name,'Attendee') AS displayName,LOWER(COALESCE(p.display_name,'Attendee')) AS nameKey,m.owner_id=? AS me,m.owner_id AS internal_owner,s.payload_json AS legacyPlan,CASE WHEN p.linkedin_visible=1 THEN p.linkedin_url ELSE NULL END AS publicLinkedIn,(${score}) AS sharedInterests FROM networking_event_attendees a JOIN community_members m ON m.owner_id=a.owner_id LEFT JOIN profiles p ON p.owner_id=m.owner_id LEFT JOIN member_plans s ON s.owner_id=m.owner_id WHERE a.event_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.owner_id=m.owner_id) ${where.length?'AND '+where.join(' AND '):''}) SELECT * FROM candidates`;
  if(cursor){sql+=query.sort==='shared'?' WHERE sharedInterests<? OR(sharedInterests=? AND(nameKey>? OR(nameKey=? AND id>?)))':' WHERE nameKey>? OR(nameKey=? AND id>?)';args.push(...(query.sort==='shared'?[cursor.score,cursor.score]:[]),cursor.name,cursor.name,cursor.id)}
  sql+=` ORDER BY ${query.sort==='shared'?'sharedInterests DESC,':''}nameKey,id LIMIT ?`;args.push(query.limit+1);const rows=await this.all<Candidate>(sql,args),page=rows.slice(0,query.limit);
  const tags=page.length?await this.all<{owner_id:string;category:string;tag:string}>(`SELECT t.owner_id,t.category,t.tag FROM member_networking_tags t JOIN member_networking_profiles p ON p.owner_id=t.owner_id AND p.event_id=t.event_id AND p.visible=1 WHERE t.event_id=? AND t.owner_id IN(${page.map(()=>'?').join(',')})`,[NETWORKING_EVENT,...page.map(r=>r.internal_owner)]):[];
  await this.active();if(epoch!==(await this.get<{revision:number}>('SELECT revision FROM networking_directory_revision WHERE event_id=?',[NETWORKING_EVENT]))!.revision)throw new NetworkingError('Attendees changed. Refresh results.',409);
  const members:NetworkingMember[]=page.map(row=>{const networking=emptyNetworking();for(const t of tags.filter(t=>t.owner_id===row.internal_owner)){const category=NETWORKING_CATEGORIES.find(c=>c===t.category);if(category&&NETWORKING_OPTIONS[category].some(([id])=>id===t.tag))networking[category].push(t.tag)}for(const c of NETWORKING_CATEGORIES)networking[c].sort();const linkedInUrl=publicLinkedIn(row.publicLinkedIn);return{id:row.id,displayName:validateDisplayName(row.displayName),me:row.me,shared:canonicalThunderPlainsPlan(row.legacyPlan,this.catalog)?1:0,networking,sharedInterests:row.sharedInterests,...(linkedInUrl?{linkedInUrl}:{})}});
  const last=page.at(-1),nextCursor=rows.length>query.limit?Buffer.from(JSON.stringify({v:1,epoch,fingerprint,score:last!.sharedInterests,name:last!.nameKey,id:last!.id})).toString('base64url'):null;
  return{members,nextCursor,hasMore:!!nextCursor,sort:query.sort,sharedSortAvailable:own.length>0,epoch};
 }
}
