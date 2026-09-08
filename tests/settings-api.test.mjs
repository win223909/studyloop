import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';

async function fixture(t, extraEnv = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-settings-api-'));
  const filePath = path.join(directory, '.env');
  const calls = [];
  const options = {
    env: { DATA_DIR: path.join(directory, 'data'), ...extraEnv },
    settingsPath: filePath,
    providerOptions: {
      fetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  };
  const app = await createApp(options);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function request(endpoint, body, headers = {}) {
    const init = {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    // fetch rewrites Host; use HTTP directly to actually test the DNS-rebinding guard.
    const response = headers.Host
      ? await new Promise((resolve, reject) => {
          const req = httpRequest(base + endpoint, init, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: res.statusCode,
                  headers: res.headers,
                }),
              ),
            );
          });
          req.on('error', reject);
          req.end(init.body);
        })
      : await fetch(base + endpoint, init);
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { request, filePath, options, calls };
}

test('settings API requires direct local access, matching origin and session token', async (t) => {
  const { request, filePath } = await fixture(t, { LLM_API_KEY: 'settings-test-key' });
  const initial = await request('/api/settings');
  assert.equal(initial.data.editable, true);
  assert.equal(initial.data.secrets.LLM_API_KEY, true);
  assert.equal(JSON.stringify(initial.data).includes('settings-test-key'), false);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  const body = { values: { LLM_MODEL: 'test-model' }, revision: initial.data.revision };
  assert.equal((await request('/api/settings', body)).status, 403);
  assert.equal(
    (await request('/api/settings', body, { 'X-Settings-Token': '0'.repeat(64) })).status,
    403,
  );
  const token = { 'X-Settings-Token': initial.data.csrfToken };
  assert.equal(
    (await request('/api/settings', body, { ...token, Origin: 'https://unrelated.example' }))
      .status,
    403,
  );
  assert.equal((await request('/api/settings', body, { ...token, Origin: '' })).status, 403);
  for (const headers of [
    { 'X-Forwarded-For': '127.0.0.1' },
    { Forwarded: 'for=127.0.0.1' },
    { Host: 'rebind.example' },
  ]) {
    assert.equal(
      (await request('/api/settings', undefined, headers)).data.editable,
      false,
      JSON.stringify(headers),
    );
    assert.equal((await request('/api/settings', body, { ...token, ...headers })).status, 403);
  }
  await assert.rejects(readFile(filePath), { code: 'ENOENT' });
});

test('save applies availability now and after restart; probes do not persist or expose keys', async (t) => {
  const { request, filePath, calls, options } = await fixture(t);
  const first = (await request('/api/settings')).data;
  const candidate = {
    values: {
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'https://model.example/v1',
      LLM_MODEL: 'test-main',
      LLM_REVIEW_MODEL: 'test-review',
    },
    secrets: { LLM_API_KEY: 'settings-probe-placeholder' },
    revision: first.revision,
  };
  const headers = { 'X-Settings-Token': first.csrfToken };
  const probe = await request('/api/settings/test', candidate, headers);
  assert.equal(probe.status, 200);
  assert.deepEqual(probe.data.models, ['test-main', 'test-review']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, 'Bearer settings-probe-placeholder');
  assert.equal(JSON.stringify(calls[0].body).includes('studyloop-configuration-test'), true);
  assert.equal(JSON.stringify(probe.data).includes('settings-probe-placeholder'), false);
  await assert.rejects(readFile(filePath), { code: 'ENOENT' });
  assert.equal((await request('/api/config')).data.generationAvailable, false);
  const saved = await request('/api/settings', candidate, headers);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.config.generationAvailable, true);
  assert.equal((await request('/api/config')).data.generationAvailable, true);
  assert.equal(calls.length, 2, 'saving must not contact the model');
  assert.equal(JSON.stringify(saved.data).includes('settings-probe-placeholder'), false);
  const serialized = await readFile(filePath, 'utf8');
  assert.equal((await request('/api/settings', candidate, headers)).status, 409);
  const changedHost = {
    values: { LLM_BASE_URL: 'https://other.example/v1' },
    revision: saved.data.revision,
  };
  assert.equal((await request('/api/settings/test', changedHost, headers)).status, 400);
  assert.equal(calls.length, 2);
  assert.equal(await readFile(filePath, 'utf8'), serialized);

  const rebooted = await createApp(options);
  const rebootServer = rebooted.listen(0, '127.0.0.1');
  await new Promise((resolve) => rebootServer.once('listening', resolve));
  try {
    const current = await (
      await fetch(`http://127.0.0.1:${rebootServer.address().port}/api/config`)
    ).json();
    assert.equal(current.generationAvailable, true);
  } finally {
    await new Promise((resolve) => rebootServer.close(resolve));
  }
});

test('shared instance login is still required for local configuration', async (t) => {
  const { request } = await fixture(t, { INSTANCE_PASSWORD: 'test-only-password' });
  assert.equal((await request('/api/settings')).status, 401);
  assert.equal((await request('/api/login', { password: 'test-only-password' })).status, 200);
  assert.equal((await request('/api/settings')).data.editable, true);
  assert.equal(
    (await request('/api/settings', undefined, { 'X-Real-IP': '192.0.2.1' })).data.editable,
    false,
  );
});

test('saving is rejected during active generation and succeeds after the request finishes', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-settings-active-'));
  const filePath = path.join(directory, '.env');
  let releaseGeneration;
  let markStarted;
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const observedModels = [];
  const app = await createApp({
    env: {
      DATA_DIR: path.join(directory, 'data'),
      LLM_MODEL: 'before-save-model',
      LLM_API_KEY: 'active-generation-test-placeholder',
    },
    settingsPath: filePath,
    core: {
      createPlan: async (input, options) => {
        observedModels.push(options.env.LLM_MODEL);
        markStarted();
        await generationGate;
        observedModels.push(options.env.LLM_MODEL);
        return {
          title: input.topic,
          description: 'Synthetic outline for a settings concurrency regression.',
          subject: 'Science',
          level: input.level,
          language: input.language,
          objectives: ['Describe the synthetic lesson'],
          sources: [{ id: 'source-1', title: input.topic, kind: 'upload', text: input.text }],
        };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let pendingGeneration;
  t.after(async () => {
    releaseGeneration();
    await pendingGeneration?.catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function request(endpoint, body, headers = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { Origin: base }),
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  const initial = (await request('/api/settings')).data;
  const headers = { 'X-Settings-Token': initial.csrfToken };
  const baseline = await request('/api/settings', { revision: initial.revision }, headers);
  assert.equal(baseline.status, 200);
  const originalFile = await readFile(filePath, 'utf8');
  const form = new FormData();
  for (const [key, value] of Object.entries({
    topic: 'Synthetic science lesson',
    level: 'Beginner',
    language: 'en',
    mode: 'text',
    text: 'Synthetic source text used only to test generation and settings coordination. '.repeat(
      8,
    ),
  }))
    form.set(key, value);
  pendingGeneration = request('/api/plans', form);
  await Promise.race([
    started,
    pendingGeneration.then(() => {
      throw new Error('Generation ended before reaching the test gate.');
    }),
  ]);
  const proposed = { revision: baseline.data.revision, values: { LLM_MODEL: 'after-save-model' } };
  try {
    const rejected = await request('/api/settings', proposed, headers);
    assert.equal(rejected.status, 409);
    assert.match(rejected.data.error, /generation/);
    assert.equal(await readFile(filePath, 'utf8'), originalFile);
    assert.equal((await request('/api/settings')).data.values.LLM_MODEL, 'before-save-model');
  } finally {
    releaseGeneration();
  }
  assert.equal((await pendingGeneration).status, 201);
  assert.deepEqual(observedModels, ['before-save-model', 'before-save-model']);
  const saved = await request('/api/settings', proposed, headers);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.values.LLM_MODEL, 'after-save-model');
  assert.equal(saved.data.config.generationAvailable, true);
  assert.equal(JSON.stringify(saved.data).includes('active-generation-test-placeholder'), false);
});
