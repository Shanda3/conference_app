'use client';
import{useEffect,useRef,useState}from'react';
import{useAuth,useClerk}from'@clerk/react';
import{BookOpen,Check,ChevronDown,LoaderCircle}from'lucide-react';
import{AIPrep}from'./ai-prep';import{PrepNoteSave}from'./prep-note-save';
import{talkPrepFor}from'@/lib/talk-prep';import{aiSessionSource}from'@/lib/ai-session';
import{TalkPrepUnavailable}from'./talk-prep-unavailable';
import{STACK_CHOICES,INTEREST_CHOICES,PREFERENCE_LIMIT,emptyTalkPreferences,validateTalkPreferences,type TalkPrepPreferences}from'@/lib/talk-preferences';
import type{Session}from'@/lib/planner';
import type{PublishedSession}from'@/lib/program-model';
export type PrepSaveIdentity={userId:string;sessionId:string};
type Props={session:Session;published:PublishedSession[];initiallyOpen?:boolean;expectedUserId:string;preferences?:TalkPrepPreferences;busy:boolean;onSavePreferences:(preferences:TalkPrepPreferences,identity:PrepSaveIdentity)=>Promise<boolean>;onAppend:(section:string,identity:PrepSaveIdentity)=>Promise<string>};
export function TalkPrep(props:Props){
  const result=talkPrepFor(props.session,props.published),ai=aiSessionSource(props.session,props.published);
  const [open,setOpen]=useState(!!props.initiallyOpen),section=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(props.initiallyOpen)section.current?.scrollIntoView({block:'start'})},[]);
  if(result.status==='excluded'&&!ai.eligible)return null;
  return <details ref={section} className="talk-prep" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><BookOpen size={20} aria-hidden="true"/><span>Before this talk</span><ChevronDown size={18} aria-hidden="true"/></summary><div className="talk-prep-body">
    {result.status==='ready'?<>
      <p className="prep-disclosure">A shared preparation guide. Background and suggested questions are not a promise of what the speaker will cover.</p>
      <h4>A quick primer</h4><p>{result.guide.primer}</p>
      <h4>Terms to recognize</h4><dl className="prep-terms">{result.guide.terms.map(([term,definition])=><div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
      <p>{result.guide.background}</p>
      <h4>Questions you could ask</h4><ol className="prep-questions">{result.guide.questions.map(question=><li key={question}>{question}</li>)}</ol>
      <h4>Read a little further</h4><ul className="prep-readings">{result.guide.readings.map(([label,url])=><li key={url}><a href={url} target="_blank" rel="noreferrer">{label} ↗</a></li>)}</ul>
      <p className="prep-source">Based on the <a href={result.guide.sourceUrl} target="_blank" rel="noreferrer">official session abstract ↗</a>, reviewed October 13, 2026. {result.dailyVerified?`Abstract checked ${new Date(result.verifiedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago'})} (conference time).`:'Daily abstract verification is pending.'}</p>
      <PrepNoteSave expectedUserId={props.expectedUserId} primer={result.guide.primer} questions={result.guide.questions} label="Before this talk · shared guide reviewed October 13" onAppend={props.onAppend}/>
    </>:<TalkPrepUnavailable session={props.session} published={props.published} status={result.status==='excluded'?'unreviewed':result.status} aiAvailable={ai.eligible}/>}
    <PreferenceSettings expectedUserId={props.expectedUserId} preferences={props.preferences} busy={props.busy} onSave={props.onSavePreferences}/>
    {ai.eligible&&<AIPrep sessionId={props.session.id} expectedUserId={props.expectedUserId} preferences={props.preferences} kind="prep" onAppend={props.onAppend}/>}
  </div></details>;
}
function PreferenceSettings({expectedUserId,preferences,busy,onSave}:{expectedUserId:string;preferences?:TalkPrepPreferences;busy:boolean;onSave:Props['onSavePreferences']}){
  const auth=useAuth();
  if(!auth.isLoaded||auth.userId!==expectedUserId||!auth.sessionId)return null;
  return <PreferenceForm key={auth.userId+':'+auth.sessionId} identity={{userId:auth.userId,sessionId:auth.sessionId}} saved={preferences} busy={busy} onSave={onSave}/>;
}
function PreferenceForm({identity,saved,busy,onSave}:{identity:PrepSaveIdentity;saved?:TalkPrepPreferences;busy:boolean;onSave:Props['onSavePreferences']}){
  const clerk=useClerk(),[draft,setDraft]=useState(saved??emptyTalkPreferences()),[editing,setEditing]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
  const inFlight=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{if(!editing)setDraft(saved??emptyTalkPreferences())},[saved,editing]);
  const current=()=>mounted.current&&clerk.loaded!==false&&clerk.user?.id===identity.userId&&clerk.session?.id===identity.sessionId;
  const toggle=(kind:'stack'|'interests',id:string)=>{setNotice('');setDraft(previous=>{const ids=previous[kind];if(!ids.includes(id)&&ids.length>=PREFERENCE_LIMIT){setNotice('Choose up to six in each list.');return previous}return{...previous,[kind]:ids.includes(id)?ids.filter(item=>item!==id):[...ids,id]}})};
  async function save(){if(inFlight.current||busy||!current())return;inFlight.current=true;setPending(true);setNotice('');try{const next=validateTalkPreferences(draft),ok=await onSave(next,identity);if(current()){if(ok){setEditing(false);setNotice('Your private selections are saved.')}else setNotice('Your selections were not saved. Close this dialog to check the planner message, then try again.')}}catch{if(current())setNotice('Your selections were not saved. Try again.')}finally{inFlight.current=false;if(current())setPending(false)}}
  const hasSaved=!!(saved&&(saved.stack.length+saved.interests.length||saved.personalizationOptIn));
  return <section className="prep-preferences" aria-labelledby="prep-preferences-title"><h4 id="prep-preferences-title">Your tech stack & interests <span>(optional)</span></h4><p>Select a few labels for personalized preparation. Shared guides work without them. Every AI request has a separate review and approval step.</p>
    {!editing?<><button type="button" className="button secondary" disabled={busy} onClick={()=>{setDraft(saved??emptyTalkPreferences());setNotice('');setEditing(true)}}>{hasSaved?'Edit private selections':'Choose labels'}</button>{hasSaved&&<p className="prep-selected">{[...STACK_CHOICES,...INTEREST_CHOICES].filter(([id])=>[...saved!.stack,...saved!.interests].includes(id)).map(([,label])=>label).join(' · ')||'No labels selected'}</p>}</>:<>
      {([['stack','Your stack',STACK_CHOICES],['interests','Your interests',INTEREST_CHOICES]] as const).map(([kind,label,choices])=><fieldset key={kind} disabled={busy||pending}><legend>{label} · choose up to {PREFERENCE_LIMIT}</legend><div className="prep-chips">{choices.map(([id,text])=><button type="button" key={id} aria-pressed={draft[kind].includes(id)} onClick={()=>toggle(kind,id)}>{draft[kind].includes(id)&&<Check size={16} aria-hidden="true"/>}{text}</button>)}</div></fieldset>)}
      <label className="prep-opt-in"><input type="checkbox" checked={draft.personalizationOptIn} disabled={busy||pending} onChange={event=>setDraft(previous=>({...previous,personalizationOptIn:event.target.checked}))}/><span>Use my selected labels when I request AI preparation.</span></label>
      <p className="prep-disclosure">Saved privately with your account; removed from the active planner when your account is deleted. Saving labels sends no AI request. Preparation requests exclude your email, phone, profile, private notes, and connections.</p>
      <div className="prep-preference-actions"><button type="button" className="button primary" disabled={busy||pending} onClick={save}>{pending&&<LoaderCircle size={16} className="spin" aria-hidden="true"/>}Save selections</button><button type="button" className="button secondary" disabled={busy||pending} onClick={()=>{setDraft(saved??emptyTalkPreferences());setEditing(false);setNotice('')}}>Skip / cancel</button><button type="button" className="text-button" disabled={busy||pending} onClick={()=>setDraft(emptyTalkPreferences())}>Clear selections</button></div>
    </>}
    {notice&&<p className="prep-notice" role="status">{notice}</p>}
  </section>;
}
