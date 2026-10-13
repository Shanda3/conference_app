/** Organizer-confirmed ThunderPlains locations. Apply after source validation;
 * raw publisher snapshots and attendees' saved records remain unchanged. */
const lunch='thunderplains-2026-02499046-49d3-460e-8e42-81a71065f258';
type RoomSession={id:string;conferenceId:string;room:string};
export function sessionRoom(session:RoomSession):string{
 if(session.conferenceId!=='thunderplains-2026'||session.id===lunch||!/^thunderplains-2026-(?:\d+|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(session.id))return session.room;
 return session.room==='Track AB'?'Room 301 AB':session.room==='Track CD'?'Room 301 CD':session.room;
}
export function confirmedSessionRoom<T extends RoomSession>(session:T):T{
 const room=sessionRoom(session);return room===session.room?session:{...session,room};
}
