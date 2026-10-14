'use client';
import{useEffect,useId,useRef}from'react';
import './attendee-social.css';
export function SocialConfirmDialog({title,children,confirmLabel,busy=false,error='',onCancel,onConfirm}:{title:string;children:React.ReactNode;confirmLabel:string;busy?:boolean;error?:string;onCancel:()=>void;onConfirm:()=>Promise<unknown>|void}){
 const ref=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),heading=useId();
 useEffect(()=>{ref.current?.showModal();cancel.current?.focus();return()=>ref.current?.close()},[]);
 return <dialog ref={ref} className="social-confirm-modal" aria-labelledby={heading} onCancel={e=>{e.preventDefault();if(!busy)onCancel()}}><h2 id={heading}>{title}</h2><div>{children}</div>{error&&<p className="error-banner" role="alert">{error}</p>}<div className="social-confirm-actions"><button ref={cancel} type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="button primary" disabled={busy} onClick={()=>void onConfirm()}>{busy?'Saving…':confirmLabel}</button></div></dialog>;
}
