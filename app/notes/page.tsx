import{getAuthContext}from'../../lib/auth-context.ts';
import{SessionBoundary}from'../session-boundary';
import{AccountDeletionProgress}from'../account-deletion-progress';
import{Login}from'../auth-client';
import Planner from'../planner';
export const dynamic='force-dynamic';
export const metadata={title:'Private notes & download · ThunderPlains Devyo',robots:{index:false,follow:false}};
export default function Notes(){
 const auth=getAuthContext();if(!auth.user)return<Login status={auth.status} registrationOpen={auth.registrationOpen}/>;
 if(auth.deletionIdentity&&auth.deletionStatus)return<AccountDeletionProgress identity={auth.deletionIdentity} initialStatus={auth.deletionStatus}/>;
 return<SessionBoundary expectedUserId={auth.user.userId.slice(auth.user.userId.lastIndexOf(':')+1)}><Planner attendeeSocialSchemaReady={auth.attendeeSocialSchemaReady} connectionNotificationsEnabled={auth.connectionNotificationsEnabled} communitiesEnabled={auth.communitiesEnabled} talkDiscussionsEnabled={auth.talkDiscussionsEnabled} profilePhotosEnabled={auth.profilePhotosEnabled} initialSection="notes" user={auth.user} signInPath="/sign-in" accountDeletionEnabled={auth.accountDeletionEnabled} accountDeletionSchemaReady={auth.accountDeletionSchemaReady}/></SessionBoundary>;
}
