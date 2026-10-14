import {env} from 'cloudflare:workers';
import {getAuthContext} from '@/lib/auth-context';
import {isDiscussionModerator} from '@/lib/talk-discussion';
import {SessionBoundary} from '@/app/session-boundary';
import {DiscussionModeration} from '@/app/talk-discussion';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'Discussion reports · ThunderPlains Devyo',robots:{index:false,follow:false,noarchive:true}};
export default function ModerationPage(){
 const auth=getAuthContext();
 if(!auth.user||auth.eventId!=='thunderplains-2026'||!auth.talkDiscussionsEnabled||!isDiscussionModerator(auth.user.userId,env.DEVYO_TALK_MODERATOR_USER_IDS))notFound();
 return <SessionBoundary expectedUserId={auth.user.userId.slice(auth.user.userId.lastIndexOf(':')+1)}><DiscussionModeration/></SessionBoundary>;
}
