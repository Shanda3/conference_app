'use client';
import {useMemo} from 'react';
import type {PlannerState,Session} from '@/lib/planner';
import {applyProgramReview,reviewProgram} from '@/lib/program-model';
import type {ProgramPayload,ProgramField} from '@/lib/program-model';
const labels={title:'Title',start:'Starts',end:'Ends',room:'Room',speaker:'Speakers',track:'Track'};
const stamp=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'}).format(new Date(value));
const fieldValue=(session:Session,field:ProgramField)=>['start','end'].includes(field)?stamp(session[field]):session[field]||'Not listed';
export function ProgramReviewPanel({payload,state,busy,error,onSave,onClose}:{payload:ProgramPayload|null;state:PlannerState;busy:boolean;error:string;onSave:(s:PlannerState,m?:string)=>Promise<boolean>;onClose:()=>void}){
 const review=useMemo(()=>payload?reviewProgram(state,payload.sessions.filter(s=>s.conferenceId!=='thunderplains-2026'),payload.knownSessions):null,[payload,state]);
 return <section className="program-review"><h3>Daily organizer schedule check</h3>
 <p>We check the public session feeds at 9 AM Central through October 21. Times, rooms, titles, tracks and speakers are checked. Descriptions, tickets and separate organizer pages still need an organizer check.</p>
 {error&&<p role="status">{error} Your saved planner stays unchanged.</p>}
 {payload?.sources.map(source=><div className="program-source-status" key={source.conferenceId}><b>{source.name}: {source.status==='ok'?'verified':source.status==='failed'?'check incomplete':'awaiting first check'}</b><p>{source.lastSuccessAt?`Last successful check: ${stamp(source.lastSuccessAt)}.`:'The original verified snapshot is shown.'} {source.status==='failed'?source.message:'Only a complete feed replaces the previous program.'}</p><a href={source.sourceUrl} target="_blank" rel="noreferrer">Official {source.name} feed ↗</a></div>)}
 {payload?.stopped&&<p>Daily fetching has finished because the event is over. The last complete organizer program remains available.</p>}
 {review&&<><h3>Conference schedules stay current automatically</h3><p>Official ThunderPlains and InnoTech times, rooms, titles, speakers and descriptions update automatically. Saved choices, private notes, connections and custom sessions stay intact. New sessions are available to explore and are not automatically saved to your agenda.</p><h3>Review other program changes</h3><p>{review.added.length} new sessions · {review.updates.length} updated sessions. These changes apply only to your plan. Saved choices, private notes, connections and personal field edits stay intact. A removed or cancelled session stays in your saved agenda with a warning until you remove it. Its last published times are excluded from conflict checks.</p>
 {review.keptPrivateFields>0&&<p>{review.keptPrivateFields} differing fields are kept as personal edits. Open Edit session if you want to replace them yourself.</p>}
 <ul className="program-changes">{review.added.map(s=><li key={s.id}><b>New: {s.title}</b><span>{stamp(s.start)} · {s.room||'Room not listed'}</span></li>)}{review.updates.map(u=><li key={u.session.id}><b>{u.session.title}</b>{u.fields.map(field=><span key={field}>{labels[field]}: {fieldValue(u.before,field)} → {fieldValue(u.session,field)}</span>)}</li>)}</ul>
 <button className="button secondary" disabled={busy||(!review.added.length&&!review.updates.length)} onClick={async()=>{if(await onSave(applyProgramReview(state,review),`Applied ${review.added.length+review.updates.length} organizer updates; your choices and notes are kept`))onClose()}}>Apply updates to my plan</button>
 </>}
 </section>;
}
