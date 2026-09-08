import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { loadSamples } from '../server/core/samples.js';
import { CoreError } from '../server/core/providers.js';

const sample = loadSamples()[0];
const planBody = {
  topic: 'Replay fixture fractions',
  level: 'Beginner',
  language: 'en',
  mode: 'search',
};
const answers = Object.fromEntries(sample.questions.map((question) => [question.id, 'unknown']));
const question = sample.questions[0];
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function instance(t, hooks = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-api-replay-'));
  const calls = { plans: 0, courses: 0 };
  let store;
  let server;
  let base;
  const start = async () => {
    store = new Store(directory);
    const app = await createApp({
      env: { DATA_DIR: directory, DAILY_GENERATION_LIMIT: '100', MAX_CONCURRENT_GENERATIONS: '1' },
      store,
      onDiagnostic: () => {},
      onError: () => {},
      core: {
        providerConfig: () => ({ generationAvailable: true, searchAvailable: true }),
        createPlan: async (input) => {
          calls.plans++;
          await hooks.plan?.(input, calls.plans);
          return {
            title: input.topic,
            description: sample.description,
            subject: sample.subject,
            level: input.level,
            language: input.language,
            objectives: [...sample.objectives],
            sources: structuredClone(sample.sources),
          };
        },
        generateCourse: async (plan, options) => {
          calls.courses++;
          await hooks.course?.(plan, options, calls.courses);
          return {
            ...structuredClone(sample),
            ...plan,
            questions: structuredClone(sample.questions.slice(0, options.questionCount)),
          };
        },
      },
    });
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (!server) return;
    hooks.release?.();
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  };
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  await start();
  function browser() {
    let cookie = '';
    const raw = async (endpoint, body, extra = {}) => {
      const response = await fetch(base + endpoint, {
        method: extra.method || (body === undefined ? 'GET' : 'POST'),
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Origin: base,
          ...(extra.key ? { 'Idempotency-Key': extra.key } : {}),
          ...extra.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: extra.signal,
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return response;
    };
    const request = async (...args) => {
      const response = await raw(...args);
      return { status: response.status, data: await response.json() };
    };
    return { request, raw };
  }
  return {
    directory,
    calls,
    browser,
    get store() {
      return store;
    },
    restart: async () => {
      await stop();
      await start();
    },
  };
}

function publicQuestions(course) {
  assert.equal(course.questions.length, 6);
  for (const question of course.questions) {
    for (const field of ['answerIndex', 'explanation', 'lesson', 'practice'])
      assert.equal(Object.hasOwn(question, field), false, `Public question leaked ${field}`);
  }
  assert.equal(Object.hasOwn(course, 'request'), false);
}

async function pipeline(request, key = 'pipeline-replay-key', topic = planBody.topic) {
  const planResult = await request('/api/plans', { ...planBody, topic }, { key });
  assert.equal(planResult.status, 201);
  const plan = planResult.data.plan;
  const courseBody = { planId: plan.id, objectives: plan.objectives, questionCount: 6 };
  const courseResult = await request('/api/courses', courseBody, { key });
  assert.equal(courseResult.status, 201);
  const course = courseResult.data.course;
  const attemptEndpoint = `/api/courses/${course.id}/attempts`;
  const attemptResult = await request(attemptEndpoint, { answers }, { key });
  assert.equal(attemptResult.status, 201);
  const attempt = attemptResult.data.attempt;
  const practiceEndpoint = `/api/attempts/${attempt.id}/practice/${question.id}`;
  const practiceResult = await request(practiceEndpoint, { answer: 'unknown' }, { key });
  assert.equal(practiceResult.status, 200);
  return { plan, course, courseBody, attempt, attemptEndpoint, practiceEndpoint, practiceResult };
}

test('all four APIs share concurrent requests, replay after restart, and retain public course filtering', async (t) => {
  const planEntered = deferred();
  const releasePlan = deferred();
  const courseEntered = deferred();
  const releaseCourse = deferred();
  const app = await instance(t, {
    release: () => {
      releasePlan.resolve();
      releaseCourse.resolve();
    },
    plan: async () => {
      planEntered.resolve();
      await releasePlan.promise;
    },
    course: async () => {
      courseEntered.resolve();
      await releaseCourse.promise;
    },
  });
  const { request } = app.browser();
  await request('/api/session');
  const key = 'all-four-operations';
  const firstPlan = request('/api/plans', planBody, { key });
  await planEntered.promise;
  const duplicatePlan = request('/api/plans', { ...planBody }, { key });
  assert.equal(
    (await request('/api/plans', { ...planBody, topic: 'Changed topic' }, { key })).status,
    409,
  );
  releasePlan.resolve();
  const [p1, p2] = await Promise.all([firstPlan, duplicatePlan]);
  assert.equal(p1.status, 201);
  assert.deepEqual(p2, p1);
  const plan = p1.data.plan;
  const courseBody = { planId: plan.id, objectives: plan.objectives, questionCount: 6 };
  const firstCourse = request('/api/courses', courseBody, { key });
  await courseEntered.promise;
  const duplicateCourse = request('/api/courses', courseBody, { key });
  assert.equal(
    (await request('/api/courses', { ...courseBody, questionCount: 4 }, { key })).status,
    409,
  );
  releaseCourse.resolve();
  const [c1, c2] = await Promise.all([firstCourse, duplicateCourse]);
  assert.equal(c1.status, 201);
  assert.deepEqual(c2, c1);
  publicQuestions(c1.data.course);
  assert.ok((await app.store.get('courses', c1.data.course.id)).course.questions[0].practice);
  const attemptEndpoint = `/api/courses/${c1.data.course.id}/attempts`;
  const reorderedAnswers = Object.fromEntries(Object.entries(answers).reverse());
  const [a1, a2] = await Promise.all([
    request(attemptEndpoint, { answers }, { key }),
    request(attemptEndpoint, { answers: reorderedAnswers }, { key }),
  ]);
  assert.equal(a1.status, 201);
  assert.deepEqual(a2, a1);
  assert.equal(a1.data.attempt.unknown, 6);
  assert.equal(
    (await request(attemptEndpoint, { answers: { ...answers, [question.id]: 0 } }, { key })).status,
    409,
  );
  const practiceEndpoint = `/api/attempts/${a1.data.attempt.id}/practice/${question.id}`;
  const [pr1, pr2] = await Promise.all([
    request(practiceEndpoint, { answer: 'unknown' }, { key }),
    request(practiceEndpoint, { answer: 'unknown' }, { key }),
  ]);
  assert.equal(pr1.status, 200);
  assert.deepEqual(pr2, pr1);
  assert.equal(
    (await request(practiceEndpoint, { answer: question.practice.answerIndex }, { key })).status,
    409,
  );
  assert.deepEqual(app.calls, { plans: 1, courses: 1 });
  for (const collection of ['plans', 'courses', 'attempts', 'practice']) {
    const records = await app.store.list(collection);
    assert.equal(records.length, 1, collection);
    assert.equal(records[0].request.key, key);
    assert.match(records[0].request.fingerprint, /^[a-f0-9]{64}$/);
  }
  assert.equal(
    (await app.store.list('usage'))[0].count,
    2,
    'Replays must not consume generation quota',
  );
  await app.restart();
  const replays = await Promise.all([
    request('/api/plans', planBody, { key }),
    request('/api/courses', courseBody, { key }),
    request(attemptEndpoint, { answers }, { key }),
    request(practiceEndpoint, { answer: 'unknown' }, { key }),
  ]);
  assert.deepEqual(replays, [p1, c1, a1, pr1]);
  publicQuestions(replays[1].data.course);
  assert.deepEqual(app.calls, { plans: 1, courses: 1 });
  for (const collection of ['plans', 'courses', 'attempts', 'practice'])
    assert.equal((await app.store.list(collection)).length, 1, collection);
});

test('a disconnected client can retry a completed course generation without a second model call', async (t) => {
  const entered = deferred();
  const release = deferred();
  const app = await instance(t, {
    release: () => release.resolve(),
    course: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  const { request, raw } = app.browser();
  const plan = (await request('/api/plans', planBody, { key: 'drop-plan' })).data.plan;
  const body = { planId: plan.id, objectives: plan.objectives, questionCount: 6 };
  const controller = new AbortController();
  const dropped = raw('/api/courses', body, { key: 'dropped-course', signal: controller.signal });
  const rejected = assert.rejects(dropped, (error) => error.name === 'AbortError');
  await entered.promise;
  controller.abort();
  await rejected;
  release.resolve();
  const deadline = Date.now() + 5000;
  while (!(await app.store.list('courses')).length && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const persisted = await app.store.list('courses');
  assert.equal(
    persisted.length,
    1,
    'Generation must finish before the disconnected request is retried',
  );
  await app.restart();
  const replayed = await request('/api/courses', body, { key: 'dropped-course' });
  assert.equal(replayed.status, 201);
  assert.equal(replayed.data.course.id, persisted[0].course.id);
  publicQuestions(replayed.data.course);
  assert.deepEqual(app.calls, { plans: 1, courses: 1 });
  assert.equal((await app.store.list('courses')).length, 1);
});

test('the same keys in other browsers cannot replay or access another owner’s course, answer, or practice', async (t) => {
  const app = await instance(t);
  const first = app.browser().request;
  const second = app.browser().request;
  const key = 'same-key-two-owners';
  const one = await pipeline(first, key);
  const two = await pipeline(second, key);
  assert.notEqual(one.plan.id, two.plan.id);
  assert.notEqual(one.course.id, two.course.id);
  assert.notEqual(one.attempt.id, two.attempt.id);
  assert.deepEqual(app.calls, { plans: 2, courses: 2 });
  assert.equal((await second(`/api/courses/${one.course.id}`)).status, 404);
  assert.equal((await second('/api/courses', one.courseBody, { key })).status, 404);
  assert.equal((await second(one.attemptEndpoint, { answers }, { key })).status, 404);
  assert.equal((await second(`/api/attempts/${one.attempt.id}`)).status, 404);
  assert.equal((await second(one.practiceEndpoint, { answer: 'unknown' }, { key })).status, 404);
  assert.deepEqual(
    (await second('/api/attempts')).data.attempts.map((item) => item.id),
    [two.attempt.id],
  );
  for (const collection of ['plans', 'courses', 'attempts', 'practice'])
    assert.equal((await app.store.list(collection)).length, 2, collection);
  assert.deepEqual(app.calls, { plans: 2, courses: 2 });
});

test('deletion removes request metadata and all generated result copies with no additional replay cache', async (t) => {
  const app = await instance(t);
  const { request } = app.browser();
  const marker = 'DELETE_REPLAY_CONTENT_FIXTURE';
  const key = 'delete-all-replay-metadata';
  const generated = await pipeline(request, key, marker);
  const filenames = [];
  for (const collection of ['plans', 'courses', 'attempts', 'practice'])
    for (const record of await app.store.list(collection)) {
      const id = record.id || record.plan?.id || record.course?.id || record.attempt?.id;
      filenames.push(app.store.file(collection, id));
      assert.equal(record.request.key, key);
    }
  const practice = (await app.store.list('practice'))[0];
  assert.deepEqual(practice.result, generated.practiceResult.data);
  const scope = (await request(`/api/attempts/${generated.attempt.id}/deletion-preview`)).data;
  assert.deepEqual(scope.counts, { attempts: 1, practice: 1, handoffs: 0, courses: 1, plans: 1 });
  const deleted = await request(
    `/api/attempts/${generated.attempt.id}`,
    { revision: scope.revision },
    { method: 'DELETE' },
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.completed, true);
  for (const filename of filenames) await assert.rejects(access(filename), { code: 'ENOENT' });
  for (const collection of ['plans', 'courses', 'attempts', 'practice'])
    assert.deepEqual(await app.store.list(collection), []);
  const allowedCollections = new Set([
    'plans',
    'courses',
    'attempts',
    'practice',
    'sessions',
    'usage',
    'attempt-deletions',
  ]);
  for (const collection of await readdir(app.directory)) {
    assert.ok(
      allowedCollections.has(collection),
      `Unexpected persistence collection: ${collection}`,
    );
    for (const name of await readdir(path.join(app.directory, collection))) {
      const contents = await readFile(path.join(app.directory, collection, name), 'utf8');
      assert.ok(!contents.includes(marker));
      assert.ok(!contents.includes(key));
      assert.ok(!contents.includes('"fingerprint"'));
      assert.ok(!contents.includes('"result"'));
    }
  }
  // An in-memory or restored response cache must not revive deleted course data.
  assert.equal((await request(generated.attemptEndpoint, { answers }, { key })).status, 404);
  assert.equal(
    (await request(generated.practiceEndpoint, { answer: 'unknown' }, { key })).status,
    404,
  );
  await app.restart();
  assert.equal((await request('/api/courses', generated.courseBody, { key })).status, 404);
  assert.equal((await request(generated.attemptEndpoint, { answers }, { key })).status, 404);
  assert.equal(
    (await request(generated.practiceEndpoint, { answer: 'unknown' }, { key })).status,
    404,
  );
  assert.deepEqual(app.calls, { plans: 1, courses: 1 });
  const receipt = (await request(`/api/attempt-deletions/${generated.attempt.id}`)).data;
  assert.equal(receipt.completed, true);
  assert.equal('request' in receipt, false);
});

test('a model failure leaves no replay record and the same request key can safely retry', async (t) => {
  const app = await instance(t, {
    plan: async (_input, attempt) => {
      if (attempt === 1) throw new CoreError('provider_model', 'Fixture model unavailable.');
    },
  });
  const { request } = app.browser();
  const key = 'retry-after-failure';
  const failed = await request('/api/plans', planBody, { key });
  assert.equal(failed.status, 502);
  assert.equal(failed.data.code, 'provider_model');
  assert.deepEqual(await app.store.list('plans'), []);
  const success = await request('/api/plans', planBody, { key });
  assert.equal(success.status, 201);
  assert.deepEqual(await request('/api/plans', planBody, { key }), success);
  assert.equal(app.calls.plans, 2);
  assert.equal((await app.store.list('plans')).length, 1);
});
