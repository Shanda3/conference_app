export const PHOTO_EVENT='thunderplains-2026';
export const PHOTO_LIMITS={cropBytes:1_200_000,outputBytes:163_840,side:512,perDay:10,perMonth:2000,storedPhotos:500,inFlight:4,leaseMs:20_000,processingMs:8000} as const;
export type PhotoSettings={enabled:true;hasPhoto:boolean;visible:boolean;fallback:'initials'|'gravatar';revision:number};
export class PhotoError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function photoRevision(value:unknown){if(typeof value!=='string'||! /^(0|[1-9]\d{0,14})$/.test(value)||!Number.isSafeInteger(Number(value)))throw new PhotoError('Reload your photo settings before saving.',409);return Number(value)}
export function photoSettingsBody(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PhotoError('Choose valid photo settings.');const b=value as Record<string,unknown>;
 if(Object.keys(b).sort().join(',')!=='fallback,visibility'||!['initials','gravatar'].includes(b.fallback as string)||!['private','attendees'].includes(b.visibility as string)||typeof b.fallback!=='string'||typeof b.visibility!=='string')throw new PhotoError('Choose valid photo settings.');
 return{fallback:b.fallback as 'initials'|'gravatar',visible:b.visibility==='attendees'};
}
const text=(bytes:Uint8Array,start:number,n:number)=>String.fromCharCode(...bytes.subarray(start,start+n));
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
/** The server accepts only the bounded canvas crop, never the original file. */
export function validatePhotoCrop(bytes:Uint8Array){
 if(bytes.length>PHOTO_LIMITS.cropBytes)throw new PhotoError('The cropped photo is too large.',413);
 const bad=()=>{throw new PhotoError('Send a still 512-pixel square PNG crop.');};
 if(bytes.length<45||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))bad();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,header=false,data=false,end=false,chunks=0;
 while(offset+12<=bytes.length){if(++chunks>256)bad();const length=view.getUint32(offset),kind=text(bytes,offset+4,4);if(length>bytes.length-offset-12||!['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(kind))bad();if(crc(bytes.subarray(offset+4,offset+8+length))!==view.getUint32(offset+8+length))bad();
  if(!header&&kind!=='IHDR')bad();if(kind==='IHDR'){if(header||length!==13||view.getUint32(offset+8)!==512||view.getUint32(offset+12)!==512||bytes[offset+16]!==8||![2,6].includes(bytes[offset+17])||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]!==0)bad();header=true}
  if(kind==='IDAT'){if(!length)bad();data=true}if(data&&kind!=='IDAT'&&kind!=='IEND')bad();offset+=length+12;if(kind==='IEND'){if(length!==0||offset!==bytes.length)bad();end=true;break}
 }if(!header||!data||!end)bad();
}
/** Validate the clean output container; metadata, animation and trailing payloads fail closed. */
export function validatePhotoWebp(bytes:Uint8Array){
 const bad=()=>{throw new PhotoError('The photo could not be safely prepared.',503)};
 if(bytes.length<20||bytes.length>PHOTO_LIMITS.outputBytes||text(bytes,0,4)!=='RIFF'||text(bytes,8,4)!=='WEBP')bad();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(4,true)+8!==bytes.length)bad();let offset=12,images=0;
 while(offset+8<=bytes.length){const kind=text(bytes,offset,4),length=view.getUint32(offset+4,true);if(length>bytes.length-offset-8||!['VP8 ','VP8L','VP8X','ALPH'].includes(kind))bad();if(kind==='VP8X'){if(length!==10||(bytes[offset+8]&0x2e)!==0)bad();const side=(i:number)=>1+bytes[i]+(bytes[i+1]<<8)+(bytes[i+2]<<16);if(side(offset+12)!==512||side(offset+15)!==512)bad()}if(kind==='VP8 '||kind==='VP8L')images++;offset+=8+length+(length%2);}
 if(offset!==bytes.length||images!==1)bad();
}
export async function boundedPhotoBytes(stream:ReadableStream<Uint8Array>|null,max:number){if(!stream)throw new PhotoError('Choose a photo crop.');const reader=stream.getReader(),chunks:Uint8Array[]=[],deadline=Date.now()+PHOTO_LIMITS.processingMs;let total=0;try{while(true){const part=await photoTimeout(reader.read(),Math.max(1,deadline-Date.now()));if(part.done)break;total+=part.value.length;if(total>max)throw new PhotoError('The photo is too large.',413);chunks.push(part.value)}}finally{void reader.cancel().catch(()=>undefined);reader.releaseLock()}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes}
export async function photoTimeout<T>(operation:Promise<T>,ms:number=PHOTO_LIMITS.processingMs):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new PhotoError('Photo processing timed out. Reload before trying again.',503)),ms)})])}finally{clearTimeout(timer)}}
