'use client';
import{useCallback,useEffect,useLayoutEffect,useRef,useState}from'react';
import{SCREEN_TOUR_STEPS,clipTourTarget,screenTourPlacement,screenTourKey,readScreenTourState,rememberScreenTour,type TourRect,type TourSection}from'@/lib/screen-tour';
import'./screen-tour.css';
type Props={owner:string;authenticated:boolean;eligibleToOffer:boolean;blocked:boolean;section:string;requestStart:number;onNavigate:(section:TourSection)=>void};
export function ScreenTour({owner,authenticated,eligibleToOffer,blocked,section,requestStart,onNavigate}:Props){
 const[offer,setOffer]=useState(false),[active,setActive]=useState(false),[index,setIndex]=useState(0),[notice,setNotice]=useState(''),[layout,setLayout]=useState<{position:ReturnType<typeof screenTourPlacement>;target:TourRect|null;missing:boolean}|null>(null);
 const panel=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null),returnTo=useRef<HTMLElement|null>(null),lastRequest=useRef(requestStart),step=SCREEN_TOUR_STEPS[index];
 const remember=useCallback(()=>{try{rememberScreenTour(owner,window.localStorage)}catch{}setOffer(false)},[owner]);
 const close=useCallback((restoreFocus=true)=>{setActive(false);setLayout(null);remember();if(restoreFocus)requestAnimationFrame(()=>{const target=returnTo.current?.isConnected?returnTo.current:document.querySelector<HTMLElement>('[data-tour-return]');if(target){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});target.focus({preventScroll:true})}})},[remember]);
 const begin=useCallback((trigger?:HTMLElement)=>{
  if(!authenticated||blocked)return;
  // Do not navigate away from an unsent message. Read only whether a draft exists.
  if([...document.querySelectorAll<HTMLTextAreaElement>('[data-devyo-message-draft]')].some(field=>field.value.trim())){setNotice('Finish or clear your message draft before starting the tour. Replay it from Sources and help when you are ready.');return}
  if(document.querySelector('[data-devyo-profile-draft="true"]')){setNotice('Save or discard your unfinished profile changes before starting the tour. Replay it from Sources and help when you are ready.');return}
  returnTo.current=trigger??document.querySelector<HTMLElement>('[data-tour-return]');remember();setNotice('');setIndex(0);setLayout(null);setActive(true);
 },[authenticated,blocked,remember]);
 useEffect(()=>{if(!authenticated||blocked||!eligibleToOffer){setOffer(false);return}try{setOffer(readScreenTourState(owner,window.localStorage)==='new')}catch{setOffer(false)}},[owner,authenticated,blocked,eligibleToOffer]);
 useEffect(()=>{if(requestStart===lastRequest.current)return;lastRequest.current=requestStart;begin()},[requestStart,begin]);
 useEffect(()=>{if(active&&(!authenticated||blocked))close(false)},[active,authenticated,blocked,close]);
 useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===screenTourKey(owner)&&event.newValue==='seen')setOffer(false)};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[owner]);
 useEffect(()=>{if(active)onNavigate(step.section)},[active,index,onNavigate,step.section]);
 useEffect(()=>{if(active&&section!==step.section)close(false)},[section]);
 useEffect(()=>{
  if(!active)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!blocked){event.preventDefault();close()}};
  const hidden=()=>{if(document.visibilityState==='hidden')close(false)};
  const input=(event:FocusEvent)=>{const target=event.target;if(target instanceof HTMLElement&&!panel.current?.contains(target)&&target.matches('input,textarea,select,[contenteditable="true"]'))close(false)};
  const leave=()=>close(false);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',hidden);document.addEventListener('focusin',input);window.addEventListener('pagehide',leave);window.addEventListener('popstate',leave);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('focusin',input);window.removeEventListener('pagehide',leave);window.removeEventListener('popstate',leave)};
 },[active,blocked,close]);
 useLayoutEffect(()=>{
  if(!active||section!==step.section)return;
  let frame=0,firstFrame=0,secondFrame=0,stopped=false,observed:HTMLElement|null=null;
  const viewport=():TourRect=>{const v=window.visualViewport;return{left:v?.offsetLeft??0,top:v?.offsetTop??0,width:v?.width??window.innerWidth,height:v?.height??window.innerHeight}};
  const target=()=>{for(const selector of step.targets){const el=document.querySelector<HTMLElement>(selector),r=el?.getBoundingClientRect();if(el&&r&&r.width>0&&r.height>0&&!el.closest('[inert],[aria-hidden="true"]'))return el}return null};
  const measure=()=>{if(stopped)return;const view=viewport();if(view.width<260||view.height<220){setNotice('The tour is paused for more screen space. Replay it from Sources and help when you are ready.');close(false);return}const el=target();if(el!==observed){if(observed)resize?.unobserve(observed);if(el)resize?.observe(el);observed=el}const r=el?.getBoundingClientRect(),rect=r?{left:r.left,top:r.top,width:r.width,height:r.height}:null,position=screenTourPlacement(rect,view,panel.current?.getBoundingClientRect().height||280),next={position,target:clipTourTarget(rect,view),missing:!el};setLayout(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)};
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);if(panel.current)resize?.observe(panel.current);const el=target();if(el){resize?.observe(el);observed=el}
  const mutation=typeof MutationObserver==='undefined'?null:new MutationObserver(schedule);mutation?.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  // Let the planner finish its own navigation/focus before placing the coach.
  firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{target()?.scrollIntoView({block:step.section==='profile'&&viewport().width<=760?'start':'center',inline:'nearest',behavior:'auto'});measure();heading.current?.focus({preventScroll:true})})});measure();
  return()=>{stopped=true;cancelAnimationFrame(frame);cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);resize?.disconnect();mutation?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule)};
 },[active,index,section,step,close]);
 if(!authenticated||blocked)return null;
 return <>{notice&&<div className="screen-tour-notice" role="status"><p>{notice}</p><button type="button" onClick={()=>setNotice('')} aria-label="Dismiss tour message">Close</button></div>}
  {offer&&!active&&<aside className="screen-tour-offer" aria-label="Devyo guided tour"><div><h2>New to Devyo?</h2><p>Set up your name and avatar, then explore your agenda, connections, private notes and AI questions.</p></div><div className="screen-tour-offer-actions"><button type="button" className="button primary" onClick={event=>begin(event.currentTarget)}>Take the tour</button><button type="button" className="button secondary" onClick={()=>close()}>Not now</button></div></aside>}
  {active&&<>{layout?.target&&<div className="screen-tour-highlight" aria-hidden="true" style={layout.target}/>}
   <section className="screen-tour-panel" role="dialog" aria-modal="false" aria-labelledby="screen-tour-title" aria-describedby="screen-tour-description" ref={panel} style={layout?.position??{visibility:'hidden'}}>
    <header><div><p id="screen-tour-progress" className="screen-tour-progress">Devyo tour · {index+1} of {SCREEN_TOUR_STEPS.length}</p><h2 id="screen-tour-title" tabIndex={-1} aria-describedby="screen-tour-progress screen-tour-description" ref={heading}>{step.title}</h2></div><button type="button" className="screen-tour-close" aria-label="Close guided tour" onClick={()=>close()}>×</button></header>
    <div className="screen-tour-copy"><p id="screen-tour-description">{step.description}</p>{layout?.missing&&<p className="screen-tour-missing">This control is not available on this screen right now. You can still follow the overview.</p>}{index===SCREEN_TOUR_STEPS.length-1&&<p>Replay this tour anytime from Sources and help.</p>}</div>
    <footer><button type="button" className="screen-tour-skip" onClick={()=>close()}>Skip tour</button><button type="button" className="button secondary" disabled={index===0||!layout||section!==step.section} onClick={()=>{setLayout(null);setIndex(i=>Math.max(0,i-1))}}>Back</button><button type="button" className="button primary" disabled={!layout||section!==step.section} onClick={()=>{if(index===SCREEN_TOUR_STEPS.length-1)close();else{setLayout(null);setIndex(i=>i+1)}}}>{index===SCREEN_TOUR_STEPS.length-1?'Finish':'Next'}</button></footer>
   </section>
  </>}
 </>;
}
