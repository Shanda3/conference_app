import {env} from 'cloudflare:workers';
import {readProgram} from '@/lib/program-sync';
import type {ProgramSeed} from '@/lib/program-model';
import seed from '@/lib/event-data.json';
import{VenueGuide}from'../venue-guide';
export const dynamic='force-dynamic';
export const metadata={title:'Find your way | ThunderPlains Devyo',description:'Official Oklahoma City Convention Center floor plans, restrooms, parking, accessibility and session level guidance.'};
export default async function VenuePage(){let published;try{if(env.DB)published=(await readProgram(env.DB,seed as unknown as ProgramSeed)).sessions.map(({id,conferenceId,room,status})=>({id,conferenceId,room,status}))}catch{/* Keep the verified bundled room snapshot if the public program is unavailable. */}return <main className="venue-public"><nav className="venue-public-nav" aria-label="Devyo navigation"><a className="venue-home" href="/">ThunderPlains · Devyo</a><a className="button secondary" href="/">Back to Devyo</a></nav><VenueGuide published={published}/></main>}
