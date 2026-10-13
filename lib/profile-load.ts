export class ProfileReadTimeout extends Error{constructor(){super('Loading took too long. Retry this section; your saved information has not changed.')}}
/** Bound both headers and JSON-body reads. No retry, write, token or session change. */
export async function readProfileSection<T>(path:'/api/profile'|'/api/shares',signal?:AbortSignal,timeoutMs=12000,fetcher:typeof fetch=fetch):Promise<T>{
 if(signal?.aborted)throw new DOMException('Canceled','AbortError');
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let cancel=()=>{};
 const stop=new Promise<never>((_,reject)=>{cancel=()=>{controller.abort();reject(new DOMException('Canceled','AbortError'))};signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{controller.abort();reject(new ProfileReadTimeout())},timeoutMs)});
 const read=(async()=>{const response=await fetcher(path,{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!response.ok)throw new Error(response.status===401||response.status===403?'Your sign-in could not be verified for this section. Reload this page to retry your current session.':'This section could not be loaded. Please retry.');return await response.json() as T})();
 try{return await Promise.race([read,stop])}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
