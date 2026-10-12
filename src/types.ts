export interface Address { level: number; index: number }
export interface RecordInput { kind: string; text: string }
export interface MemoryRecord extends RecordInput { id: number; date: string }
export interface Summary extends Address { text: string }
export interface Checkpoint {
  version: 1; cursor: number; main: Address[]; compaction: Address[];
  mainBatching: boolean; compactionBatching: boolean;
}
export interface StoredMemory { records: MemoryRecord[]; nodes: Summary[]; checkpoint: Checkpoint | null }
/** Each mutation resolves only after the adapter's promised persistence boundary.
 * open() must acquire exclusive writer ownership; load/reads return owned copies. */
export interface Storage {
  open(): Promise<void>;
  load(): Promise<StoredMemory>;
  appendRecords(records: readonly MemoryRecord[]): Promise<void>;
  appendNode(node: Summary): Promise<void>;
  checkpoint(value: Checkpoint): Promise<void>;
  close(): Promise<void>;
}
export interface Receipt { firstId: number; ids: number[]; endExclusive: number }
export interface UsageCounters { input?: number; output?: number; cachedInput?: number; cacheWriteInput?: number }
export type Observation =
  | { kind: 'submission'; payload: unknown }
  | { kind: 'usage'; scope: 'attempt' | 'cumulative'; streamId?: string; counters: UsageCounters };
export interface CompressionRequest {
  jobId: string; attemptId: string; attempt: number; node: Address;
  source: string; context: string; priorResponses: string[]; feedback: string | null;
}
export type Backend = (request: CompressionRequest, signal: AbortSignal, emit: (event: Observation) => void) => Promise<string>;
export interface Policy {
  nodeBytes: number; recordBytes: number; pageBytes: number; resultKind: string;
  mainHigh: number; mainLow: number; compactionHigh: number; compactionLow: number;
  concurrency: number; maxAttempts: number; diagnosticLimit: number;
}
export interface MemoryOptions {
  storage?: Storage; backend?: Backend; policy?: Partial<Policy>;
  validate?: (request: CompressionRequest, text: string) => string | null;
  now?: () => number;
}
export interface Snapshot {
  state: 'ready' | 'pending' | 'failed'; before: number; coveredThrough: number;
  view: Address[]; text: string | null; bytes: number | null;
}
export interface Attempt {
  id: string; jobId: string; node: Address; number: number;
  state: 'running' | 'completed' | 'rejected' | 'failed' | 'cancelled';
  request: CompressionRequest; payload: unknown; payloadObserved: boolean;
  response: string | null; error: string | null; events: Observation[]; usage: UsageCounters;
}
export interface Usage {
  started: number; input: number; output: number; cachedInput: number; cacheWriteInput: number;
  inputObserved: number; outputObserved: number; cachedInputObserved: number; cacheWriteInputObserved: number;
}
export interface MemoryEvent { sequence: number; kind: string; data: unknown }
