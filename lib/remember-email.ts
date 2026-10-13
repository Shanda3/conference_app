export const REMEMBER_CHOICE_KEY='devyo.remember-email-choice.v1';
export const REMEMBER_EMAIL_KEY='devyo.remembered-email.v1';
export type EmailStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function safeRememberedEmail(value:unknown){if(typeof value!=='string')return '';const email=value.trim();return email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:''}
export function readRememberChoice(storage:EmailStorage){try{return storage.getItem(REMEMBER_CHOICE_KEY)!=='off'}catch{return true}}
export function readRememberedEmail(storage:EmailStorage){try{return readRememberChoice(storage)?safeRememberedEmail(storage.getItem(REMEMBER_EMAIL_KEY)):''}catch{return ''}}
export function setRememberChoice(storage:EmailStorage,enabled:boolean){try{storage.setItem(REMEMBER_CHOICE_KEY,enabled?'on':'off');if(!enabled)storage.removeItem(REMEMBER_EMAIL_KEY);return true}catch{return false}}
/** Called only after Clerk supplies a verified primary email. No password, OTP, JWT or session token is accepted or stored. */
export function rememberVerifiedEmail(storage:EmailStorage,email:unknown){const value=safeRememberedEmail(email);if(!value||!readRememberChoice(storage))return false;try{storage.setItem(REMEMBER_EMAIL_KEY,value);return true}catch{return false}}
