/** Plain-text, editable note additions. No automatic writes and no hidden note metadata. */
export function prepNoteSection(label:string,primer:string,questions:string[]):string{
 if(!primer.trim()&&!questions.length)return'';
 if(label.length>100||primer.length>900||questions.length>5||questions.some(q=>typeof q!=='string'||!q.trim()||q.length>300))throw Error('Choose a smaller note addition.');
 return[label,primer.trim()?`Primer: ${primer.trim()}`:'',questions.length?'Suggested questions:':'',...questions.map(q=>`• ${q.trim()}`)].filter(Boolean).join('\n');
}
export function appendPrepNote(current:string,section:string):{note:string;duplicate:boolean}{
 if(!section.trim())throw Error('Select a primer or question first.');
 if(current.includes(section))return{note:current,duplicate:true};
 const note=current+(current.trim()?'\n\n':'')+section;if(note.length>8000)throw Error('This note would exceed 8,000 characters. Select less material or shorten the note first.');return{note,duplicate:false};
}
