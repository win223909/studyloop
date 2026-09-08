import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { loadSamples } from '../server/core/samples.js';
import { CoreError } from '../server/core/providers.js';

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

test('safe provider classification reaches the client without upstream response details', async (t) => {
  const failure = new CoreError('provider_model', 'Check the model ID in Models & settings.');
  failure.cause = new Error('upstream-private-response');
  const { browser } = await instance(t, {
    core: {
      providerConfig: () => ({ generationAvailable: true }),
      createPlan: async () => {
        throw failure;
      },
    },
  });
  const result = await browser()('/api/plans', {
    topic: 'Decimal division',
    level: 'Primary school',
    language: 'en',
    mode: 'search',
  });
  assert.equal(result.status, 502);
  assert.equal(result.json.code, 'provider_model');
  assert.equal(result.json.error, failure.publicMessage);
  assert.deepEqual(Object.keys(result.json).sort(), ['code', 'error', 'generation']);
  assert.equal(result.json.generation.operation, 'plan');
  assert.equal(result.json.generation.phase, 'outline');
  assert.match(result.json.generation.requestId, /^[a-f0-9-]{36}$/);
  assert.ok(!JSON.stringify(result.json).includes('upstream-private-response'));
});

test('coverage failures expose only bounded recovery details and do not save a plan', async (t) => {
  const failure = new CoreError('sources_insufficient', 'More teaching material is needed.');
  failure.sourceSearch = {
    topic: '混合运算与数量关系',
    rounds: 2,
    queries: ['混合运算与数量关系', '四则运算'],
    suggestedTopics: ['运算顺序', '方程', '比例', 'extra'],
    rawResponse: 'private-provider-output',
  };
  const { browser } = await instance(t, {
    core: {
      providerConfig: () => ({ generationAvailable: true }),
      createPlan: async () => {
        throw failure;
      },
    },
  });
  const request = browser();
  const result = await request('/api/plans', {
    topic: failure.sourceSearch.topic,
    mode: 'search',
    language: 'zh',
    level: '小学高年级',
  });
  assert.equal(result.status, 422);
  assert.deepEqual(result.json.sourceSearch, {
    topic: failure.sourceSearch.topic,
    rounds: 2,
    queries: failure.sourceSearch.queries,
    suggestedTopics: ['运算顺序', '方程', '比例'],
  });
  assert.ok(!JSON.stringify(result.json).includes('private-provider-output'));
  assert.equal((await request('/api/courses')).json.courses.length, 3);
});

test('material provenance is validated before generation and keyword search cannot override sources', async (t) => {
  const calls = [];
  const { browser } = await instance(t, {
    core: {
      providerConfig: () => ({ generationAvailable: true }),
      createPlan: async (input) => {
        calls.push(input);
        return { title: input.topic };
      },
    },
  });
  const request = browser();
  const body = {
    topic: 'Equivalent fractions',
    level: 'Grade 6',
    language: 'en',
    mode: 'text',
    text: 'Original fixture teaching material. '.repeat(20),
    sourceTitle: '  Original mathematics notes, Grade 6, chapter 2, pages 8–10  ',
    sourceUrl: ' https://basic.smartedu.cn/tchMaterial/detail?contentId=fixture-public-id ',
  };
  const posted = await request('/api/plans', body);
  assert.equal(posted.status, 201);
  assert.equal(calls[0].sourceTitle, body.sourceTitle.trim());
  assert.equal(calls[0].sourceUrl, body.sourceUrl.trim());
  for (const invalid of [
    { sourceUrl: 'javascript:alert(1)' },
    { sourceUrl: 'https://user:password@example.org/' },
    { sourceUrl: ['https://example.org'] },
    { sourceUrl: 'https://example.org/' + 'x'.repeat(2000) },
    { sourceTitle: 'x'.repeat(201) },
    { sourceTitle: {} },
  ])
    assert.equal((await request('/api/plans', { ...body, ...invalid })).status, 400);
  assert.equal(calls.length, 1, 'Invalid metadata must not trigger a model request.');
  assert.equal((await request('/api/plans', { ...body, mode: 'search' })).status, 201);
  assert.equal(calls[1].sourceTitle, undefined);
  assert.equal(calls[1].sourceUrl, undefined);
});

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
