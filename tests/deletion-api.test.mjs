import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { loadSamples } from '../server/core/samples.js';

const sample = loadSamples()[0];
const answers = Object.fromEntries(sample.questions.map((question) => [question.id, 'unknown']));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function instance(t, { StoreClass = Store, core = {}, env = {} } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-delete-'));
  const store = new StoreClass(directory);
  const app = await createApp({
    env: { DATA_DIR: directory, ...env },
    store,
    onError: () => {},
    openmaicRuntime: {
      status: () => ({ installed: true, ready: false, state: 'stopped', version: 'fixture' }),
      ensureRunning: async () => {
        throw new Error('No classroom runtime needed for deletion.');
      },
      refresh: async () => {},
      stop: async () => {},
    },
    core: {
      providerConfig: () => ({ generationAvailable: true, searchAvailable: true }),
      createPlan: async (input) => ({
        title: 'Generated fraction course',
        description: sample.description,
        subject: sample.subject,
        level: input.level,
        language: input.language,
        objectives: sample.objectives,
        sources: sample.sources,
      }),
      generateCourse: async (plan) => ({ ...structuredClone(sample), ...plan }),
      ...core,
    },
  });
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  function browser() {
    let cookie = '';
    return async (endpoint, body, extra = {}) => {
      const response = await fetch(base + endpoint, {
        method: extra.method || (body === undefined ? 'GET' : 'POST'),
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Origin: base,
          ...extra.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  }
  return { directory, store, browser };
}

async function generated(request, plan) {
  if (!plan) {
    const result = await request('/api/plans', {
      topic: 'Fractions',
      level: 'Beginner',
      language: 'en',
      mode: 'search',
    });
    assert.equal(result.status, 201);
    plan = result.data.plan;
  }
  const result = await request('/api/courses', {
    planId: plan.id,
    objectives: plan.objectives,
    questionCount: 6,
  });
  assert.equal(result.status, 201);
  return { plan, course: result.data.course };
}
async function imported(request) {
  const result = await request('/api/import', sample);
  assert.equal(result.status, 201);
  return result.data.course;
}
async function submit(request, courseId) {
  const result = await request(`/api/courses/${courseId}/attempts`, { answers });
  assert.equal(result.status, 201);
  return result.data.attempt;
}
const preview = (request, attemptId) => request(`/api/attempts/${attemptId}/deletion-preview`);
const remove = (request, attemptId, revision, extra) =>
  request(`/api/attempts/${attemptId}`, { revision }, { method: 'DELETE', ...extra });

test('deletion removes actual generated files and expired handoffs, preserves only an owner-scoped receipt', async (t) => {
  const { store, browser } = await instance(t);
  const request = browser();
  const { plan, course } = await generated(request);
  const attempt = await submit(request, course.id);
  assert.equal((await store.get('courses', course.id)).planId, plan.id);
  assert.equal((await store.get('attempts', attempt.id)).planId, plan.id);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(`/api/attempts/${attempt.id}/practice/${sample.questions[0].id}`, {
          answer: 'unknown',
        })
      ).status,
      200,
    );
  const first = (await request(`/api/attempts/${attempt.id}/classroom-handoff`, {})).data;
  const old = await store.get('classroom-handoffs', first.id);
  await store.put('classroom-handoffs', first.id, { ...old, expiresAt: 1 });
  const second = (await request(`/api/attempts/${attempt.id}/classroom-handoff`, {})).data;
  const before = (await preview(request, attempt.id)).data;
  assert.deepEqual(before.counts, { attempts: 1, practice: 2, handoffs: 2, courses: 1, plans: 1 });
  assert.deepEqual(before.retained, []);
  assert.deepEqual(before.handoffIds, [first.id, second.id].sort());
  assert.match(before.revision, /^[a-f0-9]{64}$/);
  const filenames = [
    store.file('attempts', attempt.id),
    store.file('courses', course.id),
    store.file('plans', plan.id),
  ];
  for (const collection of ['practice', 'classroom-handoffs'])
    for (const item of await store.list(collection))
      filenames.push(store.file(collection, item.id));
  const indexDirectory = path.join(store.directory, 'classroom-handoff-index');
  const usage = await store.list('usage');
  const deleted = await remove(request, attempt.id, before.revision);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data.deleted, before.counts);
  assert.equal(deleted.data.completed, true);
  for (const filename of filenames) await assert.rejects(access(filename), { code: 'ENOENT' });
  assert.deepEqual(await store.list('classroom-handoff-index'), []);
  await access(indexDirectory);
  assert.deepEqual(await store.list('usage'), usage);
  assert.ok((await store.list('sessions')).length > 0);
  assert.equal((await request(`/api/attempts/${attempt.id}`)).status, 404);
  assert.equal((await request(`/api/courses/${course.id}`)).status, 404);
  assert.equal((await request(`/api/classroom-handoffs/${second.id}`)).status, 404);
  assert.equal(
    (
      await request(`/api/attempts/${attempt.id}/practice/${sample.questions[0].id}`, {
        answer: 'unknown',
      })
    ).status,
    404,
  );
  assert.equal((await request(`/api/attempts/${attempt.id}/classroom-handoff`, {})).status, 404);
  const receipt = await request(`/api/attempt-deletions/${attempt.id}`);
  assert.equal(receipt.status, 200);
  assert.deepEqual(Object.keys(receipt.data).sort(), [
    'attemptId',
    'completed',
    'deleted',
    'deletedAt',
    'handoffIds',
  ]);
  assert.deepEqual(receipt.data.handoffIds, before.handoffIds);
  assert.deepEqual((await remove(request, attempt.id, 'old-revision')).data.deleted, before.counts);
  assert.equal((await preview(request, attempt.id)).status, 404);
});

test('deletion obeys owner, password and CSRF boundaries and never deletes sample courses', async (t) => {
  const { browser, store } = await instance(t, {
    env: { INSTANCE_PASSWORD: 'deletion-test-password' },
  });
  const first = browser();
  const second = browser();
  assert.equal((await remove(first, 'missing', '0'.repeat(64))).status, 401);
  assert.equal((await first('/api/attempt-deletions/missing')).status, 401);
  for (const request of [first, second])
    assert.equal((await request('/api/login', { password: 'deletion-test-password' })).status, 200);
  const attempt = await submit(first, sample.id);
  const scope = (await preview(first, attempt.id)).data;
  assert.equal(scope.counts.courses, 0);
  assert.deepEqual(scope.retained, [{ resource: 'course', reason: 'sample', count: 1 }]);
  assert.equal((await preview(second, attempt.id)).status, 404);
  assert.equal((await remove(second, attempt.id, scope.revision)).status, 404);
  assert.equal(
    (
      await remove(first, attempt.id, scope.revision, {
        headers: { Origin: 'https://unrelated.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await remove(first, attempt.id, scope.revision, {
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403,
  );
  assert.equal((await remove(first, '..%2Fsessions', scope.revision)).status, 404);
  assert.ok(await store.get('attempts', attempt.id));
  assert.equal((await remove(first, attempt.id, scope.revision)).status, 200);
  assert.equal((await second(`/api/attempt-deletions/${attempt.id}`)).status, 404);
  assert.equal((await remove(second, attempt.id, scope.revision)).status, 404);
  assert.equal((await first('/api/courses')).data.courses.length, 3);
  assert.equal((await first(`/api/courses/${sample.id}`)).status, 200);
});

test('shared imported courses stay until their last attempt and never affect another owner', async (t) => {
  const { browser, store } = await instance(t);
  const request = browser();
  const other = browser();
  const course = await imported(request);
  const otherCourse = await imported(other);
  const first = await submit(request, course.id);
  const second = await submit(request, course.id);
  const scope = (await preview(request, first.id)).data;
  assert.equal(scope.counts.courses, 0);
  assert.deepEqual(scope.retained, [
    { resource: 'course', reason: 'shared', count: 1, references: 1 },
  ]);
  assert.equal((await remove(request, first.id, scope.revision)).status, 200);
  assert.ok(await store.get('courses', course.id));
  assert.equal((await request(`/api/attempts/${second.id}`)).status, 200);
  const lastScope = (await preview(request, second.id)).data;
  assert.equal(lastScope.counts.courses, 1);
  assert.equal((await remove(request, second.id, lastScope.revision)).status, 200);
  assert.equal(await store.get('courses', course.id), null);
  assert.ok(await store.get('courses', otherCourse.id));
});

test('scope revisions reject additions or changed sharing before deleting any files', async (t) => {
  const { browser, store } = await instance(t);
  const request = browser();
  const course = await imported(request);
  const attempt = await submit(request, course.id);
  const first = (await preview(request, attempt.id)).data;
  assert.equal((await remove(request, attempt.id, undefined)).status, 400);
  await request(`/api/attempts/${attempt.id}/practice/${sample.questions[0].id}`, {
    answer: 'unknown',
  });
  assert.equal((await remove(request, attempt.id, first.revision)).status, 409);
  assert.ok(await store.get('attempts', attempt.id));
  assert.equal(await store.get('attempt-deletions', attempt.id), null);
  const second = (await preview(request, attempt.id)).data;
  await submit(request, course.id);
  assert.equal((await remove(request, attempt.id, second.revision)).status, 409);
  const latest = (await preview(request, attempt.id)).data;
  assert.equal(latest.counts.courses, 0);
  assert.equal((await remove(request, attempt.id, latest.revision)).status, 200);
  assert.ok(await store.get('courses', course.id));
});

for (const kind of ['unique', 'ambiguous', 'unmatched', 'shared']) {
  test(`legacy plan association is conservative: ${kind}`, async (t) => {
    const { browser, store } = await instance(t);
    const request = browser();
    const { plan, course } = await generated(request);
    const attempt = await submit(request, course.id);
    for (const [collection, id] of [
      ['courses', course.id],
      ['attempts', attempt.id],
    ]) {
      const value = await store.get(collection, id);
      delete value.planId;
      await store.put(collection, id, value);
    }
    const planRecord = await store.get('plans', plan.id);
    const extraId = randomUUID();
    if (kind === 'unique' || kind === 'ambiguous') {
      const extra = structuredClone(planRecord);
      extra.plan.id = extraId;
      if (kind === 'unique') extra.plan.sources[0].text += ' Different source content.';
      await store.put('plans', extraId, extra);
    } else if (kind === 'unmatched') {
      await store.put('plans', plan.id, {
        ...planRecord,
        plan: { ...plan, description: 'Different outline metadata' },
      });
    } else {
      await generated(request, plan);
    }
    const scope = (await preview(request, attempt.id)).data;
    assert.equal(scope.counts.plans, kind === 'unique' ? 1 : 0);
    if (kind !== 'unique') assert.equal(scope.retained[0].reason, kind);
    assert.equal((await remove(request, attempt.id, scope.revision)).status, 200);
    assert.equal(Boolean(await store.get('plans', plan.id)), kind !== 'unique');
    if (['unique', 'ambiguous'].includes(kind)) assert.ok(await store.get('plans', extraId));
  });
}

test('in-flight generation cannot recreate a course from a deleted plan', async (t) => {
  const entered = deferred();
  const release = deferred();
  let calls = 0;
  const { browser, store } = await instance(t, {
    core: {
      generateCourse: async (plan) => {
        if (++calls === 2) {
          entered.resolve();
          await release.promise;
        }
        return { ...structuredClone(sample), ...plan };
      },
    },
  });
  const request = browser();
  const { plan, course } = await generated(request);
  const attempt = await submit(request, course.id);
  const pending = request('/api/courses', {
    planId: plan.id,
    objectives: plan.objectives,
    questionCount: 6,
  });
  await entered.promise;
  const scope = (await preview(request, attempt.id)).data;
  const deleted = await remove(request, attempt.id, scope.revision);
  release.resolve();
  assert.equal(deleted.status, 200);
  assert.equal((await pending).status, 409);
  assert.deepEqual(await store.list('courses'), []);
  assert.deepEqual(await store.list('plans'), []);
});

test('practice, handoff and attempt writes queued behind deletion cannot recreate removed records', async (t) => {
  const deleting = deferred();
  const release = deferred();
  const requestsArrived = deferred();
  let arrivals = 0;
  let watching = false;
  class PausedStore extends Store {
    async get(collection, id) {
      const value = await super.get(collection, id);
      if (watching && collection === 'sessions' && ++arrivals === 3) requestsArrived.resolve();
      return value;
    }
    async deleteMany(...args) {
      deleting.resolve();
      await release.promise;
      return super.deleteMany(...args);
    }
  }
  const { browser, store } = await instance(t, { StoreClass: PausedStore });
  const request = browser();
  const course = await imported(request);
  const attempt = await submit(request, course.id);
  const scope = (await preview(request, attempt.id)).data;
  const deletion = remove(request, attempt.id, scope.revision);
  await deleting.promise;
  watching = true;
  const writes = [
    request(`/api/attempts/${attempt.id}/practice/${sample.questions[0].id}`, {
      answer: 'unknown',
    }),
    request(`/api/attempts/${attempt.id}/classroom-handoff`, {}),
    request(`/api/courses/${course.id}/attempts`, { answers }),
  ];
  await requestsArrived.promise;
  await new Promise(setImmediate);
  release.resolve();
  assert.equal((await deletion).status, 200);
  for (const result of await Promise.all(writes)) assert.equal(result.status, 404);
  for (const collection of [
    'courses',
    'attempts',
    'practice',
    'classroom-handoffs',
    'classroom-handoff-index',
  ])
    assert.deepEqual(await store.list(collection), []);
});

for (const failure of ['remove', 'receipt', 'receipt-after-write']) {
  test(`failed ${failure} restores removed files and never exposes a successful receipt`, async (t) => {
    let fail = true;
    class FailingStore extends Store {
      async remove(collection, id) {
        if (failure === 'remove' && fail && collection === 'courses')
          throw new Error('private-storage-diagnostic');
        return super.remove(collection, id);
      }
      async put(collection, id, value) {
        if (failure === 'receipt' && fail && collection === 'attempt-deletions')
          throw new Error('private-storage-diagnostic');
        const result = await super.put(collection, id, value);
        if (failure === 'receipt-after-write' && fail && collection === 'attempt-deletions')
          throw new Error('private-storage-diagnostic');
        return result;
      }
    }
    const { browser, store } = await instance(t, { StoreClass: FailingStore });
    const request = browser();
    const { plan, course } = await generated(request);
    const attempt = await submit(request, course.id);
    await request(`/api/attempts/${attempt.id}/practice/${sample.questions[0].id}`, {
      answer: 'unknown',
    });
    const handoff = (await request(`/api/attempts/${attempt.id}/classroom-handoff`, {})).data;
    const original = await readFile(store.file('attempts', attempt.id));
    const scope = (await preview(request, attempt.id)).data;
    const response = await remove(request, attempt.id, scope.revision);
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(response.data), /private-storage-diagnostic/);
    assert.deepEqual(await readFile(store.file('attempts', attempt.id)), original);
    assert.ok(await store.get('courses', course.id));
    assert.ok(await store.get('plans', plan.id));
    assert.equal((await store.list('practice')).length, 1);
    assert.equal((await request(`/api/classroom-handoffs/${handoff.id}`)).status, 200);
    assert.equal((await request(`/api/attempt-deletions/${attempt.id}`)).status, 404);
    fail = false;
    const retry = (await preview(request, attempt.id)).data;
    assert.equal((await remove(request, attempt.id, retry.revision)).status, 200);
  });
}

test('storage validates the whole batch before deleting files or accepting receipt destinations', async (t) => {
  const { store } = await instance(t);
  await store.put('practice', 'safe-record', { id: 'safe-record', owner: 'test-owner' });
  for (const target of [
    { collection: '../sessions', id: 'bad' },
    { collection: 'practice', id: '../../bad' },
  ]) {
    await assert.rejects(
      store.transaction(() =>
        store.deleteMany([{ collection: 'practice', id: 'safe-record' }, target]),
      ),
      /Invalid storage identifier/,
    );
    assert.ok(await store.get('practice', 'safe-record'));
    await assert.rejects(
      store.transaction(() =>
        store.deleteMany([{ collection: 'practice', id: 'safe-record' }], {
          records: [{ ...target, value: {} }],
        }),
      ),
      /Invalid storage identifier/,
    );
    assert.ok(await store.get('practice', 'safe-record'));
  }
});
