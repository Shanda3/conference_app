export type PlannerSection='sessions'|'agenda'|'attendees'|'groups'|'connections'|'notes'|'chat'|'profile'|'venue';
/** Ignore browser chrome and ordinary zoom/resize changes when no field is being edited. */
export function keyboardObscuresNavigation(layoutHeight:number,visibleHeight:number,editing:boolean){
 return editing&&Number.isFinite(layoutHeight)&&Number.isFinite(visibleHeight)&&layoutHeight>0&&visibleHeight>0&&layoutHeight-visibleHeight>120&&visibleHeight<layoutHeight*0.8;
}
