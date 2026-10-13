import type{Connection}from'./planner';
import{validateLinkedInUrl}from'./sharing.ts';
export type AttendeeConnectionSource={id:string;displayName:string;me:number;linkedInUrl?:string};
export function attendeeConnectionId(member:Pick<AttendeeConnectionSource,'id'>){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(member.id))throw Error('This attendee could not be saved. Refresh the attendees list.');
 return `member-${member.id}`;
}
/** Copy only directory fields deliberately visible to signed-in members. Private fields are never read. */
export function attendeeConnection(member:AttendeeConnectionSource,conferenceId:string):Connection{
 if(member.me)throw Error('Choose another attendee to save as a connection.');
 return{id:attendeeConnectionId(member),conferenceId,name:member.displayName,linkedInUrl:member.linkedInUrl?validateLinkedInUrl(member.linkedInUrl):'',role:'',company:'',notes:'',followUpDate:'',status:'want-to-meet'};
}
