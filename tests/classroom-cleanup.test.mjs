import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomCleanup } from '../src/classroom-cleanup.js';

const PREFIX = 'studyloop.pending-classroom-cleanups.';
const LEGACY = 'studyloop.pending-classroom-cleanups';
const input = { attemptId: 'attempt-a', handoffIds: ['preview-handoff'] };
const stageKey = (id = input.attemptId) => `${PREFIX}staged.${id}`;
const confirmedKey = (id = input.attemptId) => `${PREFIX}confirmed.${id}`;
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});
const receipt = (attemptId = input.attemptId, handoffIds = ['server-handoff']) => ({
  attemptId,
  handoffIds,
  completed: true,
  deletedAt: '2026-09-09T00:00:00.000Z',
  deleted: { attempts: 1, practice: 0, handoffs: handoffIds.length, courses: 1, plans: 1 },
});
const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
class MemoryStorage {
  values = new Map();
  fail = () => false;
  get length() {
    this.check('read');
    return this.values.size;
  }
  check(operation, key) {
    if (this.fail(operation, key)) throw new Error('private-storage-failure');
  }
  key(index) {
    this.check('read');
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    this.check('read', key);
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.check('write', key);
    this.beforeWrite?.(key, value);
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.check('remove', key);
    this.values.delete(key);
  }
}
function client(options = {}) {
  const storage = options.storage || new MemoryStorage();
  const sessionStorage = options.sessionStorage || new MemoryStorage();
  const requests = [];
  const bridges = [];
  const cleanup = createClassroomCleanup({
    storage,
    sessionStorage,
    fetcher: async (...args) => {
      requests.push(args);
      return options.fetcher ? options.fetcher(...args) : response(receipt());
    },
    runBridge: async (job) => {
      bridges.push(structuredClone(job));
      return options.runBridge ? options.runBridge(job) : { ok: true, deleted: 1, pending: 0 };
    },
  });
  return { ...cleanup, storage, sessionStorage, requests, bridges };
}

test('only an owned complete matching receipt authorizes cleanup, using its authoritative handoff IDs', async () => {
  const state = client();
  state.queue(input);
  const result = await state.cleanup({ ...input, handoffIds: ['forged-client-handoff'] });
  assert.deepEqual(result, { ok: true, deleted: 1, pending: 0 });
  assert.deepEqual(state.bridges, [{ attemptId: input.attemptId, handoffIds: ['server-handoff'] }]);
  const [url, options] = state.requests[0];
  assert.equal(url, '/api/attempt-deletions/attempt-a');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.method, undefined);
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(state.pending(), []);
});

test('404, incomplete, malformed and mismatched receipts retain staged work without touching classrooms', async () => {
  const invalid = [
    response({ error: 'Not owned or not deleted' }, 404),
    response({ ...receipt(), completed: false }),
    response({ ...receipt(), attemptId: 'another-attempt' }),
    response({ ...receipt(), handoffIds: undefined }),
    response({ ...receipt(), handoffIds: ['../unsafe'] }),
    response({ ...receipt(), deleted: undefined }),
    response({ ...receipt(), deleted: { attempts: 0 } }),
    response(null),
    {
      ok: true,
      json: async () => {
        throw new Error('private-malformed-receipt');
      },
    },
  ];
  for (const value of invalid) {
    const state = client({ fetcher: async () => value });
    const result = await state.cleanup(input);
    assert.equal(result.ok, false);
    assert.equal(result.pending, 1);
    assert.equal(state.bridges.length, 0);
    assert.deepEqual(state.pending(), [{ ...input, phase: 'staged' }]);
    assert.doesNotMatch(result.message, /private-/);
  }
});

test('persisted interrupted work retries after reload and a changed owner cannot use cached confirmation', async () => {
  const storage = new MemoryStorage();
  const first = client({ storage });
  first.queue(input);
  const ownerChanged = client({ storage, fetcher: async () => response({}, 404) });
  assert.equal((await ownerChanged.retry()).ok, false);
  assert.equal(ownerChanged.bridges.length, 0);
  assert.equal(ownerChanged.pending().length, 1);
  const partial = client({
    storage,
    runBridge: async () => ({ ok: false, deleted: 1, pending: 1 }),
  });
  assert.equal((await partial.retry()).ok, false);
  assert.equal(partial.pending()[0].phase, 'confirmed');
  const otherOwner = client({ storage, fetcher: async () => response({}, 404) });
  assert.equal((await otherOwner.retry()).ok, false);
  assert.equal(otherOwner.bridges.length, 0);
  assert.equal(otherOwner.pending()[0].phase, 'confirmed');
  const resumed = client({
    storage,
    runBridge: async () => ({ ok: true, deleted: 0, pending: 0 }),
  });
  assert.equal((await resumed.retry()).ok, true);
  assert.equal(resumed.requests.length, 1);
  assert.deepEqual(resumed.pending(), []);
});

test('no handoffs and no matching local association skip the bridge; either association store can require it', async () => {
  const empty = client({ fetcher: async () => response(receipt(input.attemptId, [])) });
  assert.deepEqual(await empty.cleanup(input), { ok: true, deleted: 0, pending: 0 });
  assert.equal(empty.bridges.length, 0);
  for (const source of ['local', 'session']) {
    const state = client({ fetcher: async () => response(receipt(input.attemptId, [])) });
    if (source === 'local')
      state.storage.setItem(
        'studyloop.classroom-links',
        JSON.stringify({ 'stage-a': { attemptId: input.attemptId } }),
      );
    else
      state.sessionStorage.setItem(
        'studyloop.classroom-contexts',
        JSON.stringify({ 'stage-a': { returnUrl: '/?attempt=attempt-a' } }),
      );
    assert.equal((await state.cleanup(input)).ok, true);
    assert.deepEqual(state.bridges, [{ attemptId: input.attemptId, handoffIds: [] }]);
  }
  const unrelated = client({ fetcher: async () => response(receipt(input.attemptId, [])) });
  unrelated.storage.setItem(
    'studyloop.classroom-links',
    JSON.stringify({
      'stage-b': { attemptId: 'attempt-b' },
      'foreign-url': { returnUrl: 'https://unrelated.example/?attempt=attempt-a' },
    }),
  );
  assert.equal((await unrelated.cleanup(input)).ok, true);
  assert.equal(unrelated.bridges.length, 0);
});

test('partial or invalid bridge results preserve confirmation and never report false success', async () => {
  for (const result of [
    { ok: false, deleted: 1, pending: 2 },
    { ok: true, deleted: 1, pending: 1 },
    { ok: true, deleted: -1, pending: 0 },
    { ok: true, deleted: 1 },
    null,
  ]) {
    const state = client({ runBridge: async () => result });
    const actual = await state.cleanup(input);
    assert.equal(actual.ok, false);
    assert.equal(actual.pending, 1);
    assert.equal(state.pending()[0].phase, 'confirmed');
    state.discard(input.attemptId);
    assert.equal(state.pending().length, 1);
  }
});

test('cleanup is singleflight per attempt and a later retry revalidates the receipt', async () => {
  const entered = gate();
  const release = gate();
  const state = client({
    runBridge: async () => {
      entered.resolve();
      await release.promise;
      return { ok: false, deleted: 0, pending: 1 };
    },
  });
  const first = state.cleanup(input);
  const duplicate = state.cleanup({ ...input, handoffIds: ['another-preview'] });
  assert.equal(first, duplicate);
  await entered.promise;
  assert.equal(state.requests.length, 1);
  assert.equal(state.bridges.length, 1);
  release.resolve();
  await first;
  await state.retry();
  assert.equal(state.requests.length, 2);
  assert.equal(state.bridges.length, 2);
});

test('staged cancellation cannot discard confirmation, including a delayed staging write from another tab', async () => {
  const storage = new MemoryStorage();
  const first = client({ storage, runBridge: async () => ({ ok: false, deleted: 0, pending: 1 }) });
  const second = client({ storage });
  first.queue(input);
  second.discard(input.attemptId);
  assert.deepEqual(first.pending(), []);
  await first.cleanup(input);
  storage.setItem(stageKey(), JSON.stringify({ ...input, phase: 'staged' }));
  second.queue({ ...input, handoffIds: ['old-tab-preview'] });
  second.discard(input.attemptId);
  assert.deepEqual(first.pending(), [
    { attemptId: input.attemptId, handoffIds: ['server-handoff'], phase: 'confirmed' },
  ]);
  assert.ok(storage.getItem(confirmedKey()));
});

test('independent per-attempt keys prevent cross-tab whole-queue lost updates', async () => {
  const storage = new MemoryStorage();
  const first = client({ storage });
  const second = client({ storage });
  const other = { attemptId: 'attempt-b', handoffIds: [] };
  storage.beforeWrite = () => {
    storage.beforeWrite = undefined;
    second.queue(other);
  };
  first.queue(input);
  assert.deepEqual(
    first.pending().map((job) => job.attemptId),
    ['attempt-a', 'attempt-b'],
  );
  assert.equal((await first.cleanup(input)).ok, true);
  assert.deepEqual(second.pending(), [{ ...other, phase: 'staged' }]);
  assert.ok(storage.getItem(stageKey('attempt-b')));
});

test('a late partial cleanup retains its task after another tab cleared the shared entry', async () => {
  const storage = new MemoryStorage();
  const entered = gate();
  const release = gate();
  const first = client({
    storage,
    runBridge: async () => {
      entered.resolve();
      await release.promise;
      return { ok: false, deleted: 0, pending: 1 };
    },
  });
  const pending = first.cleanup(input);
  await entered.promise;
  const second = client({ storage });
  assert.equal((await second.cleanup(input)).ok, true);
  assert.deepEqual(second.pending(), []);
  release.resolve();
  assert.equal((await pending).ok, false);
  assert.equal(first.pending()[0].phase, 'confirmed');
});

test('storage failures block new staging, retain work, and return safe pending states', async () => {
  for (const operation of ['read', 'write']) {
    const storage = new MemoryStorage();
    storage.fail = (current) => current === operation;
    const state = client({ storage });
    assert.throws(() => state.queue(input));
    const result = await state.cleanup(input);
    assert.equal(result.ok, false);
    assert.equal(result.pending, 1);
    assert.doesNotMatch(result.message, /private-storage-failure/);
    assert.equal(state.requests.length, 0);
    assert.equal(state.bridges.length, 0);
    if (operation === 'read') assert.equal((await state.retry()).ok, false);
  }
  const storage = new MemoryStorage();
  const state = client({ storage });
  state.queue(input);
  storage.fail = (operation, key) => operation === 'write' && key === confirmedKey();
  assert.equal((await state.cleanup(input)).ok, false);
  assert.equal(state.bridges.length, 0);
  assert.equal(state.pending()[0].phase, 'staged');
});

test('failed queue removal retains confirmation and reports already completed cleanup without false completion', async () => {
  const storage = new MemoryStorage();
  storage.fail = (operation, key) => operation === 'remove' && key === confirmedKey();
  const state = client({ storage, runBridge: async () => ({ ok: true, deleted: 2, pending: 0 }) });
  const result = await state.cleanup(input);
  assert.equal(result.ok, false);
  assert.equal(result.deleted, 2);
  assert.equal(state.pending()[0].phase, 'confirmed');
  storage.fail = () => false;
  const retry = client({ storage, runBridge: async () => ({ ok: true, deleted: 0, pending: 0 }) });
  assert.equal((await retry.retry()).ok, true);
  assert.deepEqual(retry.pending(), []);
});

test('legacy migration retains original queue until every row is persisted and preserves confirmed phase', () => {
  const storage = new MemoryStorage();
  const old = [
    { ...input, phase: 'staged' },
    { attemptId: 'attempt-b', handoffIds: [], phase: 'confirmed' },
  ];
  storage.setItem(LEGACY, JSON.stringify(old));
  storage.fail = (operation, key) => operation === 'write' && key === confirmedKey('attempt-b');
  const state = client({ storage });
  assert.throws(() => state.pending());
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY)), old);
  storage.fail = () => false;
  assert.deepEqual(state.pending(), old);
  assert.equal(storage.getItem(LEGACY), null);
  state.discard('attempt-a');
  state.discard('attempt-b');
  assert.deepEqual(state.pending(), [old[1]]);
});

test('malformed queue and association data stay pending rather than silently losing cleanup work', async () => {
  const state = client({ fetcher: async () => response(receipt(input.attemptId, [])) });
  state.storage.setItem('studyloop.classroom-links', '{malformed');
  assert.equal((await state.cleanup(input)).ok, false);
  assert.equal(state.bridges.length, 0);
  assert.equal(state.pending()[0].phase, 'confirmed');
  state.storage.setItem(
    confirmedKey(),
    JSON.stringify({ ...input, attemptId: 'different', phase: 'confirmed' }),
  );
  assert.throws(() => state.pending());
  assert.equal((await state.retry()).ok, false);
  for (const bad of [
    { attemptId: 123, handoffIds: [] },
    { attemptId: '../bad', handoffIds: [] },
    { attemptId: 'valid', handoffIds: ['../bad'] },
  ])
    assert.throws(() => state.queue(bad), /Invalid classroom cleanup/);
});
