import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory, InMemoryStorage, type Backend, type Observation, type Storage } from '../src/index.js';
const long='x'.repeat(800);
test('exclusive snapshot, no inference for short source, copied reads and reopen', async()=>{
 const store=new InMemoryStorage();let calls=0;let m=await Memory.open({storage:store,backend:async()=>{calls++;return 'summary';}});
 try{const a=await m.append({kind:'user',text:'prior'});const b=await m.append({kind:'user',text:'fresh'});
 assert.deepEqual(a,{firstId:0,ids:[0],endExclusive:1});assert.equal(calls,0);
 const snapshot=m.snapshot({before:b.firstId});assert.match(snapshot.text!,/prior/);assert.doesNotMatch(snapshot.text!,/fresh/);
 m.records()[0]!.text='mutated';m.nodes()[0]!.text='mutated';snapshot.view[0]!.index=123;
 assert.equal(m.zoom(0,1).text,'prior');const expected=m.snapshot();await m.close();m=await Memory.open({storage:store});assert.deepEqual(m.snapshot(),expected);
 }finally{await m.close();}
});
test('failed snapshot excludes prompt; five bounded attempts, retry on append',async()=>{
 let fail=true,calls=0;const m=await Memory.open({backend:async()=>{calls++;if(fail)throw new Error('provider failed');return 'user: retained';}});
 try{await m.append({kind:'user',text:long});assert.equal(m.snapshot().state,'pending');const failed=await m.settle();assert.equal(calls,5);assert.equal(failed.state,'failed');assert.equal(failed.text,null);fail=false;await m.append({kind:'note',text:'retry'});assert.equal((await m.settle()).state,'ready');assert.equal(m.status().failed.length,0);}finally{await m.close();}
});
test('keeps shortest valid complete response after exhausting byte retries',async()=>{
 const sizes=[800,700,900,650,750];const m=await Memory.open({backend:async r=>'s'.repeat(sizes[r.attempt-1]!)});
 try{await m.append({kind:'user',text:long});await m.settle();assert.equal(m.attempts().length,5);assert.equal(m.nodes()[0]!.text.length,650);}finally{await m.close();}
});
test('validation rejects source boundary errors; request copies cannot mutate authority',async()=>{
 const m=await Memory.open({backend:async r=>{r.node.index=99;r.source='poison';return r.attempt===1?'wrong':'user: valid';},validate:(_r,text)=>text==='wrong'?'wrong author':null});
 try{await m.append({kind:'user',text:long});await m.settle();assert.equal(m.nodes()[0]!.index,0);assert.equal(m.attempts()[0]!.state,'rejected');assert.match(m.attempts()[0]!.request.source,/user: x/);}finally{await m.close();}
});
test('parallel work respects admission and snapshots omit later completed leaves',async()=>{
 const waiting=new Map<number,(text:string)=>void>();let active=0,peak=0;
 const m=await Memory.open({policy:{concurrency:2},backend:r=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>waiting.set(r.node.index,text=>{active--;resolve(text);}));}});
 try{for(let i=0;i<3;i++)await m.append({kind:'user',text:long});m.step();assert.equal(waiting.size,2);waiting.get(1)!('second');await new Promise(r=>setTimeout(r,10));assert.equal(m.snapshot().coveredThrough,0);assert.equal(m.snapshot().text,null);waiting.get(0)!('first');await new Promise(r=>setTimeout(r,10));waiting.get(2)!('third');await m.settle();assert.equal(m.snapshot().state,'ready');assert.equal(peak,2);}finally{await m.close();}
});
test('close cancels, ignores late completion and releases storage without waiting on backend',async()=>{
 const store=new InMemoryStorage();let resolve!:(text:string)=>void,signal!:AbortSignal;
 const m=await Memory.open({storage:store,backend:(_r,s)=>{signal=s;return new Promise(r=>{resolve=r;});}});
 await m.append({kind:'user',text:long});m.step();await m.close();assert.equal(signal.aborted,true);resolve('late');await new Promise(r=>setTimeout(r,5));const reopened=await Memory.open({storage:store});try{assert.equal(reopened.nodes().length,0);assert.equal(reopened.records().length,1);}finally{await reopened.close();}
});
test('append waits for promised persistence; failure stops further writes',async()=>{
 const store=new InMemoryStorage();let release!:()=>void;const saved=store.appendRecords.bind(store);
 store.appendRecords=records=>new Promise<void>(resolve=>{release=()=>{void saved(records).then(resolve);};});
 const m=await Memory.open({storage:store});let returned=false;const pending=m.append({kind:'user',text:'hello'}).then(r=>{returned=true;return r;});await new Promise(r=>setTimeout(r,5));assert.equal(returned,false);assert.equal(m.status().count,0);release();assert.equal((await pending).endExclusive,1);await m.close();
 const broken=new InMemoryStorage();broken.appendRecords=async()=>{throw new Error('disk failure');};const failed=await Memory.open({storage:broken});try{await assert.rejects(()=>failed.append({kind:'user',text:'hello'}),/disk failure/);await assert.rejects(()=>failed.append({kind:'user',text:'again'}),/Storage failed/);assert.equal(failed.status().count,0);}finally{await failed.close();}
});
test('payload captured once, explicit zero distinct from unknown, cumulative retries counted once',async()=>{
 const m=await Memory.open({backend:async(r,_s,emit)=>{
 emit({kind:'submission',payload:{input:'exact'}});emit({kind:'submission',payload:{input:'replacement'}});
 emit({kind:'usage',scope:'cumulative',streamId:'provider-thread',counters:{input:10*r.attempt,output:0,cachedInput:0}});
 emit({kind:'usage',scope:'cumulative',streamId:'provider-thread',counters:{input:10*r.attempt,output:0,cachedInput:0}});
 return r.attempt===1?'s'.repeat(700):'summary';}});
 try{await m.append({kind:'user',text:long});await m.settle();assert.equal(m.usage().input,20);assert.equal(m.usage().cachedInput,0);assert.equal(m.usage().cachedInputObserved,2);assert.equal(m.usage().cacheWriteInputObserved,0);assert.deepEqual(m.attempts()[0]!.payload,{input:'exact'});}finally{await m.close();}
});
test('missing backend is pending, retention never erases spend, subscribers receive copies',async()=>{
 const pending=await Memory.open();try{await pending.append({kind:'user',text:long});assert.equal((await pending.settle()).state,'pending');}finally{await pending.close();}
 const m=await Memory.open({policy:{diagnosticLimit:1},backend:async(_r,_s,e)=>{e({kind:'usage',scope:'attempt',counters:{input:7}});return 'summary';}});
 try{let notices=0;m.subscribe(e=>{notices++;e.kind='mutated';throw new Error('listener');});for(let i=0;i<3;i++){await m.append({kind:'user',text:long});await m.settle();}assert.equal(m.attempts().length,1);assert.equal(m.usage().input,21);assert.equal(m.usage().started,3);assert.ok(notices>0);}finally{await m.close();}
});
test('Unicode pages roundtrip, split receipts, and clipped tool results stay one record',async()=>{
 const m=await Memory.open({policy:{recordBytes:8,pageBytes:4}});try{const receipt=await m.append({kind:'user',text:'🙂🙂🙂'});assert.deepEqual(receipt.ids,[0,1]);assert.equal(m.zoom(0,1,{page:0}).text,'🙂');assert.equal(m.zoom(0,1,{page:1}).text,'🙂');assert.equal(m.records().map(r=>r.text).join(''),'🙂🙂🙂');await m.append({kind:'echo',text:'🙂'.repeat(30001)});assert.equal(m.records().length,3);assert.equal(Array.from(m.records()[2]!.text).length,30000);}finally{await m.close();}
});
test('bad persisted data fails closed and releases ownership',async()=>{
 const store=new InMemoryStorage();store.load=async()=>({records:[{id:1,kind:'user',text:'bad',date:'2026'}],nodes:[],checkpoint:null});await assert.rejects(()=>Memory.open({storage:store}),/journal/);await store.open();await store.close();
});
test('same storage cannot have two owners',async()=>{const storage=new InMemoryStorage();const m=await Memory.open({storage});try{await assert.rejects(()=>Memory.open({storage}),/owned/);}finally{await m.close();}});
