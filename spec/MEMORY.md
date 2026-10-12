# UNII TypeScript core contract

This is the normative contract for this repository. The pinned Lisp implementation in `references/lisp` is the behavioral oracle for the implemented subset. Source revisions are recorded in `sources.json`. Changing the contract or diverging from that oracle requires an explicit documented decision and corresponding checks.

## Records and immutable tree

Records receive contiguous zero-based IDs. An append receipt identifies all resulting records with an exclusive end boundary. Ordinary input is split at UTF-8 code point boundaries into chunks of at most 30,000 bytes by default. The default result kind, `echo`, is clipped to 30,000 Unicode code points and remains one record. Empty text remains a record.

A node at level L and index I covers `[I * 2^L, (I + 1) * 2^L)`. Leaves summarize one record; parents summarize exactly their two children. Nodes are immutable and uniquely addressed. Sources fitting the default 512-byte node target are stored verbatim without inference. Parent sources concatenate the two child texts with a newline. No unrelated records become authoritative source material.

## Views and readiness

Main and compaction views partition a contiguous completed prefix without gaps or overlap. Main uses high/low byte budgets of 128,000/64,000; compaction uses 32,000/16,000. Budget accounting includes the rendered chat wrapper and line headers. The merge order uses age divided by covered span, with oldest-first ties. A batching operation preserves its state until eligible merges finish. Both views, their batching flags and the completed cursor are checkpointed.

Snapshot boundaries are exclusive. A ready snapshot covers every record before its requested boundary. Pending or failed snapshots expose coverage and addresses, but return null for prompt text and bytes. Finishing a later leaf cannot bridge an earlier unfinished leaf. Prefix snapshots split crossing nodes to recover exact coverage.

## Compression port

The application supplies a Backend callback. Its request contains the immutable authoritative source, the available earlier compaction context, attempt identity, previous responses and validation feedback. The application owns provider calls, prompts, tools and authentication. Optional validation may reject a result by returning a reason.

Default admission is eight concurrent jobs and five attempts per job. Failed calls, rejected responses and oversized responses consume attempts. After size retries, the shortest valid complete response may exceed the target. Invalid responses never become nodes. Failed work can be retried after a new append. Without a backend, long unresolved sources remain pending. `step()` admits work; `settle()` drives currently available work to completion. The core has no background timer.

## Storage port and recovery

Storage owns persistence and exclusive writer ownership. `open()` acquires ownership; `load()` returns an owned image; mutations resolve only after the adapter's promised persistence boundary. An append must store its complete record batch atomically. Nodes are stored before views reference them. Checkpoint replacement must be atomic. Durable adapters must recover a valid prefix after interruption and reject corrupt or ambiguous state.

The core waits for storage confirmation before issuing a receipt. A storage error stops subsequent mutations. Opening validates the image, restores both views and queues missing work. Reads and callback requests are owned copies. Closing cancels work, drains already queued storage mutations and releases ownership; late backend completion cannot write into closed memory. Repeated close calls await the same close operation.

The supplied InMemoryStorage implements this contract in RAM only. Reopening the same instance preserves its contents; process restart does not. No on-disk compatibility with Lisp is promised.

## Observability

Attempts expose source, context, responses, validation or backend errors, cancellation and the actual submitted payload when the backend reports it. Submission payload is captured once per attempt. Events allow applications to observe changes without polling; subscriber errors cannot break the core.

Backend usage observations distinguish per-attempt counters from cumulative counters shared across retries. Counters are monotone high-water marks; repeated observations do not charge twice. An attempt cannot switch scope or cumulative stream. Explicit zero counts as observed; an absent counter remains unknown. Cached input and cache-write input are distinct. Aggregate totals expose observation coverage and survive diagnostic eviction during the open instance's lifetime. The core does not infer cache hits, prices or monetary cost from text.

Terminal attempt retention defaults to 100, with at most 100 usage observations retained per attempt. Running attempts remain visible. Retention is bounded by count, not payload bytes. Diagnostics and usage are currently runtime state and are not persisted in the Storage image.
