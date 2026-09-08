import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreError,
  createPlan,
  generateCourse,
  providerConfig,
  searchSources,
  testProvider,
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

test('provided textbook metadata stays attached to source text without fetching its URL', async () => {
  const calls = [];
  const sourceTitle = 'Original mathematics notes, Grade 6, chapter 2, pages 8–10';
  const sourceUrl = 'https://basic.smartedu.cn/tchMaterial/detail?contentId=fixture-public-id';
  const plan = await createPlan(
    { ...input, sourceTitle, sourceUrl },
    {
      env,
      fetch: mockProvider([outline], 'openai-compatible', calls),
    },
  );
  assert.deepEqual(plan.sources, [
    {
      id: 'source-1',
      title: sourceTitle,
      text: input.text.trim(),
      kind: 'upload',
      url: sourceUrl,
    },
  ]);
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((call) => String(call.url).includes('smartedu.cn')));
  assert.match(JSON.stringify(calls[0].body), /Original mathematics notes/);
  assert.match(JSON.stringify(calls[0].body), /fixture-public-id/);
});

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

test('provider errors distinguish model, parameters, billing, routes, and rate limits safely', async () => {
  const privateDetail = 'private-upstream-diagnostic';
  const cases = [
    // MiniMax can omit error.code entirely, including for an unknown numeric model ID.
    [
      400,
      {
        type: 'bad_request_error',
        message: `invalid params, unknown model '1234567890' (2013) ${privateDetail}`,
      },
      'provider_model',
    ],
    [
      400,
      {
        type: 'bad_request_error',
        message: `invalid params, unsupported max_completion_tokens (2013) ${privateDetail}`,
      },
      'provider_request',
    ],
    [404, { code: 'model_not_found', message: privateDetail }, 'provider_model'],
    [
      400,
      { type: 'invalid_request_error', param: 'model', message: privateDetail },
      'provider_model',
    ],
    [404, { type: 'not_found_error', message: privateDetail }, 'provider_endpoint'],
    [429, { type: 'insufficient_quota', message: privateDetail }, 'provider_quota'],
    [429, { code: 'credit_balance_exhausted', message: privateDetail }, 'provider_quota'],
    [429, { code: 'project_spend_limit_exceeded', message: privateDetail }, 'provider_quota'],
    [
      429,
      {
        type: 'rate_limit_error',
        message: `You have reached your monthly spend limit. ${privateDetail}`,
      },
      'provider_quota',
    ],
    [
      400,
      {
        type: 'invalid_request_error',
        message: `Your credit balance is too low. ${privateDetail}`,
      },
      'provider_quota',
    ],
    [429, { type: 'rate_limit_error', message: privateDetail }, 'provider_rate_limit'],
    [429, { status: 'RESOURCE_EXHAUSTED', message: privateDetail }, 'provider_rate_limit'],
    [400, { status: 'INVALID_ARGUMENT', message: privateDetail }, 'provider_request'],
    [
      400,
      {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: privateDetail,
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_INVALID',
            metadata: { key: env.LLM_API_KEY },
          },
        ],
      },
      'provider_auth',
    ],
    [400, { code: 'context_length_exceeded', message: privateDetail }, 'provider_context_limit'],
    [403, { type: 'permission_error', message: privateDetail }, 'provider_auth'],
    [402, { type: 'billing_error', message: privateDetail }, 'provider_quota'],
    [408, { message: privateDetail }, 'provider_timeout'],
    [503, { type: 'overloaded_error', message: privateDetail }, 'provider_unavailable'],
  ];
  for (const [status, upstreamError, expected] of cases) {
    await assert.rejects(
      () =>
        testProvider({ env, fetch: async () => jsonResponse({ error: upstreamError }, status) }),
      (failure) => {
        assert.ok(failure instanceof CoreError);
        assert.equal(
          failure.code,
          expected,
          `HTTP ${status}, ${upstreamError.type || upstreamError.code || upstreamError.status}`,
        );
        assert.equal(failure.message, failure.publicMessage);
        const exposed = `${JSON.stringify(failure)} ${failure.message} ${failure.stack}`;
        assert.ok(!exposed.includes(privateDetail));
        assert.ok(!exposed.includes(env.LLM_API_KEY));
        assert.ok(!exposed.includes('1234567890'));
        return true;
      },
    );
  }
});

test('MiniMax HTTP 200 business failures are rejected before parsing model content', async () => {
  for (const [statusCode, expected] of [
    [1001, 'provider_timeout'],
    [1002, 'provider_rate_limit'],
    [1004, 'provider_auth'],
    ['1008', 'provider_quota'],
    [1024, 'provider_unavailable'],
    [1026, 'provider_content_filter'],
    [1027, 'provider_content_filter'],
    [1039, 'provider_context_limit'],
    [2013, 'provider_request'],
    [2049, 'provider_auth'],
    [2056, 'provider_quota'],
    [9999, 'provider_http'],
  ]) {
    await assert.rejects(
      () =>
        testProvider({
          env,
          fetch: async () =>
            jsonResponse({
              base_resp: { status_code: statusCode, status_msg: 'private-business-diagnostic' },
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
        }),
      (failure) =>
        failure instanceof CoreError &&
        failure.code === expected &&
        !failure.message.includes('private-business-diagnostic'),
    );
  }
  await assert.rejects(
    () =>
      testProvider({
        env,
        fetch: async () => jsonResponse({ error: { code: 'model_not_found' } }),
      }),
    (failure) => failure.code === 'provider_model',
  );
});

test('successful business status and numeric deployment IDs remain valid', async () => {
  const calls = [];
  const result = await testProvider({
    env: { ...env, LLM_MODEL: '1234567890' },
    fetch: mockProvider(
      [
        jsonResponse({
          base_resp: { status_code: 0, status_msg: 'success' },
          choices: [
            {
              message: {
                content: '{"ok":true,"error":"a model output field is not an API failure"}',
              },
            },
          ],
        }),
      ],
      'openai-compatible',
      calls,
    ),
  });
  assert.deepEqual(result.models, ['1234567890']);
  assert.equal(calls[0].body.model, '1234567890');
});

test('malformed and oversized error bodies preserve useful HTTP errors without exposing content', async () => {
  for (const [status, expected] of [
    [401, 'provider_auth'],
    [404, 'provider_endpoint'],
    [429, 'provider_rate_limit'],
    [502, 'provider_unavailable'],
  ]) {
    await assert.rejects(
      () =>
        testProvider({
          env,
          fetch: async () => new Response('<html>private-gateway-response</html>', { status }),
        }),
      (failure) =>
        failure.code === expected && !failure.message.includes('private-gateway-response'),
    );
  }
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(40_000));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    () => testProvider({ env, fetch: async () => new Response(body, { status: 404 }) }),
    (failure) => failure.code === 'provider_endpoint',
  );
  assert.equal(cancelled, true);
  await assert.rejects(
    () =>
      testProvider({
        env,
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('private-stream-failure'));
              },
            }),
            { status: 401 },
          ),
      }),
    (failure) =>
      failure.code === 'provider_auth' && !failure.message.includes('private-stream-failure'),
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

test('Chinese encyclopedia queries separate connecting particles without corrupting subject terms', async () => {
  for (const [topic, expected] of [
    ['小数的除法', '小数 除法'],
    ['C++的入门', 'C++ 入门'],
    ['目的地', '目的地'],
  ]) {
    const sources = await searchSources(topic, 'zh', {
      env: {},
      fetch: async (url) => {
        const request = new URL(url);
        if (request.searchParams.get('list') === 'search') {
          assert.equal(request.searchParams.get('srsearch'), expected);
          return jsonResponse({ query: { search: [{ pageid: 10 }] } });
        }
        return jsonResponse({
          query: {
            pages: [
              {
                pageid: 10,
                title: topic,
                extract: sourceCourse.sources[0].text,
                fullurl: 'https://zh.wikipedia.org/wiki/10',
              },
            ],
          },
        });
      },
    });
    assert.equal(sources.length, 1);
  }
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

for (const protocol of ['openai-compatible', 'anthropic', 'gemini']) {
  test(`configuration probe uses ${protocol} and validates both selected models`, async () => {
    const calls = [];
    const result = await testProvider({
      env: { ...env, LLM_PROVIDER: protocol, LLM_REVIEW_MODEL: 'test-review' },
      fetch: mockProvider([{ ok: true }, { ok: true }], protocol, calls),
    });
    assert.deepEqual(result, { ok: true, models: ['test-model', 'test-review'] });
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(result).includes(env.LLM_API_KEY), false);
  });
}
test('configuration probes reject unusable responses and redact authentication errors', async () => {
  await assert.rejects(
    testProvider({ env, fetch: mockProvider([{ ok: false }]) }),
    (e) => e.code === 'model_format',
  );
  await assert.rejects(
    testProvider({
      env,
      fetch: mockProvider([jsonResponse({ error: 'test-private-provider-body' }, 401)]),
    }),
    (e) => e.code === 'provider_auth' && !e.message.includes('test-private-provider-body'),
  );
});
