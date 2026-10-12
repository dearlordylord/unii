# Current boundaries

The library owns record splitting, immutable binary summaries, merge scheduling, main and compaction views, readiness, retry admission, checkpoints, recovery validation and runtime diagnostics. Its public surface is exported from `src/index.ts`; tree helpers are internal.

The host owns the LLM backend, its provider request format, prompts, source validation policy, credentials and reporting actual usage. The host also chooses a Storage adapter. The default adapter is RAM. A future file or SQLite adapter can implement the existing port without coupling the core to a directory or database driver. Atomic batches, checkpoint replacement, recovery and writer locking belong to that adapter.

This first version has no provider SDK, Pi dependency, ordinary chat generation, UI, filesystem adapter or migration from Lisp data files. It does not persist diagnostics, calculate monetary costs or establish real-provider cache effectiveness. Payload retention has a count limit but no byte limit. These are explicit boundaries for subsequent work.

## Adaptation and reference code

`src/tree.ts` adapts the MIT-licensed pi-optchat tree primitives; the surrounding core and ports are implemented here. Attribution and the upstream license are in `THIRD_PARTY_NOTICES.md`. The original pi-optchat checkout is under ignored `.references/pi-optchat`, pinned by `spec/sources.json`. It is not a build dependency.

The Lisp oracle is a tracked, pinned Git submodule at `references/lisp`. It is needed for development parity checks, not for running the library. The TypeScript contract lives in `spec/MEMORY.md`; upstream references do not replace it.

## Evidence and limits

`npm run test:oracle` compares against the pinned Lisp code with the same deterministic asynchronous backend: receipts, both rendered views after each input, every immutable node, every compression source and every compression context. The fixture also closes and reopens memory. The generated counts are in `oracle-evidence.json`.

This exercises 130 inputs, including Unicode, split records, clipped results and view pressure. It does not prove equivalence for every completion order or policy, semantic summary quality, provider cache savings or durable disk recovery. Separate tests cover failure, cancellation, storage confirmation, concurrency, usage accounting and corruption; property checks cover Unicode splitting and merge order across 20,001 appends.
