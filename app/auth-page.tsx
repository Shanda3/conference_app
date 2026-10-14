import {getAuthContext} from '../lib/auth-context.ts';
import {Login} from './auth-client';import {SessionBoundary} from './session-boundary';import Planner from './planner';
export default function AuthPage({signUp=false}:{signUp?:boolean}){
 const auth=getAuthContext();
 return auth.user?<SessionBoundary expectedUserId={auth.user.userId.slice(auth.user.userId.lastIndexOf(':')+1)}><Planner attendeeSocialSchemaReady={auth.attendeeSocialSchemaReady} connectionNotificationsEnabled={auth.connectionNotificationsEnabled} communitiesEnabled={auth.communitiesEnabled} talkDiscussionsEnabled={auth.talkDiscussionsEnabled} eventId={auth.eventId} profilePhotosEnabled={auth.profilePhotosEnabled} accountDeletionSchemaReady={auth.accountDeletionSchemaReady} accountDeletionEnabled={auth.accountDeletionEnabled} user={auth.user} signInPath="/sign-in"/></SessionBoundary>:<Login status={auth.status} signUp={signUp} registrationOpen={auth.registrationOpen} accountDeletedNotice={auth.accountDeletedNotice} deletionIdentity={auth.deletionIdentity} deletionStatus={auth.deletionStatus}/>;
}
