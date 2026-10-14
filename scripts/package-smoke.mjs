// Copyright (c) 2026 Igor Loskutov. SPDX-License-Identifier: MIT
// Assisted-by: Codex:gpt-6-1-sol
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'unii-package-'));
function run(command, args, cwd = directory) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`${command}: ${result.error ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
try {
  const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], root));
  const paths = new Set(packed.files.map(file => file.path));
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'docs/METHODOLOGY.md', 'spec/MEMORY.md', 'dist/index.js', 'dist/index.d.ts']) {
    assert(paths.has(path), `Missing package file: ${path}`);
  }
  assert(![...paths].some(path => /^(?:references|\.references|node_modules|src|test|scripts)\//.test(path)), 'Development reference or source leaked into package');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed.filename)]);
  const installed = join(directory, 'node_modules/@firfi/unii');
  const metadata = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.license, 'MIT');
  assert.notEqual(metadata.private, true);
  assert(readFileSync(join(installed, 'THIRD_PARTY_NOTICES.md'), 'utf8').includes('Copyright (c) 2026 Jonas Silva'));
  assert(readFileSync(join(installed, 'dist/tree.js'), 'utf8').includes('Jonas Silva'));
  writeFileSync(join(directory, 'consumer.ts'), `import { Memory, InMemoryStorage, type Storage, type Backend } from '@firfi/unii';
const storage: Storage = new InMemoryStorage();
const backend: Backend = async request => request.source;
const memory = await Memory.open({ storage, backend });
try {
  const retries: number = memory.retryFailed();
  if (retries !== 0) throw new Error('Unexpected retry work');
  const receipt = await memory.append({ kind: 'user', text: 'Package consumer 🙂' });
  if (memory.snapshot({ before: receipt.endExclusive }).state !== 'ready') throw new Error('Snapshot incomplete');
} finally { await memory.close(); }
`);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts']);
  run(process.execPath, ['consumer.js']);
  console.log(`Package smoke passed: ${metadata.name}@${metadata.version}, declarations, runtime and attribution`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
