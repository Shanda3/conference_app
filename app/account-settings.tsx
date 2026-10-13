"use client";
import {useEffect,useRef,useState} from 'react';
import {useClerk,useReverification,useSession,useUser} from '@clerk/react';
import {isReverificationCancelledError} from '@clerk/react/errors';
import {AlertTriangle,LoaderCircle,Trash2} from 'lucide-react';
import {ACCOUNT_DELETE_CONFIRMATION} from '@/lib/account-deletion';
import{NotesDownload}from'./notes-download';
import{closeDeletedWorkspace,deletionPrincipalMatches,finishDeletedAccount}from'@/lib/account-deletion-browser';
type Preview={counts:{shareLinks:number;authoredMessages:number;noteCount:number};ownedGroups:{id:string;name:string}[];status:'active'|'requested'|'identity_deleted'|'complete';previewToken?:string;expiresAt?:number};
type Confirmation={confirmation:string;closeOwnedGroups:boolean;ownedGroupIds:string[];previewToken:string};
export function AccountSettings({allowNewRequests=true}:{allowNewRequests?:boolean}){
 const{user,isLoaded}=useUser(),{session,isLoaded:sessionLoaded}=useSession();
 if(!isLoaded||!sessionLoaded||!user||!session)return null;
 return<AccountDeletionPanel key={`${user.id}:${session.id}`} identity={{userId:user.id,sessionId:session.id}} allowNewRequests={allowNewRequests}/>;
}
function AccountDeletionPanel({identity,allowNewRequests}:{identity:{userId:string;sessionId:string};allowNewRequests:boolean}){
 const[open,setOpen]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[phrase,setPhrase]=useState(''),[closeGroups,setCloseGroups]=useState(false),[busy,setBusy]=useState(false),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),clerk=useClerk(),mounted=useRef(true),requests=useRef(new Set<AbortController>());
 const matches=()=>mounted.current&&clerk.user?.id===identity.userId&&clerk.session?.id===identity.sessionId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const controller of requests.current)controller.abort();requests.current.clear()}},[]);
 async function accountFetch(method:string,body?:unknown){if(!matches())return;const controller=new AbortController();if(method!=='DELETE')requests.current.add(controller);try{return await fetch(method==='GET'?'/api/account?status=1':'/api/account',{method,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-Expected-Devyo-Session':identity.sessionId},...(body===undefined?{}:{body:JSON.stringify(body)})})}finally{requests.current.delete(controller)}}
 const remove=useReverification((body:Confirmation)=>accountFetch('DELETE',body));
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close()},[open]);
 const pending=!!preview&&preview.status!=='active';
 async function load(){if(!matches())return;setBusy(true);setError('');setPhrase('');setCloseGroups(false);try{
  let response=await accountFetch('GET');if(!response||!matches())return;
  let data=await response.json() as Preview&{error?:string};if(!matches())return;
  if(!response.ok)throw Error(data.error||'Account details could not be loaded.');
  if(data.status==='active'&&allowNewRequests){response=await accountFetch('POST',{action:'preview',expectedSessionId:identity.sessionId});if(!response||!matches())return;data=await response.json() as Preview&{error?:string};if(!matches())return;if(!response.ok)throw Error(data.error||'Account deletion review could not be prepared.');}
  if(data.status==='complete'){await finishDeletedAccount(clerk,identity);return}if(data.status!=='active'){closeDeletedWorkspace(identity,data.status);return}setPreview(data);
 }catch(e){if(matches())setError(e instanceof Error?e.message:'Account details could not be loaded.')}finally{if(matches())setBusy(false)}}
 function review(){setOpen(true);setPreview(null);void load()}
 async function submit(event:React.FormEvent){event.preventDefault();if(!allowNewRequests||!matches()||!preview?.previewToken||pending||phrase!==ACCOUNT_DELETE_CONFIRMATION||(preview.ownedGroups.length>0&&!closeGroups))return;
  setBusy(true);setSubmitting(true);setError('');try{
   const response=await remove({confirmation:phrase,closeOwnedGroups:closeGroups,ownedGroupIds:preview.ownedGroups.map(group=>group.id),previewToken:preview.previewToken});
   if(!response||(clerk.loaded!==false&&!deletionPrincipalMatches(clerk,identity,true)))return;
   const data=await response.json() as {status:Preview['status'];deleted:boolean;error?:string};if(clerk.loaded!==false&&!deletionPrincipalMatches(clerk,identity,true))return;
   if(!response.ok)throw Error(data.error||'Check account status before retrying.');
   if(data.deleted&&data.status==='complete'){if(clerk.loaded===false)closeDeletedWorkspace(identity,'complete',false);else await finishDeletedAccount(clerk,identity);return}
   if(['requested','identity_deleted'].includes(data.status)){closeDeletedWorkspace(identity,data.status as 'requested'|'identity_deleted',clerk.loaded!==false);return}
   throw Error('Account deletion could not be confirmed.');
  }catch(e){if(!matches())return;if(isReverificationCancelledError(e))setError('Verification canceled. No deletion request was confirmed.');else{await load();if(matches())setError('Review the current account status before confirming again.')}}finally{if(matches()){setBusy(false);setSubmitting(false)}}
 }

 return <article className="social-card account-settings"><span className="eyebrow">ACCOUNT DELETION</span><h2>{allowNewRequests?'Delete my account':'Account deletion status'}</h2><p>{allowNewRequests?'You can leave Devyo whenever you choose. Review what will be removed first.':'You can check an existing deletion request here. New requests are temporarily unavailable.'}</p><button className="button secondary" onClick={review}><Trash2 size={16}/>{allowNewRequests?'Delete my account':'Check account status'}</button>
 {open&&<dialog ref={dialog} className="account-delete-dialog" aria-labelledby="account-delete-title" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false)}} onClose={()=>{if(!busy)setOpen(false)}}>
 <h2 id="account-delete-title">{submitting?'Deleting your account…':pending?'Account deletion requested':'Delete your entire Devyo account?'}</h2>
 {error&&<p className="error-banner" role="alert"><AlertTriangle size={17}/>{error}</p>}
 {busy&&<p role="status"><LoaderCircle size={18} className="spin"/>{submitting?'Confirm your sign-in if asked. Securely removing your account…':'Checking your account…'}</p>}
 {submitting?null:pending?<><p role="status">{preview?.status==='complete'?'Your account and active saved app data have been deleted.':'Your request is accepted and your workspace is closed. Shared plans, invitations and your attendee listing are removed. Account and data removal will retry automatically if a service is unavailable.'}</p><p>A minimal receipt prevents old sessions from restoring data. Previously downloaded or copied information cannot be recalled. Recovery backups and provider logs may remain under their retention policies.</p><div className="account-delete-actions"><button className="button secondary" disabled={busy} onClick={load}>Check status</button><a className="button primary" href="https://devyo.app/" referrerPolicy="no-referrer">Return to Devyo</a></div></>:preview&&!allowNewRequests?<><p>Your account is active. New deletion requests are temporarily unavailable. Contact shandaokcwebdev@gmail.com if you need assistance.</p><button className="button secondary" onClick={()=>setOpen(false)}>Close</button></>:preview?<form onSubmit={submit}>
 <p>This permanently closes the Devyo account you are signed in to, across <strong>all conferences</strong>. It deletes your sign-in details, saved agendas, notes, connections, private profile, avatar settings and messages you wrote. This is different from removing only your ThunderPlains event data.</p>
 <div className="account-export-first"><p><strong>Save your notes before continuing.</strong> Downloaded copies remain on your device.</p><NotesDownload count={preview.counts.noteCount}/></div>
 <p>Your shared schedules, attendee listing and group invitations are removed when the request is accepted. Your memberships are removed when cleanup completes. Other attendees’ accounts, planners and messages stay intact.</p>
 {preview.ownedGroups.length>0&&<div className="account-owned-groups"><p>These groups will become read-only for their remaining members:</p><ul>{preview.ownedGroups.map(g=><li key={g.id}>{g.name}</li>)}</ul><label><input type="checkbox" checked={closeGroups} onChange={e=>setCloseGroups(e.target.checked)} disabled={busy}/> I understand that these groups will stop accepting new members and messages. Other members keep their existing conversations.</label></div>}
 <p>Existing group names and other members’ messages may remain in read-only group history. A minimal deletion receipt is retained to prevent restored or stale sessions from recreating your data. Recovery backups, provider logs and copies downloaded or shared outside Devyo are not erased instantly.</p><label className="field"><span>Type {ACCOUNT_DELETE_CONFIRMATION} to confirm</span><input value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off" disabled={busy} required/></label><p>You may be asked to verify your sign-in again. This cannot be undone once accepted.</p><div className="account-delete-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>Keep my account</button><button className="button account-delete-button" disabled={busy||!preview.previewToken||phrase!==ACCOUNT_DELETE_CONFIRMATION||(preview.ownedGroups.length>0&&!closeGroups)}><Trash2 size={16}/>Permanently delete my account</button></div></form>:!busy&&<div className="account-delete-actions"><button className="button secondary" onClick={load}>Retry</button><button className="button secondary" onClick={()=>setOpen(false)}>Keep my account</button></div>}
 </dialog>}</article>;
}
