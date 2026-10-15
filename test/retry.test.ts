import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory, InMemoryStorage, type CompressionRequest } from '../src/index.js';
const long='x'.repeat(800);
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }
async function turn() { await new Promise<void>(resolve=>setImmediate(resolve)); }
test('explicit retry restores readiness without adding records or committing rejected output',async()=>{
 let valid=false;const storage=new InMemoryStorage();
 const memory=await Memory.open({storage,now:()=>0,policy:{maxAttempts:1},backend:async()=>valid?'user: retained source':'partial',validate:(_request,text)=>text==='partial'?'Incomplete source':null});
 try {
  const receipt=await memory.append({kind:'user',text:long});assert.equal((await memory.settle()).state,'failed');
  const records=memory.records();assert.deepEqual(memory.nodes(),[]);valid=true;
  assert.equal(memory.retryFailed(),1);assert.equal(memory.snapshot().state,'pending');assert.equal(memory.retryFailed(),0);
  assert.equal((await memory.settle()).state,'ready');assert.deepEqual(memory.records(),records);assert.equal(memory.snapshot().before,receipt.endExclusive);
  assert.deepEqual(memory.nodes(),[{level:0,index:0,text:'user: retained source'}]);assert.equal(memory.retryFailed(),0);
 }finally{await memory.close();}
});
test('retry bounds eligibility and leaves active and completed work independent',async()=>{
 const active=deferred<string>();let recovering=false;const requests:CompressionRequest[]=[];
 const memory=await Memory.open({policy:{concurrency:3,maxAttempts:1},backend:request=>{
  requests.push(request);if(request.node.index===2)return active.promise;
  return recovering?Promise.resolve('user: recovered'):Promise.reject(new Error('Unavailable'));
 }});
 try {
  for(let index=0;index<3;index++)await memory.append({kind:'user',text:long});memory.step();
  while(memory.status().failed.length<2)await turn();
  assert.equal(memory.status().active,1);const records=memory.records();
  for(const limit of [0,-1,1.5,4,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>memory.retryFailed(limit),/retry limit/);
  assert.equal(memory.status().failed.length,2);recovering=true;assert.equal(memory.retryFailed(1),1);assert.equal(memory.status().failed.length,1);
  memory.step();assert.equal(memory.retryFailed(),1);assert.equal(memory.retryFailed(),0);memory.step();
  assert.equal(requests.filter(request=>request.node.index===2).length,1);
  assert.equal(requests.filter(request=>request.node.index===0).length,2);
  assert.equal(requests.filter(request=>request.node.index===1).length,2);
  active.resolve('user: active source');assert.equal((await memory.settle()).state,'ready');
  assert.deepEqual(memory.records(),records);assert.equal(memory.retryFailed(),0);assert.equal(memory.status().active,0);
 }finally{await memory.close();}
});
test('retry rejects closed memory and storage fail-stop',async()=>{
 const closed=await Memory.open();await closed.close();assert.throws(()=>closed.retryFailed(),/closed/);
 class FailingStorage extends InMemoryStorage {
  override async appendRecords():Promise<void> { throw new Error('Disk unavailable'); }
 }
 const memory=await Memory.open({storage:new FailingStorage()});
 try{await assert.rejects(()=>memory.append({kind:'user',text:'record'}),/Disk unavailable/);assert.throws(()=>memory.retryFailed(),/Storage failed/);}finally{await memory.close();}
});
test('caller can stop failed backend retries and explicitly recover retained records',async()=>{
 let calls=0,recover=false;const denied=new Error('Authentication denied');
 const memory=await Memory.open({now:()=>0,shouldRetryBackendError:error=>{assert.equal(error,denied);return false;},backend:async()=>{calls++;if(!recover)throw denied;return 'user: recovered';}});
 try {
  await memory.append({kind:'user',text:long});const records=memory.records();
  assert.equal((await memory.settle()).state,'failed');assert.equal(calls,1);assert.deepEqual(memory.nodes(),[]);
  memory.step();await turn();assert.equal(calls,1);recover=true;assert.equal(memory.retryFailed(),1);
  assert.equal((await memory.settle()).state,'ready');assert.equal(calls,2);assert.deepEqual(memory.records(),records);
 }finally{await memory.close();}
});
test('backend retry classification preserves default attempts and completed refinement',async()=>{
 let calls=0;const legacy=await Memory.open({backend:async()=>{calls++;throw new Error('Unavailable');}});
 try{await legacy.append({kind:'user',text:long});assert.equal((await legacy.settle()).state,'failed');assert.equal(calls,5);}finally{await legacy.close();}
 const requests:CompressionRequest[]=[];const refined=await Memory.open({shouldRetryBackendError:()=>{assert.fail('Successful refinement is not a backend failure');},backend:async request=>{requests.push(request);return request.attempt===1?'s'.repeat(600):'short summary';}});
 try{await refined.append({kind:'user',text:long});assert.equal((await refined.settle()).state,'ready');assert.equal(requests.length,2);assert.match(requests[1]!.feedback!,/exceeds/);assert.deepEqual(requests[1]!.priorResponses,['s'.repeat(600)]);assert.equal(refined.nodes()[0]!.text,'short summary');}finally{await refined.close();}
});
test('stopping backend retry retains only a prior completed candidate',async()=>{
 let calls=0;const completed='s'.repeat(600);const memory=await Memory.open({shouldRetryBackendError:()=>false,backend:async()=>{calls++;if(calls===1)return completed;throw new Error('Unavailable');}});
 try{await memory.append({kind:'user',text:long});assert.equal((await memory.settle()).state,'ready');assert.equal(calls,2);assert.equal(memory.nodes()[0]!.text,completed);assert.equal(memory.attempts()[1]!.response,null);}finally{await memory.close();}
});
test('a failing retry classifier stops the job without accepting output',async()=>{
 let calls=0;const memory=await Memory.open({shouldRetryBackendError:()=>{throw new Error('Classifier failed');},backend:async()=>{calls++;throw new Error('Unavailable');}});
 try{await memory.append({kind:'user',text:long});assert.equal((await memory.settle()).state,'failed');assert.equal(calls,1);assert.deepEqual(memory.nodes(),[]);assert.match(memory.status().failed[0]!.message,/Classifier failed/);}finally{await memory.close();}
});

test('source kinds follow journal ownership across parent compression and reopen',async()=>{
 const requests:CompressionRequest[]=[];const storage=new InMemoryStorage();
 const options={storage,backend:async(request:CompressionRequest)=>{requests.push(request);return 'compressed summary';},policy:{nodeBytes:24}};
 let memory=await Memory.open(options);
 try{
  await memory.append({kind:'user',text:'assistant_interrupted: quoted marker '+long});
  await memory.settle();assert.deepEqual(requests[0]!.sourceKinds,['user']);
  await memory.close();memory=await Memory.open(options);
  await memory.append({kind:'assistant_interrupted',text:long});
  await memory.settle();
  const leaf=requests.find(request=>request.node.level===0&&request.node.index===1)!;
  assert.deepEqual(leaf.sourceKinds,['assistant_interrupted']);
  const parent=requests.find(request=>request.node.level===1)!;
  assert.deepEqual(parent.sourceKinds,['user','assistant_interrupted']);
  await memory.append({kind:'user',text:long});await memory.settle();
  const later=requests.find(request=>request.node.level===0&&request.node.index===2)!;
  assert.deepEqual(later.sourceKinds,['user']);assert.notEqual(later.context,'');
 }finally{await memory.close();}
});
