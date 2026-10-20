"use client";
import {CalendarDays,Compass,Menu,MessageCircle,Users} from 'lucide-react';
import type {PlannerSection} from '@/lib/mobile-ui';
const items=[{id:'sessions',label:'Sessions',icon:Compass},{id:'agenda',label:'Agenda',icon:CalendarDays},{id:'attendees',label:'Attendees',icon:Users},{id:'chat',label:'Chat',icon:MessageCircle}] as const;
export function MobileNavigation({section,savedCount,chatUnread=0,hidden,expanded,onSelect,onMore}:{section:PlannerSection;savedCount:number;chatUnread?:number;hidden:boolean;expanded:boolean;onSelect:(section:PlannerSection)=>void;onMore:(event:React.MouseEvent<HTMLButtonElement>)=>void}){
 const secondary=!items.some(item=>item.id===section);
 return <nav className={`mobile-primary-nav ${hidden?'is-hidden':''}`} aria-label="Primary navigation" aria-hidden={hidden||undefined} inert={hidden}>
 {items.map(({id,label,icon:Icon})=><button key={id} type="button" className={section===id?'active':''} aria-current={section===id?'page':undefined} aria-label={id==='agenda'&&savedCount>0?`Agenda, ${savedCount} saved sessions`:id==='chat'&&chatUnread>0?`Chat, ${chatUnread} unread messages`:label} onClick={()=>onSelect(id)}><span className="mobile-nav-icon"><Icon size={22} aria-hidden="true"/>{id==='agenda'&&savedCount>0&&<b aria-hidden="true">{savedCount>99?'99+':savedCount}</b>}{id==='chat'&&chatUnread>0&&<b aria-hidden="true">{chatUnread>99?'99+':chatUnread}</b>}</span><span>{label}</span></button>)}
 <button type="button" className={secondary?'active':''} aria-current={secondary?'page':undefined} aria-controls="planner-navigation" aria-expanded={expanded} onClick={onMore}><span className="mobile-nav-icon"><Menu size={22} aria-hidden="true"/></span><span>More</span></button>
 </nav>;
}
