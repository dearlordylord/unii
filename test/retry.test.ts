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
