import{PHOTO_EVENT,PHOTO_LIMITS,PhotoError,type PhotoSettings,validatePhotoWebp}from'./photo-model.ts';
type PhotoRow={image:ArrayBuffer|number[]|null;visible:number;fallback:'initials'|'gravatar';revision:number;change_token:string};
export const PHOTO_CLEANUP_TABLES=['member_profile_photos','profile_photo_daily','profile_photo_work'] as const;
const schema=['member_profile_photos','profile_photo_daily','profile_photo_monthly','profile_photo_work','photo_work_expiry','photo_storage_count','photo_block_insert','photo_block_update','photo_block_work','photo_block_daily_insert','photo_block_daily_update','photo_close_work'];
export async function assertPhotoSchema(db:D1Database){const rows=(await db.prepare(`SELECT name FROM sqlite_master WHERE name IN(${schema.map(()=>'?').join(',')})`).bind(...schema).all<{name:string}>()).results;if(schema.some(name=>!rows.some(r=>r.name===name)))throw new PhotoError('Photo storage is being prepared.',503)}
export class PhotoD1{
 readonly db:D1Database;readonly owner:string;constructor(db:D1Database,owner:string){this.db=db;this.owner=owner}
 async active(){if(await this.db.prepare('SELECT 1 FROM account_deletions WHERE owner_id=?').bind(this.owner).first())throw new PhotoError('Your account is unavailable.',403)}
 row(){return this.db.prepare('SELECT image,visible,fallback,revision,change_token FROM member_profile_photos WHERE owner_id=? AND event_id=?').bind(this.owner,PHOTO_EVENT).first<PhotoRow>()}
 async settings():Promise<PhotoSettings&{gravatarAvailable:boolean}>{await this.active();const row=await this.row(),gravatar=!!await this.db.prepare('SELECT 1 FROM member_avatars WHERE owner_id=?').bind(this.owner).first();await this.active();return{enabled:true,hasPhoto:!!row?.image,visible:row?.visible===1,fallback:row?.fallback??(gravatar?'gravatar':'initials'),revision:row?.revision??0,gravatarAvailable:gravatar}}
 async reserve(revision:number,now=Date.now()){
  await this.active();if(((await this.row())?.revision??0)!==revision)throw new PhotoError('Your photo changed. Reload before saving.',409);
  const id=crypto.randomUUID(),day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);
  const results=await this.db.batch<{id?:string}>([
   this.db.prepare('DELETE FROM profile_photo_work WHERE expires_at<=?').bind(now),
   this.db.prepare(`INSERT INTO profile_photo_work(id,owner_id,expires_at,budget_month) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?) AND COALESCE((SELECT revision FROM member_profile_photos WHERE owner_id=?),0)=? AND COALESCE((SELECT attempts FROM profile_photo_daily WHERE owner_id=? AND day=?),0)<? AND COALESCE((SELECT attempts FROM profile_photo_monthly WHERE month=?),0)<? AND (SELECT COUNT(*) FROM profile_photo_work WHERE expires_at>?)<? AND (EXISTS(SELECT 1 FROM member_profile_photos WHERE owner_id=? AND image IS NOT NULL) OR (SELECT COUNT(*) FROM member_profile_photos WHERE image IS NOT NULL)<?) RETURNING id`).bind(id,this.owner,now+PHOTO_LIMITS.leaseMs,month,this.owner,this.owner,revision,this.owner,day,PHOTO_LIMITS.perDay,month,PHOTO_LIMITS.perMonth,now,PHOTO_LIMITS.inFlight,this.owner,PHOTO_LIMITS.storedPhotos),
   this.db.prepare('INSERT INTO profile_photo_daily(owner_id,day,attempts) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM profile_photo_work WHERE id=? AND owner_id=?) ON CONFLICT(owner_id,day) DO UPDATE SET attempts=attempts+1').bind(this.owner,day,id,this.owner),
   this.db.prepare('INSERT INTO profile_photo_monthly(month,attempts) SELECT ?,1 WHERE EXISTS(SELECT 1 FROM profile_photo_work WHERE id=? AND owner_id=?) ON CONFLICT(month) DO UPDATE SET attempts=attempts+1').bind(month,id,this.owner),
  ]);
  if(!results[1].results.some(r=>r.id===id)){await this.active();if(((await this.row())?.revision??0)!==revision)throw new PhotoError('Your photo changed. Reload before saving.',409);throw new PhotoError('Photo processing is busy or your upload limit has been reached. Reload before trying later.',429)}return id;
 }
 async beforeTransform(id:string,revision:number){await this.active();const now=Date.now(),month=new Date(now).toISOString().slice(0,7);const allowed=await this.db.prepare('SELECT 1 FROM profile_photo_work WHERE id=? AND owner_id=? AND expires_at>? AND budget_month=? AND COALESCE((SELECT revision FROM member_profile_photos WHERE owner_id=?),0)=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)').bind(id,this.owner,now,month,this.owner,revision,this.owner).first();if(!allowed)throw new PhotoError('Your photo processing reservation changed. Reload before saving.',409);}
 async release(id:string){await this.db.prepare('DELETE FROM profile_photo_work WHERE id=? AND owner_id=?').bind(id,this.owner).run()}
 async write(revision:number,image:Uint8Array|null|undefined,visible:boolean,fallback:'initials'|'gravatar',work?:string,now=Date.now()){
  await this.active();const current=await this.row();if((current?.revision??0)!==revision)throw new PhotoError('Your photo changed. Reload before saving.',409);
  if(fallback==='gravatar'&&!await this.db.prepare('SELECT 1 FROM member_avatars WHERE owner_id=?').bind(this.owner).first())throw new PhotoError('Enable your account’s Gravatar first, or choose initials.',409);
  if(visible&&!current?.image&&image===undefined)throw new PhotoError('Add a photo before showing it to attendees.');
  if(image instanceof Uint8Array){if(!work)throw new PhotoError('Photo processing must be reserved before saving.',409);validatePhotoWebp(image);}
  const token=crypto.randomUUID(),next=revision+1,blob=image===undefined?(current?.image?new Uint8Array(current.image).buffer:null):image===null?null:new Uint8Array(image).buffer;
  const guard=`NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=?)${work?' AND EXISTS(SELECT 1 FROM profile_photo_work WHERE id=? AND owner_id=? AND expires_at>?)':''}${image instanceof Uint8Array?' AND (EXISTS(SELECT 1 FROM member_profile_photos WHERE owner_id=? AND image IS NOT NULL) OR (SELECT COUNT(*) FROM member_profile_photos WHERE image IS NOT NULL)<?)':''}`,args:(string|number)[]=work?[this.owner,work,this.owner,now]:[this.owner];if(image instanceof Uint8Array)args.push(this.owner,PHOTO_LIMITS.storedPhotos);
  const results=await this.db.batch<{change_token?:string}>([
   this.db.prepare(`UPDATE member_profile_photos SET image=?,visible=?,fallback=?,revision=?,change_token=?,updated_at=? WHERE owner_id=? AND event_id=? AND revision=? AND ${guard} RETURNING change_token`).bind(blob,Number(visible&&!!blob),fallback,next,token,now,this.owner,PHOTO_EVENT,revision,...args),
   this.db.prepare(`INSERT INTO member_profile_photos(owner_id,event_id,image,visible,fallback,revision,change_token,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ?=0 AND ${guard} ON CONFLICT(owner_id) DO NOTHING RETURNING change_token`).bind(this.owner,PHOTO_EVENT,blob,Number(visible&&!!blob),fallback,next,token,now,revision,...args),
  ]);
  if(![...results[0].results,...results[1].results].some(r=>r.change_token===token))throw new PhotoError('Your photo or account changed. Reload before saving.',409);
  const result=await this.settings();if(result.revision!==next)throw new PhotoError('Your photo changed again. Reload before saving.',409);return result;
 }
 async image(member:string|null,self:boolean,deliver=true){
  await this.active();const target=self?this.owner:(await this.db.prepare('SELECT owner_id FROM community_members WHERE id=?').bind(member).first<{owner_id:string}>())?.owner_id;if(target&&await this.db.prepare('SELECT 1 FROM account_deletions WHERE owner_id=?').bind(target).first())throw new PhotoError('Photo unavailable.',404);const row=self?await this.db.prepare(`SELECT p.* FROM member_profile_photos p WHERE p.owner_id=? AND p.event_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=p.owner_id)`).bind(this.owner,PHOTO_EVENT).first<PhotoRow&{owner_id:string}>():await this.db.prepare(`SELECT p.* FROM member_profile_photos p JOIN community_members m ON m.owner_id=p.owner_id WHERE m.id=? AND p.event_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=p.owner_id)`).bind(member,PHOTO_EVENT).first<PhotoRow&{owner_id:string}>();
  if(!row)return{bytes:null,fallback:'gravatar' as const}; // preserve pre-existing Gravatar opt-in for unconfigured accounts
  if(!deliver||!row.image||(!self&&row.owner_id!==this.owner&&row.visible!==1))return{bytes:null,fallback:row.fallback};
  const bytes=new Uint8Array(row.image);validatePhotoWebp(bytes);
  // Recheck target visibility/version and both deletion fences immediately before delivery.
  const allowed=await this.db.prepare('SELECT 1 FROM member_profile_photos WHERE owner_id=? AND event_id=? AND revision=? AND (owner_id=? OR visible=1) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(?,?))').bind(row.owner_id,PHOTO_EVENT,row.revision,this.owner,this.owner,row.owner_id).first();
  if(!allowed)throw new PhotoError('Photo unavailable.',404);return{bytes,fallback:row.fallback};
 }
}
