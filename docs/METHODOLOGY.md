# Extraction and adaptation methodology

## Objective and authority

The objective was to make a reusable TypeScript memory core for an independent application. The user selected the existing Emacs Lisp implementation as the behavioral oracle and required preservation of memory observability. The library contract is recorded in `spec/MEMORY.md`; the exact reference revisions and their roles are recorded in `spec/sources.json`.

This work used interface extraction and behavioral differential testing. It was not a mechanical language translation, formal proof, live-provider benchmark or repeated optimization experiment.

## Reference selection

Earlier source review compared pi-optchat and optchat-durable against the Lisp implementation for use outside Pi. We selected pi-optchat's tree primitives as the adaptation starting point. Its standalone algorithmic helpers were useful without its Pi application integration. We did not copy its complete application, storage lifecycle or prompts.

The original pi-optchat checkout is retained under ignored `.references/pi-optchat`, pinned at `2bdbd4df63c696fabc06ee9bc616245083069097`. The Lisp oracle is a tracked Git submodule pinned at `7567c83f9b68a7d51c8971ade104a3d0a1f1ecde`. Neither is a runtime dependency. The original review artifacts remain in SlopChat under `docs/typescript-memory-comparison.md` and `docs/typescript-memory-source-review.md`; this document preserves the methodology within the extracted library itself.

## Boundary extraction

1. Identify core behavior: contiguous records, immutable binary summaries, merge order, main and compaction views, exclusive snapshot boundaries, compression admission, retries and readiness.
2. Separate application effects into two ports: Backend for compression and observations, Storage for ownership and persistence. Provider SDKs, credentials, prompts, UI and chat generation remain with the host application.
3. Adapt MIT-licensed tree primitives in `src/tree.ts`; implement the surrounding TypeScript facade, scheduler, storage contract and diagnostics. Preserve sources and contexts as inspectable request data and use owned copies at boundaries.
4. Implement an in-memory adapter to exercise the port without deciding a disk format. Require storage confirmation before receipts, exclusive ownership, atomic record batches and checkpoints, and fail-stop behavior after storage errors.
5. Preserve honest observations: actual payload when reported, retries, cancellation, failures and separate input/output/cache counters. Missing counters remain unknown; duplicate cumulative observations do not inflate totals. Diagnostic eviction does not erase aggregate runtime usage.

## Behavioral verification

Example tests exercise failure, cancellation, out-of-order completion, persistence confirmation, corrupt state, retries, immutable reads and usage accounting. Property-based checks verify Unicode splitting and merge selection against an independent rollback counter over 20,001 appends.

The differential fixture supplies the same inputs and deterministic asynchronous compression function to Lisp and TypeScript. After every append it compares the receipt and both rendered views. It also compares every immutable summary, every submitted source and every compaction context, and checks restoration after close/open. The pinned oracle revision is checked before execution. Counts are regenerated in `docs/oracle-evidence.json`.

The initial run matched 130 input operations, 131 stored records, 259 nodes and 235 compression sources and contexts. All 14 unit/property tests passed. No real LLM calls were made.

Matching this finite fixture is evidence for the tested behavior, not proof of equivalence for all schedules or policies. It establishes neither semantic summary quality nor provider cache savings. RAM reopening is not evidence of disk durability. Remaining boundaries are explicit in `docs/BOUNDARIES.md`.

## Reproduction and future changes

Initialize the pinned submodule, install the lockfile dependencies and run `npm run check`. The complete check includes type checking, unit/property tests, the Lisp fixture, build and installation of the packed artifact into a temporary consumer. Emacs is required only for the oracle check.

For future behavior changes, update the contract deliberately, retain source provenance, run the relevant tests and rerun the differential fixture. A mismatch must be explained rather than silently accepted by weakening the comparison. Update the oracle pin explicitly when adopting new Lisp behavior.

## Attribution preservation

Original implementation and documentation: Igor Loskutov, MIT. Adapted tree primitives: Jonas Silva, pi-optchat, MIT. Memory design: Victor Taelin, OptChat/UniiChat. Behavioral oracle: Igor Loskutov's Emacs Lisp unii-memory. Implementation assistance: Codex:gpt-6-1-sol.

The standard MIT license remains unchanged. Upstream design and prompt text are not bundled or relicensed; their attribution is recorded separately. Full notices travel with the npm artifact, and source copyright/SPDX headers survive compilation into JavaScript.
