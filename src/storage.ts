import type { Checkpoint, MemoryRecord, Storage, StoredMemory, Summary } from './types.js';
// Copyright (c) 2026 Igor Loskutov. SPDX-License-Identifier: MIT
// Assisted-by: Codex:gpt-6-1-sol
import { key } from './tree.js';
/** RAM-only adapter. Retains data across close/open of this same instance, not process exit. */
export class InMemoryStorage implements Storage {
  #opened = false;
  #image: StoredMemory = { records: [], nodes: [], checkpoint: null };
  async open(): Promise<void> { if (this.#opened) throw new Error('Storage already owned'); this.#opened = true; }
  #check(): void { if (!this.#opened) throw new Error('Storage closed'); }
  async load(): Promise<StoredMemory> { this.#check(); return structuredClone(this.#image); }
  async appendRecords(records: readonly MemoryRecord[]): Promise<void> {
    this.#check();
    records.forEach((r,i) => { if (r.id !== this.#image.records.length + i) throw new Error('Noncontiguous record'); });
    this.#image.records.push(...structuredClone(records));
  }
  async appendNode(node: Summary): Promise<void> {
    this.#check();
    if (this.#image.nodes.some(n => key(n) === key(node))) throw new Error('Immutable node already exists');
    this.#image.nodes.push(structuredClone(node));
  }
  async checkpoint(value: Checkpoint): Promise<void> { this.#check(); this.#image.checkpoint = structuredClone(value); }
  async close(): Promise<void> { this.#opened = false; }
}
