import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{validatePhotoCrop,validatePhotoWebp,photoRevision,photoSettingsBody,photoTimeout,boundedPhotoBytes}from'../lib/photo-model.ts';
import{encodePhotoCrop,photoImagesAvailable}from'../lib/photo-images.ts';
const sharp=createRequire(import.meta.url)('sharp');
const png=new Uint8Array(await sharp({create:{width:512,height:512,channels:3,background:'#724399'}}).png().toBuffer());
const webp=new Uint8Array(await sharp(png).webp().toBuffer());
test('server crop rejects originals, active formats, invalid CRC, animation and trailing payloads',async()=>{
 validatePhotoCrop(png);for(const bad of[new TextEncoder().encode('<svg/>'),new Uint8Array([...png,0]),png.slice(0,-1)])assert.throws(()=>validatePhotoCrop(bad));
 const corrupt=png.slice();corrupt[40]^=1;assert.throws(()=>validatePhotoCrop(corrupt));const original=new Uint8Array(await sharp({create:{width:1024,height:512,channels:3,background:'#fff'}}).png().toBuffer());assert.throws(()=>validatePhotoCrop(original));
});
test('WebP verification rejects metadata chunks, animation, excess bytes and trailing payloads',()=>{
 validatePhotoWebp(webp);const injected=new Uint8Array(webp.length+8);injected.set(webp);injected.set(new TextEncoder().encode('EXIF'),webp.length);new DataView(injected.buffer).setUint32(4,injected.length-8,true);assert.throws(()=>validatePhotoWebp(injected));assert.throws(()=>validatePhotoWebp(new Uint8Array([...webp,0])));assert.throws(()=>validatePhotoWebp(new Uint8Array(163841)));
});
test('revision and visibility validation reject coercions and owner selectors',()=>{
 assert.equal(photoRevision('0'),0);for(const value of[null,1,'01','-1','1.5',[],{}])assert.throws(()=>photoRevision(value));assert.deepEqual(photoSettingsBody({fallback:'initials',visibility:'private'}),{fallback:'initials',visible:false});for(const value of[{fallback:['initials'],visibility:'private'},{fallback:'initials',visibility:['private']},{fallback:'initials',visibility:'private',owner:'other'}])assert.throws(()=>photoSettingsBody(value));
});
test('actual Worker encoder calls the binding with a bounded crop; processing fixture is not provider verification',async()=>{
 let calls=0;const parameters:unknown[]=[];const binding={async info(stream:ReadableStream<Uint8Array>){const bytes=await boundedPhotoBytes(stream,1200000);calls++;return{format:bytes[0]===137?'image/png':'image/webp',fileSize:bytes.length,width:512,height:512}},input(){return{transform(value:unknown){parameters.push(value);return this},async output(value:unknown){parameters.push(value);return{contentType:()=> 'image/webp',image:()=>new Blob([webp.buffer]).stream()}}}}} as unknown as ImagesBinding;
 assert.equal(photoImagesAvailable(undefined),false);assert.equal(photoImagesAvailable({} as ImagesBinding),false);assert.equal(photoImagesAvailable(binding),true);assert.deepEqual(await encodePhotoCrop(png,binding),webp);assert.equal(calls,2);assert.deepEqual(parameters,[{width:512,height:512},{format:'image/webp',quality:82,anim:false}]);await assert.rejects(encodePhotoCrop(png,binding,async()=>{throw Error('Synthetic lease closed')}));assert.equal(parameters.length,2);
});
test('bounded reader and processing deadline fail closed',async()=>{await assert.rejects(boundedPhotoBytes(new Blob([new Uint8Array(20)]).stream(),10));await assert.rejects(photoTimeout(new Promise(()=>{}),10));});
