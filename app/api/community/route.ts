import{env}from'cloudflare:workers';
import {getAuthContext} from '@/lib/auth-context';
import {AttendeeSocialD1,assertSocialSchema} from '@/lib/attendee-social-d1';
import {SOCIAL_EVENT,communityDefinition,publicCommunities,AttendeeSocialError} from '@/lib/attendee-social';
import {ensureLinkedInVisibility,publicLinkedIn} from "@/lib/profile-visibility";
import { chatRequestId } from "@/lib/chat";
import { sql } from "drizzle-orm";
import { getAppUser } from "@/app/auth";
import { getDb } from "@/db";
import verifiedCatalog from "@/lib/event-data.json";
import {latestShareCatalog,type ShareProgramRow} from "@/lib/share-program";
import { validateState } from "@/lib/planner";
import { assertSameOrigin, createShareToken, hashShareToken, hashSharedSchedule, objectWithKeys, PRIVATE_RESPONSE_HEADERS, projectSharedSchedule, readSharingBody, SharingError, validateDisplayName, validateSharedSchedule } from "@/lib/sharing";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: PRIVATE_RESPONSE_HEADERS});
const archivedGroup=()=>env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY==='true'?sql`EXISTS(SELECT 1 FROM account_deletions d WHERE d.owner_id=g.owner_id)`:sql`0`;
function id(value: unknown): string {
  if(typeof value !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(value)) throw new SharingError("Choose a valid member or group.");
  return value;
}
function text(value: unknown, max: number): string {
  if(typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw new SharingError(`Enter between 1 and ${max} characters.`);
  return value.trim();
}
async function snapshot(owner: string) {
  const [row] = await getDb().all<{display_name:string; state_json:string; revision:number}>(sql`SELECT p.display_name, s.state_json, s.revision FROM profiles p JOIN planner_states s ON s.owner_id=p.owner_id WHERE p.owner_id=${owner}`);
  if(!row) throw new SharingError("Save your display name and planner first.",409);
  const result = projectSharedSchedule(validateState(JSON.parse(row.state_json)),validateDisplayName(row.display_name),await latestShareCatalog(verifiedCatalog,()=>getDb().all<ShareProgramRow>(sql`SELECT conference_id,last_success_at,sessions_json FROM public_program_sources`)));
  return {...result,revision:row.revision,previewHash:await hashSharedSchedule(result.preview)};
}
async function membership(group: string, owner: string, requireOwner=false) {
  const [row] = await getDb().all<{id:string;name:string;isOwner:number;archived:number}>(sql`SELECT g.id,g.name,g.owner_id=${owner} AS isOwner,${archivedGroup()} AS archived FROM private_groups g WHERE g.id=${group} AND (g.owner_id=${owner} OR EXISTS(SELECT 1 FROM private_group_members m WHERE m.group_id=g.id AND m.owner_id=${owner}))`);
  if(!row || (requireOwner&&!row.isOwner)) throw new SharingError("Group not found or unavailable.",404);
  return row;
}
export async function GET(request: Request): Promise<Response> {
  try {
    const user=await getAppUser();
    if(!user)return json({error:"Sign in to see attendees and groups."},401);
    const owner=user.userId, db=getDb(), q=new URL(request.url).searchParams;
    await ensureLinkedInVisibility(db);
    const social=env.DEVYO_ATTENDEE_SOCIAL_SCHEMA_READY==='true';
    if(social){if(env.DEVYO_ACCOUNT_DELETION_SCHEMA_READY!=='true'||!env.DB)throw new SharingError('Community privacy controls are being prepared.',503);await assertSocialSchema(env.DB)}
    // The directory registers app attendees, not unrelated users in the identity provider.
    await db.run(sql`INSERT INTO community_members(id,owner_id) VALUES(${crypto.randomUUID()},${owner}) ON CONFLICT(owner_id) DO NOTHING`);
    if(q.has("preview"))return json(await snapshot(owner));
    if(q.has('profile')){
      if(!social||getAuthContext().eventId!==SOCIAL_EVENT)throw new SharingError('Attendee profile unavailable.',404);
      if(q.size!==1||q.getAll('profile').length!==1)throw new SharingError('Choose one attendee.');
      const member=await new AttendeeSocialD1(env.DB!,owner).member(id(q.get('profile')));
      return json({member:{...member,communities:env.DEVYO_COMMUNITIES_ENABLED==='true'?member.communities:[]}});
    }
    if(q.has("member")) {
      const member=id(q.get("member"));
      if(social){if(getAuthContext().eventId!==SOCIAL_EVENT)throw new SharingError('Open this on the ThunderPlains site.',404);await new AttendeeSocialD1(env.DB!,owner).member(member)}
      const [row]=await db.all<{payload_json:string}>(sql`SELECT p.payload_json FROM member_plans p JOIN community_members m ON m.owner_id=p.owner_id WHERE m.id=${member}`);
      if(!row)return json({error:"This attendee has not shared a plan, or has stopped sharing."},404);
      return json({plan:validateSharedSchedule(JSON.parse(row.payload_json))});
    }
    if(q.has("group")) {
      const group=id(q.get("group")), selected=await membership(group,owner);
      const messages=await db.all(sql`SELECT id, (SELECT m.id FROM community_members m WHERE m.owner_id=private_group_messages.owner_id) AS memberId, display_name AS displayName, body, created_at AS createdAt, owner_id=${owner} AS mine FROM private_group_messages WHERE group_id=${group} AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`);
      const members=await db.all(sql`SELECT m.id,COALESCE(p.display_name,'Attendee') AS displayName FROM community_members m LEFT JOIN profiles p ON p.owner_id=m.owner_id WHERE m.owner_id IN (SELECT owner_id FROM private_group_members WHERE group_id=${group}) OR m.owner_id IN (SELECT owner_id FROM private_groups WHERE id=${group}) ORDER BY displayName,m.id`);
      const invites=selected.isOwner?await db.all(sql`SELECT id,expires_at AS expiresAt,revoked_at IS NOT NULL AS revoked FROM private_group_invites WHERE group_id=${group} ORDER BY expires_at DESC LIMIT 100`):[];
      await membership(group,owner); // Recheck after reads if removal raced this request.
      return json({group:selected,messages:messages.reverse(),members,invites});
    }
    if(social&&getAuthContext().eventId!==SOCIAL_EVENT)throw new SharingError('Open attendees on the ThunderPlains site.',404);
    const community=q.get('community'),relationship=q.get('relationship')??'all';
    if([...q.keys()].some(k=>!['offset','community','relationship'].includes(k))||[...new Set(q.keys())].some(k=>q.getAll(k).length!==1))throw new SharingError('Use valid directory filters.');
    if(community&&!communityDefinition(community)||!['all','member','interested'].includes(relationship)||q.has('relationship')&&!community)throw new SharingError('Choose a listed community and relationship.');
    if(community&&(!social||env.DEVYO_COMMUNITIES_ENABLED!=='true'))throw new SharingError('Community filters are being prepared.',503);
    const offset=Math.max(0,Math.min(100000,Number(q.get("offset"))||0));
    const privacy=social?sql`NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(${owner},m.owner_id)) AND NOT EXISTS(SELECT 1 FROM attendee_blocks WHERE event_id=${SOCIAL_EVENT} AND ((owner_id=${owner} AND blocked_owner_id=m.owner_id) OR(owner_id=m.owner_id AND blocked_owner_id=${owner})))`:sql`1`;
    const filter=community?sql`EXISTS(SELECT 1 FROM attendee_communities c WHERE c.owner_id=m.owner_id AND c.event_id=${SOCIAL_EVENT} AND c.community_id=${community} AND (${relationship}='all' OR c.relationship=${relationship}))`:sql`1`;
    const badges=social&&env.DEVYO_COMMUNITIES_ENABLED==='true'?sql`COALESCE((SELECT json_group_array(json_object('id',community_id,'relationship',relationship)) FROM attendee_communities WHERE owner_id=m.owner_id AND event_id=${SOCIAL_EVENT}),'[]')`:sql`'[]'`;
    const members=await db.all<{id:string;displayName:string;me:number;shared:number;publicLinkedIn:string|null;communities:string}>(sql`SELECT m.id,COALESCE(p.display_name,'Attendee') AS displayName,m.owner_id=${owner} AS me,EXISTS(SELECT 1 FROM member_plans s WHERE s.owner_id=m.owner_id) AS shared,CASE WHEN p.linkedin_visible=1 THEN p.linkedin_url ELSE NULL END AS publicLinkedIn,${badges} communities FROM community_members m LEFT JOIN profiles p ON p.owner_id=m.owner_id WHERE ${privacy} AND ${filter} ORDER BY displayName,m.id LIMIT 101 OFFSET ${Math.floor(offset)}`);
    const groups=await db.all(sql`SELECT g.id,g.name,g.owner_id=${owner} AS isOwner,${archivedGroup()} AS archived FROM private_groups g WHERE g.owner_id=${owner} OR EXISTS(SELECT 1 FROM private_group_members m WHERE m.group_id=g.id AND m.owner_id=${owner}) ORDER BY g.created_at DESC`);
    const [self]=await db.all<{shared:number}>(sql`SELECT EXISTS(SELECT 1 FROM member_plans WHERE owner_id=${owner}) AS shared`);
    return json({members:members.slice(0,100).map(({publicLinkedIn:link,communities,...member})=>{const linkedInUrl=publicLinkedIn(link);return{...member,communities:publicCommunities(communities),...(linkedInUrl?{linkedInUrl}:{})}}),hasMore:members.length>100,groups,sharing:!!self.shared});
  } catch(error) {return failure(error);}
}
export async function POST(request: Request): Promise<Response> {
  try {
    const user=await getAppUser();
    if(!user)return json({error:"Sign in to use attendees and groups."},401);
    assertSameOrigin(request);
    const raw=await readSharingBody(request);
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new SharingError("Send a valid request.");
    const action=(raw as Record<string,unknown>).action, owner=user.userId,db=getDb(),now=Date.now();
    if(action==="publish") {
      const b=objectWithKeys(raw,["action","revision","previewHash"]), s=await snapshot(owner);
      if(b.revision!==s.revision||b.previewHash!==s.previewHash)throw new SharingError("Your plan changed. Review it again before sharing.",409);
      if(!s.preview.sessions.length)throw new SharingError("Save a verified session first.",409);
      const rows=await db.all(sql`INSERT INTO member_plans(owner_id,payload_json) SELECT ${owner},${JSON.stringify(s.preview)} WHERE EXISTS(SELECT 1 FROM planner_states WHERE owner_id=${owner} AND revision=${s.revision}) AND EXISTS(SELECT 1 FROM profiles WHERE owner_id=${owner} AND display_name=${s.preview.displayName}) ON CONFLICT(owner_id) DO UPDATE SET payload_json=excluded.payload_json RETURNING owner_id`);
      if(!rows.length)throw new SharingError("Your plan changed. Review it again.",409);
      return json({shared:true});
    }
    if(action==="unpublish") {objectWithKeys(raw,["action"]);await db.run(sql`DELETE FROM member_plans WHERE owner_id=${owner}`);return json({shared:false});}
    if(action==="create-group") {
      const b=objectWithKeys(raw,["action","name"]),name=text(b.name,60),group=crypto.randomUUID();
      const rows=await db.all(sql`INSERT INTO private_groups(id,owner_id,name,created_at) SELECT ${group},${owner},${name},${now} WHERE (SELECT COUNT(*) FROM private_groups WHERE owner_id=${owner})<10 RETURNING id`);
      if(!rows.length)throw new SharingError("You can create up to 10 private groups.",429);
      return json({id:group},201);
    }
    if(action==="join") {
      const b=objectWithKeys(raw,["action","token"]);
      if(typeof b.token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(b.token))throw new SharingError("This invitation is invalid or expired.",404);
      const hash=await hashShareToken(b.token);
      // Validate and join in one statement, so revocation/expiry cannot race acceptance.
      const rows=await db.all<{group_id:string}>(sql`INSERT INTO private_group_members(group_id,owner_id,joined_at) SELECT group_id,${owner},${now} FROM private_group_invites WHERE token_hash=${hash} AND revoked_at IS NULL AND expires_at>${now} ON CONFLICT(group_id,owner_id) DO UPDATE SET joined_at=private_group_members.joined_at RETURNING group_id`);
      if(!rows.length)throw new SharingError("This invitation is invalid or expired.",404);
      return json({id:rows[0].group_id});
    }
    if(action==="invite") {
      const b=objectWithKeys(raw,["action","group"]),group=id(b.group);await membership(group,owner,true);
      const token=createShareToken(),hash=await hashShareToken(token),invite=crypto.randomUUID(),expires=now+7*86400000;
      // Invitations always last seven days. Count the last day's creation cohort,
      // including revoked links, so revocation cannot reset the storage quota.
      const rows=await db.all(sql`INSERT INTO private_group_invites(id,group_id,token_hash,expires_at) SELECT ${invite},${group},${hash},${expires} WHERE (SELECT COUNT(*) FROM private_group_invites WHERE group_id=${group} AND expires_at>${now} AND revoked_at IS NULL)<10 AND (SELECT COUNT(*) FROM private_group_invites WHERE group_id=${group} AND expires_at>${now+6*86400000})<10 RETURNING id`);
      if(!rows.length)throw new SharingError("Each group allows 10 active invitations and 10 new invitations per 24 hours. Try again later.",429);
      return json({path:`/#group-invite=${token}`,expiresAt:expires},201);
    }
    if(action==="revoke-invite") {
      const b=objectWithKeys(raw,["action","group","invite"]),group=id(b.group),invite=id(b.invite);await membership(group,owner,true);
      await db.run(sql`UPDATE private_group_invites SET revoked_at=${now} WHERE id=${invite} AND group_id=${group}`);
      return json({revoked:true});
    }
    if(action==="remove-member") {
      const b=objectWithKeys(raw,["action","group","member"]),group=id(b.group),member=id(b.member);await membership(group,owner,true);
      await db.run(sql`DELETE FROM private_group_members WHERE group_id=${group} AND owner_id IN (SELECT owner_id FROM community_members WHERE id=${member} AND owner_id<>${owner})`);
      return json({removed:true});
    }
    if(action==="leave") {
      const b=objectWithKeys(raw,["action","group"]),group=id(b.group),m=await membership(group,owner);
      if(m.isOwner)throw new SharingError("The group creator cannot leave their group.",409);
      await db.run(sql`DELETE FROM private_group_members WHERE group_id=${group} AND owner_id=${owner}`);return json({left:true});
    }
    if(action==="message") {
      const b=objectWithKeys(raw,["action","group","body",...("requestId" in raw?["requestId"]:[])]),group=id(b.group),body=text(b.body,2000);const selected=await membership(group,owner);if(selected.archived)throw new SharingError("This group is read-only because its creator left Devyo. Existing members can read, leave or delete their own messages.",409);
      const [profile]=await db.all<{display_name:string}>(sql`SELECT display_name FROM profiles WHERE owner_id=${owner}`);
      if(!profile)throw new SharingError("Save your display name in Profile & sharing before posting.",409);
      let messageId:string;try{messageId=await chatRequestId(owner,group,b.requestId)}catch{throw new SharingError("Invalid message retry ID.")}
      const replay=async()=>{const [prior]=await db.all<{body:string;deleted_at:number|null}>(sql`SELECT body,deleted_at FROM private_group_messages WHERE id=${messageId} AND group_id=${group} AND owner_id=${owner}`);if(!prior)return null;if(prior.deleted_at!==null)throw new SharingError("That message was deleted. Start a new message.",410);if(prior.body!==body)throw new SharingError("This retry belongs to a different message.",409);return json({sent:true,replayed:true})};
      const existing=await replay();if(existing)return existing;
      const rows=await db.all(sql`INSERT INTO private_group_messages(id,group_id,owner_id,display_name,body,created_at) SELECT ${messageId},${group},${owner},${validateDisplayName(profile.display_name)},${body},${now} WHERE EXISTS(SELECT 1 FROM private_groups g WHERE g.id=${group} AND (g.owner_id=${owner} OR EXISTS(SELECT 1 FROM private_group_members m WHERE m.group_id=g.id AND m.owner_id=${owner}))) AND (SELECT COUNT(*) FROM private_group_messages WHERE owner_id=${owner} AND created_at>${now-60000})<12 AND (SELECT COUNT(*) FROM private_group_messages WHERE owner_id=${owner} AND created_at>${now-86400000})<300 ON CONFLICT(id) DO NOTHING RETURNING id`);
      if(!rows.length){const retried=await replay();if(retried)return retried;throw new SharingError("Posting unavailable. Check your membership or try later: 12 messages per minute and 300 per 24 hours across your private groups.",429);}
      return json({sent:true},201);
    }
    if(action==="delete-message") {
      const b=objectWithKeys(raw,["action","group","message"]),group=id(b.group),message=id(b.message),m=await membership(group,owner);
      const changed=await db.run(sql`UPDATE private_group_messages SET body='',deleted_at=${now} WHERE id=${message} AND group_id=${group} AND (owner_id=${owner} OR ${m.isOwner?1:0})`);if(!changed.meta.changes)throw new SharingError('Message not found or unavailable.',404);return json({deleted:true});
    }
    throw new SharingError("Choose a supported action.");
  } catch(error) {return failure(error);}
}
function failure(error:unknown) {return error instanceof SharingError||error instanceof AttendeeSocialError?json({error:error.message},error.status):json({error:"The community could not be loaded or saved. Please try again."},503);}
