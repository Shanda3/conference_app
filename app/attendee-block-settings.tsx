'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {useAuth,useClerk} from '@clerk/react';
import type {SocialRequest} from './attendee-social-client';
import {SocialConfirmDialog} from './social-confirm-dialog';

type Attendee={id:string;displayName:string;me?:number};
type Result={members:Attendee[];hasMore:boolean};
export function AttendeeBlockSettings({expectedUserId,request,blocked,disabled=false,onBlockedChange,onBusyChange}:{expectedUserId:string;request:SocialRequest;blocked:Attendee[];disabled?:boolean;onBlockedChange:(blocked:Attendee[])=>void;onBusyChange:(busy:boolean)=>void}){
 const auth=useAuth(),clerk=useClerk(),id=useId(),finder=useRef<HTMLInputElement>(null),review=useRef<HTMLButtonElement>(null),version=useRef(0),pending=useRef(false);
 const[query,setQuery]=useState(''),[applied,setApplied]=useState(''),[offset,setOffset]=useState(0),[result,setResult]=useState<Result|null>(null),[selected,setSelected]=useState(''),[confirm,setConfirm]=useState<Attendee|null>(null),[searching,setSearching]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>()=>{++version.current},[expectedUserId,auth.userId,auth.sessionId]);
 const current=()=>auth.isLoaded&&auth.userId===expectedUserId&&clerk.user?.id===auth.userId&&!!auth.sessionId&&clerk.session?.id===auth.sessionId;
 async function find(term:string,page=0){
  if(disabled||busy||searching||!term.trim())return;
  const n=++version.current;setSearching(true);setError('');setNotice('');setSelected('');setResult(null);
  try{
   if(!current())throw new Error('Your sign-in session changed. Reload before continuing.');
   const params=new URLSearchParams({search:term.trim(),offset:String(page)}),response=await fetch('/api/community?'+params,{cache:'no-store',signal:AbortSignal.timeout(12000)}),data=await response.json() as Result&{error?:string};
   if(n!==version.current)return;if(!current())throw new Error('Your sign-in session changed. Reload before continuing.');if(!response.ok)throw new Error(data.error||'Attendees could not be loaded. Please try again.');
   setResult({members:data.members.filter(member=>!member.me),hasMore:data.hasMore});setApplied(term.trim());setOffset(page);
  }catch(e){if(n===version.current)setError(e instanceof Error?e.message:'Please try again.')}finally{if(n===version.current)setSearching(false)}
 }
 async function change(member:Attendee,action:'block'|'unblock'){
  if(pending.current||disabled)return;pending.current=true;setBusy(true);onBusyChange(true);setError('');setNotice('');
  try{
   const next=await request<{blocked:Attendee[]}>('',{action,memberId:member.id});onBlockedChange(next.blocked);setConfirm(null);setSelected('');setResult(null);
   if(action==='block')window.dispatchEvent(new Event('devyo-attendee-blocked'));
   setNotice(action==='block'?'Attendee blocked. You can unblock them here.':'Attendee unblocked.');requestAnimationFrame(()=>finder.current?.focus({preventScroll:true}));
  }catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{pending.current=false;setBusy(false);onBusyChange(false)}
 }
 function cancel(){setConfirm(null);requestAnimationFrame(()=>review.current?.focus({preventScroll:true}))}
 const locked=disabled||busy;
 return <section className="blocked-attendees" aria-labelledby={id+'-heading'}>
  <h3 id={id+'-heading'}>Blocked attendees</h3>
  <p id={id+'-disclosure'} className="form-hint">Blocking hides each other in the attendee directory and prevents connection notices. Existing group conversations and separately shared schedule links remain available.</p>
  <form className="attendee-block-search" onSubmit={event=>{event.preventDefault();void find(query)}}>
   <label className="field"><span>Find an attendee by display name</span><input ref={finder} type="search" maxLength={80} value={query} disabled={locked||searching} onChange={event=>{setQuery(event.target.value);setResult(null);setSelected('');setNotice('')}} placeholder="Their chosen display name" aria-describedby={id+'-search-hint'}/></label>
   <p id={id+'-search-hint'} className="form-hint">Search names shown in the attendee list. Display names are not verified identities.</p>
   <button type="submit" className="button secondary" disabled={locked||searching||!query.trim()}>{searching?'Searching…':'Find attendee'}</button>
  </form>
  {error&&!confirm&&<p role="alert" className="error-banner">{error}</p>}{notice&&<p role="status" className="social-success">{notice}</p>}
  {result&&<div className="attendee-block-results"><p role="status" className="form-hint">{result.members.length?`${result.members.length} ${result.members.length===1?'attendee':'attendees'} on this page. Choose the person you want to block.`:'No matching attendees available to block.'}</p>
   {!!result.members.length&&<><label className="field"><span>Attendee to block</span><select value={selected} disabled={locked||searching} onChange={event=>setSelected(event.target.value)}><option value="">Choose an attendee</option>{result.members.map(member=><option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><button ref={review} type="button" className="button secondary" disabled={locked||searching||!selected} onClick={()=>{setError('');setConfirm(result.members.find(member=>member.id===selected)??null)}}>Block selected attendee</button></>}
   {(offset>0||result.hasMore)&&<div className="share-link-actions"><button type="button" className="button secondary" disabled={locked||searching||offset===0} onClick={()=>void find(applied,Math.max(0,offset-100))}>Previous results</button><button type="button" className="button secondary" disabled={locked||searching||!result.hasMore} onClick={()=>void find(applied,offset+100)}>Next results</button></div>}
  </div>}
  <h4>People you’ve blocked</h4>{blocked.length?blocked.map(member=><div className="share-row" key={member.id}><span>{member.displayName}</span><button type="button" className="button secondary" disabled={locked||searching} aria-label={'Unblock '+member.displayName} onClick={()=>void change(member,'unblock')}>Unblock</button></div>):<p>No blocked attendees.</p>}
  {confirm&&<SocialConfirmDialog title={`Block ${confirm.displayName}?`} confirmLabel="Block attendee" busy={busy} error={error} onCancel={cancel} onConfirm={()=>change(confirm,'block')}><p>You will be hidden from each other in the attendee directory and receive no connection notices from each other.</p><p>Existing groups and separately shared schedule links remain available. You can unblock this attendee here in Settings.</p></SocialConfirmDialog>}
 </section>;
}
