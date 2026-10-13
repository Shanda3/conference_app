import{TALK_GUIDES}from'./talk-prep.ts';
import type{PublishedSession}from'./program-model.ts';
const decode=(value:string)=>value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi,(_,e:string)=>{if(e.startsWith('#')){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}return({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'}as Record<string,string>)[e.toLowerCase()]}).replace(/\r/g,'').split('\n').map(line=>line.replace(/[\t ]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
export async function abstractFingerprint(html:string,expectedTitle:string):Promise<string>{
  const title=html.match(/<h3\b[^>]*class="[^"]*sz-session__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)?.[1];
  const description=html.match(/<p\b[^>]*class="[^"]*sz-session__description[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if(!title||!description||decode(title)!==expectedTitle)throw Error('Public abstract identity is unavailable.');
  const plain=decode(description);if(!plain||plain.length>12000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(plain))throw Error('Public abstract is unavailable.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(plain));return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Public organizer reads only, fixed host/IDs, at most 3 concurrent and 12 total. */
export async function refreshTalkAbstracts(sessions:PublishedSession[],checkedAt:string,fetcher:typeof fetch=fetch):Promise<void>{
  const reviewed=sessions.filter(s=>s.status==='scheduled'&&TALK_GUIDES.some(g=>g.id===s.id&&g.conferenceId===s.conferenceId&&g.sourceId===s.sourceId&&g.title===s.title));
  for(let i=0;i<reviewed.length;i+=3)await Promise.all(reviewed.slice(i,i+3).map(async session=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const url=`https://sessionize.com/api/v2/xtaduary/session?id=${session.sourceId}`;
      const response=await fetcher(url,{method:'POST',body:'',redirect:'manual',signal:controller.signal,headers:{Accept:'text/html'}});
      if(!response.ok||!/^text\/html/i.test(response.headers.get('Content-Type')??'')||Number(response.headers.get('Content-Length')??0)>100000||!response.body)throw Error('Unavailable');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw Error('Too large')}chunks.push(value)}}finally{reader.releaseLock()}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
      const hash=await abstractFingerprint(new TextDecoder('utf-8',{fatal:true}).decode(bytes),session.title);
      session.prepAbstract={status:'ok',hash,checkedAt};
    }catch{session.prepAbstract={status:'failed',hash:'',checkedAt}}
    finally{clearTimeout(timeout)}
  }));
}
