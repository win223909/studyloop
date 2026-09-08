import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  classifyOpenMAICRequest,
  createOpenMAICProxy,
} from '../server/integrations/openmaic-proxy.js';

const TOKEN = 'synthetic-internal-runtime-token-for-proxy-tests';
const classify = (url, method = 'GET', options) =>
  classifyOpenMAICRequest({ url, method }, options);

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function fixture(t, handler, { parseJson = false, runtime, publicFiles } = {}) {
  const upstream = await listen(t, handler);
  let calls = 0;
  let finished = 0;
  const proxy = createOpenMAICProxy({
    runtime: runtime ?? {
      ensureRunning: async () => {
        calls++;
        return { url: upstream.url, token: TOKEN };
      },
    },
    publicFiles,
  });
  const frontend = await listen(t, async (req, res) => {
    if (parseJson && req.headers['content-type']?.startsWith('application/json')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      req.body = JSON.parse(Buffer.concat(chunks).toString());
    }
    req.originalUrl = req.url;
    await proxy(req, res);
    finished++;
  });
  return { url: frontend.url, calls: () => calls, finished: () => finished };
}

test('classifies only verified native pages and stateless API methods', () => {
  for (const url of [
    '/studyloop-launch',
    '/studio',
    '/generation-preview?sessionId=test',
    '/classroom/stage_123',
  ]) {
    assert.deepEqual(classify(url), { kind: 'page', generation: false, allowed: true });
    assert.equal(classify(url, 'POST').allowed, false);
  }
  assert.deepEqual(classify('/api/server-providers'), {
    kind: 'api',
    generation: false,
    allowed: true,
  });
  assert.equal(classify('/api/server-providers', 'POST').allowed, false);
  for (const url of [
    '/api/generate/scene-content',
    '/api/generate/scene-outlines-stream',
    '/api/generate/scene-actions',
    '/api/generate/agent-profiles',
    '/api/chat',
    '/api/quiz-grade',
  ]) {
    assert.deepEqual(classify(url, 'POST'), { kind: 'api', generation: true, allowed: true });
    assert.equal(classify(url).allowed, false);
  }
  assert.equal(classify('/'), null);
  assert.equal(classify('/api/attempts/example'), null);
  assert.equal(classify('/api/health'), null);
});

test('classroom cleanup exposes only its exact GET page and remains outside generation APIs', async (t) => {
  assert.deepEqual(classify('/studyloop-cleanup'), {
    kind: 'page',
    generation: false,
    allowed: true,
  });
  assert.equal(classify('/studyloop-cleanup?_rsc=fixture').allowed, true);
  for (const method of ['HEAD', 'POST', 'DELETE', 'PUT', 'OPTIONS'])
    assert.equal(classify('/studyloop-cleanup', method).allowed, false);
  for (const url of [
    '/studyloop-cleanup/extra',
    '/studyloop-cleanup/%2e%2e/api/persistence',
    '/studyloop-cleanup%2fextra',
  ])
    assert.equal(classify(url)?.allowed, false);
  assert.equal(classify('/api/attempt-deletions/fixture-attempt'), null);
  const requests = [];
  const current = await fixture(t, (req, res) => {
    requests.push(req.url);
    assert.equal(req.headers['x-studyloop-runtime'], TOKEN);
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Cleanup fixture</title>');
  });
  const response = await fetch(current.url + '/studyloop-cleanup');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Cleanup fixture/);
  assert.equal((await fetch(current.url + '/studyloop-cleanup', { method: 'POST' })).status, 404);
  assert.deepEqual(requests, ['/studyloop-cleanup']);
});

test('blocks shared persistence, jobs, voice registration and route-normalization escapes', () => {
  for (const url of [
    '/api/persistence/stages',
    '/api/agent/sessions',
    '/api/generate-classroom/job',
    '/api/jobs/job',
    '/api/classroom?id=someone',
    '/api/classroom-media/other/file',
    '/api/stages',
    '/api/stage-meta/other',
    '/api/folders',
    '/api/materials',
    '/api/usage',
    '/api/provider/probe-models',
    '/api/chat/pi',
    '/api/azure-voices',
    '/api/generate/voice',
    '/api/generate/tts',
    '/api/generate/image',
    '/api/proxy-media',
    '/workspace',
    '/workbench/new',
    '/eval/whiteboard',
    '/classroom/id/export',
    '/classroom/',
    '/studio/extra',
    '/_next/static/../../api/persistence/stages',
    '/_next/static/%2e%2e/private',
    '/_next/static/%252e%252e/private',
    '/_next/static/a%2fb',
    '/_next/static/a\\b',
    '//example.test/studio',
    '/_next/static/%00.js',
    '/_next/static/%zz',
  ])
    assert.equal(classify(url, url.startsWith('/api/') ? 'POST' : 'GET')?.allowed, false, url);
});

test('public build manifest is authoritative and image optimization only reads listed local assets', () => {
  assert.equal(classify('/avatars/teacher.png').allowed, true);
  assert.equal(classify('/vendor/gsap.min.js').allowed, true);
  assert.equal(classify('/vendor/private.json').allowed, false);
  assert.equal(classify('/_next/static/chunks/app/classroom/%5Bid%5D/page.js').allowed, true);
  const options = { publicFiles: new Set(['/avatars/teacher.png', '/brand/classroom.svg']) };
  assert.equal(classify('/brand/classroom.svg', 'GET', options).allowed, true);
  assert.equal(classify('/avatars/unknown.png', 'GET', options).allowed, false);
  assert.equal(
    classify('/_next/image?url=%2Favatars%2Fteacher.png&w=128&q=75', 'GET', options).allowed,
    true,
  );
  for (const source of [
    'http://127.0.0.1/private',
    'https://example.test/image.png',
    '//example.test/x',
    '/api/persistence/stage',
    '/avatars/unknown.png',
    '/avatars/teacher.png?secret=x',
  ]) {
    assert.equal(
      classify('/_next/image?url=' + encodeURIComponent(source), 'GET', options).allowed,
      false,
    );
  }
  assert.equal(
    classify('/_next/image?url=%2Favatars%2Fteacher.png&url=https://example.test', 'GET', options)
      .allowed,
    false,
  );
  assert.equal(classify('/_next/webpack-hmr').allowed, false);
});

test('rebuilds parsed JSON and forwards Next headers without caller credentials or forwarding authority', async (t) => {
  let observed;
  const { url } = await fixture(
    t,
    async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      observed = { headers: req.headers, body: Buffer.concat(chunks).toString(), url: req.url };
      res.setHeader('content-type', 'application/json');
      res.setHeader('set-cookie', 'upstream-session=private; Path=/');
      res.setHeader('x-studyloop-runtime', TOKEN);
      res.end('{"ok":true}');
    },
    { parseJson: true },
  );
  const source = '{ "lesson": "中文", "answers": [1, 2] }';
  const response = await fetch(url + '/api/generate/scene-content', {
    method: 'POST',
    body: source,
    headers: {
      'content-type': 'application/json',
      cookie: 'studyloop_session=private',
      authorization: 'Bearer synthetic-client-secret',
      'x-studyloop-runtime': 'forged',
      'x-forwarded-host': 'external.example',
      'x-forwarded-for': '10.0.0.1',
      forwarded: 'host=external.example',
      'proxy-authorization': 'Basic private',
      'x-api-key': 'synthetic-client-key',
      rsc: '1',
      'next-router-state-tree': '["",{}]',
      'next-url': '/generation-preview',
      accept: 'text/x-component',
    },
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(JSON.parse(observed.body), JSON.parse(source));
  assert.equal(Number(observed.headers['content-length']), Buffer.byteLength(observed.body));
  assert.equal(observed.headers['x-studyloop-runtime'], TOKEN);
  assert.equal(observed.headers.rsc, '1');
  assert.equal(observed.headers['next-router-state-tree'], '["",{}]');
  assert.equal(observed.headers['next-url'], '/generation-preview');
  for (const header of [
    'cookie',
    'authorization',
    'x-forwarded-host',
    'x-forwarded-for',
    'forwarded',
    'proxy-authorization',
    'x-api-key',
  ])
    assert.equal(observed.headers[header], undefined, header);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-studyloop-runtime'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('does not start runtime for disabled routes and rejects non-loopback runtime addresses', async (t) => {
  const blocked = await fixture(t, (_req, res) => res.end('should not reach runtime'));
  assert.equal((await fetch(blocked.url + '/api/persistence/stages')).status, 404);
  assert.equal(blocked.calls(), 0);
  for (const address of [
    'https://127.0.0.1:9999',
    'http://example.test',
    'http://localhost',
    'http://127.0.0.1/private',
    'http://name:password@127.0.0.1',
    'http://127.0.0.1?token=private',
  ]) {
    const current = await fixture(t, (_req, res) => res.end(), {
      runtime: { ensureRunning: async () => ({ url: address, token: TOKEN }) },
    });
    const response = await fetch(current.url + '/studio');
    assert.equal(response.status, 503, address);
    assert.ok(!(await response.text()).includes(address));
  }
});

test('sanitizes upstream HTTP errors and permits only internal allowlisted redirects', async (t) => {
  let mode = 'error';
  const { url } = await fixture(t, (_req, res) => {
    if (mode === 'error') {
      res.writeHead(429, { 'content-type': 'text/html', 'set-cookie': 'secret=private' });
      res.end(`<html>synthetic-provider-secret ${TOKEN}</html>`);
    } else {
      res.writeHead(307, { location: mode });
      res.end(TOKEN);
    }
  });
  let response = await fetch(url + '/studio');
  assert.equal(response.status, 429);
  let text = await response.text();
  assert.ok(!text.includes('synthetic-provider-secret') && !text.includes(TOKEN));
  assert.equal(response.headers.get('set-cookie'), null);
  for (const target of [
    'https://example.test/?token=' + TOKEN,
    '/api/persistence/stages',
    '/studio?token=' + TOKEN,
  ]) {
    mode = target;
    response = await fetch(url + '/studio', { redirect: 'manual' });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
    assert.ok(!(await response.text()).includes(TOKEN));
  }
  mode = '/classroom/synthetic-stage';
  response = await fetch(url + '/studio', { redirect: 'manual' });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), mode);
});

test('streams SSE promptly, sanitizes error events and holds completion until stream ends', async (t) => {
  let upstreamResponse;
  const current = await fixture(t, (_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"type":"delta","text":"你好"}\n\n');
  });
  const response = await fetch(current.url + '/api/chat', { method: 'POST', body: '{}' });
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(Buffer.from(first.value).toString(), /你好/);
  assert.equal(current.finished(), 0);
  upstreamResponse.write('data: {"type":"error","data":{"message":"synthetic-provider-secret ');
  upstreamResponse.end(TOKEN + '"}}\n\n');
  let rest = '';
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    rest += Buffer.from(part.value).toString();
  }
  assert.match(rest, /"type":"error"/);
  assert.ok(!rest.includes('synthetic-provider-secret') && !rest.includes(TOKEN));
  assert.equal(current.finished(), 1);
});

test('redacts runtime token across response chunks, including compressed successful responses', async (t) => {
  let compressed = false;
  const current = await fixture(t, (_req, res) => {
    res.setHeader('content-type', 'text/html');
    if (compressed) {
      res.setHeader('content-encoding', 'gzip');
      res.end(gzipSync(`<p>${TOKEN}</p>`));
    } else {
      res.write('<p>' + TOKEN.slice(0, 9));
      setImmediate(() => res.end(TOKEN.slice(9) + '</p>'));
    }
  });
  assert.equal(await (await fetch(current.url + '/studio')).text(), '<p>[redacted]</p>');
  compressed = true;
  const response = await fetch(current.url + '/studio');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(await response.text(), '<p>[redacted]</p>');
});

test('client cancellation closes the upstream stream and settles the proxy promise', async (t) => {
  let closed;
  const upstreamClosed = new Promise((resolve) => {
    closed = resolve;
  });
  const current = await fixture(t, (_req, res) => {
    res.on('close', closed);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(':ready\n\n');
  });
  const controller = new AbortController();
  const response = await fetch(current.url + '/api/chat', {
    method: 'POST',
    body: '{}',
    signal: controller.signal,
  });
  await response.body.getReader().read();
  controller.abort();
  await upstreamClosed;
  assert.equal(current.finished(), 1);
});

test('cancellation releases the proxy while shared runtime startup is still pending', async (t) => {
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const current = await fixture(t, (_req, res) => res.end(), {
    runtime: {
      ensureRunning: () => {
        entered();
        return new Promise(() => {});
      },
    },
  });
  const request = http.get(current.url + '/studio');
  request.on('error', () => {});
  await started;
  request.destroy();
  // Wait for the actual server-side close, without depending on the runtime.
  for (let turn = 0; turn < 20 && !current.finished(); turn++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(current.finished(), 1);
});

test('streams unparsed bodies and refuses oversized or encoded raw requests', async (t) => {
  let received;
  const current = await fixture(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = Buffer.concat(chunks).toString();
    res.end('ok');
  });
  const response = await fetch(current.url + '/api/chat', {
    method: 'POST',
    body: '{"messages":[]}',
  });
  assert.equal(await response.text(), 'ok');
  assert.equal(received, '{"messages":[]}');
  assert.equal(
    (
      await fetch(current.url + '/api/chat', {
        method: 'POST',
        body: gzipSync('{}'),
        headers: { 'content-encoding': 'gzip' },
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(current.url + '/api/chat', {
        method: 'POST',
        body: 'x'.repeat(16 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
});
