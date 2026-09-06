import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreError,
  createPlan,
  generateCourse,
  providerConfig,
  searchSources,
} from '../server/core/providers.js';
import { loadSamples } from '../server/core/samples.js';

const sourceCourse = loadSamples().find((course) => course.id === 'fractions');
const env = { LLM_API_KEY: 'test-placeholder', LLM_MODEL: 'test-model' };
const outline = {
  sufficient: true,
  title: 'Fraction practice',
  description: 'A course supported by supplied notes.',
  subject: 'Mathematics',
  objectives: ['Compare and calculate fractions'],
};
const input = {
  topic: 'Fractions',
  level: 'Beginner',
  language: 'en',
  mode: 'text',
  text: sourceCourse.sources[0].text,
};
const jsonResponse = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function mockProvider(
  outputs,
  provider = 'openai-compatible',
  calls = [],
  wrapper = (text) => text,
) {
  let index = 0;
  return async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const value = outputs[index++];
    if (value instanceof Response) return value;
    const content = wrapper(JSON.stringify(value));
    return jsonResponse(
      provider === 'anthropic'
        ? { content: [{ type: 'text', text: content }], stop_reason: 'end_turn' }
        : provider === 'gemini'
          ? { candidates: [{ content: { parts: [{ text: content }] }, finishReason: 'STOP' }] }
          : { choices: [{ message: { content }, finish_reason: 'stop' }] },
    );
  };
}

function fixtureBank() {
  const questions = structuredClone(sourceCourse.questions.slice(0, 4));
  questions.forEach((q) => {
    q.concept = outline.objectives[0];
    q.sourceIds = ['source-1'];
  });
  const bank = { sufficient: true, questions };
  const review = {
    reviews: questions.map((q) => ({
      id: q.id,
      answerIndex: q.answerIndex,
      practiceAnswerIndex: q.practice.answerIndex,
      supported: true,
      unambiguous: true,
      sourceIds: q.sourceIds,
      reason: 'The cited rules support both calculations.',
    })),
  };
  const teaching = { valid: true, checkedIds: questions.map((q) => q.id) };
  return { bank, review, teaching };
}

test('no secrets or model configuration means samples-only; keyless requires opt-in', () => {
  assert.equal(providerConfig({ env: {} }).generationAvailable, false);
  assert.equal(providerConfig({ env }).generationAvailable, true);
  assert.equal(
    providerConfig({ env: { LLM_MODEL: 'local', LLM_BASE_URL: 'http://localhost:11434/v1' } })
      .generationAvailable,
    false,
  );
  assert.equal(
    providerConfig({
      env: {
        LLM_MODEL: 'local',
        LLM_BASE_URL: 'http://localhost:11434/v1',
        LLM_ALLOW_KEYLESS: 'true',
      },
    }).generationAvailable,
    true,
  );
  assert.equal(
    providerConfig({ env: { ...env, LLM_BASE_URL: 'https://secret@example.com/v1' } })
      .generationAvailable,
    false,
  );
  assert.equal(
    providerConfig({ env: { ...env, LLM_BASE_URL: 'https://example.com/v1?key=secret' } })
      .generationAvailable,
    false,
  );
  assert.equal(
    providerConfig({ env: { ...env, LLM_BASE_URL: 'not a URL' } }).generationAvailable,
    false,
  );
});

test('compatible vendors use max_tokens with an explicit override for gateways', async () => {
  for (const override of [undefined, 'max_completion_tokens']) {
    const calls = [];
    await createPlan(input, {
      env: { ...env, LLM_BASE_URL: 'https://model.example/v1', LLM_TOKEN_PARAMETER: override },
      fetch: mockProvider([outline], 'openai-compatible', calls),
    });
    assert.equal(calls[0].body[override || 'max_tokens'], 8192);
    assert.equal(calls[0].body[override ? 'max_tokens' : 'max_completion_tokens'], undefined);
  }
});

test('compatible protocol, reasoning prefix, citations, and blind review form a complete course', async () => {
  const { bank, review, teaching } = fixtureBank();
  const calls = [];
  const options = {
    env: { ...env, LLM_REVIEW_MODEL: 'review-model', LLM_JSON_MODE: 'true' },
    fetch: mockProvider(
      [outline, bank, review, teaching],
      'openai-compatible',
      calls,
      (text) =>
        `<think>Private reasoning is not course content.</think>\n\`\`\`json\n${text}\n\`\`\``,
    ),
  };
  const plan = await createPlan(input, options);
  const course = await generateCourse(
    plan,
    { objectives: plan.objectives, questionCount: 4 },
    options,
  );
  assert.equal(course.questions.length, 4);
  assert.equal(course.origin, 'generated');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-placeholder');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.equal(calls[0].body.max_completion_tokens, 8192);
  assert.equal(calls[0].body.max_tokens, undefined);
  assert.equal(calls[2].body.model, 'review-model');
  const blindInput = JSON.parse(
    calls[2].body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
  );
  assert.equal(Object.hasOwn(blindInput.questions[0], 'answerIndex'), false);
  assert.equal(Object.hasOwn(blindInput.questions[0].practice, 'answerIndex'), false);
  assert.equal(Object.hasOwn(blindInput.questions[0], 'explanation'), false);
});

for (const provider of ['anthropic', 'gemini'])
  test(`native ${provider} request and response protocol`, async () => {
    const calls = [];
    const plan = await createPlan(input, {
      env: { ...env, LLM_PROVIDER: provider },
      fetch: mockProvider([outline], provider, calls),
    });
    assert.equal(plan.title, outline.title);
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].url.includes('test-placeholder'), false);
    if (provider === 'anthropic') {
      assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
      assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
      assert.equal(calls[0].init.headers['x-api-key'], 'test-placeholder');
      assert.match(calls[0].body.system, /UNTRUSTED DATA/);
    } else {
      assert.equal(
        calls[0].url,
        'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
      );
      assert.equal(calls[0].init.headers['x-goog-api-key'], 'test-placeholder');
      assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
    }
  });

test('independent review rejects a wrong key, ambiguous question, missing evidence, or weak explanation', async () => {
  for (const kind of [
    'wrong-key',
    'ambiguous',
    'evidence',
    'teaching',
    'missing-review',
    'forged-source',
  ]) {
    const { bank, review, teaching } = fixtureBank();
    if (kind === 'wrong-key')
      review.reviews[0].answerIndex = (review.reviews[0].answerIndex + 1) % 4;
    if (kind === 'ambiguous') review.reviews[0].unambiguous = false;
    if (kind === 'evidence') review.reviews[0].sourceIds = ['invented'];
    if (kind === 'teaching') teaching.valid = false;
    if (kind === 'missing-review') review.reviews.pop();
    if (kind === 'forged-source') bank.questions[0].sourceIds = ['invented'];
    const options = { env, fetch: mockProvider([outline, bank, review, teaching]) };
    const plan = await createPlan(input, options);
    await assert.rejects(
      () => generateCourse(plan, { objectives: plan.objectives, questionCount: 4 }, options),
      (error) =>
        error instanceof CoreError &&
        ['review_rejected', 'review_invalid', 'teaching_review_rejected', 'bank_invalid'].includes(
          error.code,
        ),
    );
  }
});

test('thin or irrelevant material and tampered objectives never produce a bank', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      createPlan(
        { ...input, text: 'Fractions, week 1' },
        {
          env,
          fetch: async () => {
            calls++;
          },
        },
      ),
    /too little source material/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => createPlan(input, { env, fetch: mockProvider([{ sufficient: false }]) }),
    /enough relevant/,
  );
  const plan = await createPlan(input, { env, fetch: mockProvider([outline]) });
  await assert.rejects(
    () => generateCourse(plan, { objectives: ['Unapproved scope'], questionCount: 4 }, { env }),
    /confirmed outline/,
  );
  await assert.rejects(
    () => generateCourse(plan, { objectives: plan.objectives, questionCount: 99 }, { env }),
    /4, 6, or 8/,
  );
});

test('provider failures and malformed JSON never echo secret or remote response content', async () => {
  const sensitive = 'private-provider-response-and-secret';
  const optionsList = [
    { env, fetch: async () => new Response(sensitive, { status: 401 }) },
    { env, fetch: async () => new Response(sensitive, { status: 500 }) },
    {
      env,
      fetch: async () => {
        throw new Error(sensitive);
      },
    },
    { env, fetch: async () => jsonResponse({ choices: [{ message: { content: sensitive } }] }) },
  ];
  for (const options of optionsList)
    await assert.rejects(
      () => createPlan(input, options),
      (error) =>
        error instanceof CoreError &&
        !error.message.includes(sensitive) &&
        !error.message.includes(env.LLM_API_KEY),
    );
});

test('Wikipedia preserves search ranking and fetches each full extract separately', async () => {
  const requested = [];
  const sources = await searchSources('fractions', 'en', {
    env: {},
    fetch: async (url) => {
      const request = new URL(url);
      requested.push(request);
      if (request.searchParams.get('list') === 'search')
        return jsonResponse({
          query: {
            search: [
              { pageid: 10, title: 'Fraction' },
              { pageid: 20, title: 'Rational number' },
            ],
          },
        });
      const pageid = request.searchParams.get('pageids');
      return jsonResponse({
        query: {
          pages: [
            {
              pageid: Number(pageid),
              title: pageid === '10' ? 'Fraction' : 'Rational number',
              extract: sourceCourse.sources[0].text,
              fullurl: `https://en.wikipedia.org/wiki/${pageid}`,
            },
          ],
        },
      });
    },
  });
  assert.equal(requested[0].hostname, 'en.wikipedia.org');
  assert.equal(requested[0].searchParams.get('srsearch'), 'fractions');
  assert.equal(requested.length, 3);
  assert.ok(requested.every((url) => !url.searchParams.has('exchars')));
  assert.deepEqual(
    sources.map((source) => source.title),
    ['Fraction', 'Rational number'],
  );
  assert.equal(sources[0].kind, 'web');
  assert.match(sources[0].license, /CC BY-SA/);
  assert.ok(sources[0].retrievedAt);
});

test('Brave uses search excerpts only and does not fetch arbitrary result URLs', async () => {
  let calls = 0;
  const sources = await searchSources('fractions', 'zh', {
    env: { BRAVE_SEARCH_API_KEY: 'search-placeholder' },
    fetch: async (url, init) => {
      calls++;
      assert.equal(new URL(url).hostname, 'api.search.brave.com');
      assert.equal(init.headers['X-Subscription-Token'], 'search-placeholder');
      return jsonResponse({
        web: {
          results: [
            {
              title: '<b>Fractions</b>',
              url: 'https://example.org/lesson',
              description: sourceCourse.sources[0].text.slice(0, 500),
              extra_snippets: [sourceCourse.sources[0].text.slice(500)],
            },
          ],
        },
      });
    },
  });
  assert.equal(calls, 1);
  assert.match(sources[0].title, /search excerpts/);
  assert.equal(sources[0].title.includes('<b>'), false);
  assert.ok(sources[0].text.length > 400);
});
