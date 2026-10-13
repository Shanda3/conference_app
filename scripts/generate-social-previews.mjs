// Reproducible public branding assets; no attendee data, network or image-generation provider.
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createRequire}from'node:module';
const root=new URL('../',import.meta.url),require=createRequire(new URL('package.json',root)),sharp=require('sharp');
const mark=(await readFile(new URL('public/thunderplains-mark.svg',root),'utf8')).match(/<path\b[^>]*\/>/g).join('');
const folder=new URL('public/social-previews/',root);await mkdir(folder,{recursive:true});
for(const brand of['devyo','thunderplains']){
 const event=brand==='thunderplains',name=event?'ThunderPlains':'Devyo',domain=event?'thunderplains.devyo.app':'devyo.app';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc"><title id="title">${name} conference planner</title><desc id="desc">Public ${name} branding. A clear conference plan with private notes and attendee connections.</desc>
 <rect width="1200" height="630" fill="#24103b"/><circle cx="1190" cy="300" r="295" fill="#3c1b53"/><circle cx="1190" cy="300" r="220" fill="none" stroke="#663180" stroke-width="2"/><circle cx="1190" cy="300" r="140" fill="none" stroke="#663180" stroke-width="2"/>
 <rect x="74" y="58" width="66" height="82" rx="12" fill="${event?'#f2dafa':'#00cbe7'}"/>${event?`<svg x="85" y="60" width="44" height="77" viewBox="0 0 680 1350">${mark}</svg>`:'<path d="M91 78h15c21 0 21 42 0 42H91V78zm12 10v22h4c10 0 10-22 0-22h-4z" fill="#24103b" fill-rule="evenodd"/>'}
 <g font-family="Arial, Helvetica, sans-serif"><text x="160" y="101" fill="#fff" font-size="44" font-weight="700">${name}</text><text x="162" y="132" fill="#00cbe7" font-size="18" letter-spacing="2">${event?'BY TECHLAHOMA · ATTENDEE PLANNER':'YOUR CONFERENCE STARTS HERE'}</text>
 <text x="76" y="257" fill="#fff" font-size="77" font-weight="700">${event?'A clear plan.':'Your conference.'}</text><text x="76" y="349" fill="#fff" font-size="77" font-weight="700">${event?'More room to connect.':'Your kind of day.'}</text>
 <text x="80" y="410" fill="#dacbe6" font-size="27">${event?'October 21, 2026 · Oklahoma City':'Find your event. Build your private agenda.'}</text><text x="80" y="467" fill="#00cbe7" font-size="25">Sessions · Private notes · Connections</text>
 <path d="M76 527H1124" stroke="#654279" stroke-width="2"/><text x="80" y="583" fill="#ffd843" font-size="26" font-weight="700">${domain}</text><text x="1124" y="583" text-anchor="end" fill="#dacbe6" font-size="20">${event?'Independent attendee planner':'A fun Techlahoma side project'}</text></g></svg>`;
 await writeFile(new URL(brand+'.svg',folder),svg);await sharp(Buffer.from(svg)).png().toFile(new URL(brand+'.png',folder).pathname);
 console.log(`${brand}: SVG source + 1200×630 PNG`);
}
