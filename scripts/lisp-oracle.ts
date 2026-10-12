import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { Memory, InMemoryStorage, type Backend } from '../src/index.js';
const root=resolve(import.meta.dirname,'..'),directory=mkdtempSync(join(tmpdir(),'unii-ts-fixture-'));
try {
 const pin=JSON.parse(readFileSync(join(root,'spec/sources.json'),'utf8')).oracle.commit;
 const actual=spawnSync('git',['-C',join(root,'references/lisp'),'rev-parse','HEAD'],{encoding:'utf8'});
 assert.equal(actual.stdout.trim(),pin,'Initialize the pinned Lisp submodule');
 const records=Array.from({length:128},(_,i)=>({kind:i%13===0?'note':'user',text:i%11===0?`short-${i} ж🙂\nnext`:`record-${i} ж🙂\n`+'x'.repeat(600)}));
 records.push({kind:'user',text:'🙂'.repeat(10000)},{kind:'echo',text:'x'.repeat(30001)});
 const input=join(directory,'input.json');writeFileSync(input,JSON.stringify({records}));
 const oracle=spawnSync('emacs',['--batch','-Q','-L',join(root,'references/lisp'),'-l',join(root,'scripts/lisp-fixture.el')],{encoding:'utf8',env:{...process.env,UNII_ORACLE_INPUT:input},timeout:60000,maxBuffer:16*1024*1024});
 if(oracle.status!==0)throw new Error(oracle.stderr||String(oracle.error));
 const expected=JSON.parse(oracle.stdout);
 const requests:{node:number[];source:string;context:string}[]=[];
 const backend:Backend=async r=>{requests.push({node:[r.node.level,r.node.index],source:r.source,context:r.context});return `user: synthetic ${r.node.level}/${r.node.index} `+'s'.repeat(300);};
 const storage=new InMemoryStorage(),options={storage,backend,policy:{mainHigh:2400,mainLow:1200,compactionHigh:600,compactionLow:300}};
 let memory=await Memory.open(options);const traces:unknown[]=[],receipts:unknown[]=[];
 try {
  for(let i=0;i<records.length;i++) {
   receipts.push(await memory.append(records[i]!));await memory.settle();
   const main=memory.snapshot(),compaction=memory.snapshot({view:'compaction'});
   const normalize=(s:typeof main)=>({...s,view:s.view.map(p=>[p.level,p.index])});
   traces.push({main:normalize(main),compaction:normalize(compaction)});
   assert.deepEqual(receipts[i],expected.receipts[i],`receipt ${i}`);
   assert.deepEqual(traces[i],expected.traces[i],`snapshot after input ${i}`);
   if(i===63){await memory.close();memory=await Memory.open(options);assert.deepEqual(normalize(memory.snapshot()),expected.traces[i].main,'reopen main');assert.deepEqual(normalize(memory.snapshot({view:'compaction'})),expected.traces[i].compaction,'reopen compaction');}
  }
  const sort=(nodes:any[])=>nodes.sort((a,b)=>a.level-b.level||a.index-b.index);
  assert.deepEqual(sort(memory.nodes()),sort(expected.nodes),'every immutable summary');
  const requestKey=(r:{node:number[]})=>r.node.join('/');
  const sourceOrder=(rows:any[])=>rows.map(r=>({node:r.node,source:r.source})).sort((a,b)=>requestKey(a).localeCompare(requestKey(b)));
  assert.deepEqual(sourceOrder(requests),sourceOrder(expected.requests),'every submitted source');
  const contextMatches=requests.filter(r=>expected.requests.some((e:any)=>requestKey(e)===requestKey(r)&&e.context===r.context)).length;
  assert.equal(contextMatches,requests.length,'every submitted compaction context');
  const evidence={oracleCommit:pin,inputRecords:records.length,storedRecords:memory.records().length,nodes:memory.nodes().length,receiptAndSnapshotMatches:traces.length,sourceMatches:requests.length,contextMatches,modelRequests:requests.length,realModelCalls:0,reopenIdentical:true};
  writeFileSync(join(root,'docs/oracle-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
 } finally{await memory.close();}
}finally{rmSync(directory,{recursive:true,force:true});}
