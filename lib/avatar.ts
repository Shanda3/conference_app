export async function gravatarHash(value:unknown):Promise<string>{
 if(typeof value!=="string")throw new Error("Enter your Gravatar email address.");
 const email=value.trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid Gravatar email address.");
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(email))),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function fetchGravatar(hash:string,fetcher:typeof fetch=fetch):Promise<Response>{
 if(!/^[a-f0-9]{64}$/.test(hash))return new Response(null,{status:404});
 try{
 const upstream=await fetcher(`https://gravatar.com/avatar/${hash}?s=96&d=404&r=g`,{redirect:"manual",signal:AbortSignal.timeout(5000),headers:{Accept:"image/png,image/jpeg,image/webp,image/gif"}});
 const type=upstream.headers.get("content-type")?.split(";")[0];
 if(!upstream.ok||!type||!["image/png","image/jpeg","image/webp","image/gif"].includes(type)||!upstream.body)return new Response(null,{status:404});
 const reader=upstream.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512000){await reader.cancel();return new Response(null,{status:404})}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new Response(bytes,{headers:{"Content-Type":type,"X-Content-Type-Options":"nosniff"}});
 }catch{return new Response(null,{status:404})}
}

/** Only sanitized completed bytes cross requests. Never share request-bound I/O,
 * Response objects or pending promises between Cloudflare request contexts. */
export function createGravatarCache(fetcher:typeof fetch=fetch,clock:()=>number=Date.now){
 type Entry={bytes:Uint8Array|null;type:string|null;expires:number};
 const entries=new Map<string,Entry>(),inFlight=new Set<string>();let storedBytes=0;
 const remove=(key:string)=>{const old=entries.get(key);if(old)storedBytes-=old.bytes?.byteLength??0;entries.delete(key)};
 const response=(entry:Entry)=>entry.bytes?new Response(new Uint8Array(entry.bytes),{headers:{'Content-Type':entry.type!,'X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});
 return async(hash:string):Promise<Response>=>{
  if(!/^[a-f0-9]{64}$/.test(hash))return new Response(null,{status:404});
  const now=clock();for(const[key,entry]of entries)if(entry.expires<=now)remove(key);
  const hit=entries.get(hash);if(hit){entries.delete(hash);entries.set(hash,hit);return response(hit)}
  // Duplicate pending images temporarily fall back to initials. This also bounds
  // simultaneous transport without awaiting another request's I/O.
  if(inFlight.has(hash)||inFlight.size>=32)return new Response(null,{status:404});
  inFlight.add(hash);
  try{
   const upstream=await fetchGravatar(hash,fetcher),bytes=upstream.ok?new Uint8Array(await upstream.arrayBuffer()):null;
   const entry:Entry={bytes,type:upstream.headers.get('Content-Type'),expires:clock()+(bytes?120000:15000)};
   while(entries.size>=64||storedBytes+(bytes?.byteLength??0)>4*1024*1024){const key=entries.keys().next().value;if(key===undefined)break;remove(key)}
   entries.set(hash,entry);storedBytes+=bytes?.byteLength??0;return response(entry);
  }finally{inFlight.delete(hash)}
 };
}
