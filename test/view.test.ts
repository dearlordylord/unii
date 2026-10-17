import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { bytes, key, mostDue, render, View } from '../src/tree.js';
import type { Address, Summary } from '../src/types.js';

test('incremental view sizes preserve full-render merge decisions for Unicode and incomplete trees', () => {
 const text = fc.array(fc.constantFrom('a','é','ж','🙂','中','\r','\n'), {maxLength:40}).map(chars => chars.join(''));
 fc.assert(fc.property(fc.array(text,{minLength:1,maxLength:64}),fc.array(fc.boolean(),{minLength:1,maxLength:128}),fc.integer({min:1,max:1500}),fc.integer({min:0,max:1500}),fc.boolean(),(texts,available,low,extra,batching) => {
  const high=low+extra,total=texts.length,nodes=new Map<string,Summary>();
  texts.forEach((value,index)=>nodes.set(key({level:0,index}),{level:0,index,text:value}));
  for(let level=1;2**level<=total;level++)for(let index=0;(index+1)*2**level<=total;index++) {
   if(available[(level*total+index)%available.length] && nodes.has(key({level:level-1,index:index*2})) && nodes.has(key({level:level-1,index:index*2+1})))
    nodes.set(key({level,index}),{level,index,text:`${level}🙂${index}\n${texts[index]}`});
  }
  const node=(p:Address)=>nodes.get(key(p));
  const initial=texts.map((_,index)=>({level:0,index}));
  const expected=structuredClone(initial);let expectedBatching=batching,changed=false;
  const size=()=>bytes(render(expected,node));
  if(size()>high)expectedBatching=true;
  while(expectedBatching && size()>low) {
   const i=mostDue(expected,total,p=>node(p)!==undefined);if(i<0)break;
   const a=expected[i]!;expected.splice(i,2,{level:a.level+1,index:a.index/2});changed=true;
  }
  if(size()<=low)expectedBatching=false;
  const actual=new View(high,low,node);actual.parts=structuredClone(initial);actual.batching=batching;
  assert.equal(actual.fit(total),changed);assert.deepEqual(actual.parts,expected);assert.equal(actual.batching,expectedBatching);assert.equal(actual.size,size());
 }),{seed:20261017,numRuns:300});
});
