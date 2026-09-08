import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { loadSamples } from '../server/core/samples.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-classroom-test-'));
  const store = new Store(directory);
  const requests = [];
  const providerRequests = [];
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, headers: req.headers, body, method: req.method });
    if (options.upstream) return options.upstream(req, res, body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamUrl = await listen(upstream);
  let starts = 0;
  let refreshes = 0;
  const runtime = options.runtime || {
    status: () => ({
      installed: true,
      ready: starts > 0,
      state: starts ? 'ready' : 'stopped',
      version: 'test-build',
    }),
    ensureRunning: async () => {
      starts++;
      return { url: upstreamUrl, token: 'internal-runtime-test-only-token' };
    },
    refresh: async () => {
      refreshes++;
    },
    stop: async () => {},
  };
  const app = await createApp({
    env: { DATA_DIR: directory, ...options.env },
    store,
    openmaicRuntime: runtime,
    ...(options.settings ? { settingsPath: path.join(directory, '.env') } : {}),
    core: { providerConfig: () => ({ generationAvailable: true, searchAvailable: true }) },
    providerOptions: {
      fetch: async (url, init) => {
        providerRequests.push({ url, body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  });
  const server = http.createServer(app);
  const base = await listen(server);
  t.after(async () => {
    server.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
    await rm(directory, { recursive: true, force: true });
  });
  function browser() {
    let cookie = '';
    return {
      cookie: () => cookie,
      async request(endpoint, body, extra = {}) {
        const response = await fetch(base + endpoint, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...extra.headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const sessionCookie = response.headers
          .getSetCookie()
          .find(
            (value) =>
              value.startsWith('studyloop_session=') && !value.startsWith('studyloop_session=;'),
          );
        if (sessionCookie) cookie = sessionCookie.split(';')[0];
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          /* Native classroom pages and streams are not JSON. */
        }
        return { status: response.status, data, text, headers: response.headers };
      },
    };
  }
  return {
    base,
    store,
    browser,
    requests,
    providerRequests,
    starts: () => starts,
    refreshes: () => refreshes,
  };
}

async function submittedAttempt(browser) {
  const course = (await loadSamples())[0];
  const response = await browser.request(`/api/courses/${course.id}/attempts`, {
    answers: Object.fromEntries(course.questions.map((question) => [question.id, 'unknown'])),
  });
  assert.equal(response.status, 201);
  return response.data.attempt;
}

test('classroom handoffs use saved attempts, isolate owners, expire, and reuse active links', async (t) => {
  const instance = await fixture(t, {
    env: { OPENMAIC_URL: 'https://obsolete.example', LLM_API_KEY: 'private-test-key' },
  });
  const first = instance.browser();
  const second = instance.browser();
  const attempt = await submittedAttempt(first);
  const endpoint = `/api/attempts/${attempt.id}/classroom-handoff`;
  const [created, repeated] = await Promise.all([
    first.request(endpoint, { brief: 'FORGED-BROWSER-BRIEF', owner: 'FORGED-OWNER' }),
    first.request(endpoint, {}),
  ]);
  assert.equal(created.status, 200);
  assert.deepEqual(repeated.data, created.data);
  assert.equal(created.data.url, `/studyloop-launch?handoff=${created.data.id}`);
  assert.equal(instance.starts(), 0);
  assert.doesNotMatch(JSON.stringify(created.data), /private-test-key|obsolete\.example|FORGED/);
  const payload = await first.request(`/api/classroom-handoffs/${created.data.id}`);
  assert.equal(payload.data.courseTitle, attempt.courseTitle);
  assert.equal(payload.data.returnUrl, `/?attempt=${attempt.id}`);
  assert.match(payload.data.brief, /OpenMAIC/);
  assert.doesNotMatch(payload.text, /FORGED|private-test-key|studyloop_session/);
  assert.equal((await second.request(endpoint, {})).status, 404);
  assert.equal((await second.request(`/api/classroom-handoffs/${created.data.id}`)).status, 404);
  assert.equal((await first.request(`/api/classroom-handoffs/missing`)).status, 404);
  const record = await instance.store.get('classroom-handoffs', created.data.id);
  await instance.store.put('classroom-handoffs', record.id, {
    ...record,
    expiresAt: Date.now() - 1,
  });
  assert.equal((await first.request(`/api/classroom-handoffs/${record.id}`)).status, 410);
  const renewed = await first.request(endpoint, {});
  assert.notEqual(renewed.data.id, created.data.id);
  const config = await first.request('/api/config');
  assert.equal(config.data.openmaicAvailable, true);
  assert.equal(config.data.openmaicStatus.ready, false);
  assert.doesNotMatch(
    config.text,
    /private-test-key|obsolete\.example|internal-runtime-test-only-token/,
  );
});

test('classroom authentication, CSRF, root cookie migration, and StudyLoop API priority', async (t) => {
  const instance = await fixture(t, { env: { INSTANCE_PASSWORD: 'test-access' } });
  const browser = instance.browser();
  assert.equal((await browser.request('/studio')).status, 401);
  assert.equal((await browser.request('/api/server-providers')).status, 401);
  assert.equal(instance.starts(), 0);
  await browser.request('/api/login', { password: 'test-access' });
  const attempt = await submittedAttempt(browser);
  const migrated = await browser.request('/api/session');
  const cookies = migrated.headers.getSetCookie();
  assert.ok(cookies.some((value) => /Path=\/;/.test(value) && /HttpOnly/.test(value)));
  assert.ok(
    cookies.some((value) => /Path=\/api;/.test(value) && /Expires=Thu, 01 Jan 1970/.test(value)),
  );
  const retainedCookie = browser.cookie();
  const other = instance.browser();
  await other.request('/api/session');
  const duplicate = await browser.request('/api/attempts', undefined, {
    headers: { cookie: `${retainedCookie}; ${other.cookie()}` },
  });
  assert.equal(duplicate.data.attempts[0].id, attempt.id);
  assert.equal(browser.cookie(), retainedCookie);
  const crossSite = {
    headers: { Origin: 'https://unrelated.example', 'Sec-Fetch-Site': 'cross-site' },
  };
  assert.equal(
    (await browser.request(`/api/attempts/${attempt.id}/classroom-handoff`, {}, crossSite)).status,
    403,
  );
  assert.equal((await browser.request('/api/generate/scene-content', {}, crossSite)).status, 403);
  assert.equal((await browser.request('/studio', {}, crossSite)).status, 403);
  assert.equal(instance.starts(), 0);
  assert.equal((await browser.request('/api/health')).data.status, 'ok');
  assert.equal(instance.starts(), 0);
  const studio = await browser.request('/studio');
  assert.equal(studio.status, 200);
  assert.match(studio.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
  assert.match(studio.headers.get('content-security-policy'), /script-src-attr 'unsafe-inline'/);
  assert.match(studio.headers.get('content-security-policy'), /katex@0\.16\.9/);
  assert.match(studio.headers.get('content-security-policy'), /three@0\.160\.0/);
  const configPolicy = (await browser.request('/api/config')).headers.get(
    'content-security-policy',
  );
  assert.match(configPolicy, /script-src 'self';/);
  assert.doesNotMatch(configPolicy, /katex@|three@/);
  assert.equal(instance.requests[0].headers.cookie, undefined);
});

test('proxy rejects shared runtime storage and forwards only internal authority', async (t) => {
  const instance = await fixture(t);
  const browser = instance.browser();
  for (const endpoint of [
    '/api/persistence/classrooms',
    '/api/agent/status',
    '/api/jobs/job-id',
    '/api/classroom/shared-id',
    '/api/stages',
    '/api/generate/voice',
    '/api/generate/tts',
    '/workbench',
  ])
    assert.equal(
      (await browser.request(endpoint, endpoint.startsWith('/api/generate') ? {} : undefined))
        .status,
      404,
    );
  assert.equal(instance.starts(), 0);
  const response = await browser.request('/api/server-providers', undefined, {
    headers: {
      authorization: 'Bearer browser-test-secret',
      'x-studyloop-runtime': 'forged-browser-token',
      'x-forwarded-host': 'unrelated.example',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(
    instance.requests[0].headers['x-studyloop-runtime'],
    'internal-runtime-test-only-token',
  );
  assert.equal(instance.requests[0].headers.authorization, undefined);
  assert.equal(instance.requests[0].headers.cookie, undefined);
  assert.equal(instance.requests[0].headers['x-forwarded-host'], undefined);
  assert.doesNotMatch(response.text, /internal-runtime|forged-browser|browser-test-secret/);
});

test('classroom generation holds concurrency until streamed responses finish and uses the daily cap', async (t) => {
  let finish;
  let began;
  const streaming = new Promise((resolve) => {
    began = resolve;
  });
  const instance = await fixture(t, {
    env: { MAX_CONCURRENT_GENERATIONS: '1', DAILY_GENERATION_LIMIT: '1' },
    upstream(req, res) {
      if (req.url === '/api/server-providers') {
        res.setHeader('content-type', 'application/json');
        res.end('{"providers":[]}');
        return;
      }
      res.setHeader('content-type', 'text/event-stream');
      res.write('data: {"type":"progress","message":"Generating"}\n\n');
      finish = () => res.end('data: {"type":"complete"}\n\n');
      began();
    },
  });
  const browser = instance.browser();
  await browser.request('/api/session');
  const pending = browser.request('/api/generate/scene-content', { topic: 'fractions' });
  await streaming;
  assert.equal((await browser.request('/api/chat', {})).status, 429);
  assert.equal((await browser.request('/api/server-providers')).status, 200);
  finish();
  const completed = await pending;
  assert.equal(completed.status, 200);
  assert.match(completed.text, /complete/);
  assert.equal((await browser.request('/api/chat', {})).status, 429);
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(await instance.store.get('usage', day), { count: 1 });
});

test('native runtime failures never return raw provider details or internal tokens', async (t) => {
  const instance = await fixture(t, {
    upstream(_req, res) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.setHeader('set-cookie', 'upstream-private=do-not-forward');
      res.end('{"error":"provider-test-secret internal-runtime-test-only-token"}');
    },
  });
  const response = await instance.browser().request('/api/server-providers');
  assert.ok(response.status >= 500);
  assert.match(response.data.error, /classroom/i);
  assert.doesNotMatch(response.text, /provider-test-secret|internal-runtime-test-only-token/);
  assert.ok(response.headers.getSetCookie().every((value) => !value.includes('upstream-private')));
});

test('testing an unsaved configuration leaves the classroom runtime unchanged; saving refreshes it', async (t) => {
  const instance = await fixture(t, { settings: true });
  const browser = instance.browser();
  const snapshot = (await browser.request('/api/settings')).data;
  const headers = { Origin: instance.base, 'X-Settings-Token': snapshot.csrfToken };
  const invalidTest = await browser.request(
    '/api/settings/test',
    {
      revision: snapshot.revision,
      values: { LLM_PROVIDER: 'unsupported-test-provider' },
    },
    { headers },
  );
  assert.equal(invalidTest.status, 400);
  assert.equal(instance.refreshes(), 0);
  const probe = await browser.request(
    '/api/settings/test',
    {
      revision: snapshot.revision,
      values: {
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'https://model.example/v1',
        LLM_MODEL: 'unsaved-test-model',
      },
      secrets: { LLM_API_KEY: 'unsaved-test-only-key' },
    },
    { headers },
  );
  assert.equal(probe.status, 200);
  assert.equal(instance.providerRequests.length, 1);
  assert.equal(instance.providerRequests[0].body.model, 'unsaved-test-model');
  assert.equal(instance.refreshes(), 0);
  const unchanged = (await browser.request('/api/settings')).data;
  assert.equal(unchanged.values.LLM_MODEL, snapshot.values.LLM_MODEL);
  assert.equal(unchanged.secrets.LLM_API_KEY, false);
  assert.equal(unchanged.revision, snapshot.revision);
  assert.doesNotMatch(probe.text, /unsaved-test-only-key/);
  const saved = await browser.request(
    '/api/settings',
    {
      revision: snapshot.revision,
      values: { LLM_MODEL: 'test-model' },
    },
    { headers },
  );
  assert.equal(saved.status, 200);
  assert.equal(instance.refreshes(), 1);
  assert.equal(saved.data.values.LLM_MODEL, 'test-model');
});
