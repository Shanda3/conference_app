import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth-context';
import {discussionTalk} from '@/lib/talk-discussion';
import {SessionBoundary} from '@/app/session-boundary';
import {TalkDiscussion} from '@/app/talk-discussion';
export const dynamic='force-dynamic';
export const metadata={title:'Talk discussion · ThunderPlains Devyo',robots:{index:false,follow:false,noarchive:true}};
export default async function DiscussionPage({params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params;let talk;try{talk=discussionTalk(sessionId)}catch{notFound()}
 const auth=getAuthContext();if(!auth.user||auth.eventId!=='thunderplains-2026')notFound();
 if(!auth.talkDiscussionsEnabled)return <main className="welcome-login"><h1>Talk discussions are being prepared.</h1><a href="/">Return to the planner</a></main>;
 return <SessionBoundary expectedUserId={auth.user.userId.slice(auth.user.userId.lastIndexOf(':')+1)}><TalkDiscussion talk={talk}/></SessionBoundary>;
}
