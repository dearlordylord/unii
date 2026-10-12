import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { bytes, mostDue, splitUtf8, type View } from '../src/tree.js';
import type { Address } from '../src/types.js';
test('UTF-8 splitting preserves every code point and bounds each chunk',()=>{
 fc.assert(fc.property(fc.array(fc.constantFrom('a','\n','ж','🙂','中','é'),{maxLength:300}),fc.integer({min:4,max:100}),(chars,limit)=>{const text=chars.join(''),parts=splitUtf8(text,limit);assert.equal(parts.join(''),text);parts.forEach(p=>assert.ok(bytes(p)<=limit));}),{seed:20261012,numRuns:500});
});
test('merge order matches independent rollback counter for 20,001 appends',()=>{
 type State={keep:number;state:number;older:State|null};
 const push=(n:number,s:State|null):State=>!s?{keep:0,state:n,older:null}:!s.keep?{...s,keep:1}:{keep:0,state:n,older:push(s.state,s.older)};
 let oracle:State|null=null,parts:Address[]=[];
 for(let total=1;total<=20001;total++){
  oracle=push(total-1,oracle);const boundaries:number[]=[];for(let s:State|null=oracle;s;s=s.older)boundaries.unshift(s.state);
  parts.push({level:0,index:total-1});
  while(parts.length>boundaries.length){const i=mostDue(parts,total,()=>true);assert.ok(i>=0);const p=parts[i]!;parts.splice(i,2,{level:p.level+1,index:p.index/2});}
  assert.deepEqual(parts.map(p=>p.index*2**p.level),boundaries,`step ${total}`);
 }
});
