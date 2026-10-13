import{AFTER_PARTY_ID}from'./organizer-session-extras.ts';
/** Public, sourced venue guidance only. No attendee data, location permission or map API keys. */
export const VENUE={name:'Oklahoma City Convention Center',address:'100 Mick Cornett Drive',city:'Oklahoma City, OK 73109',checkedAt:'2026-10-12',sources:{plans:'https://okcconventioncenter.com/plan/floor-plans/',accessibility:'https://okcconventioncenter.com/attend/accesibility/',garage:'https://www.embarkok.com/parking/convention-center-garage',arrival:'https://www.oklahoma.gov/odmhsas/trainings/conferences/momentum-conference/travel.html',streetcar:'https://www.embarkok.com/streetcar',transit:'https://www.embarkok.com/streetcar/map-schedule',brochure:'https://okcconventioncenter.com/wp-content/uploads/2021/09/Brochure-2025-Web_compressed.pdf'}} as const;
export type RestroomMarker={id:string;x:number;y:number;landmark:string};
export type VenueLevel={number:1|2|3|4;title:string;rooms:string;image:string;sourceImage:string;restrooms:RestroomMarker[]};
// Coordinates mark the published restroom symbols, not an indoor route or live access state.
export const VENUE_LEVELS:VenueLevel[]=[
 {number:1,title:'Level 1 · Exhibit halls',rooms:'Exhibit Hall A and its program theaters are on this level.',image:'/venue-maps/level-1.jpg',sourceImage:'https://okcconventioncenter.com/wp-content/uploads/2021/09/okc-convention-first-floor-map.jpg',restrooms:[{id:'R1',x:15.1,y:72.4,landmark:'Prefunction edge by Hall A / Room 101'},{id:'R2',x:30.3,y:72.4,landmark:'Prefunction edge by Hall B'},{id:'R3',x:55.7,y:72.4,landmark:'Prefunction edge by Hall C'},{id:'R4',x:75.9,y:71.7,landmark:'Prefunction edge by Hall D / Rooms 102–106'}]},
 {number:2,title:'Level 2 · Meeting rooms',rooms:'Rooms 201–209. The program uses 201, 202, 203, 204, 206AB, 207AB, 208AB and 209AB.',image:'/venue-maps/level-2.jpg',sourceImage:'https://okcconventioncenter.com/wp-content/uploads/2021/09/Floor-2-Map.jpg',restrooms:[{id:'R1',x:31.9,y:26.8,landmark:'Beside the 205A end of the 205–207 room row'},{id:'R2',x:67.9,y:25.1,landmark:'Beside the 207B end of the 205–207 room row'}]},
 {number:3,title:'Level 3 · Meeting rooms & Junior Ballroom',rooms:'Rooms 301A–D and Junior Ballroom 302 appear on the venue plan.',image:'/venue-maps/level-3.jpg',sourceImage:'https://okcconventioncenter.com/wp-content/uploads/2021/09/okc-convention-3rd-floor-map.jpg',restrooms:[{id:'R1',x:20,y:49,landmark:'Lobby-facing bank just above Rooms 301A–D on the plan'},{id:'R2',x:72.1,y:51.3,landmark:'Lobby-facing bank beside Junior Ballroom 302'}]},
 {number:4,title:'Level 4 · Ballroom',rooms:'Ballroom A and B. No conference session assignment is inferred from this map.',image:'/venue-maps/level-4.jpg',sourceImage:'https://okcconventioncenter.com/wp-content/uploads/2021/09/OKC-Convention-Center-Fourth-Floor.jpg',restrooms:[{id:'R1',x:27.2,y:46.6,landmark:'Bank beside Ballroom A'},{id:'R2',x:59.1,y:46,landmark:'Bank beside Ballroom B'}]},
];
export function publicVenuePath(path:string){return ['/venue','/venue/','/venue-maps/outdoor-reference.svg'].includes(path)||VENUE_LEVELS.some(level=>path===level.image)}
export function venueDirections(provider:'google'|'apple',garage=false){const destination=garage?'Convention Center Garage, 15 Mick Cornett Drive, Oklahoma City, OK':`${VENUE.address}, ${VENUE.city}`;if(garage&&provider==='google')return 'https://www.google.com/maps/dir/?api=1&destination=35.4602231%2C-97.513217';return provider==='apple'?`https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
/** Exact published or organizer-confirmed room labels only. */
export function sessionVenueTarget(conferenceId:string,room:string):{anchor:string;level:number}|null{
 if(conferenceId==='thunderplains-2026'&&['Room 301 AB','Room 301 CD'].includes(room))return{anchor:'level-3',level:3};
 if(conferenceId!=='innotech-oklahoma-2026')return null;
 if(['Exhibit Hall A, First Floor','Interworks Partner Demo Theater, Exhibit Hall A, First Floor','Interworks Partner Theater, Exhibit Hall A, First Floor'].includes(room))return{anchor:'level-1',level:1};
 if(/^Room (201|202|203|204|206AB|207AB|208AB|209AB), Second Floor$/.test(room))return{anchor:'level-2',level:2};
 if(room==='Room 301A-D, Third Floor')return{anchor:'level-3',level:3};
 return null;
}

export const VENUE_ROOMS=[
 ...['Exhibit Hall A','Exhibit Hall B','Exhibit Hall C','Exhibit Hall D',...Array.from({length:6},(_,i)=>`Room ${101+i}`)].map(label=>({label,level:1,anchor:'level-1'})),
 ...['201','202','203','204','205A/B','206A/B','207A/B','208A/B','209A/B'].map(number=>({label:`Room ${number}`,level:2,anchor:'level-2'})),
 ...['301 AB','301 CD','301A–D','302 · Junior Ballroom'].map(number=>({label:`Room ${number}`,level:3,anchor:'level-3'})),
 ...['Ballroom A','Ballroom B'].map(label=>({label,level:4,anchor:'level-4'})),
];
export function findVenueRooms(query:string){const q=query.trim().toLowerCase().replace(/[^a-z0-9]/g,'');if(!q)return[];return VENUE_ROOMS.filter(room=>room.label.toLowerCase().replace(/[^a-z0-9]/g,'').includes(q)).slice(0,12)}

/** Organizer location correction for this published lunch service only; raw program stays intact. */
export function sessionOutdoorLocation(session:{id:string;conferenceId:string}){
 if(session.conferenceId==='thunderplains-2026'&&session.id==='thunderplains-2026-02499046-49d3-460e-8e42-81a71065f258')return{label:'Food trucks · northeast corner',href:'/venue#food-trucks',anchor:'food-trucks'} as const;
 return null;
}

export function sessionAfterPartyLocation(session:{id:string;conferenceId:string}){return session.conferenceId==='thunderplains-2026'&&session.id===AFTER_PARTY_ID?{label:'Social Capital',href:'/venue#after-party',anchor:'after-party'} as const:null}
