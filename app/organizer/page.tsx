import {env} from 'cloudflare:workers';
import {getAuthContext} from '@/lib/auth-context';
import {OrganizerReviewStore} from '@/lib/organizer-review-store';
import {OrganizerReviewError} from '@/lib/organizer-review-model';
import programSeed from '@/lib/event-data.json';import type {ProgramSeed} from '@/lib/program-model';
import {SessionBoundary} from '../session-boundary';
import {Login} from '../auth-client';
import {OrganizerReviewPanel} from './review-panel';
export const dynamic='force-dynamic';
export const metadata={title:'Organizer schedule review · ThunderPlains Devyo',robots:{index:false,follow:false}};
export default async function OrganizerPage(){
 const auth=getAuthContext();if(!auth.user)return <Login status={auth.status} registrationOpen={auth.registrationOpen}/>;
 if(env.DEVYO_ORGANIZER_REVIEW_SCHEMA_READY!=='true'||!env.DB)return <main><h1>Organizer schedule review</h1><p>Organizer review is being prepared.</p><a href="/">Return to my planner</a></main>;
 try{const review=await new OrganizerReviewStore(env.DB,auth.user.userId,programSeed as unknown as ProgramSeed).review();const expectedUserId=auth.user.userId.slice(auth.user.userId.lastIndexOf(':')+1);if(!auth.sessionId)throw new OrganizerReviewError('Verify your sign-in session again.',409);
 return <SessionBoundary expectedUserId={expectedUserId}><OrganizerReviewPanel expectedUserId={expectedUserId} expectedSessionId={auth.sessionId} initialReview={{...review,paused:env.DEVYO_ORGANIZER_REVIEW_ENABLED!=='true',canApply:review.canApply&&env.DEVYO_ORGANIZER_REVIEW_ENABLED==='true'}}/></SessionBoundary>;
 }catch{return <main><h1>Organizer schedule review</h1><p>This review is unavailable for the current account, or the shared program could not be loaded.</p><a href="/">Return to my planner</a></main>;}
}
