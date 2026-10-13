'use client';
import{useRef,useState}from'react';import{useAuth,useClerk}from'@clerk/react';import{prepNoteSection}from'@/lib/prep-notes';import type{PrepSaveIdentity}from'./talk-prep';
export function PrepNoteSave({primer,questions,label,expectedUserId,onAppend,editor=false}:{primer:string;questions:string[];label:string;expectedUserId:string;onAppend:(section:string,identity:PrepSaveIdentity)=>Promise<string>;editor?:boolean}){
 const auth=useAuth(),clerk=useClerk(),[chosen,setChosen]=useState<string[]>([]),[includePrimer,setIncludePrimer]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),active=useRef(false);
 const identity=auth.userId&&auth.sessionId?{userId:auth.userId,sessionId:auth.sessionId}:null;
 const current=()=>!!identity&&auth.isLoaded&&identity.userId===expectedUserId&&clerk.user?.id===identity.userId&&clerk.session?.id===identity.sessionId;
 const section=prepNoteSection(label,includePrimer?primer:'',questions.filter(q=>chosen.includes(q)));
 async function append(){if(active.current||!current()||!identity||!section)return;active.current=true;setBusy(true);setNotice('');try{const message=await onAppend(section,identity);if(current())setNotice(message)}catch(error){if(current())setNotice(error instanceof Error?error.message:'This addition was not saved.')}finally{active.current=false;if(current())setBusy(false)}}
 if(!auth.isLoaded||auth.userId!==expectedUserId)return null;
 return <details className="prep-note-save"><summary>{editor?'Add questions to my note':'Save preparation to my session note'}</summary><div>
   <p>Select what to add. Your existing notes stay intact.</p>
   {primer&&<label><input type="checkbox" checked={includePrimer} disabled={busy} onChange={e=>setIncludePrimer(e.target.checked)}/><span>Include the primer</span></label>}
   {questions.map(q=><label key={q}><input type="checkbox" checked={chosen.includes(q)} disabled={busy} onChange={e=>setChosen(previous=>e.target.checked?[...previous,q]:previous.filter(item=>item!==q))}/><span>{q}</span></label>)}
   {section&&<details><summary>Preview the addition</summary><pre>{section}</pre></details>}
   <button type="button" className="button secondary" disabled={busy||!section||!current()} onClick={append}>{busy?'Adding…':editor?'Add selected to note editor':'Save selected to session note'}</button>
   {notice&&<p role="status">{notice}</p>}
 </div></details>;
}
