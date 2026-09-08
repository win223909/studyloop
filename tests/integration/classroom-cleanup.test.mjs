import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createApp } from '../../server/app.js';
import { createOpenMAICRuntime } from '../../server/integrations/openmaic-runtime.js';
import { loadSamples } from '../../server/core/samples.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

// Runs in an empty browser context at a random origin. Every row and byte below
// is synthetic; this test never opens a real browser profile or an API key file.
async function seedBrowserFixture({ attemptId, otherAttemptId, handoffId }) {
  const open = (name, upgrade) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => upgrade?.(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const write = async (name, rows, upgrade) => {
    const database = await open(name, upgrade);
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(Object.keys(rows), 'readwrite');
        transaction.oncomplete = resolve;
        transaction.onabort = transaction.onerror = () => reject(transaction.error);
        for (const [table, values] of Object.entries(rows))
          for (const value of values)
            if (value.externalKey !== undefined)
              transaction.objectStore(table).put(value.value, value.externalKey);
            else transaction.objectStore(table).put(value);
      });
    } finally {
      database.close();
    }
  };
  const stage = (id, refs = []) => ({
    id,
    name: `Synthetic ${id}`,
    createdAt: 1,
    updatedAt: 1,
    videoManifest: Object.fromEntries(refs.map((ref) => [ref, {}])),
  });
  const scene = (stageId, audioId) => ({
    id: `scene-${stageId}`,
    stageId,
    order: 0,
    type: 'quiz',
    title: 'Synthetic quiz',
    content: { type: 'quiz', questions: [] },
    actions: audioId ? [{ id: 'speech', type: 'speech', text: 'Synthetic', audioId }] : [],
  });
  const a = stage('delete-stage', [
    'owned-asset',
    'alias-delete',
    'shared-asset',
    'legacy-shared-asset',
    'compat-shared-asset',
    'undo-shared-audio',
  ]);
  const b = stage('keep-stage', ['shared-asset', 'alias-keep']);
  const oldDelete = stage('delete-legacy', ['legacy-owned-asset']);
  const oldKeep = stage('keep-legacy', ['legacy-shared-asset']);
  const scenes = [
    scene(a.id, 'owned-audio'),
    scene(b.id),
    scene(oldDelete.id),
    scene(oldKeep.id, 'legacy-shared-audio'),
  ];
  // This reference is held only by the surviving legacy classroom, including an
  // audio row indexed to A: global IDs must survive independent of that index.
  scenes[0].actions.push({
    id: 'shared-speech',
    type: 'speech',
    text: 'Shared',
    audioId: 'legacy-shared-audio',
  });
  scenes[0].actions.push({
    id: 'compat-speech',
    type: 'speech',
    text: 'Compat',
    audioId: 'compat-shared-audio',
  });
  scenes[0].actions.push({
    id: 'undo-speech',
    type: 'speech',
    text: 'Undo',
    audioId: 'undo-shared-audio',
  });
  const keepUndoScene = {
    ...scenes[1],
    actions: [{ id: 'undo-speech', type: 'speech', text: 'Undo', audioId: 'undo-shared-audio' }],
  };
  await write('maic-documents', {
    stages: [a, b].map((value) => ({ ...value, dslVersion: '0.3.0' })),
    scenes: scenes.slice(0, 2),
    outlines: [a, b].map((value) => ({
      stageId: value.id,
      outline: { outlines: [], generationComplete: true, createdAt: 1, updatedAt: 1 },
    })),
  });
  const blob = new Blob(['synthetic media'], { type: 'image/png' });
  await write('MAIC-Database', {
    stages: [a, b, oldDelete, oldKeep],
    scenes,
    stageOutlines: [a, b, oldDelete, oldKeep].map((value) => ({
      stageId: value.id,
      outlines: [],
      generationComplete: true,
    })),
    mediaFiles: [
      { id: `${a.id}:owned-asset`, stageId: a.id, type: 'image', blob },
      { id: `${a.id}:shared-asset`, stageId: a.id, type: 'image', blob },
      { id: `${b.id}:shared-asset`, stageId: b.id, type: 'image', blob },
      { id: `${b.id}:compat-shared-asset`, stageId: b.id, type: 'image', blob },
      { id: `${oldDelete.id}:legacy-owned-asset`, stageId: oldDelete.id, type: 'image', blob },
    ],
    audioFiles: [
      { id: 'owned-audio', stageId: a.id, blob, createdAt: 1 },
      { id: 'legacy-shared-audio', stageId: a.id, blob, createdAt: 1 },
      { id: 'compat-shared-audio', stageId: b.id, blob, createdAt: 1 },
      { id: 'undo-shared-audio', stageId: a.id, blob, createdAt: 1 },
    ],
    imageFiles: [
      { id: 'owned-asset', blob, createdAt: 1 },
      { id: 'legacy-shared-asset', blob, createdAt: 1 },
    ],
    snapshots: [
      { id: 1, index: 0, slides: [scenes[0], keepUndoScene] },
      { id: 2, index: 0, slides: [scenes[2]] },
    ],
    chatSessions: [
      { id: 'delete-chat', stageId: a.id },
      { id: 'keep-chat', stageId: b.id },
    ],
    chatRestoreStaging: [{ id: 'delete-chat', stageId: a.id }],
    agentEditSessions: [
      { id: 'delete-edit', stageId: a.id },
      { id: 'keep-edit', stageId: b.id },
    ],
    generatedAgents: [
      { id: 'delete-agent', stageId: a.id },
      { id: 'keep-agent', stageId: b.id },
    ],
    playbackState: [{ stageId: a.id }, { stageId: b.id }],
    stageFolders: [
      { stageId: a.id, folderId: 'folder' },
      { stageId: b.id, folderId: 'folder' },
    ],
    folders: [{ id: 'folder', name: 'Shared folder', order: 0 }],
  });
  await write(
    'maic-runtime',
    {
      sessions: [
        { id: 'delete-runtime', stageId: a.id, learnerKey: 'fixture' },
        { id: 'keep-runtime', stageId: b.id, learnerKey: 'fixture' },
      ],
      records: [
        { sessionId: 'delete-runtime', seq: 0, payload: { text: 'delete' } },
        { sessionId: 'keep-runtime', seq: 0, payload: { text: 'keep' } },
      ],
    },
    (database) => {
      const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('by-stage', 'stageId');
      sessions.createIndex('by-learner', 'learnerKey');
      sessions.createIndex('by-stage-learner', ['stageId', 'learnerKey']);
      database.createObjectStore('records', { keyPath: ['sessionId', 'seq'] });
    },
  );
  const assetHashes = {
    'owned-asset': 'unique-delete',
    'alias-delete': 'shared-hash',
    'alias-keep': 'shared-hash',
    'shared-asset': 'shared-reference-hash',
    'legacy-shared-asset': 'legacy-shared-hash',
    'legacy-owned-asset': 'legacy-unique-delete',
    'compat-shared-asset': 'compat-shared-hash',
    'undo-shared-audio': 'undo-shared-hash',
  };
  await write(
    'maic-asset-pool',
    {
      assets: Object.entries(assetHashes).map(([id, contentHash]) => ({
        externalKey: id,
        value: { contentHash, mime: 'image/png', meta: {} },
      })),
      blobs: [...new Set(Object.values(assetHashes))].map((hash) => ({
        externalKey: hash,
        value: new Uint8Array([1, 2, 3]).buffer,
      })),
    },
    (database) => {
      database.createObjectStore('assets').createIndex('by-content-hash', 'contentHash');
      database.createObjectStore('blobs');
    },
  );
  localStorage.setItem(
    'studyloop.classroom-links',
    JSON.stringify({
      [a.id]: {
        stageId: a.id,
        attemptId,
        handoffId,
        returnUrl: `/?attempt=${attemptId}`,
        courseTitle: a.name,
        language: 'en',
        createdAt: 1,
      },
      [b.id]: {
        stageId: b.id,
        attemptId: otherAttemptId,
        returnUrl: `/?attempt=${otherAttemptId}`,
        courseTitle: b.name,
        language: 'en',
        createdAt: 1,
      },
    }),
  );
  sessionStorage.setItem(
    'studyloop.classroom-contexts',
    JSON.stringify({
      [oldDelete.id]: {
        courseTitle: oldDelete.name,
        language: 'en',
        returnUrl: `/?attempt=${attemptId}`,
      },
      'untrusted-context': {
        courseTitle: a.name,
        returnUrl: `https://example.invalid/?attempt=${attemptId}`,
      },
    }),
  );
  for (const value of scenes)
    for (const prefix of ['quizDraft:', 'quizAnswers:', 'quizResults:', 'quizAttemptId:'])
      localStorage.setItem(prefix + value.id, JSON.stringify({ synthetic: value.stageId }));
  for (const id of [a.id, b.id])
    for (const prefix of ['playback-cursor:', 'editor-current-scene:'])
      localStorage.setItem('maic:device:' + prefix + id, JSON.stringify({ fixture: true }));
}

async function browserSnapshot() {
  const databases = {};
  for (const name of ['MAIC-Database', 'maic-documents', 'maic-runtime', 'maic-asset-pool']) {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    databases[name] = {};
    for (const table of database.objectStoreNames) {
      const tx = database.transaction(table);
      const store = tx.objectStore(table);
      const [keys, rows] = await Promise.all(
        [store.getAllKeys(), store.getAll()].map(
          (request) =>
            new Promise((resolve, reject) => {
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      databases[name][table] = { keys, rows };
    }
    database.close();
  }
  return {
    databases: JSON.parse(JSON.stringify(databases)),
    // The embedded shell hydrates managed provider settings asynchronously,
    // independently of cleanup. Compare classroom data, including every quiz,
    // device, link and tombstone key, without racing that account preference.
    local: Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key !== 'maic:account:settings-storage'),
    ),
    session: { ...sessionStorage },
  };
}

async function openCleanupBridge(page) {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.id = 'cleanup-fixture';
        iframe.hidden = true;
        const timer = setTimeout(
          () => reject(new Error('Cleanup bridge did not become ready.')),
          30000,
        );
        const listener = (event) => {
          if (
            event.origin !== location.origin ||
            event.source !== iframe.contentWindow ||
            event.data?.type !== 'studyloop:cleanup-ready'
          )
            return;
          clearTimeout(timer);
          removeEventListener('message', listener);
          resolve();
        };
        addEventListener('message', listener);
        iframe.src = '/studyloop-cleanup';
        document.body.append(iframe);
      }),
  );
}
async function sendCleanup(page, attemptId, requestId, handoffIds = []) {
  return page.evaluate(
    ({ attemptId, requestId, handoffIds }) =>
      new Promise((resolve, reject) => {
        const frame = document.querySelector('#cleanup-fixture');
        const timer = setTimeout(() => reject(new Error('Cleanup bridge timed out.')), 30000);
        const listener = (event) => {
          if (
            event.source !== frame.contentWindow ||
            event.origin !== location.origin ||
            event.data?.type !== 'studyloop:cleanup-result' ||
            event.data.requestId !== requestId ||
            event.data.attemptId !== attemptId
          )
            return;
          clearTimeout(timer);
          removeEventListener('message', listener);
          resolve(event.data);
        };
        addEventListener('message', listener);
        frame.contentWindow.postMessage(
          { type: 'studyloop:cleanup', attemptId, requestId, handoffIds },
          location.origin,
        );
      }),
    { attemptId, requestId, handoffIds },
  );
}

test(
  'real browser cleanup verifies receipts, cascades IndexedDB, preserves shared legacy assets, and fences retries',
  { timeout: 180000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-cleanup-browser-'));
    let modelCalls = 0;
    const provider = http.createServer((_req, res) => {
      modelCalls++;
      res.writeHead(500).end('No model request is expected.');
    });
    const providerBase = await listen(provider);
    const env = {
      DATA_DIR: directory,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: providerBase + '/v1',
      LLM_API_KEY: 'fixture-only',
      LLM_MODEL: 'fixture-only',
    };
    const runtime = createOpenMAICRuntime({ root, env });
    assert.equal(
      runtime.status().installed,
      true,
      'Build the bundled classroom before this integration test.',
    );
    const app = await createApp({ root, env, openmaicRuntime: runtime });
    const server = http.createServer(app);
    const base = await listen(server);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    t.after(async () => {
      await browser.close();
      server.closeAllConnections();
      provider.closeAllConnections();
      await runtime.stop();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => provider.close(resolve)),
      ]);
      await rm(directory, { recursive: true, force: true });
    });
    await page.goto(base + '/');
    const sample = (await loadSamples())[0];
    const answers = Object.fromEntries(
      sample.questions.map((question) => [question.id, 'unknown']),
    );
    async function submit() {
      const response = await context.request.post(base + `/api/courses/${sample.id}/attempts`, {
        data: { answers },
      });
      assert.equal(response.status(), 201);
      return (await response.json()).attempt;
    }
    const attempt = await submit(),
      other = await submit();
    const handoff = await (
      await context.request.post(base + `/api/attempts/${attempt.id}/classroom-handoff`, {
        data: {},
      })
    ).json();
    await page.goto(base + '/studio');
    await page.locator('.studyloop-library-saved[aria-busy="false"]').waitFor();
    await page.evaluate(seedBrowserFixture, {
      attemptId: attempt.id,
      otherAttemptId: other.id,
      handoffId: handoff.id,
    });
    await page.goto(base + '/');
    await openCleanupBridge(page);
    const before = await page.evaluate(browserSnapshot);
    const denied = await sendCleanup(page, attempt.id, 'not-deleted', ['forged-handoff']);
    assert.equal(denied.ok, false);
    assert.deepEqual(
      await page.evaluate(browserSnapshot),
      before,
      '404 receipts cannot alter any classroom storage.',
    );

    const preview = await (
      await context.request.get(base + `/api/attempts/${attempt.id}/deletion-preview`)
    ).json();
    const removed = await context.request.delete(base + `/api/attempts/${attempt.id}`, {
      data: { revision: preview.revision },
    });
    assert.equal(removed.status(), 200);
    // A real peer channel models an old open classroom that has not loaded the
    // new tombstone listener. It must cause pending, never optimistic success.
    const peer = await context.newPage();
    await peer.goto(base + '/api/health');
    await peer.evaluate(() => {
      window.syntheticPresence = new BroadcastChannel('maic-stage-presence');
      window.syntheticPresence.onmessage = ({ data }) => {
        if (data?.kind === 'probe' && data.stageId === 'delete-stage')
          window.syntheticPresence.postMessage({ ...data, kind: 'present' });
      };
    });
    const deferred = await sendCleanup(page, attempt.id, 'peer-present', ['forged-handoff']);
    assert.equal(deferred.ok, false);
    assert.ok(deferred.pending >= 1);
    const partial = await page.evaluate(browserSnapshot);
    assert.ok(partial.databases['maic-documents'].stages.keys.includes('delete-stage'));
    assert.ok(JSON.parse(partial.local['studyloop.classroom-deletions'])[attempt.id]);
    await peer.close();
    const finished = await sendCleanup(page, attempt.id, 'retry-after-close', ['forged-handoff']);
    assert.equal(finished.ok, true, JSON.stringify(finished));
    assert.equal(finished.pending, 0);
    assert.ok(finished.sharedAssetsRetained >= 2);
    const after = await page.evaluate(browserSnapshot);
    const db = after.databases;
    assert.deepEqual(db['maic-documents'].stages.keys, ['keep-stage']);
    assert.deepEqual(db['maic-documents'].scenes.keys, [['keep-stage', 'scene-keep-stage']]);
    assert.deepEqual(db['maic-documents'].outlines.keys, ['keep-stage']);
    assert.deepEqual(db['MAIC-Database'].stages.keys, ['keep-legacy', 'keep-stage']);
    assert.deepEqual(db['MAIC-Database'].scenes.keys, ['scene-keep-legacy', 'scene-keep-stage']);
    assert.deepEqual(db['MAIC-Database'].mediaFiles.keys, [
      'keep-stage:compat-shared-asset',
      'keep-stage:shared-asset',
    ]);
    assert.deepEqual(db['MAIC-Database'].audioFiles.keys, [
      'compat-shared-audio',
      'legacy-shared-audio',
      'undo-shared-audio',
    ]);
    assert.deepEqual(db['MAIC-Database'].imageFiles.keys, ['legacy-shared-asset']);
    assert.deepEqual(
      db['MAIC-Database'].snapshots.rows[0].slides.map((scene) => scene.stageId),
      ['keep-stage'],
    );
    assert.equal(db['MAIC-Database'].snapshots.rows.length, 1);
    for (const [table, expected] of Object.entries({
      chatSessions: ['keep-chat'],
      chatRestoreStaging: [],
      agentEditSessions: ['keep-edit'],
      generatedAgents: ['keep-agent'],
      playbackState: ['keep-stage'],
      stageFolders: ['keep-stage'],
      folders: ['folder'],
    }))
      assert.deepEqual(db['MAIC-Database'][table].keys, expected, table);
    assert.deepEqual(db['maic-runtime'].sessions.keys, ['keep-runtime']);
    assert.deepEqual(db['maic-runtime'].records.keys, [['keep-runtime', 0]]);
    assert.deepEqual(db['maic-asset-pool'].assets.keys, [
      'alias-keep',
      'compat-shared-asset',
      'legacy-shared-asset',
      'shared-asset',
      'undo-shared-audio',
    ]);
    assert.deepEqual(db['maic-asset-pool'].blobs.keys, [
      'compat-shared-hash',
      'legacy-shared-hash',
      'shared-hash',
      'shared-reference-hash',
      'undo-shared-hash',
    ]);
    assert.deepEqual(
      JSON.parse(after.local['studyloop.classroom-links']),
      JSON.parse(before.local['studyloop.classroom-links'])['keep-stage']
        ? { 'keep-stage': JSON.parse(before.local['studyloop.classroom-links'])['keep-stage'] }
        : {},
    );
    for (const prefix of ['quizDraft:', 'quizAnswers:', 'quizResults:', 'quizAttemptId:']) {
      assert.equal(after.local[prefix + 'scene-delete-stage'], undefined);
      assert.equal(after.local[prefix + 'scene-delete-legacy'], undefined);
      assert.equal(
        after.local[prefix + 'scene-keep-stage'],
        before.local[prefix + 'scene-keep-stage'],
      );
      assert.equal(
        after.local[prefix + 'scene-keep-legacy'],
        before.local[prefix + 'scene-keep-legacy'],
      );
    }
    assert.equal(after.local['maic:device:playback-cursor:delete-stage'], undefined);
    assert.equal(after.local['maic:device:editor-current-scene:delete-stage'], undefined);
    assert.equal(
      after.local['maic:device:playback-cursor:keep-stage'],
      before.local['maic:device:playback-cursor:keep-stage'],
    );
    const repeated = await sendCleanup(page, attempt.id, 'new-id-idempotent-retry');
    assert.equal(repeated.ok, true);
    assert.equal(repeated.deleted, 0);
    assert.deepEqual((await page.evaluate(browserSnapshot)).databases, after.databases);

    // A stale, cached generation session from a previous tab must be rejected
    // before a network generation request or a new stage is persisted.
    await page.evaluate(
      ({ attemptId }) => {
        sessionStorage.setItem(
          'studyloop.classroom-context',
          JSON.stringify({
            attemptId,
            returnUrl: `/?attempt=${attemptId}`,
            courseTitle: 'Stale synthetic course',
            language: 'en',
          }),
        );
        sessionStorage.setItem(
          'generationSession',
          JSON.stringify({
            sessionId: 'stale-session',
            studyloopAttemptId: attemptId,
            requirements: {
              requirement: 'Must not regenerate',
              webSearch: false,
              interactiveMode: false,
            },
            pdfText: 'Synthetic material',
            sceneOutlines: null,
            currentStep: 'generating',
            previewPhase: 'preparing',
          }),
        );
      },
      { attemptId: attempt.id },
    );
    await page.goto(base + '/generation-preview');
    await page.waitForURL(base + '/studio');
    await page.locator('.studyloop-library-saved[aria-busy="false"]').waitFor();
    assert.deepEqual((await page.evaluate(browserSnapshot)).databases, after.databases);
    assert.equal(modelCalls, 0, 'Deletion and stale-session rejection must never call a model.');
    assert.equal((await context.request.get(base + `/api/attempts/${other.id}`)).status(), 200);

    // Removing the final referencing classroom must now reclaim its own
    // formerly-shared bytes, including media held only by its undo snapshot.
    const otherPreview = await (
      await context.request.get(base + `/api/attempts/${other.id}/deletion-preview`)
    ).json();
    assert.equal(
      (
        await context.request.delete(base + `/api/attempts/${other.id}`, {
          data: { revision: otherPreview.revision },
        })
      ).status(),
      200,
    );
    await openCleanupBridge(page);
    const lastOwner = await sendCleanup(page, other.id, 'delete-final-shared-owner');
    assert.equal(lastOwner.ok, true, JSON.stringify(lastOwner));
    const finalState = (await page.evaluate(browserSnapshot)).databases;
    assert.deepEqual(finalState['maic-documents'].stages.keys, []);
    assert.deepEqual(finalState['maic-asset-pool'].assets.keys, ['legacy-shared-asset']);
    assert.deepEqual(finalState['maic-asset-pool'].blobs.keys, ['legacy-shared-hash']);
    assert.deepEqual(finalState['MAIC-Database'].audioFiles.keys, ['legacy-shared-audio']);
    assert.deepEqual(finalState['MAIC-Database'].stages.keys, ['keep-legacy']);
    assert.deepEqual(finalState['maic-runtime'].records.keys, []);
    assert.equal(modelCalls, 0);
  },
);
