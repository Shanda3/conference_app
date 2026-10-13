import{VenueGuide}from'../venue-guide';
export const dynamic='force-dynamic';
export const metadata={title:'Find your way | ThunderPlains Devyo',description:'Official Oklahoma City Convention Center floor plans, restrooms, parking, accessibility and session level guidance.'};
export default function VenuePage(){return <main className="venue-public"><nav className="venue-public-nav" aria-label="Devyo navigation"><a className="venue-home" href="/">ThunderPlains · Devyo</a><a className="button secondary" href="/">Back to Devyo</a></nav><VenueGuide/></main>}
