import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestReplayGuard } from '../server/request-replay.js';
import { HttpError } from '../server/errors.js';

const base = { owner: 'owner-a', operation: 'course', key: 'request-1', payload: { count: 6 } };
const status = (expected) => (error) => error instanceof HttpError && error.status === expected;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test('reserve before asynchronous saved lookup; identical requests share the exact pending promise', async () => {
  const lookup = deferred();
  const workResult = deferred();
  let reads = 0;
  let writes = 0;
  const guard = createRequestReplayGuard({
    findSaved: async () => {
      reads++;
      return lookup.promise;
    },
  });
  const work = ({ key, fingerprint }) => {
    writes++;
    assert.equal(key, base.key);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    return workResult.promise;
  };
  const first = guard.run(base, work);
  const second = guard.run(base, work);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  await assert.rejects(guard.run({ ...base, payload: { count: 8 } }, work), status(409));
  lookup.resolve(undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 1);
  assert.equal(guard.run(base, work), first);
  workResult.resolve({ id: 'course-1' });
  assert.deepEqual(await first, { id: 'course-1' });
  assert.deepEqual(await second, { id: 'course-1' });
});

test('canonical hashing sorts object keys recursively while preserving array order and string contents', async () => {
  const saved = new Map();
  const guard = createRequestReplayGuard({ findSaved: async ({ key }) => saved.get(key) });
  let calls = 0;
  const work = ({ key, fingerprint }) => {
    calls++;
    const result = { id: 'saved' };
    saved.set(key, { fingerprint, result });
    return result;
  };
  const payload = { b: { z: '中文\n', a: false }, a: [1, { y: null, x: 2 }] };
  await guard.run({ ...base, payload }, work);
  assert.deepEqual(
    await guard.run(
      { ...base, payload: { a: [1, { x: 2, y: null }], b: { a: false, z: '中文\n' } } },
      work,
    ),
    { id: 'saved' },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    guard.run({ ...base, payload: { ...payload, a: [{ y: null, x: 2 }, 1] } }, work),
    status(409),
  );
  await assert.rejects(
    guard.run({ ...base, payload: { ...payload, b: { ...payload.b, z: '中文' } } }, work),
    status(409),
  );
});

test('a new guard replays only the original persisted result and rejects changed payloads', async () => {
  let saved;
  const findSaved = async (identity) => {
    assert.deepEqual(identity, { owner: base.owner, operation: base.operation, key: base.key });
    return saved;
  };
  await createRequestReplayGuard({ findSaved }).run(base, ({ fingerprint }) => {
    saved = { fingerprint, result: { id: 'persisted-course' } };
    return saved.result;
  });
  const restarted = createRequestReplayGuard({ findSaved });
  assert.deepEqual(
    await restarted.run(base, () => assert.fail('must not repeat work')),
    saved.result,
  );
  await assert.rejects(
    restarted.run({ ...base, payload: { count: 4 } }, () =>
      assert.fail('must not replace saved work'),
    ),
    status(409),
  );
});

test('completed responses are not kept in an extra memory cache after the original record disappears', async () => {
  let saved;
  let calls = 0;
  const guard = createRequestReplayGuard({ findSaved: async () => saved });
  const work = ({ fingerprint }) => {
    saved = { fingerprint, result: { id: `result-${++calls}` } };
    return saved.result;
  };
  await guard.run(base, work);
  saved = undefined;
  assert.deepEqual(await guard.run(base, work), { id: 'result-2' });
});

test('lookup and work failures release pending state so the request can be retried', async () => {
  let reads = 0;
  let calls = 0;
  const guard = createRequestReplayGuard({
    findSaved: async () => {
      if (++reads === 1) throw new Error('lookup fixture failure');
    },
  });
  const work = () => {
    if (++calls === 1) throw new Error('work fixture failure');
    return 'success';
  };
  await assert.rejects(guard.run(base, work), /lookup fixture failure/);
  await assert.rejects(guard.run(base, work), /work fixture failure/);
  assert.equal(await guard.run(base, work), 'success');
  assert.equal(reads, 3);
  assert.equal(calls, 2);
});

test('invalid saved metadata is not replayed and does not poison the pending slot', async () => {
  let saved = { fingerprint: 'invalid-fingerprint', result: { id: 'unverified' } };
  const guard = createRequestReplayGuard({ findSaved: async () => saved });
  await assert.rejects(
    guard.run(base, () => assert.fail('must not overwrite invalid record')),
    status(500),
  );
  saved = undefined;
  assert.equal(await guard.run(base, () => 'retried'), 'retried');
});

test('a failure after persistence is resolved from the saved record on retry without repeating work', async () => {
  let saved;
  const guard = createRequestReplayGuard({ findSaved: async () => saved });
  await assert.rejects(
    guard.run(base, ({ fingerprint }) => {
      saved = { fingerprint, result: { id: 'written-before-response-failed' } };
      throw new Error('response fixture failure');
    }),
    /response fixture failure/,
  );
  assert.deepEqual(await guard.run(base, () => assert.fail('already saved')), saved.result);
});

test('owner and operation isolate concurrent requests even when delimiters occur in identities', async () => {
  const requests = [
    base,
    { ...base, owner: 'owner-b' },
    { ...base, operation: 'practice' },
    { ...base, owner: 'x:y', operation: 'z' },
    { ...base, owner: 'x', operation: 'y:z' },
  ];
  const reads = [];
  const guard = createRequestReplayGuard({
    findSaved: async (identity) => {
      reads.push(identity);
    },
  });
  assert.deepEqual(
    await Promise.all(requests.map((request, i) => guard.run(request, () => i))),
    [0, 1, 2, 3, 4],
  );
  assert.equal(reads.length, 5);
});

test('missing keys preserve previous work behavior without hashing payloads or querying saved records', async () => {
  let calls = 0;
  const guard = createRequestReplayGuard({ findSaved: () => assert.fail('no lookup without key') });
  const work = (metadata) => {
    assert.deepEqual(metadata, { key: undefined, fingerprint: undefined });
    return ++calls;
  };
  const request = { payload: { otherwiseNotJson: undefined } };
  assert.deepEqual(await Promise.all([guard.run(request, work), guard.run(request, work)]), [1, 2]);
});

test('unsafe or malformed keys and missing scoped identities cannot reach saved lookup or work', async () => {
  const guard = createRequestReplayGuard({
    findSaved: () => assert.fail('invalid request lookup'),
  });
  const work = () => assert.fail('invalid request work');
  for (const key of ['', null, 5, ' has-space', 'x/y', '..', '中文', 'x\ny', 'a'.repeat(101)]) {
    await assert.rejects(guard.run({ ...base, key }, work), status(400));
  }
  for (const request of [
    { ...base, owner: undefined },
    { ...base, operation: '' },
  ]) {
    await assert.rejects(guard.run(request, work), status(400));
  }
  await assert.rejects(guard.run(undefined, work), status(400));
  const valid = createRequestReplayGuard({ findSaved: async () => undefined });
  for (const key of ['019f1321-58d8-7fe1-bc78-1e1f3e347eb7', 'A', 'a._:-9', 'a'.repeat(100)]) {
    assert.equal(await valid.run({ ...base, key }, () => 'ok'), 'ok');
  }
});

test('non-JSON payloads cannot be coerced, dropped, or execute a getter/toJSON during hashing', async () => {
  const guard = createRequestReplayGuard({
    findSaved: () => assert.fail('invalid payload lookup'),
  });
  const cyclic = {};
  cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'secret', {
    enumerable: true,
    get: () => assert.fail('must not execute getters'),
  });
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const symbol = { [Symbol('hidden')]: 1 };
  const customArray = [1];
  customArray.extra = 2;
  let tooDeep = {};
  for (let i = 0; i < 66; i++) tooDeep = { child: tooDeep };
  for (const payload of [
    undefined,
    { nested: undefined },
    NaN,
    Infinity,
    1n,
    () => {},
    Symbol('value'),
    new Date(0),
    new Map(),
    { toJSON: () => assert.fail('must not execute toJSON') },
    cyclic,
    getter,
    hidden,
    symbol,
    Array(2),
    customArray,
    tooDeep,
  ]) {
    await assert.rejects(
      guard.run({ ...base, payload }, () => assert.fail('invalid payload work')),
      status(400),
    );
  }
});

test('shared JSON subobjects and null-prototype objects serialize without being mistaken for cycles', async () => {
  const shared = { x: 1 };
  const plain = Object.assign(Object.create(null), { first: shared, second: shared });
  let fingerprint;
  const guard = createRequestReplayGuard({ findSaved: async () => undefined });
  await guard.run({ ...base, payload: plain }, (metadata) => {
    fingerprint = metadata.fingerprint;
  });
  await guard.run({ ...base, payload: { second: { x: 1 }, first: { x: 1 } } }, (metadata) => {
    assert.equal(metadata.fingerprint, fingerprint);
  });
});

test('conflict errors do not reveal another payload, owner, request key, or persisted result', async () => {
  let saved;
  const marker = 'PRIVATE_REPLAY_FIXTURE_123';
  const guard = createRequestReplayGuard({ findSaved: async () => saved });
  await guard.run({ ...base, key: marker, payload: { marker } }, ({ fingerprint }) => {
    saved = { fingerprint, result: { marker } };
    return saved.result;
  });
  await assert.rejects(
    guard.run({ ...base, key: marker, payload: null }, () => assert.fail('no replay')),
    (error) => {
      assert.ok(status(409)(error));
      assert.ok(!String(error.stack).includes(marker));
      assert.ok(!JSON.stringify(error).includes(marker));
      return true;
    },
  );
});
