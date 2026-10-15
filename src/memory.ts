import type { Address, Attempt, Backend, Checkpoint, CompressionRequest, MemoryEvent, MemoryOptions, MemoryRecord, Observation, Policy, Receipt, Snapshot, Storage, Summary, Usage, UsageCounters } from './types.js';
// Copyright (c) 2026 Igor Loskutov. SPDX-License-Identifier: MIT
// Independent boundary/scheduler; tree primitives adapted from pi-optchat.
// Assisted-by: Codex:gpt-6-1-sol
import { InMemoryStorage } from './storage.js';
import { bytes, end, flat, key, partition, prefix, render, span, splitUtf8, start, validAddress, View } from './tree.js';
const defaults: Policy = { nodeBytes: 512, recordBytes: 30000, pageBytes: 4000, resultKind: 'echo', mainHigh: 128000, mainLow: 64000, compactionHigh: 32000, compactionLow: 16000, concurrency: 8, maxAttempts: 5, diagnosticLimit: 100 };
const counterNames = ['input','output','cachedInput','cacheWriteInput'] as const;
interface Job { id: string; node: Address; controller: AbortController }
export class Memory {
  #storage: Storage; #backend: Backend | undefined; #policy: Policy;
  #validate: MemoryOptions['validate']; #shouldRetryBackendError: (error: unknown) => boolean; #now: () => number;
  #records: MemoryRecord[] = []; #nodes = new Map<string,Summary>();
  #main: View; #compaction: View; #cursor = 0;
  #leaves = new Map<string,Address>(); #parents = new Map<string,Address>();
  #running = new Map<string,Job>(); #failed = new Map<string,string>();
  #closed = false; #closing: Promise<void> | null = null; #fatal: string | null = null; #jobSequence = 0; #eventSequence = 0;
  #tail: Promise<unknown> = Promise.resolve(); #revision = 0; #pumping = false;
  #attempts: Attempt[] = []; #listeners = new Set<(event: MemoryEvent) => void>();
  #streams = new Map<string,UsageCounters>(); #scopes = new Map<string,string>();
  #usage: Usage = { started: 0, input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, inputObserved: 0, outputObserved: 0, cachedInputObserved: 0, cacheWriteInputObserved: 0 };
  private constructor(options: MemoryOptions) {
    this.#storage = options.storage ?? new InMemoryStorage(); this.#backend = options.backend;
    this.#policy = { ...defaults, ...options.policy }; this.#validate = options.validate; this.#now = options.now ?? Date.now;
    this.#shouldRetryBackendError = options.shouldRetryBackendError ?? (() => true);
    for (const [name,n] of Object.entries(this.#policy)) {
      if (name === 'resultKind') { if (typeof n !== 'string' || !n) throw new Error('Invalid resultKind'); continue; }
      if (!Number.isSafeInteger(n) || Number(n) <= 0) throw new Error(`Invalid policy ${name}`);
    }
    if (this.#policy.recordBytes < 4 || this.#policy.pageBytes < 4 || this.#policy.mainLow > this.#policy.mainHigh || this.#policy.compactionLow > this.#policy.compactionHigh) throw new Error('Invalid policy budgets');
    this.#main = new View(this.#policy.mainHigh,this.#policy.mainLow,p => this.#nodes.get(key(p)));
    this.#compaction = new View(this.#policy.compactionHigh,this.#policy.compactionLow,p => this.#nodes.get(key(p)));
  }
  static async open(options: MemoryOptions = {}): Promise<Memory> {
    const m = new Memory(options); await m.#storage.open();
    try {
      const data = await m.#storage.load();
      if (!Array.isArray(data.records) || !Array.isArray(data.nodes)) throw new Error('Invalid storage image');
      data.records.forEach((r,i) => { if (r.id !== i || typeof r.text !== 'string' || typeof r.kind !== 'string' || !r.kind || typeof r.date !== 'string') throw new Error('Invalid journal'); });
      m.#records = structuredClone(data.records);
      for (const n of data.nodes) {
        if (!validAddress(n) || typeof n.text !== 'string' || end(n) > m.#records.length || m.#nodes.has(key(n))) throw new Error('Invalid immutable node');
        m.#nodes.set(key(n),structuredClone(n));
      }
      for (const n of m.#nodes.values()) if (n.level && (!m.#nodes.has(key({level:n.level-1,index:n.index*2})) || !m.#nodes.has(key({level:n.level-1,index:n.index*2+1})))) throw new Error('Parent missing source children');
      if (data.checkpoint) {
        const c = data.checkpoint;
        if (c.version !== 1 || !Number.isSafeInteger(c.cursor) || c.cursor < 0 || c.cursor > m.#records.length || !partition(c.main,c.cursor) || !partition(c.compaction,c.cursor) || typeof c.mainBatching !== 'boolean' || typeof c.compactionBatching !== 'boolean') throw new Error('Invalid checkpoint');
        for (const p of [...c.main,...c.compaction]) if (!m.#nodes.has(key(p))) throw new Error('Checkpoint references unbuilt node');
        m.#cursor=c.cursor; m.#main.parts=structuredClone(c.main); m.#compaction.parts=structuredClone(c.compaction);
        m.#main.batching=c.mainBatching; m.#compaction.batching=c.compactionBatching;
      }
      for (const n of m.#nodes.values()) m.#queueParent(n);
      for (let i=0;i<m.#records.length;i++) if (!m.#nodes.has(key({level:0,index:i}))) m.#leaves.set(key({level:0,index:i}),{level:0,index:i});
      // Recovery only reconstructs committed state and verbatim nodes, never runs a backend.
      for (const p of [...m.#leaves.values()]) await m.#short(p);
      await m.#mutate(async()=>m.#publish()); return m;
    } catch (error) { await m.#storage.close(); throw error; }
  }
  #check(): void { if (this.#closed) throw new Error('Memory closed'); if (this.#fatal) throw new Error(`Storage failed: ${this.#fatal}`); }
  async #persist(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch (e) { this.#fatal = String(e); throw e; }
  }
  #mutate<T>(action: () => Promise<T>): Promise<T> {
    const result=this.#tail.then(()=>{ this.#check(); return action(); });
    this.#tail=result.catch(()=>{}); return result;
  }
  #event(kind: string,data: unknown): void {
    this.#revision++; const event={sequence:++this.#eventSequence,kind,data:structuredClone(data)};
    for (const listener of [...this.#listeners]) { try { listener(structuredClone(event)); } catch { /* A subscriber cannot roll back a committed operation. */ } }
  }
  subscribe(listener: (event: MemoryEvent) => void): () => void { this.#check(); this.#listeners.add(listener); return ()=>{this.#listeners.delete(listener);}; }
  async append(input: RecordInputChecked): Promise<Receipt> {
    this.#check(); if (!input || typeof input.kind !== 'string' || !input.kind || typeof input.text !== 'string') throw new Error('Record requires kind and text');
    const texts=input.kind===this.#policy.resultKind ? [clip(input.text)] : splitUtf8(input.text,this.#policy.recordBytes), kind=input.kind;
    const receipt=await this.#mutate(async()=>{
      const firstId=this.#records.length, date=new Date(this.#now()).toISOString();
      const records=texts.map((text,i)=>({id:firstId+i,kind,text,date}));
      await this.#persist(()=>this.#storage.appendRecords(structuredClone(records)));
      this.#records.push(...records);
      for(const r of records) this.#leaves.set(key({level:0,index:r.id}),{level:0,index:r.id});
      for(const [id] of this.#failed) this.#failed.delete(id);
      this.#event('records-appended',{firstId,endExclusive:this.#records.length});
      return {firstId,ids:records.map(r=>r.id),endExclusive:this.#records.length};
    });
    for(const id of receipt.ids) await this.#short({level:0,index:id});
    return structuredClone(receipt);
  }
  #source(p: Address): string {
    if (!p.level) { const r=this.#records[p.index]; if (!r) throw new Error('Missing source'); return `${r.kind}: ${r.text}`; }
    const a=this.#nodes.get(key({level:p.level-1,index:p.index*2})),b=this.#nodes.get(key({level:p.level-1,index:p.index*2+1}));
    if (!a || !b) throw new Error('Parent lacks children'); return `${a.text}\n${b.text}`;
  }
  #queueParent(p: Address): void {
    const parent={level:p.level+1,index:Math.floor(p.index/2)}, sibling={level:p.level,index:p.index%2 ? p.index-1 : p.index+1};
    if (!this.#nodes.has(key(parent)) && this.#nodes.has(key(sibling))) this.#parents.set(key(parent),parent);
  }
  async #commit(p: Address,text: string): Promise<void> {
    await this.#mutate(async()=>{
      if (this.#nodes.has(key(p))) return;
      const node={...p,text}; await this.#persist(()=>this.#storage.appendNode(structuredClone(node)));
      this.#nodes.set(key(p),node); this.#leaves.delete(key(p)); this.#parents.delete(key(p)); this.#failed.delete(key(p)); this.#queueParent(p);
      await this.#publish(); this.#event('node-committed',p);
    });
  }
  async #publish(): Promise<void> {
    while(this.#nodes.has(key({level:0,index:this.#cursor}))) {
      const p={level:0,index:this.#cursor++};this.#main.parts.push({...p});this.#compaction.parts.push({...p});
    }
    if(this.#main.fit(this.#records.length)) this.#compaction.batching=true;
    this.#compaction.fit(this.#records.length);
    const checkpoint:Checkpoint={version:1,cursor:this.#cursor,main:structuredClone(this.#main.parts),compaction:structuredClone(this.#compaction.parts),mainBatching:this.#main.batching,compactionBatching:this.#compaction.batching};
    await this.#persist(()=>this.#storage.checkpoint(checkpoint));
  }
  async #short(p: Address): Promise<void> {
    if(this.#nodes.has(key(p)) || this.#running.has(key(p))) return;
    const source=this.#source(p);
    if(bytes(source)>this.#policy.nodeBytes) return;
    await this.#commit(p,source);
    const parent={level:p.level+1,index:Math.floor(p.index/2)};
    if(this.#parents.has(key(parent))) await this.#short(parent);
  }
  snapshot(options: { before?:number; view?:'main'|'compaction' }={}): Snapshot {
    this.#check(); const before=options.before??this.#records.length;
    if(!Number.isSafeInteger(before)||before<0||before>this.#records.length) throw new Error('Invalid exclusive boundary');
    if(options.view!==undefined && options.view!=='main' && options.view!=='compaction') throw new Error('Invalid view');
    const coveredThrough=Math.min(before,this.#cursor),parts=prefix(options.view==='compaction'?this.#compaction.parts:this.#main.parts,coveredThrough);
    const complete=coveredThrough===before;
    const failed=!complete && [...this.#failed.keys()].some(id=>{const p=this.#leaves.get(id);return p && start(p)<before;});
    const text=complete?render(parts,p=>this.#nodes.get(key(p))):null;
    return {state:complete?'ready':failed?'failed':'pending',before,coveredThrough,view:structuredClone(parts),text,bytes:text===null?null:bytes(text)};
  }
  records(): MemoryRecord[] { this.#check();return structuredClone(this.#records); }
  nodes(): Summary[] { this.#check();return structuredClone([...this.#nodes.values()]); }
  attempts(): Attempt[] { this.#check();return structuredClone(this.#attempts); }
  usage(): Usage { this.#check();return structuredClone(this.#usage); }
  status(): {count:number;cursor:number;active:number;pending:number;failed:{node:Address;message:string}[];storageError:string|null} {
    return {count:this.#records.length,cursor:this.#cursor,active:this.#running.size,pending:this.#leaves.size+this.#parents.size,failed:[...this.#failed].map(([id,message])=>({node:structuredClone((this.#leaves.get(id)??this.#parents.get(id))!),message})),storageError:this.#fatal};
  }
  zoom(first:number,count:number,options:{page?:number}={}): {text:string;totalBytes:number;pages:number} {
    this.#check();const p={level:Math.log2(count),index:first/count};
    if(!validAddress(p)||end(p)>this.#records.length)throw new Error('Invalid aligned range');
    if(count===1) {
      const text=this.#records[first]!.text,pages=splitUtf8(text,this.#policy.pageBytes),page=options.page??0;
      if(!Number.isSafeInteger(page)||page<0||page>=pages.length)throw new Error('Invalid page');
      return {text:pages[page]!,totalBytes:bytes(text),pages:pages.length};
    }
    const children=[{level:p.level-1,index:p.index*2},{level:p.level-1,index:p.index*2+1}];
    const text=children.map(c=>{const n=this.#nodes.get(key(c));if(!n)throw new Error('Unbuilt range');return `${start(c)}+${span(c)}|${flat(n.text)}`;}).join('\n');
    return {text,totalBytes:bytes(text),pages:1};
  }
  date(id:number):string {this.#check();if(!Number.isSafeInteger(id)||id<0||!this.#records[id])throw new Error('Invalid record ID');return this.#records[id]!.date;}
  /** Requeue at most limit failed nodes without changing records or starting provider I/O. */
  retryFailed(limit:number=this.#policy.concurrency):number {
    this.#check();
    if(!Number.isSafeInteger(limit)||limit<=0||limit>this.#policy.concurrency)throw new Error('Invalid retry limit');
    let count=0;
    for(const id of this.#failed.keys()) {
      if(count===limit)break;
      this.#failed.delete(id);count++;
    }
    if(count)this.#event('retry-eligible',{count});
    return count;
  }
  /** Schedule work without waiting for provider I/O. No autonomous retry timers. */
  step():void {
    this.#check();if(this.#pumping)return;this.#pumping=true;
    try {
      const leaves=[...this.#leaves.values()].slice(0,this.#policy.concurrency);
      for(const p of [...leaves,...this.#parents.values()]) {
        if(this.#running.size>=this.#policy.concurrency)break;
        const id=key(p);if(this.#running.has(id)||this.#failed.has(id)||this.#nodes.has(id))continue;
        const source=this.#source(p);
        if(bytes(source)>this.#policy.nodeBytes && !this.#backend)continue;
        const job:Job={id:`job-${++this.#jobSequence}`,node:{...p},controller:new AbortController()};
        this.#running.set(id,job);
        void this.#run(job,source).catch(error=>{
          if(!this.#closed){this.#failed.set(id,String(error));this.#event('job-failed',{node:p,error:String(error)});}
        }).finally(()=>{this.#running.delete(id);this.#trim();this.#revision++;if(!this.#closed&&!this.#fatal)this.step();});
      }
    } finally {this.#pumping=false;}
  }
  async #run(job:Job,source:string):Promise<void> {
    if(bytes(source)<=this.#policy.nodeBytes){await this.#commit(job.node,source);return;}
    const boundary=job.node.level?end(job.node):start(job.node);
    const context=render(prefix(this.#compaction.parts,Math.min(boundary,this.#cursor)),p=>this.#nodes.get(key(p)));
    let best:string|null=null,feedback:string|null=null;const priorResponses:string[]=[];
    for(let number=1;number<=this.#policy.maxAttempts;number++) {
      if(this.#closed||job.controller.signal.aborted)return;
      const request:CompressionRequest={jobId:job.id,attemptId:`${job.id}:${number}`,attempt:number,node:{...job.node},source,context,priorResponses:[...priorResponses],feedback,sourceKinds:[...new Set(this.#records.slice(start(job.node),end(job.node)).map(record=>record.kind))]};
      const attempt:Attempt={id:request.attemptId,jobId:job.id,node:{...job.node},number,state:'running',request:structuredClone(request),payload:null,payloadObserved:false,response:null,error:null,events:[],usage:{}};
      this.#attempts.push(attempt);this.#usage.started++;this.#trim();this.#event('attempt-started',{id:attempt.id,node:job.node});
      try {
        const result=await this.#backend!(structuredClone(request),job.controller.signal,event=>{try{this.#observe(attempt,event);}catch(error){this.#event('observation-rejected',{attemptId:attempt.id,error:String(error)});}});
        if(this.#closed||job.controller.signal.aborted){attempt.state='cancelled';return;}
        if(typeof result!=='string')throw new Error('Backend returned non-string');
        attempt.response=result;const text=flat(result.trim().replace(/^\d+\+\d+\|\s*/,''));
        const violation=text?this.#validate?.(structuredClone(request),text)??null:'Empty summary';
        if(violation){attempt.state='rejected';attempt.error=violation;feedback=violation;}
        else {
          attempt.state='completed';priorResponses.push(text);
          if(best===null||bytes(text)<bytes(best))best=text;
          if(bytes(best)<=this.#policy.nodeBytes){await this.#commit(job.node,best);this.#event('attempt-finished',{id:attempt.id});return;}
          feedback=`Reply exceeds ${this.#policy.nodeBytes} UTF-8 bytes. Return a complete shorter summary of the same source.`;
        }
      } catch(error) {
        if(this.#closed||job.controller.signal.aborted){attempt.state='cancelled';return;}
        attempt.state='failed';attempt.error=String(error);feedback=String(error);
        if(this.#fatal)throw error;
        if(!this.#shouldRetryBackendError(error)){this.#event('attempt-finished',{id:attempt.id});break;}
      }
      this.#event('attempt-finished',{id:attempt.id});
    }
    if(best!==null)await this.#commit(job.node,best);else throw new Error(feedback??'No valid summary');
  }
  #trim():void {
    let completed=this.#attempts.filter(a=>a.state!=='running').length;
    while(completed>this.#policy.diagnosticLimit){const i=this.#attempts.findIndex(a=>a.state!=='running');this.#attempts.splice(i,1);completed--;}
    const ids=new Set(this.#attempts.map(a=>a.id));for(const id of this.#scopes.keys())if(!ids.has(id))this.#scopes.delete(id);
    const retained=new Set(this.#attempts.map(a=>a.jobId));for(const id of this.#streams.keys())if(!retained.has(id.split('/')[0]!))this.#streams.delete(id);
  }
  #observe(attempt:Attempt,raw:Observation):void {
    if(this.#closed||attempt.state==='cancelled'||!this.#attempts.includes(attempt))return;
    const event=structuredClone(raw);
    if(event.kind==='submission') {
      if(!attempt.payloadObserved){attempt.payload=structuredClone(event.payload);attempt.payloadObserved=true;}
      this.#event('submission',{attemptId:attempt.id});return;
    }
    if(event.kind!=='usage'||!['attempt','cumulative'].includes(event.scope))throw new Error('Invalid observation');
    if(event.scope==='cumulative'&&(!event.streamId||typeof event.streamId!=='string'))throw new Error('Cumulative usage needs streamId');
    for(const name of counterNames){const n=event.counters[name];if(n!==undefined&&(!Number.isSafeInteger(n)||n<0))throw new Error('Invalid usage counter');}
    const scope=event.scope==='attempt'?'attempt':`cumulative:${event.streamId}`;
    if(this.#scopes.has(attempt.id)&&this.#scopes.get(attempt.id)!==scope)throw new Error('Usage scope changed within attempt');
    this.#scopes.set(attempt.id,scope);
    const cumulative=event.scope==='cumulative',streamKey=`${attempt.jobId}/${event.streamId}`;const previous=cumulative?this.#streams.get(streamKey)??{}:attempt.usage;
    const next:UsageCounters={...previous};
    for(const name of counterNames) {
      const n=event.counters[name];if(n===undefined)continue;
      if(attempt.usage[name]===undefined)this.#usage[`${name}Observed`]++;
      this.#usage[name]+=Math.max(0,n-(previous[name]??0));next[name]=Math.max(previous[name]??0,n);
      attempt.usage[name]=Math.max(attempt.usage[name]??0,n);
    }
    if(cumulative)this.#streams.set(streamKey,next);
    attempt.events.push(event);if(attempt.events.length>100)attempt.events.shift();this.#event('usage',{attemptId:attempt.id,counters:event.counters});
  }
  /** Wait for all currently schedulable tree work, or expose terminal failures. */
  async settle():Promise<Snapshot> {
    this.#check();this.step();
    while(this.#running.size){await new Promise<void>(resolve=>setTimeout(resolve,0));this.#check();}
    await this.#tail;this.#trim();return this.snapshot();
  }
  async close():Promise<void> {
    if(this.#closing)return this.#closing;this.#closed=true;
    for(const job of this.#running.values())job.controller.abort();this.#running.clear();
    for(const attempt of this.#attempts)if(attempt.state==='running')attempt.state='cancelled';
    this.#closing=(async()=>{await this.#tail;try{await this.#storage.close();}finally{this.#listeners.clear();}})();
    return this.#closing;
  }
}
type RecordInputChecked={kind:string;text:string};
function clip(text:string):string {const chars=Array.from(text);return chars.length<=30000?text:chars.slice(0,15000).join('')+chars.slice(-15000).join('');}
