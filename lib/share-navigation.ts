const KEY='devyo-shared-plan-intent.v1';
const pattern=/^#shared-plan=([A-Za-z0-9_-]{43})$/;
export function captureSharedPlan(){const token=location.hash.match(pattern)?.[1];if(!token)return;try{sessionStorage.setItem(KEY,JSON.stringify({token,at:Date.now()}));history.replaceState(null,'',location.pathname+location.search)}catch{/* Keep the fragment for a later retry if storage is blocked. */}}
export function resumeSharedPlan(){try{const raw=sessionStorage.getItem(KEY);if(!raw)return false;sessionStorage.removeItem(KEY);const value=JSON.parse(raw);if(!/^[A-Za-z0-9_-]{43}$/.test(value.token)||!Number.isFinite(value.at)||Date.now()-value.at>3600000||value.at>Date.now())return false;location.assign('/share/'+value.token);return true}catch{return false}}
