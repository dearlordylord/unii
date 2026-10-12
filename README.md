# UNII memory core

Independent TypeScript implementation of the UNII memory core, with the Lisp implementation as a pinned behavioral oracle. MIT licensed. No production dependencies. Node.js 22 or later.

The specification lives in [spec/MEMORY.md](spec/MEMORY.md). The current integration boundaries and validation limits are in [docs/BOUNDARIES.md](docs/BOUNDARIES.md).

## Install

The npm package name is `@firfi/unii` (UNII). This version is prepared for publication; it has not yet been published. After publication, install with `npm install @firfi/unii`. Before publication, use the tarball built by `npm pack` or `npm link` for local development. This is an ESM package with TypeScript declarations.

## Use

```ts
import { Memory, InMemoryStorage } from '@firfi/unii';

const storage = new InMemoryStorage();
const memory = await Memory.open({ storage });
try {
  const receipt = await memory.append({ kind: 'user', text: 'Remember this.' });
  const snapshot = memory.snapshot({ before: receipt.endExclusive });
  if (snapshot.state === 'ready') console.log(snapshot.text);
} finally {
  await memory.close();
}
```

Short sources need no LLM. For longer sources, pass `backend` to `Memory.open` and call `settle()` to drive compression. The callback receives source, context and retry metadata, an AbortSignal, and an observation callback. Return the summary text. Report `{ kind: 'submission', payload }` for the actual provider request and `{ kind: 'usage', scope: 'attempt', counters: { input, output, cachedInput, cacheWriteInput } }` for available provider counters. Omit counters the provider does not report.

Use `attempts()`, `usage()`, `status()` and `subscribe()` for diagnostics. `records()`, `nodes()`, `zoom()` and `date()` expose stored material. A pending or failed snapshot has no usable prompt text.

InMemoryStorage keeps data only in its instance. Supply a Storage implementation for persistence; the core does not choose a filesystem path. Backend and Storage are exported TypeScript interfaces.

## Develop

```sh
git submodule update --init
npm ci --ignore-scripts
npm run check
```

The complete check needs Emacs for the Lisp oracle. Unit/property tests alone use `npm test`; `npm run build` creates the importable library in `dist`.

The optional original adaptation source is ignored by Git:

```sh
git clone https://github.com/jonaslsaa/pi-optchat .references/pi-optchat
git -C .references/pi-optchat checkout 2bdbd4df63c696fabc06ee9bc616245083069097
```

Source pins are in `spec/sources.json`. Adapted code is tracked normally and retains its MIT attribution. The Lisp reference is a submodule so its version can be updated deliberately.

## Methodology and attribution

[docs/METHODOLOGY.md](docs/METHODOLOGY.md) records the extraction process, reference roles, interface choices, validation and its limits. [docs/RELEASING.md](docs/RELEASING.md) records package checks and publication steps.

Copyright (c) 2026 Igor Loskutov. This implementation and its original documentation use the standard [MIT license](LICENSE), without additional exceptions. Tree primitives are adapted from Jonas Silva's MIT-licensed pi-optchat; its full copyright and permission notice are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the npm package.

The memory design is by [Victor Taelin](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449), originally OptChat, subsequently UniiChat. Upstream specification and prompt text are not bundled or relicensed. This is an independent implementation, not an official UNII release. The Lisp behavioral oracle is [unii-memory](https://github.com/dearlordylord/unii-memory), by Igor Loskutov. Implementation assistance: Codex:gpt-6-1-sol.
