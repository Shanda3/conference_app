/** Positive, same-origin evidence only. An empty result is not universal uninstall detection. */
export function ownInstalledWebApp(apps:unknown,origin:string){
 if(!Array.isArray(apps))return false;
 const root=new URL('/',origin).href,manifest=new URL('/manifest.webmanifest',origin).href;
 return apps.some(app=>{if(!app||typeof app!=='object'||app.platform!=='webapp')return false;try{const id=typeof app.id==='string'?new URL(app.id,origin).href:null,url=typeof app.url==='string'?new URL(app.url,origin).href:null;return(!url||url===manifest)&&(id===root||!id&&url===manifest)}catch{return false}});
}
