'use client';
import{useEffect,useState}from'react';
import{Download,Info}from'lucide-react';
import{THUNDERPLAINS_CLEANUP}from'../lib/event-cleanup-review';
import'./event-cleanup-notice.css';

export function EventCleanupNoticeView({now,onOpenNotes}:{now:number|null;onOpenNotes?:()=>void}){
 const past=now!==null&&now>=THUNDERPLAINS_CLEANUP.deadlineAt;
 return<aside className="event-cleanup-notice" aria-labelledby="event-cleanup-notice-title">
  <Info size={23} aria-hidden="true"/>
  <div><h2 id="event-cleanup-notice-title">Save your ThunderPlains notes</h2>
   <p>The organizer requested attendee account cleanup for <strong>{THUNDERPLAINS_CLEANUP.deadlineLabel}</strong> — 48 hours after the conference ended.</p>
   <p className="event-cleanup-status">{past?'The requested deadline has passed. Cleanup has not been confirmed.':'Cleanup is awaiting final confirmation and is not yet scheduled.'} Download your saved notes now.</p>
   <p>After active app data is removed, provider backups and logs may remain under their retention policies. This notice is not a deletion confirmation.</p>
   <div className="event-cleanup-actions">{onOpenNotes?<button type="button" className="button secondary" onClick={onOpenNotes}><Download size={17} aria-hidden="true"/>Open notes & download</button>:<a className="button secondary" href="/notes"><Download size={17} aria-hidden="true"/>Open notes & download</a>}<a href="mailto:shandaokcwebdev@gmail.com">Questions? Contact Shanda</a></div>
  </div>
 </aside>;
}
export function EventCleanupNotice({onOpenNotes}:{onOpenNotes?:()=>void}){
 const[now,setNow]=useState<number|null>(null);
 useEffect(()=>{const update=()=>{if(document.visibilityState!=='hidden')setNow(Date.now())};update();const timer=window.setInterval(update,60000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}},[]);
 return<EventCleanupNoticeView now={now} onOpenNotes={onOpenNotes}/>;
}
