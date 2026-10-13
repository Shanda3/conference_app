export type LoginPhone={id:string;phoneNumber:string;verification:{status:string|null};prepareVerification:()=>Promise<LoginPhone>;attemptVerification:(params:{code:string})=>Promise<LoginPhone>};
export type PhoneAccount={id:string;phoneNumbers:LoginPhone[];reload:()=>Promise<unknown>};
export class PhoneEnrollmentError extends Error {}
export function loginPhoneValue(value:string){const phone=value.replace(/[\s().-]/g,'');if(!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone))throw new PhoneEnrollmentError('Enter a US or Canadian number with +1 and ten digits.');return phone}
function refreshedAccount(account:PhoneAccount,value:unknown):PhoneAccount{
 if(value===undefined||value===null)return account;
 if(typeof value!=='object'||!('id'in value)||value.id!==account.id||!('phoneNumbers'in value)||!Array.isArray(value.phoneNumbers))throw new PhoneEnrollmentError('Your account could not be confirmed. Refresh your profile before trying again.');
 return value as PhoneAccount;
}
export async function prepareLoginPhone(account:PhoneAccount,phone:string,create:(phone:string)=>Promise<LoginPhone|undefined>,remember:(resource:LoginPhone)=>void,pending?:LoginPhone|null,beforeTextRequest?:()=>void){
 const normalized=loginPhoneValue(phone);let resource=account.phoneNumbers.find(p=>p.phoneNumber===normalized)??(pending?.phoneNumber===normalized?pending:undefined);
 if(!resource){resource=await create(normalized);if(!resource)throw new PhoneEnrollmentError('Phone setup was canceled. Your existing sign-in methods have not changed.');remember(resource);const fresh=refreshedAccount(account,await account.reload());resource=fresh.phoneNumbers.find(p=>p.id===resource!.id)??resource;}
 if(resource.verification.status==='verified')return{resource,verified:true};
 remember(resource);beforeTextRequest?.();const prepared=await resource.prepareVerification();remember(prepared);return{resource:prepared,verified:false};
}
export async function verifyLoginPhone(account:PhoneAccount,resource:LoginPhone,code:string){
 if(!/^\d{6}$/.test(code.trim()))throw new PhoneEnrollmentError('Enter the six-digit code from your text message.');
 const verified=await resource.attemptVerification({code:code.trim()});
 if(verified.verification.status!=='verified')throw new PhoneEnrollmentError('The number is not verified yet. Check the code or request a new one.');
 const fresh=refreshedAccount(account,await account.reload());
 if(!fresh.phoneNumbers.some(p=>p.id===verified.id&&p.verification.status==='verified'))throw new PhoneEnrollmentError('The code was accepted, but account confirmation is still loading. Refresh your profile before using phone sign-in.');
 return true;
}
/** Fixed messages only: never echo provider errors, phone numbers, codes or account identifiers. */
export function phoneEnrollmentFeedback(error:unknown,stage:'send'|'verify'){
 if(error instanceof PhoneEnrollmentError)return{message:error.message,waitSeconds:0};
 const status=error&&typeof error==='object'&&'status'in error?error.status:null;
 if(status===429)return{message:'Too many text-code requests. Wait at least a minute before trying again. Your number is not ready for sign-in until it is verified.',waitSeconds:60};
 if(status===401||status===403)return{message:'Clerk could not authorize this phone update. Verify your existing sign-in and try again. Your account has not been switched.',waitSeconds:0};
 return{message:stage==='send'?'We could not confirm that a verification text was sent. This number is not ready for sign-in. Wait for the resend button, then retry or change the number.':'That code could not be verified. Check the six digits or request a new text when the resend button is available.',waitSeconds:0};
}
