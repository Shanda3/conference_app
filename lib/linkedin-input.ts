import{SharingError,validateLinkedInUrl}from'./sharing.ts';
/** Input convenience only; persisted values still pass the existing strict HTTPS LinkedIn validator. */
export function linkedInInputUrl(value:unknown):string{
 if(typeof value!=='string'||value.length>300||/[\u0000-\u001f\u007f]/.test(value))throw new SharingError('Enter your LinkedIn profile handle or direct HTTPS profile URL.');
 const input=value.trim();if(!input)return'';
 if(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/?$/.test(input))return validateLinkedInUrl(`https://www.linkedin.com/in/${input}`);
 return validateLinkedInUrl(input);
}
/** Display a saved/valid pasted URL as its handle without writing or changing the stored link. */
export function linkedInInputDisplay(value:string):string{try{const url=validateLinkedInUrl(value);return url?new URL(url).pathname.slice('/in/'.length):''}catch{return value}}
