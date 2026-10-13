import{PhotoError,PHOTO_LIMITS,boundedPhotoBytes,validatePhotoCrop,validatePhotoWebp,photoTimeout}from'./photo-model.ts';
export function photoImagesAvailable(binding:ImagesBinding|undefined){return !!binding&&typeof binding.info==='function'&&typeof binding.input==='function'}
export async function encodePhotoCrop(bytes:Uint8Array,binding:ImagesBinding,beforeTransform?:()=>Promise<void>){
 validatePhotoCrop(bytes);const started=Date.now(),month=new Date(started).toISOString().slice(0,7);const pending=()=>{if(Date.now()-started>=PHOTO_LIMITS.processingMs||new Date().toISOString().slice(0,7)!==month)throw new PhotoError('Photo processing expired. Reload before trying again.',409);};
 return photoTimeout((async()=>{
  const stream=()=>new Blob([new Uint8Array(bytes).buffer]).stream();const input=await binding.info(stream());
  if(!('width'in input)||input.format!=='image/png'||input.width!==512||input.height!==512)throw new PhotoError('Send a still 512-pixel square PNG crop.');
  pending();await beforeTransform?.();pending();
  const result=await binding.input(stream()).transform({width:512,height:512}).output({format:'image/webp',quality:82,anim:false});
  if(result.contentType()!=='image/webp')throw new PhotoError('Photo processing is unavailable.',503);
  const output=await boundedPhotoBytes(result.image(),PHOTO_LIMITS.outputBytes);validatePhotoWebp(output);
  const info=await binding.info(new Blob([output.buffer]).stream());if(!('width'in info)||info.format!=='image/webp'||info.width!==512||info.height!==512)throw new PhotoError('The photo could not be safely prepared.',503);return output;
 })());
}
