import { AsyncLocalStorage } from "node:async_hooks";
export type AppUser = { userId: string; displayName: string };
export type AuthContext = {
  user: AppUser | null;
  status: "unconfigured" | "anonymous" | "forbidden" | "authenticated" | "deleting";
  publishableKey?: string;
  registrationOpen?: boolean;
  recentlyVerified?: boolean;
  accountDeletionEnabled?:boolean;
  accountDeletionSchemaReady?:boolean;
  profilePhotosEnabled?:boolean;
  talkDiscussionsEnabled?:boolean;
  sessionId?: string;
  accountDeletedNotice?:boolean;
  deletionStatus?:'requested'|'identity_deleted'|'complete';
  deletionIdentity?:{userId:string;sessionId:string};
  eventId?: 'thunderplains-2026';
};
const contexts = new AsyncLocalStorage<AuthContext>();
export const getAuthContext = (): AuthContext => contexts.getStore() ?? { user: null, status: "unconfigured" };
export function runWithAuth<T>(context: AuthContext, run: () => T): T { return contexts.run(context, run); }
