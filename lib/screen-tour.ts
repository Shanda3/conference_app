export type TourSection='profile'|'agenda'|'connections'|'notes'|'sessions';
export const SCREEN_TOUR_STEPS=[
 {id:'profile-name',section:'profile',title:'Your name in Settings',description:'Settings is home to your conference profile and sign-in options. Enter the display name you want other attendees to see, then choose Save profile. Your email is never used as your public name. You can finish the tour first; it will not edit or save your details.',targets:['[data-tour-profile-name]','[data-tour-screen="profile"]']},
 {id:'profile-photo',section:'profile',title:'Add an optional photo',description:'Choose Add image to select a photo from your device, adjust its square crop, then save it privately. Use Show my uploaded photo and Save photo preferences only if you want signed-in ThunderPlains attendees to see it. Initials are fine too; photo uploads may not be available on every event.',targets:['[data-tour-profile-photo]']},
 {id:'profile-avatar',section:'profile',title:'Choose your avatar',description:'Keep your initials or choose Use my account’s Gravatar for an image linked to your verified email. Gravatar is optional and sends an email hash to that service; other attendees do not receive your email or hash. With a phone-only account, keep your initials or add and verify an optional email first.',targets:['[data-tour-profile-avatar]']},
 {id:'agenda',section:'agenda',title:'Your agenda',description:'Save sessions from Explore sessions to build your plan. Overlapping choices are flagged so you can choose what to attend.',targets:['[data-tour-screen="agenda"]']},
 {id:'connections',section:'connections',title:'Your connections',description:'Save someone from Attendees or add a connection yourself. Keep your private conversation notes and follow-up details here.',targets:['[data-tour-screen="connections"]']},
 {id:'notes',section:'notes',title:'Your private notes',description:'Open a session and choose Private note to capture ideas. Find your saved notes here and download a copy when you need one.',targets:['[data-tour-screen="notes"]']},
 {id:'ai',section:'sessions',title:'AI questions, when you choose',description:'Open Before this talk on a session for AI questions, or review text from a private note. Review the source, selected text and labels before approving a request. Your remaining allowance is shown before you send.',targets:['[data-tour-ai-entry]','[data-tour-screen="sessions"]']},
] as const satisfies ReadonlyArray<{id:string;section:TourSection;title:string;description:string;targets:readonly string[]}>;
type TourStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function screenTourKey(owner:string){return /^[A-Za-z0-9_-]{1,128}$/.test(owner)?'devyo-screen-tour:v1:'+owner:null}
/** With unavailable storage, offer manual replay only instead of repeatedly prompting. */
export function readScreenTourState(owner:string,storage:TourStorage):'new'|'seen'|'unavailable'{
 const key=screenTourKey(owner);if(!key)return'unavailable';
 try{if(storage.getItem(key)==='seen')return'seen';storage.setItem(key+':probe','1');storage.removeItem(key+':probe');return'new'}catch{return'unavailable'}
}
export function rememberScreenTour(owner:string,storage:TourStorage){const key=screenTourKey(owner);if(!key)return false;try{storage.setItem(key,'seen');return true}catch{return false}}
export type TourRect={left:number;top:number;width:number;height:number};
export function screenTourPlacement(target:TourRect|null,viewport:TourRect,panelHeight=280){
 const margin=12,mobile=viewport.width<=760,width=Math.max(1,Math.min(360,viewport.width-margin*2)),reserved=mobile?84:0,maxHeight=Math.max(1,viewport.height-reserved-margin*2),height=Math.min(panelHeight,maxHeight),right=viewport.left+viewport.width,bottom=viewport.top+viewport.height;
 const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
 let top=bottom-reserved-margin-height,left=viewport.left+(viewport.width-width)/2;
 if(!mobile&&target){left=target.left;top=target.top+target.height+margin;if(top+height>bottom-margin)top=target.top-height-margin;}
 return{left:clamp(left,viewport.left+margin,right-width-margin),top:clamp(top,viewport.top+margin,bottom-height-margin),width,maxHeight};
}
export function clipTourTarget(target:TourRect|null,viewport:TourRect):TourRect|null{
 if(!target)return null;const left=Math.max(target.left,viewport.left+4),top=Math.max(target.top,viewport.top+4),right=Math.min(target.left+target.width,viewport.left+viewport.width-4),bottom=Math.min(target.top+target.height,viewport.top+viewport.height-4);
 return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}
