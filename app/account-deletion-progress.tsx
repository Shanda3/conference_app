"use client";
import{useEffect,useRef,useState}from'react';import{useClerk,useAuth}from'@clerk/react';
import{deletionPrincipalMatches,finishDeletedAccount,type DeletionIdentity,type DeletionPhase}from'@/lib/account-deletion-browser';
export function AccountDeletionProgress({identity,initialStatus}:{identity:DeletionIdentity;initialStatus:DeletionPhase}){
 const clerk=useClerk(),{isLoaded}=useAuth(),[status,setStatus]=useState(initialStatus),[error,setError]=useState(''),[checking,setChecking]=useState(false),mounted=useRef(true),inFlight=useRef(false),complete=useRef(initialStatus==='complete');
 async function check(){if(!isLoaded||inFlight.current||complete.current||!deletionPrincipalMatches(clerk,identity,true))return;inFlight.current=true;setChecking(true);setError('');try{
  const response=await fetch('/api/account?status=1',{cache:'no-store',headers:{'X-Expected-Devyo-Session':identity.sessionId}});
  if(!mounted.current||!deletionPrincipalMatches(clerk,identity,true))return;const data=await response.json() as {status?:string};if(!mounted.current||!deletionPrincipalMatches(clerk,identity,true))return;
  if(!response.ok)throw Error('The accepted request will continue automatically. Sign-in may already have ended; no new request is needed.');
  if(typeof data.status!=='string'||!['requested','identity_deleted','complete'].includes(data.status))throw Error('Account status could not be confirmed.');
  setStatus(data.status as DeletionPhase);if(data.status==='complete'){complete.current=true;await finishDeletedAccount(clerk,identity)}
 }catch(e){if(mounted.current&&deletionPrincipalMatches(clerk,identity,true))setError(e instanceof Error?e.message:'Status could not be checked.')}finally{inFlight.current=false;if(mounted.current)setChecking(false)}}
 useEffect(()=>{mounted.current=true;if(!isLoaded)return()=>{mounted.current=false};if(initialStatus==='complete'){void finishDeletedAccount(clerk,identity);return()=>{mounted.current=false}}
  void check();let timer:ReturnType<typeof setTimeout>,attempt=0;const again=()=>{timer=setTimeout(async()=>{await check();if(mounted.current&&!complete.current&&++attempt<20)again()},Math.min(15000,2000*2**Math.min(attempt,3)))};again();return()=>{mounted.current=false;clearTimeout(timer)};
 },[identity.userId,identity.sessionId,initialStatus,isLoaded]);
 if(!isLoaded)return<main className="welcome-login"><h1>Finishing account closure…</h1><p role="status">Checking your sign-in session before continuing.</p></main>;
 if(!deletionPrincipalMatches(clerk,identity,true))return<main className="welcome-login"><h1>Your account changed</h1><p>Reload to open your current account.</p><a className="button primary" href="/">Open current account</a></main>;
 return<main className="welcome-login"><h1>{status==='complete'?'Account deleted':'Deleting your account…'}</h1><p role="status">{status==='complete'?'Your account is closed. Returning to ThunderPlains sign-in…':'Your request is accepted and your private workspace is closed. Account removal continues automatically if a service is unavailable.'}</p>{error&&<p role="alert">{error}</p>}{status!=='complete'&&<button className="button secondary" disabled={checking} onClick={check}>{checking?'Checking status…':'Check status'}</button>}<a className="button secondary" href="/sign-in">Go to ThunderPlains sign-in</a></main>;
}
