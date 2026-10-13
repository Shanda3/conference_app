/** LOCAL review plan only. No scheduler may purge global accounts or unrelated event data. */
export type EventRetentionEnv={DEVYO_ENVIRONMENT?:string;DEVYO_RETENTION_POLICY?:string;DEVYO_EVENT_ID?:string;DEVYO_EVENT_ENDS_AT?:string;DEVYO_CLEANUP_INSTANCE_ID?:string};
export type EventPolicy={eventId:string;endsAt:number;deadlineAt:number;instanceId:string;mode:'plan-only'};
export type EventIdentityService={verifyInstance:(id:string)=>Promise<void>};
export function eventRetentionPolicy(env:EventRetentionEnv):EventPolicy|null{
 if(env.DEVYO_RETENTION_POLICY!=='event-7d-plan')return null;
 const raw=env.DEVYO_EVENT_ENDS_AT??'',endsAt=Date.parse(raw),instanceId=env.DEVYO_CLEANUP_INSTANCE_ID??'',eventId=env.DEVYO_EVENT_ID??'';
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw)||!Number.isFinite(endsAt)||!/^ins_[A-Za-z0-9]+$/.test(instanceId)||!/^[-a-z0-9]{1,100}$/.test(eventId))throw Error('Invalid event retention review plan');
 return{eventId,endsAt,deadlineAt:endsAt+7*24*3600000,instanceId,mode:'plan-only'};
}
/** An event deadline never closes a reusable Devyo account or another conference. */
export function eventAccessClosed(_policy:EventPolicy|null,_now=Date.now()){return false}
/** Fail closed until event ownership, scoped storage and action-time approval exist. No DB/provider calls. */
export async function processEventCleanup(_db:D1Database,policy:EventPolicy,_identities:EventIdentityService,now=Date.now()){
 if(now<policy.deadlineAt)return 'active';
 return 'scope_required';
}
