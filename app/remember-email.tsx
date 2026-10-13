'use client';
import{eventHomeUrl}from"@/lib/social-sharing";
import{useEffect,useState}from'react';import{SignIn,SignUp,useUser}from'@clerk/react';
import{readRememberChoice,readRememberedEmail,setRememberChoice,rememberVerifiedEmail}from'@/lib/remember-email';
export function RememberVerifiedEmail(){
 const{isLoaded,user}=useUser();const primary=user?.primaryEmailAddress;
 useEffect(()=>{if(!isLoaded||primary?.verification?.status!=='verified')return;try{rememberVerifiedEmail(window.localStorage,primary.emailAddress)}catch{}},[isLoaded,user?.id,primary?.emailAddress,primary?.verification?.status]);return null;
}
export function RememberedAuth({signUp=false}:{signUp?:boolean}){
 const[ready,setReady]=useState(false),[remember,setRemember]=useState(true),[email,setEmail]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{try{const storage=window.localStorage;storage.getItem('devyo.remember-email-choice.v1');setRemember(readRememberChoice(storage));setEmail(readRememberedEmail(storage))}catch{setNotice('Your browser cannot save this preference.')}setReady(true)},[]);
 function choose(enabled:boolean){setRemember(enabled);try{if(!setRememberChoice(window.localStorage,enabled))setNotice('Your browser cannot save this preference.')}catch{setNotice('Your browser cannot save this preference.')}}
 const initialValues=email?{emailAddress:email}:undefined;
 return <><label className="remember-email-choice"><input type="checkbox" checked={remember} onChange={e=>choose(e.target.checked)}/><span>Remember my email on this device</span></label><p className="form-hint remember-email-hint">Prefills your email after a successful sign-in. You still verify your account when required. Uncheck on shared devices.</p>{notice&&<p role="status">{notice}</p>}{!ready?<p role="status">Loading sign-in…</p>:signUp?<SignUp initialValues={initialValues} routing="hash" signInUrl="/sign-in" forceRedirectUrl={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)} signInForceRedirectUrl={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)}/>:<SignIn initialValues={initialValues} routing="hash" signUpUrl="/sign-up" forceRedirectUrl={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)} signUpForceRedirectUrl={eventHomeUrl(typeof window==='undefined'?undefined:location.origin)}/>}</>;
}
