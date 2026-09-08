import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createOpenMAICRuntime,
  openMAICEnvironment,
} from '../server/integrations/openmaic-runtime.js';

const internalOptions = { port: 12345, token: 'runtime-unit-test-token', systemEnv: {} };

test('runtime environment copies only required system variables and the selected model configuration', () => {
  const env = {
    LLM_PROVIDER: 'openai-compatible',
    LLM_MODEL: 'test-model',
    LLM_API_KEY: 'selected-test-key',
    LLM_BASE_URL: 'https://model.example/v1',
    LLM_REVIEW_MODEL: 'separate-review-model',
    LLM_TIMEOUT_MS: '45000',
    LLM_MAX_OUTPUT_TOKENS: '4096',
    INSTANCE_PASSWORD: 'instance-test-password',
    BRAVE_SEARCH_API_KEY: 'search-test-key',
    DATA_DIR: '/private-test-data',
    OPENMAIC_URL: 'https://obsolete.example',
  };
  const before = { ...env };
  const systemEnv = {
    PATH: '/test/bin',
    HOME: '/test/home',
    LANG: 'en_US.UTF-8',
    OPENAI_API_KEY: 'unrelated-openai-test-key',
    ANTHROPIC_API_KEY: 'unrelated-anthropic-test-key',
    AWS_SECRET_ACCESS_KEY: 'unrelated-cloud-test-key',
    NEXT_PUBLIC_PERSISTENCE_TOKEN: 'public-test-token',
    NODE_OPTIONS: '--require=/unrelated-script.js',
    IMAGE_OPENAI_ENABLED: 'true',
  };
  const result = openMAICEnvironment(env, { ...internalOptions, systemEnv });
  assert.deepEqual(env, before);
  assert.equal(result.PATH, systemEnv.PATH);
  assert.equal(result.HOME, systemEnv.HOME);
  assert.equal(result.OPENAI_API_KEY, 'selected-test-key');
  assert.equal(result.OPENAI_MODELS, 'test-model');
  assert.equal(result.DEFAULT_MODEL, 'openai:test-model');
  assert.equal(result.HOSTNAME, '127.0.0.1');
  assert.equal(result.PORT, '12345');
  assert.equal(result.STUDYLOOP_RUNTIME_TOKEN, internalOptions.token);
  assert.equal(result.STUDYLOOP_LLM_TIMEOUT_MS, '45000');
  assert.equal(result.STUDYLOOP_LLM_MAX_OUTPUT_TOKENS, '4096');
  for (const key of [
    'INSTANCE_PASSWORD',
    'BRAVE_SEARCH_API_KEY',
    'DATA_DIR',
    'OPENMAIC_URL',
    'LLM_REVIEW_MODEL',
    'AWS_SECRET_ACCESS_KEY',
    'NEXT_PUBLIC_PERSISTENCE_TOKEN',
    'NODE_OPTIONS',
    'ANTHROPIC_API_KEY',
  ])
    assert.equal(result[key], undefined, key);
  const media = Object.entries(result).filter(([key]) => /^(IMAGE|VIDEO)_.*_ENABLED$/.test(key));
  assert.ok(media.length > 0);
  assert.ok(media.every(([, value]) => value === 'false'));
  assert.doesNotMatch(
    JSON.stringify(result),
    /unrelated-|instance-test-password|search-test-key|separate-review-model/,
  );
});

test('runtime maps OpenAI-compatible, Anthropic, Gemini, and keyless local model identifiers', () => {
  for (const [protocol, prefix, expectedDefault] of [
    ['openai-compatible', 'OPENAI', 'https://api.openai.com/v1'],
    ['openai', 'OPENAI', 'https://api.openai.com/v1'],
    ['anthropic', 'ANTHROPIC', 'https://api.anthropic.com/v1'],
    ['gemini', 'GOOGLE', 'https://generativelanguage.googleapis.com/v1beta'],
  ]) {
    const result = openMAICEnvironment(
      { LLM_PROVIDER: protocol, LLM_MODEL: ' model/id ', LLM_API_KEY: ' test-key ' },
      internalOptions,
    );
    assert.equal(result[prefix + '_API_KEY'], 'test-key');
    assert.equal(result[prefix + '_MODELS'], 'model/id');
    assert.equal(result[prefix + '_BASE_URL'], expectedDefault);
    assert.equal(result.DEFAULT_MODEL, prefix.toLowerCase() + ':model/id');
    assert.equal(Object.keys(result).filter((key) => key.endsWith('_API_KEY')).length, 1);
  }
  const local = openMAICEnvironment(
    {
      LLM_PROVIDER: 'openai-compatible',
      LLM_MODEL: 'local-model',
      LLM_ALLOW_KEYLESS: 'true',
      LLM_BASE_URL: 'http://127.0.0.1:1234/v1',
    },
    internalOptions,
  );
  assert.equal(local.DEFAULT_MODEL, 'ollama:local-model');
  assert.equal(local.OLLAMA_BASE_URL, 'http://127.0.0.1:1234/v1');
  assert.equal(local.OLLAMA_MODELS, 'local-model');
  assert.equal(
    Object.keys(local).some((key) => key.endsWith('_API_KEY')),
    false,
  );
});

test('missing credentials or unsupported protocols never inherit a usable provider from the host', () => {
  for (const env of [
    {},
    { LLM_MODEL: 'test-model' },
    { LLM_API_KEY: 'test-key' },
    { LLM_PROVIDER: 'unsupported', LLM_MODEL: 'test-model', LLM_API_KEY: 'test-key' },
    { LLM_PROVIDER: 'anthropic', LLM_MODEL: 'test-model', LLM_ALLOW_KEYLESS: 'true' },
  ]) {
    const result = openMAICEnvironment(env, {
      ...internalOptions,
      systemEnv: {
        OPENAI_API_KEY: 'host-test-key',
        OPENAI_MODELS: 'host-model',
        DEFAULT_MODEL: 'openai:host-model',
      },
    });
    assert.equal(result.DEFAULT_MODEL, undefined);
    assert.equal(
      Object.keys(result).some((key) => key.endsWith('_API_KEY')),
      false,
    );
    assert.doesNotMatch(JSON.stringify(result), /host-test-key|host-model/);
  }
});

async function runtimeFixture(
  t,
  { healthDelay = 0, invalidHealth = false, startupTimeout = 3000 } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'studyloop-runtime-test-'));
  const directory = path.join(root, '.runtime/openmaic/.next/standalone');
  await mkdir(directory, { recursive: true });
  // This temporary child implements health and inspection only. It cannot
  // generate lessons and has no provider/network integration.
  await writeFile(
    path.join(directory, 'server.js'),
    [
      "const http = require('node:http');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "fs.appendFileSync(path.join(__dirname, 'starts.jsonl'), JSON.stringify({pid:process.pid}) + '\\n');",
      'const born = Date.now();',
      'http.createServer((req,res) => {',
      "  res.setHeader('content-type','application/json');",
      "  if(req.headers['x-studyloop-runtime'] !== process.env.STUDYLOOP_RUNTIME_TOKEN) {",
      '    res.writeHead(401); res.end(\'{"error":"unauthorized"}\'); return;',
      '  }',
      "  if(req.url === '/api/health') {",
      '    if(Date.now() - born < ' +
        healthDelay +
        ") { res.writeHead(503); res.end('{}'); return; }",
      '    res.end(JSON.stringify({success:true,status:' +
        (invalidHealth ? "'invalid'" : "'ok'") +
        '})); return;',
      '  }',
      '  res.end(JSON.stringify({pid:process.pid,model:process.env.OPENAI_MODELS,keyPresent:Boolean(process.env.OPENAI_API_KEY)}));',
      '}).listen(Number(process.env.PORT), process.env.HOSTNAME);',
    ].join('\n'),
    { mode: 0o600 },
  );
  const env = {
    LLM_PROVIDER: 'openai-compatible',
    LLM_MODEL: 'first-test-model',
    LLM_API_KEY: 'fixture-only-key',
  };
  const runtime = createOpenMAICRuntime({ root, env, startupTimeout });
  t.after(async () => {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  });
  async function starts() {
    try {
      const text = await readFile(path.join(directory, 'starts.jsonl'), 'utf8');
      return text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  return { root, runtime, env, starts };
}

async function inspect(connection) {
  const response = await fetch(connection.url + '/inspect', {
    headers: { 'x-studyloop-runtime': connection.token },
    signal: AbortSignal.timeout(1000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('concurrent runtime starts share one owned child and stop leaves unrelated servers running', async (t) => {
  const { runtime, starts } = await runtimeFixture(t);
  const unrelated = http.createServer((_req, res) => res.end('unrelated-server'));
  await new Promise((resolve) => unrelated.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => unrelated.close(resolve)));
  const unrelatedUrl = 'http://127.0.0.1:' + unrelated.address().port;
  assert.equal(runtime.status().installed, true);
  assert.equal(runtime.status().ready, false);
  const connections = await Promise.all(Array.from({ length: 8 }, () => runtime.ensureRunning()));
  assert.ok(
    connections.every(
      (value) => value.url === connections[0].url && value.token === connections[0].token,
    ),
  );
  assert.equal((await starts()).length, 1);
  assert.equal(runtime.status().ready, true);
  assert.equal((await inspect(connections[0])).model, 'first-test-model');
  await Promise.all([runtime.stop(), runtime.stop()]);
  assert.equal(runtime.status().ready, false);
  await assert.rejects(fetch(connections[0].url, { signal: AbortSignal.timeout(1000) }));
  assert.equal(await (await fetch(unrelatedUrl)).text(), 'unrelated-server');
});

test('runtime refresh restarts with the saved configuration and a new internal token', async (t) => {
  const { runtime, env, starts } = await runtimeFixture(t);
  await runtime.refresh();
  assert.equal((await starts()).length, 0, 'an unused runtime stays lazy');
  const first = await runtime.ensureRunning();
  const original = await inspect(first);
  env.LLM_MODEL = 'updated-test-model';
  assert.equal((await inspect(first)).model, 'first-test-model');
  await runtime.refresh();
  const second = await runtime.ensureRunning();
  const changed = await inspect(second);
  assert.notEqual(second.token, first.token);
  assert.notEqual(changed.pid, original.pid);
  assert.equal(changed.model, 'updated-test-model');
  assert.equal((await starts()).length, 2);
});

test('invalid runtime health fails within the startup bound without exposing model credentials', async (t) => {
  const { runtime } = await runtimeFixture(t, { invalidHealth: true, startupTimeout: 500 });
  await assert.rejects(runtime.ensureRunning(), (error) => {
    assert.match(error.message, /could not start/);
    assert.doesNotMatch(error.message, /fixture-only-key|first-test-model/);
    return true;
  });
  assert.equal(runtime.status().ready, false);
});

test('an absent runtime stays unavailable and does not attempt an external installation', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'studyloop-missing-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = createOpenMAICRuntime({ root, env: {} });
  assert.equal(runtime.status().installed, false);
  await assert.rejects(runtime.ensureRunning(), /not installed/);
  await runtime.refresh();
  await runtime.stop();
  assert.equal(runtime.status().ready, false);
});

test('stopping an in-flight startup permits a fresh startup immediately afterwards', async (t) => {
  const { runtime, starts } = await runtimeFixture(t, { healthDelay: 500 });
  const pending = runtime.ensureRunning().then(
    () => 'ready',
    () => 'cancelled',
  );
  const deadline = Date.now() + 2000;
  while (!(await starts()).length && Date.now() < deadline) await delay(10);
  assert.equal((await starts()).length, 1);
  await runtime.stop();
  const fresh = await runtime.ensureRunning();
  assert.equal(await pending, 'cancelled');
  assert.equal((await inspect(fresh)).model, 'first-test-model');
  assert.equal((await starts()).length, 2);
});
