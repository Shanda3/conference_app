import {prepUnavailableFor} from '@/lib/talk-prep';
import type {Session} from '@/lib/planner';
import type {PublishedSession} from '@/lib/program-model';
export function TalkPrepUnavailable({session,published,status,aiAvailable=false}:{session:Session;published:readonly PublishedSession[];status:'unreviewed'|'changed'|'stale';aiAvailable?:boolean}){
 const fallback=prepUnavailableFor(session,published,status);
 return <div className="prep-unavailable"><p role="status">{fallback.message}</p>{fallback.entry&&<><h4>Published program entry</h4><p><strong>{fallback.entry.title}</strong></p>{fallback.entry.description?<p>{fallback.entry.description}</p>:fallback.kind==='panel'?<p>The official program does not include a detailed panel description.</p>:fallback.kind==='lightning'?<p>Individual talk topics are not listed in this program entry.</p>:null}</>}<p className="prep-disclosure">{aiAvailable?'You can review the official session information below to request AI questions. No reviewed preparation guide is available.':'AI questions stay unavailable until a preparation source for this session is reviewed.'}</p></div>;
}
