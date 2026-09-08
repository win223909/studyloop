import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createSettingsManager } from '../server/settings.js';
import { HttpError } from '../server/errors.js';

async function fixture(t, raw = '', initial = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-settings-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, '.env');
  if (raw !== null) await writeFile(filePath, raw, { mode: 0o600 });
  const env = { RUNTIME_UNRELATED: 'never-public-runtime-marker', ...initial };
  const manager = await createSettingsManager({ env, filePath });
  return { manager, env, filePath, directory };
}

const status = (expected) => (error) => error instanceof HttpError && error.status === expected;

test('the public example configuration, including automatic token selection, can be saved unchanged', async (t) => {
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const { manager, env } = await fixture(t, example);
  const before = await manager.read();
  assert.equal(before.values.LLM_TOKEN_PARAMETER, 'auto');
  const saved = await manager.save({ revision: before.revision, values: before.values });
  assert.equal(saved.values.LLM_TOKEN_PARAMETER, 'auto');
  assert.equal(env.LLM_TOKEN_PARAMETER, 'auto');
});

test('bootstrap applies only allowlisted file values; public snapshots expose no keys or unrelated environment', async (t) => {
  const { manager, env } = await fixture(
    t,
    [
      '# local-only sample configuration',
      'LLM_MODEL=file-model',
      'LLM_API_KEY=test-key-that-stays-server-side',
      'BRAVE_SEARCH_API_KEY=test-search-key-that-stays-server-side',
      'HOST=0.0.0.0',
      'PORT=9999',
      'INSTANCE_PASSWORD=ignored-file-password',
      'RUNTIME_UNRELATED=ignored-file-value',
    ].join('\n'),
    {
      LLM_MODEL: 'environment-model',
      HOST: '127.0.0.1',
      PORT: '3210',
      INSTANCE_PASSWORD: 'original-test-password',
    },
  );
  assert.equal(env.LLM_MODEL, 'file-model');
  assert.equal(env.LLM_API_KEY, 'test-key-that-stays-server-side');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.PORT, '3210');
  assert.equal(env.INSTANCE_PASSWORD, 'original-test-password');
  assert.equal(env.RUNTIME_UNRELATED, 'never-public-runtime-marker');
  const snapshot = await manager.read();
  assert.deepEqual(Object.keys(snapshot).sort(), ['revision', 'secrets', 'values']);
  assert.deepEqual(snapshot.secrets, { LLM_API_KEY: true, BRAVE_SEARCH_API_KEY: true });
  assert.equal(snapshot.values.LLM_TIMEOUT_MS, '90000');
  assert.equal(snapshot.values.DAILY_GENERATION_LIMIT, '20');
  assert.equal(
    Object.values(snapshot.values).every((value) => typeof value === 'string'),
    true,
  );
  assert.equal(Object.hasOwn(snapshot.values, 'LLM_API_KEY'), false);
  for (const value of [
    'test-key-that-stays-server-side',
    'test-search-key-that-stays-server-side',
    'never-public-runtime-marker',
    'original-test-password',
  ])
    assert.equal(JSON.stringify(snapshot).includes(value), false);
});

test('save round-trips special characters, preserves comments and unrelated multiline settings, and writes mode 0600', async (t) => {
  const unrelated =
    "UNRELATED='first line\nLLM_MODEL=this is data inside another value\nlast line'\n";
  const initial =
    '# Header stays\nHOST=127.0.0.1 # host stays\n' +
    unrelated +
    'export LLM_MODEL = old-model # model comment stays\nLLM_API_KEY=old-test-key # key comment stays\nLLM_API_KEY=second-old-test-key\n# Footer stays\n';
  const { manager, env, filePath } = await fixture(t, initial);
  const key = 'new-test-key# = $ \\ literal\\n single\'double"';
  const before = await manager.read();
  const saved = await manager.save({
    revision: before.revision,
    values: { LLM_MODEL: 'fresh-model', DAILY_GENERATION_LIMIT: '7' },
    secrets: { LLM_API_KEY: key },
  });
  const raw = await readFile(filePath, 'utf8');
  const parsed = parseEnv(raw);
  assert.equal(parsed.LLM_API_KEY, key);
  assert.equal(env.LLM_API_KEY, key);
  assert.equal(env.LLM_MODEL, 'fresh-model');
  assert.equal(env.DAILY_GENERATION_LIMIT, '7');
  assert.equal(parsed.UNRELATED, parseEnv(initial).UNRELATED);
  assert.ok(raw.includes(unrelated));
  assert.ok(raw.includes('# Header stays\nHOST=127.0.0.1 # host stays\n'));
  assert.ok(raw.includes('export LLM_MODEL = fresh-model # model comment stays'));
  assert.ok(raw.includes('# key comment stays'));
  assert.ok(raw.includes('# Footer stays'));
  assert.equal(raw.includes('old-test-key'), false);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.notEqual(saved.revision, before.revision);
  assert.equal(JSON.stringify(saved).includes(key), false);
  assert.deepEqual(await manager.read(), saved);
});

test('blank and omitted secrets retain existing values while null explicitly clears them', async (t) => {
  const { manager, env, filePath } = await fixture(
    t,
    'LLM_API_KEY=model-test-key\nBRAVE_SEARCH_API_KEY=search-test-key\n',
  );
  let snapshot = await manager.read();
  snapshot = await manager.save({
    revision: snapshot.revision,
    values: { LLM_MODEL: 'first-model' },
    secrets: { LLM_API_KEY: '' },
  });
  assert.equal(env.LLM_API_KEY, 'model-test-key');
  assert.equal(env.BRAVE_SEARCH_API_KEY, 'search-test-key');
  snapshot = await manager.save({
    revision: snapshot.revision,
    values: { LLM_MODEL: 'next-model' },
  });
  assert.equal(env.LLM_API_KEY, 'model-test-key');
  snapshot = await manager.save({
    revision: snapshot.revision,
    secrets: { LLM_API_KEY: null, BRAVE_SEARCH_API_KEY: null },
  });
  assert.deepEqual(snapshot.secrets, { LLM_API_KEY: false, BRAVE_SEARCH_API_KEY: false });
  assert.equal(env.LLM_API_KEY, '');
  assert.equal(env.BRAVE_SEARCH_API_KEY, '');
  assert.equal(parseEnv(await readFile(filePath, 'utf8')).LLM_API_KEY, '');
});

test('provider or base URL changes cannot silently reuse a stored model key, including preview', async (t) => {
  const { manager, env, filePath } = await fixture(
    t,
    'LLM_PROVIDER=openai-compatible\nLLM_BASE_URL=https://model.example/v1\nLLM_API_KEY=private-test-key\n',
  );
  const snapshot = await manager.read();
  const original = await readFile(filePath, 'utf8');
  for (const values of [
    { LLM_PROVIDER: 'anthropic' },
    { LLM_BASE_URL: 'https://another.example/v1' },
  ]) {
    for (const method of ['save', 'preview']) {
      for (const secrets of [undefined, { LLM_API_KEY: '' }])
        await assert.rejects(
          () => manager[method]({ revision: snapshot.revision, values, secrets }),
          status(400),
        );
    }
  }
  assert.equal(await readFile(filePath, 'utf8'), original);
  assert.equal(env.LLM_BASE_URL, 'https://model.example/v1');
  const saved = await manager.save({
    revision: snapshot.revision,
    values: { LLM_PROVIDER: 'anthropic', LLM_BASE_URL: 'https://another.example/v1' },
    secrets: { LLM_API_KEY: 'replacement-test-key' },
  });
  assert.equal(saved.secrets.LLM_API_KEY, true);
  assert.equal(env.LLM_API_KEY, 'replacement-test-key');
  const cleared = await manager.save({
    revision: saved.revision,
    values: { LLM_PROVIDER: 'gemini' },
    secrets: { LLM_API_KEY: null },
  });
  assert.equal(cleared.secrets.LLM_API_KEY, false);
});

test('preview validates a candidate without writing the file or changing runtime state', async (t) => {
  const { manager, env, filePath } = await fixture(
    t,
    'LLM_MODEL=old-model\nLLM_API_KEY=saved-test-key\n',
  );
  const snapshot = await manager.read();
  const originalEnv = { ...env };
  const originalFile = await readFile(filePath, 'utf8');
  const candidate = await manager.preview({
    revision: snapshot.revision,
    values: { LLM_MODEL: 'candidate-model' },
    secrets: { LLM_API_KEY: 'candidate-test-key' },
  });
  assert.equal(candidate.LLM_MODEL, 'candidate-model');
  assert.equal(candidate.LLM_API_KEY, 'candidate-test-key');
  assert.equal(candidate.RUNTIME_UNRELATED, 'never-public-runtime-marker');
  assert.deepEqual(env, originalEnv);
  assert.equal(await readFile(filePath, 'utf8'), originalFile);
  assert.deepEqual(await manager.read(), snapshot);
});

test('refreshing an externally changed endpoint does not authorize reuse of the runtime key', async (t) => {
  const { manager, filePath, env } = await fixture(
    t,
    'LLM_BASE_URL=https://first.example/v1\nLLM_API_KEY=saved-test-key\n',
  );
  await writeFile(filePath, 'LLM_BASE_URL=https://second.example/v1\nLLM_API_KEY=saved-test-key\n');
  const refreshed = await manager.read();
  assert.equal(refreshed.values.LLM_BASE_URL, 'https://second.example/v1');
  assert.equal(env.LLM_BASE_URL, 'https://first.example/v1');
  await assert.rejects(() => manager.preview({ revision: refreshed.revision }), status(400));
  await assert.rejects(() => manager.save({ revision: refreshed.revision }), status(400));
  const preview = await manager.preview({
    revision: refreshed.revision,
    secrets: { LLM_API_KEY: 'replacement-test-key' },
  });
  assert.equal(preview.LLM_BASE_URL, 'https://second.example/v1');
  assert.equal(preview.LLM_API_KEY, 'replacement-test-key');
});

test('a successfully cleared key is not restored from startup environment after external line deletion', async (t) => {
  const { manager, filePath, env } = await fixture(t, 'LLM_API_KEY=startup-test-key\n', {
    LLM_API_KEY: 'startup-test-key',
  });
  const initial = await manager.read();
  await manager.save({ revision: initial.revision, secrets: { LLM_API_KEY: null } });
  const contents = await readFile(filePath, 'utf8');
  await writeFile(filePath, contents.replace(/^LLM_API_KEY=.*\n/m, ''));
  const refreshed = await manager.read();
  assert.equal(refreshed.secrets.LLM_API_KEY, false);
  assert.equal((await manager.preview({ revision: refreshed.revision })).LLM_API_KEY, '');
  assert.equal(env.LLM_API_KEY, '');
});

test('revision guards reject stale saves and previews after external edits and serialize concurrent saves', async (t) => {
  const { manager, filePath } = await fixture(t, 'LLM_MODEL=initial\n# original note\n');
  const initial = await manager.read();
  await writeFile(filePath, 'LLM_MODEL=externally-edited\n# changed note\n');
  await assert.rejects(
    () => manager.save({ revision: initial.revision, values: { LLM_MODEL: 'stale' } }),
    status(409),
  );
  await assert.rejects(() => manager.preview({ revision: initial.revision }), status(409));
  const updated = await manager.read();
  assert.equal(updated.values.LLM_MODEL, 'externally-edited');
  const attempts = await Promise.allSettled([
    manager.save({ revision: updated.revision, values: { LLM_MODEL: 'first-writer' } }),
    manager.save({ revision: updated.revision, values: { LLM_MODEL: 'second-writer' } }),
  ]);
  assert.equal(attempts[0].status, 'fulfilled');
  assert.equal(attempts[1].status, 'rejected');
  assert.equal(attempts[1].reason.status, 409);
  assert.equal((await manager.read()).values.LLM_MODEL, 'first-writer');
});

test('unknown fields, wrong types, unsafe URLs, invalid limits and control characters fail without changes', async (t) => {
  const { manager, env, filePath } = await fixture(t, 'LLM_MODEL=unchanged\n');
  const snapshot = await manager.read();
  const original = await readFile(filePath, 'utf8');
  const originalEnv = { ...env };
  const invalidPayloads = [
    { values: { HOST: '0.0.0.0' } },
    { values: { INSTANCE_PASSWORD: 'test-password' } },
    { values: { LLM_API_KEY: 'test-key-in-wrong-place' } },
    { secrets: { RUNTIME_UNRELATED: 'test-value' } },
    { values: { LLM_TIMEOUT_MS: 90000 } },
    { values: { LLM_ALLOW_KEYLESS: true } },
    { values: { LLM_PROVIDER: 'invented-provider' } },
    { values: { LLM_TIMEOUT_MS: '999' } },
    { values: { LLM_MAX_OUTPUT_TOKENS: '20001' } },
    { values: { DAILY_GENERATION_LIMIT: '0' } },
    { values: { MAX_CONCURRENT_GENERATIONS: '5' } },
    { values: { LLM_MODEL: 'line\nbreak' } },
    { secrets: { LLM_API_KEY: 'line\nbreak' } },
    { unexpected: true },
    { values: [] },
    { secrets: [] },
  ];
  for (const url of [
    'javascript:alert(1)',
    'https://user:pass@example.org/v1',
    'https://@example.org/v1',
    'https://example.org/v1?key=test-key',
    'https://example.org/v1?',
    'https://example.org/#',
    'https://example.org/a\nb',
    'https://example.org/%0a',
  ])
    invalidPayloads.push({ values: { LLM_BASE_URL: url } });
  for (const payload of invalidPayloads) {
    await assert.rejects(
      () => manager.save({ revision: snapshot.revision, ...payload }),
      (error) =>
        status(400)(error) &&
        !error.message.includes('test-key') &&
        !error.message.includes('line\nbreak'),
    );
  }
  assert.deepEqual(env, originalEnv);
  assert.equal(await readFile(filePath, 'utf8'), original);
});

test('disabled and failed persistence never change runtime and do not echo file content or secrets', async (t) => {
  const env = { LLM_MODEL: 'old', LLM_API_KEY: 'private-test-key' };
  const disabled = await createSettingsManager({ env, filePath: false });
  const snapshot = await disabled.read();
  await assert.rejects(
    () => disabled.save({ revision: snapshot.revision, values: { LLM_MODEL: 'new' } }),
    status(503),
  );
  await assert.rejects(() => disabled.preview({ revision: snapshot.revision }), status(503));
  assert.equal(env.LLM_MODEL, 'old');
  const { directory } = await fixture(t, null);
  const missingParent = path.join(directory, 'missing-directory', '.env');
  const manager = await createSettingsManager({ env, filePath: missingParent });
  const before = await manager.read();
  await assert.rejects(
    () => manager.save({ revision: before.revision, values: { LLM_MODEL: 'new' } }),
    (error) =>
      status(500)(error) &&
      !error.message.includes(directory) &&
      !error.message.includes('private-test-key'),
  );
  assert.equal(env.LLM_MODEL, 'old');
  assert.equal(env.LLM_API_KEY, 'private-test-key');
  await assert.rejects(() => readFile(missingParent), { code: 'ENOENT' });
});

test('missing files can be created; symlinks and nonfiles are not replaced', async (t) => {
  const { manager, filePath, directory } = await fixture(t, null);
  const before = await manager.read();
  const saved = await manager.save({
    revision: before.revision,
    values: { LLM_MODEL: 'created-model' },
  });
  assert.equal(saved.values.LLM_MODEL, 'created-model');
  assert.equal(parseEnv(await readFile(filePath, 'utf8')).LLM_MODEL, 'created-model');
  const link = path.join(directory, 'linked.env');
  await symlink(filePath, link);
  await assert.rejects(() => createSettingsManager({ env: {}, filePath: link }), status(500));
  const folder = path.join(directory, 'folder.env');
  await mkdir(folder);
  await assert.rejects(() => createSettingsManager({ env: {}, filePath: folder }), status(500));
});
