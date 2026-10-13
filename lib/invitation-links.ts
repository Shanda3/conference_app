/** Accept only this app's generated root invitation links; never navigate to pasted URLs. */
export function groupInviteToken(input:string,origin:string):string {
 let url:URL;try{url=new URL(input)}catch{throw new Error("Paste a complete group invitation link.")}
 if((url.origin!==origin&&!(['https://devyo.app','https://thunderplains.devyo.app'].includes(origin)&&['https://devyo.app','https://thunderplains.devyo.app'].includes(url.origin)))||url.username||url.password||url.pathname!=="/"||url.search)throw new Error("Use a group invitation for this app.");
 const token=url.hash.match(/^#group-invite=([A-Za-z0-9_-]{43})$/)?.[1];
 if(!token)throw new Error("This is not a group invitation link.");return token;
}
