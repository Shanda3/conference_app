/** Private, optional labels only. No free text, contact details, or notes. */
export const STACK_CHOICES = [
  ['typescript','JavaScript / TypeScript'],['react','React'],['node','Node.js'],
  ['python','Python'],['php','PHP / Laravel'],['dotnet','C# / .NET'],
  ['java','Java'],['go','Go'],['sql','SQL / data'],['cloud','Cloud / DevOps'],
] as const;
export const INTEREST_CHOICES = [
  ['agents','AI agents'],['rag','RAG / search'],['data','Data engineering'],
  ['web','Web apps'],['security','Security'],['testing','Testing / quality'],
  ['systems','Distributed systems'],['leadership','Team leadership'],['learning','Exploring something new'],
] as const;
export const PREFERENCE_LIMIT = 6;
export type TalkPrepPreferences = {stack:string[];interests:string[];personalizationOptIn:boolean};
export const emptyTalkPreferences = ():TalkPrepPreferences => ({stack:[],interests:[],personalizationOptIn:false});
export function validateTalkPreferences(value:unknown):TalkPrepPreferences {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Talk preferences must be an object.');
  const item=value as Record<string,unknown>,keys=['stack','interests','personalizationOptIn'];
  if(Object.keys(item).some(key=>!keys.includes(key)) || keys.some(key=>!Object.hasOwn(item,key)))throw Error('Talk preferences have an unsupported or missing field.');
  if(typeof item.personalizationOptIn!=='boolean')throw Error('Choose whether to opt in to future personalization.');
  const selection=(input:unknown,choices:ReadonlyArray<readonly [string,string]>):string[]=>{
    if(!Array.isArray(input) || input.length>PREFERENCE_LIMIT || input.some(id=>typeof id!=='string' || !choices.some(choice=>choice[0]===id)) || new Set(input).size!==input.length)throw Error('Choose up to six distinct labels from each list.');
    // Stable order makes comparisons and future payloads deterministic.
    return choices.flatMap(([id])=>input.includes(id)?[id]:[]);
  };
  return{stack:selection(item.stack,STACK_CHOICES),interests:selection(item.interests,INTEREST_CHOICES),personalizationOptIn:item.personalizationOptIn};
}
/** Optional browser identity pin; the server still derives ownership from authentication. */
export function plannerIdentityMatches(expectedUser:string|null,expectedSession:string|null,owner:string,session:string|undefined):boolean {
  if(expectedUser===null&&expectedSession===null)return true;
  return /^user_[A-Za-z0-9_]+$/.test(expectedUser??'') && /^sess_[A-Za-z0-9_]+$/.test(expectedSession??'') && owner.slice(owner.lastIndexOf(':')+1)===expectedUser && session===expectedSession;
}
