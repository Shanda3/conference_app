'use client';
import{useEffect,useState}from'react';import{AlertTriangle}from'lucide-react';
import './schedule-change-alert.css';
export function ScheduleChangeAlert({count,version,owner,onReview}:{count:number;version:string;owner:string;onReview:()=>void}){
 const[fresh,setFresh]=useState(false);
 useEffect(()=>{if(!count||!version||!owner)return;try{const key='devyo-schedule-announcement:'+owner;setFresh(localStorage.getItem(key)!==version);localStorage.setItem(key,version)}catch{setFresh(true)}},[count>0,version,owner]);
 if(!count)return null;
 return <aside className="schedule-change-alert" role={fresh?'status':undefined} aria-live={fresh?'polite':'off'} aria-label="Schedule change affecting your saved plan"><AlertTriangle size={24} aria-hidden="true"/><div><strong>Schedule changes created {count} new {count===1?'conflict':'conflicts'} in your saved plan.</strong><p>Your choices and private notes are kept. Review the overlapping sessions and choose which to attend.</p></div><button type="button" className="button secondary" onClick={onReview}>Review conflicts</button></aside>;
}
