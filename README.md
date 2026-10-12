# UNII memory core

Independent TypeScript implementation of the UNII memory core, with the Lisp implementation as a pinned behavioral oracle. MIT licensed. No production dependencies. Node.js 22 or later.

The specification lives in [spec/MEMORY.md](spec/MEMORY.md). The current integration boundaries and validation limits are in [docs/BOUNDARIES.md](docs/BOUNDARIES.md).

## Use

```ts
import { Memory, InMemoryStorage } from '@dearlordylord/unii';

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

InMemoryStorage keeps data only in its instance. Supply a Storage implementation for persistence; the core does not choose a filesystem path. Backend and Storage are exported TypeScript interfaces. The package is currently private while the initial integration surface is evaluated.

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
