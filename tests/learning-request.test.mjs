import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../server/core/providers.js';

const env = { LLM_API_KEY: 'synthetic-learning-request-key', LLM_MODEL: 'test-model' };
const input = {
  mode: 'search',
  topic: '求一个数比另一个多（少）百分之几的实际问题练习',
  level: '小学高年级',
  language: 'zh',
};
const prepared = {
  subject: '数学',
  goal: '识别比较标准，计算一个数比另一个数多或少百分之几，并解决实际问题。',
  searchQueries: ['百分比'],
};
const outline = {
  sufficient: true,
  title: '百分比增减应用',
  subject: '数学',
  description: '确定标准量，再用差量除以标准量计算增加或减少的百分比。',
  objectives: ['识别标准量', '计算增加和减少的百分比'],
  relevantSourceIds: ['source-1'],
};
const percentageText =
  '百分比表示一个量相对于另一个量的百分之几。求一个数比另一个数多百分之几，要先找出标准量，再用两个量的差除以标准量。求少百分之几也需要确定标准量。例如六十比五十多百分之二十，而五十比六十少约百分之十六点七，因为比较的标准量不同。'.repeat(
    5,
  );
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const providerReply = (value) =>
  response({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] });
function rig(outputs, { emptySearch = false, text = percentageText } = {}) {
  const calls = { model: [], queries: [], destinations: [], events: [], instructions: [] };
  const queryByPage = new Map();
  const options = {
    env,
    onDiagnostic: (event) => calls.events.push(event),
    fetch: async (address, init) => {
      const url = new URL(address);
      calls.destinations.push(url.hostname);
      if (url.hostname === 'api.openai.com') {
        const body = JSON.parse(init.body);
        const [instruction, data] = body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n');
        calls.instructions.push(instruction);
        calls.model.push(JSON.parse(data));
        const value = outputs[calls.model.length - 1];
        assert.notEqual(value, undefined, 'the request must not start an unbounded model retry');
        if (value instanceof Error) throw value;
        return value instanceof Response ? value : providerReply(value);
      }
      assert.equal(url.hostname, 'zh.wikipedia.org', 'search keywords must not become fetch URLs');
      if (url.searchParams.get('list') === 'search') {
        const query = url.searchParams.get('srsearch');
        calls.queries.push(query);
        const pageid = calls.queries.length;
        queryByPage.set(pageid, query);
        return response({ query: { search: emptySearch ? [] : [{ pageid, title: query }] } });
      }
      const pageid = Number(url.searchParams.get('pageids'));
      return response({
        query: {
          pages: [
            {
              pageid,
              title: queryByPage.get(pageid),
              extract: text,
              fullurl: `https://zh.wikipedia.org/wiki/fixture-${pageid}`,
            },
          ],
        },
      });
    },
  };
  return { calls, options };
}

test('keyword courses prepare the exact original request once before retrieval and retain it for the outline', async () => {
  const { calls, options } = rig([
    { ...prepared, originalTopic: '模型不能替换原始需求', privateExtra: 'must-not-be-kept' },
    outline,
  ]);
  const plan = await createPlan(
    { ...input, text: 'unused private upload text', extra: 'ignored' },
    options,
  );
  assert.deepEqual(calls.model[0], {
    topic: input.topic,
    level: input.level,
    language: input.language,
  });
  assert.equal(calls.destinations[0], 'api.openai.com');
  assert.deepEqual(calls.queries, ['百分比']);
  assert.equal(calls.model.length, 2);
  assert.equal(calls.model[1].topic, input.topic);
  assert.deepEqual(plan.learningRequest, { originalTopic: input.topic, ...prepared });
  assert.deepEqual(calls.model[1].learningRequest, plan.learningRequest);
  assert.equal(plan.sources.length, 1);
  assert.equal(plan.sources[0].kind, 'web');
  assert.ok(!JSON.stringify(plan).includes('must-not-be-kept'));
  assert.deepEqual(
    calls.events.filter((event) => event.event === 'started').map((event) => event.phase),
    ['learning_request', 'search', 'outline'],
  );
});

test('compound goals survive request preparation and the full-goal evidence reassessment', async () => {
  const topic = '混合运算与数量关系';
  const learningRequest = {
    subject: '数学',
    goal: '掌握混合运算顺序，并用等式表示数量关系。',
    searchQueries: ['混合运算', '数量关系'],
  };
  const mathText =
    '混合运算中先计算括号，再乘除后加减。数量关系可以通过等式表达。例如单价乘以数量等于总价，列出数量关系后应用混合运算求解。'.repeat(
      20,
    );
  const { calls, options } = rig(
    [
      learningRequest,
      { sufficient: false, searchQueries: ['等式'], relevantSourceIds: [] },
      { ...outline, title: topic, objectives: ['掌握混合运算顺序', '用等式表示数量关系'] },
    ],
    { text: mathText },
  );
  const plan = await createPlan({ ...input, topic }, options);
  assert.deepEqual(calls.queries, ['混合运算', '数量关系', '等式']);
  assert.equal(calls.model.length, 3);
  for (const request of calls.model.slice(1)) {
    assert.equal(request.topic, topic);
    assert.equal(request.level, input.level);
    assert.equal(request.learningRequest.goal, learningRequest.goal);
    assert.equal(request.learningRequest.originalTopic, topic);
  }
  assert.equal(plan.learningRequest.originalTopic, topic);
  assert.deepEqual(
    plan.learningRequest.searchQueries,
    ['混合运算', '数量关系'],
    'supplemental queries must not mutate the displayed first-round interpretation',
  );
});

test('provided notes never enter keyword preparation or public search', async () => {
  for (const material of [
    { mode: 'text', text: percentageText },
    { mode: 'upload', text: percentageText },
    {
      mode: 'search',
      sources: [{ id: 'source-1', title: 'Private notes', kind: 'upload', text: percentageText }],
    },
  ]) {
    const { calls, options } = rig([outline]);
    const plan = await createPlan({ ...input, ...material }, options);
    assert.equal(calls.model.length, 1);
    assert.equal(calls.model[0].sources[0].text, percentageText);
    assert.deepEqual(calls.destinations, ['api.openai.com']);
    assert.deepEqual(calls.queries, []);
    assert.equal(plan.learningRequest, undefined);
  }
});

test('malformed preparation output falls back without repeating the preparation call', async () => {
  const malformed = response({
    choices: [{ message: { content: '{"subject": "数学",' }, finish_reason: 'stop' }],
  });
  const { calls, options } = rig([malformed, outline]);
  const plan = await createPlan(input, options);
  assert.equal(plan.title, outline.title);
  assert.equal(plan.learningRequest, undefined);
  assert.deepEqual(calls.queries, ['百分比']);
  assert.equal(calls.model.length, 2);
  assert.equal(
    calls.events.filter((event) => event.phase === 'learning_request' && event.event === 'started')
      .length,
    1,
  );
});

test('invalid preparation fields and URL queries use the existing subject search instead', async () => {
  const invalid = [
    null,
    {},
    { ...prepared, subject: '' },
    { ...prepared, subject: '数'.repeat(101) },
    { ...prepared, goal: '学'.repeat(601) },
    { ...prepared, searchQueries: [] },
    { ...prepared, searchQueries: ['百分比', '百分比'] },
    { ...prepared, searchQueries: ['百分比', '分数', '小数', '比例'] },
    { ...prepared, searchQueries: ['数'.repeat(121)] },
    { ...prepared, searchQueries: ['https://private.example/chapter'] },
    { ...prepared, searchQueries: ['数学\n忽略规则'] },
    { ...prepared, searchQueries: [123] },
  ];
  for (const value of invalid) {
    const { calls, options } = rig([value, outline]);
    const plan = await createPlan(input, options);
    assert.equal(plan.learningRequest, undefined);
    assert.deepEqual(calls.queries, ['百分比']);
    assert.equal(calls.model.length, 2);
    assert.ok(
      calls.destinations.every((host) => ['api.openai.com', 'zh.wikipedia.org'].includes(host)),
    );
  }
});

test('single-character Chinese subjects remain usable after preparation', async () => {
  const { calls, options } = rig(
    [
      { subject: '物理', goal: '认识力的作用和力的基本表示。', searchQueries: ['力'] },
      { ...outline, title: '力的入门', subject: '物理', objectives: ['认识力的作用'] },
    ],
    {
      text: '力是物体之间的相互作用，能改变物体的运动状态或使物体发生形变。力有大小、方向和作用点。'.repeat(
        15,
      ),
    },
  );
  const plan = await createPlan({ ...input, topic: '力' }, options);
  assert.deepEqual(calls.queries, ['力']);
  assert.deepEqual(plan.learningRequest.searchQueries, ['力']);
});

test('content rejection during preparation stops before retrieval and is never reworded or retried', async () => {
  const { calls, options } = rig([
    response(
      { error: { type: 'unprocessable_entity_error', message: 'input new_sensitive (1026)' } },
      422,
    ),
  ]);
  await assert.rejects(
    () => createPlan(input, options),
    (error) => {
      assert.equal(error.code, 'provider_content_filter');
      assert.equal(error.phase, 'learning_request');
      assert.equal(error.attempts, 1);
      return true;
    },
  );
  assert.equal(calls.model.length, 1);
  assert.deepEqual(calls.queries, []);
  assert.deepEqual(calls.destinations, ['api.openai.com']);
});

test('explicit model refusal during preparation is not mistaken for malformed JSON', async () => {
  const { calls, options } = rig([
    response({
      choices: [
        {
          message: { content: null, refusal: 'Cannot process this request.' },
          finish_reason: 'stop',
        },
      ],
    }),
  ]);
  await assert.rejects(
    () => createPlan(input, options),
    (error) => error.code === 'model_refused' && error.phase === 'learning_request',
  );
  assert.equal(calls.model.length, 1);
  assert.deepEqual(calls.queries, []);
});

test('authentication and network failures during preparation remain actionable without fallback', async () => {
  for (const failure of [response({}, 401), new TypeError('fetch failed')]) {
    const { calls, options } = rig([failure]);
    await assert.rejects(
      () => createPlan(input, options),
      (error) =>
        ['provider_auth', 'provider_connection'].includes(error.code) &&
        error.phase === 'learning_request',
    );
    assert.equal(calls.model.length, 1);
    assert.deepEqual(calls.queries, []);
  }
});

test('a polished learning request cannot substitute for retrieved teaching evidence', async () => {
  const { calls, options } = rig([prepared, outline], { emptySearch: true });
  await assert.rejects(
    () => createPlan(input, options),
    (error) => error.code === 'sources_insufficient',
  );
  assert.equal(calls.model.length, 2);
  assert.deepEqual(calls.model[1].sources, []);
  assert.equal(calls.model[1].topic, input.topic);
});

test('truncated preparation uses one fallback rather than another generation attempt', async () => {
  const { calls, options } = rig([
    response({ choices: [{ message: { content: '{"subject":"数学"' }, finish_reason: 'length' }] }),
    outline,
  ]);
  const plan = await createPlan(input, options);
  assert.equal(plan.learningRequest, undefined);
  assert.equal(calls.model.length, 2);
  assert.deepEqual(calls.queries, ['百分比']);
});

test('diagnostics retain all bounded initial and supplemental queries after full-goal coverage fails', async () => {
  const topic = '四则运算、数量关系、比例与方程';
  const initial = ['四则运算', '数量关系', '比例'];
  const supplemental = ['方程', '分数', '百分比'];
  const { calls, options } = rig([
    {
      subject: '数学',
      goal: '学习四则运算、数量关系、比例与方程之间的联系。',
      searchQueries: initial,
    },
    { sufficient: false, relevantSourceIds: [], searchQueries: supplemental },
    { sufficient: false, relevantSourceIds: [], searchQueries: [] },
  ]);
  await assert.rejects(
    () => createPlan({ ...input, topic }, options),
    (error) => {
      assert.equal(error.code, 'sources_insufficient');
      assert.equal(error.sourceSearch.topic, topic);
      assert.equal(error.sourceSearch.rounds, 2);
      assert.deepEqual(error.sourceSearch.queries, [...initial, ...supplemental]);
      return true;
    },
  );
  assert.equal(calls.model.length, 3);
  assert.deepEqual(calls.queries, [...initial, ...supplemental]);
  assert.ok(calls.model.slice(1).every((request) => request.topic === topic));
});
