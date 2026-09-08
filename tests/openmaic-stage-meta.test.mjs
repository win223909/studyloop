import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { classifyOpenMAICRequest } from '../server/integrations/openmaic-proxy.js';

const source = await readFile(
  new URL('../integrations/openmaic/overlay/lib/classroom/stage-meta-client.ts', import.meta.url),
  'utf8',
);
const script = new vm.Script(stripTypeScriptTypes(source).replace(/^export /gm, ''));
function client(embedded) {
  const context = vm.createContext({
    process: { env: { NEXT_PUBLIC_STUDYLOOP_EMBEDDED: embedded } },
    console: { warn() {} },
  });
  script.runInContext(context);
  return vm.runInContext('fetchStageMeta', context);
}

test('embedded classroom metadata uses the local fallback without requesting the shared sidecar', async () => {
  let requests = 0;
  const result = await client('true')('local-classroom', async () => {
    requests++;
    throw new Error('The cloud sidecar must not be requested.');
  });
  assert.equal(requests, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { outcome: 'absent' });
  assert.equal(
    classifyOpenMAICRequest({ url: '/api/stage-meta/local-classroom', method: 'GET' }).allowed,
    false,
    'Do not expose shared persistence to silence a local classroom request.',
  );
});

test('nonembedded metadata retains owner facts and distinguishes an absent sidecar from an outage', async () => {
  for (const embedded of [undefined, 'false']) {
    const fetchStageMeta = client(embedded);
    let request;
    const found = await fetchStageMeta('classroom/id', async (url, options) => {
      request = { url, options };
      return Response.json({
        isOwner: false,
        isPublic: true,
        generationComplete: true,
        publishedAt: 123,
        source: 'fixture',
      });
    });
    assert.equal(request.url, '/api/stage-meta/classroom%2Fid');
    assert.equal(request.options.credentials, 'include');
    assert.equal(request.options.cache, 'no-store');
    assert.deepEqual(JSON.parse(JSON.stringify(found)), {
      outcome: 'found',
      meta: {
        isOwner: false,
        isPublic: true,
        publishedAt: 123,
        generationComplete: true,
        source: 'fixture',
      },
    });
    assert.equal(
      (await fetchStageMeta('id', async () => new Response('', { status: 404 }))).outcome,
      'absent',
    );
    assert.equal(
      (await fetchStageMeta('id', async () => new Response('', { status: 500 }))).outcome,
      'unavailable',
    );
    assert.equal(
      (
        await fetchStageMeta('id', async () => {
          throw new Error('offline');
        })
      ).outcome,
      'unavailable',
    );
  }
});
