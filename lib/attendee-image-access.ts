import {SharingError} from './sharing.ts';
import {SOCIAL_EVENT} from './attendee-social.ts';
/** Check stored blocks before serving a profile image or contacting Gravatar. */
export async function assertAttendeeImageAccess(db:D1Database,viewer:string,member:string){
 if(!/^[a-zA-Z0-9-]{16,64}$/.test(member))throw new SharingError('Attendee image unavailable.',404);
 const row=await db.prepare(`SELECT 1 FROM community_members m WHERE m.id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id IN(?,m.owner_id)) AND NOT EXISTS(SELECT 1 FROM attendee_blocks WHERE event_id=? AND ((owner_id=? AND blocked_owner_id=m.owner_id) OR(owner_id=m.owner_id AND blocked_owner_id=?)))`).bind(member,viewer,SOCIAL_EVENT,viewer,viewer).first();
 if(!row)throw new SharingError('Attendee image unavailable.',404);
}
