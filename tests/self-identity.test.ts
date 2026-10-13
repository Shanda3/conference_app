import {test} from 'node:test';import assert from 'node:assert/strict';
import {currentIdentity} from '../lib/self-identity.ts';import {runWithAuth} from '../lib/auth-context.ts';
const env={CLERK_PUBLISHABLE_KEY:'pk_test_synthetic_fixture',CLERK_SECRET_KEY:'fixture_secret_placeholder',CLERK_ISSUER:'https://clerk.synthetic.test',DEVYO_ORIGIN:'http://localhost',DEVYO_ENVIRONMENT:'local' as const,DEVYO_ALLOWED_USER_IDS:'user_synthetic'};
const auth={user:{userId:'clerk:https://clerk.synthetic.test:user_synthetic',displayName:'Synthetic Sophia'},status:'authenticated' as const,sessionId:'sess_synthetic'};
test('self identity fetches exactly the verified subject and projects no credentials or other users',async()=>{
 let requested='';const result=await runWithAuth(auth,()=>currentIdentity(env,async id=>{requested=id;return {id,primaryEmailAddressId:'email_own',emailAddresses:[{id:'email_own',emailAddress:'synthetic@example.test',verification:{status:'verified'}}],secret:'DO_NOT_RETURN'};}));assert.equal(requested,'user_synthetic');assert.deepEqual(result,{userId:'user_synthetic',displayName:'Synthetic Sophia',verifiedPrimaryEmail:'synthetic@example.test',issuer:'https://clerk.synthetic.test'});
});
test('a substituted provider subject or anonymous/deleting account cannot pass identity review',async()=>{
 await assert.rejects(runWithAuth(auth,()=>currentIdentity(env,async()=>({id:'user_other',primaryEmailAddressId:null,emailAddresses:[]}))),/could not be verified/);
 for(const status of ['anonymous','deleting'] as const)await assert.rejects(runWithAuth({...auth,status},()=>currentIdentity(env,async()=>{throw Error('Must not fetch')})),/Sign in/);
});
