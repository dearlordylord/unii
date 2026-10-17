import type { Address, Summary } from './types.js';
// Copyright (c) 2026 Jonas Silva; adaptations copyright (c) 2026 Igor Loskutov.
// SPDX-License-Identifier: MIT
// Adapted from pi-optchat. See THIRD_PARTY_NOTICES.md for its full MIT notice.
// Assisted-by: Codex:gpt-6-1-sol
const encoder = new TextEncoder();
export const bytes = (text: string): number => encoder.encode(text).length;
export const key = (p: Address): string => `${p.level}/${p.index}`;
export const span = (p: Address): number => 2 ** p.level;
export const start = (p: Address): number => p.index * span(p);
export const end = (p: Address): number => start(p) + span(p);
export const flat = (s: string): string => s.replace(/[\r\n]+/g, ' ');
export function validAddress(p: Address): boolean {
  return Number.isSafeInteger(p.level) && p.level >= 0 && p.level <= 52 &&
    Number.isSafeInteger(p.index) && p.index >= 0 && Number.isSafeInteger(end(p));
}
export function partition(parts: readonly Address[], total: number): boolean {
  let cursor = 0;
  for (const p of parts) { if (!validAddress(p) || start(p) !== cursor) return false; cursor = end(p); }
  return cursor === total;
}
export function line(node: Summary): string { return `${start(node)}+${span(node)}|${flat(node.text)}\n`; }
export function render(parts: readonly Address[], node: (p: Address) => Summary | undefined): string {
  return `<chat>\n${parts.map(p => { const n = node(p); if (!n) throw new Error(`Unbuilt node ${key(p)}`); return line(n); }).join('')}</chat>`;
}
/** Last-inclusive age, oldest tie. Integer products avoid division rounding. */
export function mostDue(parts: readonly Address[], total: number, built: (p: Address) => boolean): number {
  let best = -1, age = 0, width = 1;
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i]!, b = parts[i + 1]!;
    if (a.level !== b.level || a.index % 2 || b.index !== a.index + 1) continue;
    const parent = { level: a.level + 1, index: a.index / 2 };
    const nextAge = total - (end(b) - 1), nextWidth = span(a);
    if (built(parent) && (best < 0 || BigInt(nextAge) * BigInt(width) > BigInt(age) * BigInt(nextWidth))) {
      best = i; age = nextAge; width = nextWidth;
    }
  }
  return best;
}
/** Complete wire bytes, including IDs, separators and wrapper. Batching survives reopen. */
export class View {
  parts: Address[] = []; batching = false;
  constructor(readonly high: number, readonly low: number, private readonly node: (p: Address) => Summary | undefined) {}
  get size(): number { return bytes(render(this.parts, this.node)); }
  fit(total: number): boolean {
    let size = this.size;
    if (size > this.high) this.batching = true;
    let changed = false;
    while (this.batching && size > this.low) {
      const i = mostDue(this.parts, total, p => !!this.node(p));
      if (i < 0) break;
      const a = this.parts[i]!, b = this.parts[i + 1]!;
      const parent = { level: a.level + 1, index: a.index / 2 };
      size += bytes(render([parent], this.node)) - bytes(render([a, b], this.node));
      this.parts.splice(i, 2, parent); changed = true;
    }
    if (size <= this.low) this.batching = false;
    return changed;
  }
}
export function splitUtf8(text: string, limit: number): string[] {
  if (!Number.isSafeInteger(limit) || limit < 4) throw new Error('UTF-8 limit must be >= 4');
  const pieces: string[] = []; let chunk = '', size = 0;
  for (const c of text) { const n = bytes(c); if (size + n > limit) { pieces.push(chunk); chunk = ''; size = 0; } chunk += c; size += n; }
  pieces.push(chunk); return pieces;
}
export function prefix(parts: readonly Address[], before: number): Address[] {
  const out: Address[] = [];
  const visit = (p: Address): void => {
    if (start(p) >= before) return;
    if (end(p) <= before) { out.push({ ...p }); return; }
    if (!p.level) return;
    visit({ level: p.level - 1, index: p.index * 2 }); visit({ level: p.level - 1, index: p.index * 2 + 1 });
  };
  parts.forEach(visit); return out;
}
