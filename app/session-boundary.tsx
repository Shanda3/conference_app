"use client";
import{eventHomeUrl}from"@/lib/social-sharing";
import {Fragment,useEffect,useState} from "react";
import {useAuth} from "@clerk/react";
import{ACCOUNT_CLOSED_EVENT,installPrivateHistoryGuard,type DeletionIdentity,type DeletionPhase}from'@/lib/account-deletion-browser';
import{AccountDeletionProgress}from'./account-deletion-progress';
/** Never render server-owned private data under a different browser identity. */
export function SessionBoundary({children,expectedUserId}:{children:React.ReactNode;expectedUserId:string}){
 const {isLoaded,isSignedIn,userId}=useAuth();
 const[closed,setClosed]=useState<{identity:DeletionIdentity;status:DeletionPhase}|null>(null);
 useEffect(()=>{if(typeof window==='undefined'||typeof document==='undefined')return;const cleanup=installPrivateHistoryGuard(window,document);const close=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.identity?.userId===expectedUserId&&/^sess_[A-Za-z0-9]+$/.test(detail.identity.sessionId)&&['requested','identity_deleted','complete'].includes(detail.status))setClosed(detail)};window.addEventListener(ACCOUNT_CLOSED_EVENT,close);return()=>{cleanup();window.removeEventListener(ACCOUNT_CLOSED_EVENT,close)}},[expectedUserId]);
 useEffect(()=>{if(isLoaded&&isSignedIn&&userId===expectedUserId&&['/sign-in','/sign-up'].includes(window.location.pathname))window.location.replace(eventHomeUrl(window.location.origin))},[isLoaded,isSignedIn,userId,expectedUserId]);
 if(isLoaded&&isSignedIn&&userId!==expectedUserId)return <main className="welcome-login"><h1>Your account changed</h1><p>Reload to open the planner for your current account. Unsaved edits from the previous account have been cleared.</p><a className="button primary" href={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)}>Open current account</a></main>;
 if(closed)return<AccountDeletionProgress identity={closed.identity} initialStatus={closed.status}/>;
 if(!isLoaded)return <main className="welcome-login"><h1>Opening your private planner…</h1></main>;
 if(!isSignedIn)return <main className="welcome-login"><h1>Your session has ended</h1><p>Sign in again to open your saved planner.</p><a className="button primary" href="/sign-in">Sign in</a></main>;
 if(userId!==expectedUserId)return <main className="welcome-login"><h1>Your account changed</h1><p>Reload to open the planner for your current account. Unsaved edits from the previous account have been cleared.</p><a className="button primary" href={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)}>Open current account</a></main>;
 return <div data-private-workspace><Fragment key={expectedUserId}>{children}</Fragment></div>;
}
