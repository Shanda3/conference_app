export type AccountEmail={id:string;emailAddress:string;verification:{status:string|null};prepareVerification:(params:{strategy:'email_code'})=>Promise<AccountEmail>;attemptVerification:(params:{code:string})=>Promise<AccountEmail>};
export type EmailAccount={id:string;emailAddresses:AccountEmail[];primaryEmailAddressId:string|null;reload:()=>Promise<unknown>};
export class EmailEnrollmentError extends Error{}
export function accountEmailValue(value:string){const email=value.trim().toLowerCase();if(email.length>254||!email||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw new EmailEnrollmentError('Enter a valid email address.');return email}
export function privateEmailLabel(value:string){const [name,domain]=value.split('@');return name.slice(0,Math.min(3,name.length))+'***@'+domain}
async function reloadAccount(account:EmailAccount,current:()=>void){current();const value=await account.reload();current();const fresh=value??account;if(typeof fresh!=='object'||!('id'in fresh)||fresh.id!==account.id||!('emailAddresses'in fresh)||!Array.isArray(fresh.emailAddresses))throw new EmailEnrollmentError('Your account could not be confirmed. Reload account settings before continuing.');return fresh as EmailAccount}
function linkedEmail(account:EmailAccount,resource:AccountEmail){const linked=account.emailAddresses.find(email=>email.id===resource.id&&accountEmailValue(email.emailAddress)===accountEmailValue(resource.emailAddress));if(!linked)throw new EmailEnrollmentError('The email could not be confirmed on this account. Reload account settings before continuing.');return linked}
export async function prepareAccountEmail(account:EmailAccount,value:string,create:(email:string)=>Promise<AccountEmail|undefined>,remember:(email:AccountEmail)=>void,current:()=>void,pending?:AccountEmail|null,beforeSend?:()=>void){
 current();const email=accountEmailValue(value);let resource=account.emailAddresses.find(item=>accountEmailValue(item.emailAddress)===email)??(pending&&accountEmailValue(pending.emailAddress)===email?pending:undefined);
 if(!resource){resource=await create(email);current();if(!resource)throw new EmailEnrollmentError('Email setup was canceled. Your existing sign-in methods have not changed.');remember(resource)}
 const fresh=await reloadAccount(account,current);resource=linkedEmail(fresh,resource);remember(resource);
 if(resource.verification.status==='verified')return{resource,verified:true};
 current();beforeSend?.();const prepared=await resource.prepareVerification({strategy:'email_code'});current();
 if(prepared.id!==resource.id||accountEmailValue(prepared.emailAddress)!==email)throw new EmailEnrollmentError('Email verification could not be confirmed. Reload account settings before continuing.');
 remember(prepared);return{resource:prepared,verified:false};
}
export async function verifyAccountEmail(account:EmailAccount,resource:AccountEmail,code:string,current:()=>void){
 current();if(!/^\d{6}$/.test(code.trim()))throw new EmailEnrollmentError('Enter the six-digit code from your email.');
 const before=await reloadAccount(account,current),linked=linkedEmail(before,resource);current();
 const verified=await linked.attemptVerification({code:code.trim()});current();
 if(verified.id!==linked.id||accountEmailValue(verified.emailAddress)!==accountEmailValue(linked.emailAddress)||verified.verification.status!=='verified')throw new EmailEnrollmentError('The email is not verified yet. Check the code or request a new one.');
 const fresh=await reloadAccount(account,current),confirmed=linkedEmail(fresh,verified);
 if(confirmed.verification.status!=='verified')throw new EmailEnrollmentError('The code was accepted, but verification is not confirmed on your account. Reload account settings before using the email.');
 return{resource:confirmed,hasVerifiedPrimary:fresh.emailAddresses.some(item=>item.id===fresh.primaryEmailAddressId&&item.verification.status==='verified')};
}
export async function selectVerifiedAccountEmail(account:EmailAccount,id:string,select:(id:string)=>Promise<unknown>,current:()=>void){
 const fresh=await reloadAccount(account,current),email=fresh.emailAddresses.find(item=>item.id===id);
 if(!email||email.verification.status!=='verified')throw new EmailEnrollmentError('Verify this email before selecting it for Gravatar.');
 if(fresh.primaryEmailAddressId!==id){current();await select(id);current()}
 const confirmed=await reloadAccount(account,current);
 if(confirmed.primaryEmailAddressId!==id||!confirmed.emailAddresses.some(item=>item.id===id&&item.verification.status==='verified'))throw new EmailEnrollmentError('The primary email change could not be confirmed. Reload account settings before using Gravatar.');return true;
}
/** Fixed messages only: no provider error text, email address, code or identifier is logged or echoed. */
export function emailEnrollmentFeedback(error:unknown,stage:'send'|'verify'|'primary'){
 if(error instanceof EmailEnrollmentError)return{message:error.message,waitSeconds:0};
 const object=error&&typeof error==='object'?error as {status?:number;errors?:Array<{code?:string}>}:{};
 const codes=object.errors?.map(e=>e.code)??[];
 if(object.status===429)return{message:'Too many email-code requests. Wait at least a minute before trying again.',waitSeconds:60};
 if(codes.includes('form_identifier_exists'))return{message:'That email could not be linked. It may already belong to another account. Choose another address or sign in to that account separately; accounts are never merged.',waitSeconds:0};
 if(codes.some(code=>code==='verification_expired'||code==='form_code_expired'))return{message:'That email code has expired. Request a new code when the resend button is available.',waitSeconds:0};
 if(object.status===401||object.status===403)return{message:'Verify your existing sign-in and try this email update again. Your account has not been switched.',waitSeconds:0};
 return{message:stage==='primary'?'Your verified email is saved, but its primary selection could not be confirmed. Reload account settings before using Gravatar.':stage==='send'?'We could not confirm that an email code was sent. Wait for the resend button, then retry.':'That email code could not be verified. Check its six digits or request a new code.',waitSeconds:0};
}
