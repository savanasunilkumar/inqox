import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceSources, eligibleReasoningField, validateDrafts, reasoningCacheKey, usableCachedPlan, verifiedDraft, prepareAnswers } from '../src/answer-reasoner.ts';

const profile = { fields:{ firstName:'Validation', lastName:'Candidate', school:'Example University' }, customAnswers:[], resume:{ text:'Built a Python service.\nDeployed on AWS with PostgreSQL.', name:'test.pdf', key:'test', size:1, uploadedAt:'2026-09-23' }, updatedAt:'2026-09-23' };
const field = { id:'field-1', label:'Summarize your project and the technologies used.', type:'textarea', options:[] };
const sources = buildEvidenceSources(profile);
const answer = { fieldId:field.id, answer:'Built a Python service and deployed it on AWS with PostgreSQL.', evidence:[{sourceId:'resume',quote:'Built a Python service.'},{sourceId:'resume',quote:'Deployed on AWS with PostgreSQL.'}] };

test('grounded answers may combine multiple résumé facts; fabricated citations fail',()=>{
 assert.equal(validateDrafts({answers:[answer]},[field],sources).length,1);
 for(const evidence of [[{sourceId:'unknown',quote:'Built a Python service.'}],[{sourceId:'resume',quote:'Led 40 engineers.'}]])
  assert.equal(validateDrafts({answers:[{...answer,evidence}]},[field],sources).length,0);
 assert.equal(validateDrafts({answers:[answer,answer]},[field],sources).length,0);
 assert.equal(validateDrafts({answers:[{...answer,fieldId:'field-999'}]},[field],sources).length,0);
});

test('personal decisions and non-text controls cannot receive generated answers',()=>{
 for(const label of ['Need sponsorship now or in the future?','Are you legally authorized to work?','Current location','Gender','Expected salary','Available start date','I agree and certify','What is your employee referral code?','Are you over 18?']) {
  const protectedField={...field,label};
  assert.equal(eligibleReasoningField(protectedField),false,label);
  assert.equal(validateDrafts({answers:[answer]},[protectedField],sources).length,0,label);
 }
 assert.equal(eligibleReasoningField({...field,type:'checkbox'}),false);
 assert.equal(eligibleReasoningField({...field,label:'Which programming languages do you use?'}),true);
});

test('a prepared answer is accepted only after a confident independent evidence check',()=>{
 assert.equal(verifiedDraft({choice:'supported',confidence:.94}),true);
 assert.equal(verifiedDraft({choice:'supported',confidence:.89}),false);
 for(const decision of [undefined,{choice:'supported',confidence:.8},{choice:'review',confidence:1}])assert.equal(verifiedDraft(decision),false);
});

test('cache is tied to profile, résumé, question options and job; expires after one day',async()=>{
 const job={company:'Example',title:'Engineer'};
 const key=await reasoningCacheKey(profile,[field],job);
 for(const [p,f,j] of [[{...profile,fields:{...profile.fields,school:'New school'}},[field],job],[{...profile,resume:{...profile.resume,text:'Changed résumé'}},[field],job],[profile,[{...field,options:[{label:'Yes',value:'yes'}]}],job],[profile,[field],{...job,company:'Different'}]])
  assert.notEqual(await reasoningCacheKey(p,f,j),key);
 const cache={key,createdAt:100,plan:{answers:[answer]}};
 assert.equal(usableCachedPlan(cache,key,[field],sources,200).answers.length,1);
 assert.equal(usableCachedPlan(cache,key,[field],sources,86400200),null);
 assert.equal(usableCachedPlan(cache,'wrong',[field],sources,200),null);
});

test('GLM uses bounded output, timeout, no storage and rejects truncated output',async()=>{
 let called=false;
 const env={AI:{run:async(model,input,options)=>{
  called=true;
  assert.equal(model,'@cf/zai-org/glm-5.3-flash');
  assert.equal(input.store,false); assert.equal(input.max_completion_tokens,4096);
  assert.ok(options.signal instanceof AbortSignal);
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:[answer]})}}],usage:{prompt_tokens:100,completion_tokens:50}};
 }}};
 const plan=await prepareAnswers(env,profile,[field],{});
 assert.ok(called);assert.equal(plan.answers.length,1);assert.equal(plan.usage.outputTokens,50);
 await assert.rejects(prepareAnswers({AI:{run:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}},profile,[field],{}),/incomplete/);
});
