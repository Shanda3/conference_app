import test from'node:test';
import assert from'node:assert/strict';
import{clearDeletionLocalData}from'../lib/account-deletion-browser.ts';

test('account deletion clears notification onboarding choices in persistent and fallback storage while preserving unrelated settings',()=>{
 const storage=()=>{const values=new Map([['devyo-notification-onboarding:v1:user_fixture','dismissed'],['unrelated-device-setting','keep']]);return{values,get length(){return values.size;},key:(index:number)=>[...values.keys()][index]??null,removeItem:(key:string)=>values.delete(key)};};
 const local=storage(),session=storage();
 clearDeletionLocalData({localStorage:local,sessionStorage:session}as unknown as Pick<Window,'localStorage'|'sessionStorage'>);
 for(const store of[local,session]){assert.equal(store.values.has('devyo-notification-onboarding:v1:user_fixture'),false);assert.equal(store.values.get('unrelated-device-setting'),'keep');}
});
