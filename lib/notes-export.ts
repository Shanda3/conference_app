import type{PlannerState}from'./planner';
import{sessionRoom}from'./session-rooms.ts';
/** Human-readable, owner-snapshot notes. Internal IDs are used only to join context, never printed. */
export function privateNotesText(state:PlannerState,now=new Date()){
 const sessions=new Map(state.sessions.map(session=>[session.id,session]));const conferences=new Map(state.conferences.map(conference=>[conference.id,conference]));
 const notes=Object.entries(state.sessionNotes).filter(([,note])=>note.trim());
 if(!notes.length)return null;
 const filename=`devyo-notes-${now.toISOString().slice(0,10)}.txt`,lines=['Devyo — My private session notes',`Exported: ${now.toISOString().replace('T',' ').replace('.000Z',' UTC')}`,`Notes: ${notes.length}`,'','This download includes your saved private notes across your planner.',''];
 notes.sort(([a],[b])=>(sessions.get(a)?.start??'').localeCompare(sessions.get(b)?.start??'')||(sessions.get(a)?.title??'').localeCompare(sessions.get(b)?.title??''));
 for(const [id,note]of notes){const session=sessions.get(id),conference=session?conferences.get(session.conferenceId):undefined;lines.push('────────────────────────────────────────',session?.title||'Saved session note');if(conference)lines.push(`Conference: ${conference.name}`);if(session?.speaker)lines.push(`Speaker: ${session.speaker}`);if(session?.start&&session.end){const zone=conference?.timeZone||'UTC';const format=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:zone});lines.push(`When: ${format.format(new Date(session.start))} – ${format.format(new Date(session.end))} (${zone})`)}if(session?.room)lines.push(`Room: ${sessionRoom(session)}`);if(session?.url)lines.push(`Session details / directions: ${session.url}`);lines.push('',note.replace(/\r\n?/g,'\n'),'')}
 return{filename,count:notes.length,text:lines.join('\n')+'\n'};
}
