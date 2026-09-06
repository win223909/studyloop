import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { loadSamples } from '../server/core/samples.js';

async function instance(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-test-'));
  const env = { DATA_DIR: directory, ...options.env };
  const app = await createApp({ ...options, env });
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
      const multipart = body instanceof FormData;
      const response = await fetch(base + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
          ...extra.headers,
        },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, json: await response.json(), response };
    };
  }
  return { browser, directory };
}

test('sample practice, unknown answers, immutable replay and owner isolation', async (t) => {
  const { browser } = await instance(t);
  const first = browser(),
    second = browser();
  const listing = await first('/api/courses');
  assert.equal(listing.json.courses.length, 3);
  const sample = (await loadSamples())[0];
  const publicResult = await first(`/api/courses/${sample.id}`);
  for (const question of publicResult.json.course.questions) {
    for (const field of ['answerIndex', 'explanation', 'lesson', 'practice'])
      assert.equal(field in question, false);
  }
  assert.equal((await first(`/api/courses/${sample.id}/attempts`, { answers: {} })).status, 400);
  const answers = Object.fromEntries(sample.questions.map((question) => [question.id, 'unknown']));
  const posted = await first(`/api/courses/${sample.id}/attempts`, { answers });
  assert.equal(posted.status, 201);
  const attempt = posted.json.attempt;
  assert.equal(attempt.score, 0);
  assert.equal(attempt.unknown, sample.questions.length);
  assert.ok(
    attempt.results.every(
      (result) => result.status === 'unknown' && result.lesson && result.practice,
    ),
  );
  assert.ok(attempt.results.every((result) => !('answerIndex' in result.practice)));
  assert.equal((await second(`/api/attempts/${attempt.id}`)).status, 404);
  assert.equal((await second('/api/attempts')).json.attempts.length, 0);
  const question = sample.questions[0];
  const practice = await first(`/api/attempts/${attempt.id}/practice/${question.id}`, {
    answer: question.practice.answerIndex,
  });
  assert.equal(practice.json.correct, true);
  assert.deepEqual((await first(`/api/attempts/${attempt.id}`)).json.attempt, attempt);
  const brief = await first(`/api/attempts/${attempt.id}/openmaic`);
  assert.match(brief.json.markdown, /OpenMAIC/);
  assert.ok(!brief.json.markdown.includes(attempt.id));
  assert.equal((await second(`/api/attempts/${attempt.id}/openmaic`)).status, 404);
});

test('course imports validate keys/references and remain in owner library', async (t) => {
  const { browser } = await instance(t);
  const first = browser(),
    second = browser();
  const course = structuredClone((await loadSamples())[0]);
  course.questions[0].answerIndex = 99;
  assert.equal((await first('/api/import', course)).status, 400);
  course.questions[0].answerIndex = 0;
  course.questions[0].sourceIds = ['missing'];
  assert.equal((await first('/api/import', course)).status, 400);
  const valid = (await loadSamples())[0];
  const imported = await first('/api/import', valid);
  assert.equal(imported.status, 201);
  assert.notEqual(imported.json.course.id, valid.id);
  assert.equal(imported.json.course.origin, 'imported');
  assert.equal((await second(`/api/courses/${imported.json.course.id}`)).status, 404);
  assert.equal(
    (await first(`/api/courses/${imported.json.course.id}/export`)).json.questions[0].answerIndex,
    valid.questions[0].answerIndex,
  );
});

test('password gate and CSRF protection; credentials never appear in config', async (t) => {
  const { browser } = await instance(t, {
    env: { INSTANCE_PASSWORD: 'test-only-access', LLM_API_KEY: 'unit-test-secret' },
  });
  const request = browser();
  assert.equal((await request('/api/session')).json.authenticated, false);
  assert.equal((await request('/api/courses')).status, 401);
  assert.equal((await request('/api/login', { password: 'wrong' })).status, 401);
  assert.equal(
    (
      await request(
        '/api/login',
        { password: 'test-only-access' },
        { headers: { Origin: 'https://unrelated.example' } },
      )
    ).status,
    403,
  );
  assert.equal((await request('/api/login', { password: 'test-only-access' })).status, 200);
  assert.equal((await request('/api/courses')).status, 200);
  const config = await request('/api/config');
  assert.ok(!JSON.stringify(config.json).includes('unit-test-secret'));
  assert.ok(!JSON.stringify(config.json).includes('test-only-access'));
});

test('missing model is explicit; no pretend keyword generation', async (t) => {
  const { browser } = await instance(t);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    topic: 'gravity',
    level: 'Grade 6',
    language: 'en',
    mode: 'search',
  }))
    form.set(key, value);
  const result = await browser()('/api/plans', form);
  assert.equal(result.status, 503);
  assert.match(result.json.error, /\.env/);
});

test('outline confirmation, scoped plans, persistent daily cap and redacted errors', async (t) => {
  const sample = (await loadSamples())[0];
  const { browser } = await instance(t, {
    env: { DAILY_GENERATION_LIMIT: '2' },
    core: {
      providerConfig: () => ({ generationAvailable: true, searchAvailable: true }),
      createPlan: async (input) => ({
        ...input,
        title: input.topic,
        description: 'Test outline',
        subject: 'Math',
        objectives: sample.objectives,
        sources: sample.sources,
      }),
      generateCourse: async () => structuredClone(sample),
    },
  });
  const first = browser(),
    second = browser();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    topic: 'fractions',
    level: 'Grade 6',
    language: 'en',
    mode: 'text',
    text: 'An original source lesson about dividing a whole into equal parts. '.repeat(8),
  }))
    form.set(key, value);
  const {
    json: { plan },
  } = await first('/api/plans', form);
  assert.ok(plan.id);
  assert.equal(
    (
      await second('/api/courses', {
        planId: plan.id,
        objectives: plan.objectives,
        questionCount: 6,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await first('/api/courses', {
        planId: plan.id,
        objectives: ['invented objective'],
        questionCount: 6,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await first('/api/courses', {
        planId: plan.id,
        objectives: plan.objectives,
        questionCount: 6,
      })
    ).status,
    201,
  );
  assert.equal((await first('/api/plans', form)).status, 429);
});

test('raw provider errors are never returned', async (t) => {
  const { browser } = await instance(t, {
    onError: () => {},
    core: {
      providerConfig: () => ({ generationAvailable: true }),
      createPlan: async () => {
        throw new Error('Authorization: secret-should-never-appear');
      },
    },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    topic: 'gravity',
    level: 'Grade 6',
    language: 'en',
    mode: 'search',
  }))
    form.set(key, value);
  const result = await browser()('/api/plans', form);
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.json).includes('secret-should-never-appear'));
});
