import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cleanBuildEnvironment,
  createPnpmShim,
  directoryFiles,
  extractSourceArchive,
  filesHash,
  readSourceArchive,
  sha256,
} from '../scripts/openmaic-build-utils.mjs';

function member(name, body = '', type = '0') {
  const data = Buffer.from(body);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000644\0', 100, 8);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  header.write('ustar\0', 257, 6);
  const sum = header.reduce((value, byte) => value + byte, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
const archive = (...members) => gzipSync(Buffer.concat([...members, Buffer.alloc(1024)]));
const parse = (data) => readSourceArchive(data, sha256(data));

test('lifecycle scripts can invoke pnpm without a global package-manager shim', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop shim '));
  try {
    const bin = await createPnpmShim(path.join(directory, 'commands'));
    assert.match(await readFile(path.join(bin, 'pnpm.cmd'), 'utf8'), /corepack pnpm %\*/);
    if (process.platform === 'win32') return;
    await writeFile(path.join(directory, 'corepack'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
      mode: 0o755,
    });
    const result = spawnSync('pnpm', ['--version'], {
      env: { PATH: bin + path.delimiter + directory },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'pnpm\n--version\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('verified source archive extracts nested files into an empty directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-source-'));
  try {
    const data = archive(
      member('app/page.tsx', 'export default 1'),
      member('.env.example', 'KEY=\n'),
    );
    await extractSourceArchive(parse(data), directory);
    assert.equal(await readFile(path.join(directory, 'app/page.tsx'), 'utf8'), 'export default 1');
    await assert.rejects(extractSourceArchive(parse(data), directory), /empty real directory/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('source hash is checked before decompression', () => {
  assert.throws(() => readSourceArchive(Buffer.from('not gzip'), '0'.repeat(64)), /SHA-256/);
});

test('archive rejects traversal, absolute paths, private files and links', () => {
  for (const filename of [
    '../escape',
    '/tmp/escape',
    'safe/../../escape',
    'C:/escape',
    'safe\\escape',
    '.env.local',
    'data/classroom.json',
    'node_modules/file',
  ])
    assert.throws(() => parse(archive(member(filename))), /Unsafe|Private/);
  for (const type of ['1', '2', '3', '4', '6'])
    assert.throws(() => parse(archive(member('link', '', type))), /links and special/);
});

test('PAX paths cannot bypass traversal validation', () => {
  const record = 'path=../escape\n';
  let length = record.length + 2;
  while (`${length} ${record}`.length !== length) length = `${length} ${record}`.length;
  assert.throws(
    () => parse(archive(member('pax', `${length} ${record}`, 'x'), member('safe'))),
    /Unsafe/,
  );
});

test('archive rejects checksum corruption, duplicate files and decompression excess', () => {
  const corrupt = member('file', 'hello');
  corrupt[0] ^= 1;
  assert.throws(() => parse(archive(corrupt)), /checksum/);
  assert.throws(() => parse(archive(member('file'), member('file'))), /Duplicate/);
  const large = archive(member('file', 'a'.repeat(10000)));
  assert.throws(() => readSourceArchive(large, sha256(large), { maxBytes: 1024 }));
});

test('overlay rejects symlinks instead of following external content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-overlay-'));
  try {
    await symlink('/outside-private-file', path.join(directory, 'copy'));
    await assert.rejects(directoryFiles(directory), /symlinks/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('build environment omits provider credentials and disables optional server features', () => {
  const clean = cleanBuildEnvironment({
    PATH: '/bin',
    HOME: '/tmp/home',
    LLM_API_KEY: 'private',
    OPENAI_API_KEY: 'private',
    DATABASE_URL: 'private',
    NEXT_PUBLIC_PERSISTENCE: 'true',
    NEXT_PUBLIC_PRO_WORKBENCH_ENABLED: 'true',
    NODE_OPTIONS: '--require=private',
  });
  assert.equal(clean.PATH, '/bin');
  assert.equal(clean.NEXT_PUBLIC_STUDYLOOP_EMBEDDED, 'true');
  assert.equal(clean.NEXT_PUBLIC_PERSISTENCE, '');
  assert.equal(clean.NEXT_PUBLIC_PRO_WORKBENCH_ENABLED, '');
  for (const key of ['LLM_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL', 'NODE_OPTIONS'])
    assert.equal(clean[key], undefined);
});

test('overlay cache key is stable by path and changes with source content', () => {
  const a = { path: 'a', data: Buffer.from('one') };
  const b = { path: 'b', data: Buffer.from('two') };
  assert.equal(filesHash([a, b]), filesHash([b, a]));
  assert.notEqual(filesHash([a, b]), filesHash([a, { ...b, data: Buffer.from('changed') }]));
});
