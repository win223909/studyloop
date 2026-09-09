import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../server/core/providers.js';

const env = { LLM_API_KEY: 'test-placeholder', LLM_MODEL: 'test-model' };
const input = { mode: 'search', topic: '混合运算与数量关系', level: '小学高年级', language: 'zh' };
const outline = {
  sufficient: true,
  title: input.topic,
  subject: '数学',
  description: '使用四则运算和等式研究数量关系。',
  objectives: ['运用运算顺序', '用等式表示数量关系'],
  relevantSourceIds: ['source-1'],
};
const text =
  '乘除法优先于加减法，括号里的运算优先。等式两边表示相等的数量，可以用等式表示数量关系。'.repeat(
    20,
  );
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function rig(outputs, { emptyInitial = false, small = false, failSearch = false } = {}) {
  const calls = { queries: [], inputs: [], destinations: [] };
  const fetch = async (address, init) => {
    const url = new URL(address);
    calls.destinations.push(url.hostname);
    if (url.hostname === 'api.openai.com') {
      const body = JSON.parse(init.body);
      calls.inputs.push(JSON.parse(body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1]));
      const value = outputs[calls.inputs.length - 1];
      assert.notEqual(value, undefined, 'No unbounded model retry');
      if (value instanceof Response) return value;
      return response({
        choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
      });
    }
    assert.equal(url.hostname, 'zh.wikipedia.org', 'Keywords never become fetch URLs');
    if (failSearch) return response({}, 503);
    if (url.searchParams.get('list') === 'search') {
      calls.queries.push(url.searchParams.get('srsearch'));
      const first = calls.queries.length === 1;
      return response({
        query: {
          search: emptyInitial && first ? [] : [{ pageid: first ? 1 : calls.queries.length }],
        },
      });
    }
    const pageid = Number(url.searchParams.get('pageids'));
    return response({
      query: {
        pages: [
          {
            pageid,
            title: pageid === 1 ? '混合运算与数量关系基础' : calls.queries[pageid - 1],
            extract: small ? text.slice(0, 180) : text,
            fullurl: `https://zh.wikipedia.org/wiki/fixture-${pageid}`,
          },
        ],
      },
    });
  };
  return { calls, options: { env, fetch } };
}

test('covered searches keep one retrieval and one outline request', async () => {
  const { calls, options } = rig([outline]);
  const plan = await createPlan(input, options);
  assert.equal(plan.title, input.topic);
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.inputs.length, 1);
});

test('insufficient compound topic gets one supplemental round and is reassessed in full', async () => {
  const { calls, options } = rig([
    { sufficient: false, searchQueries: ['四则运算', '方程', '比例'], relevantSourceIds: [] },
    { ...outline, relevantSourceIds: ['source-1', 'source-2', 'source-3'] },
  ]);
  const plan = await createPlan(input, options);
  assert.equal(calls.queries.length, 4);
  assert.equal(calls.inputs.length, 2);
  for (const request of calls.inputs) {
    assert.equal(request.topic, input.topic);
    assert.equal(request.level, input.level);
  }
  assert.ok(plan.sources.every((source) => source.title !== '混合运算与数量关系基础'));
  assert.equal(plan.sources.length, 3);
  assert.deepEqual(
    plan.sources.map((source) => source.id),
    ['source-1', 'source-2', 'source-3'],
  );
});

test('zero initial sources still permits keyword recovery without accepting unsupported output', async () => {
  const { calls, options } = rig(
    [{ sufficient: false, searchQueries: ['四则运算'], relevantSourceIds: [] }, outline],
    { emptyInitial: true },
  );
  const plan = await createPlan(input, options);
  assert.deepEqual(calls.inputs[0].sources, []);
  assert.equal(calls.inputs.length, 2);
  assert.ok(plan.sources.length);
});

test('a model claiming sufficiency cannot bypass the minimum evidence gate', async () => {
  const { calls, options } = rig([outline], { emptyInitial: true, small: true });
  await assert.rejects(
    () => createPlan(input, options),
    (error) => {
      assert.equal(error.code, 'sources_insufficient');
      assert.equal(error.sourceSearch.rounds, 2);
      return true;
    },
  );
  assert.equal(calls.inputs.length, 1);
});

test('successful plans retain only selected, supplied teaching evidence', async () => {
  const { calls, options } = rig([
    { sufficient: false, searchQueries: ['四则运算', '方程'], relevantSourceIds: [] },
    { ...outline, relevantSourceIds: ['source-1', 'invented-id'] },
  ]);
  const plan = await createPlan(input, options);
  assert.equal(calls.inputs.length, 2);
  assert.equal(plan.sources.length, 1);
  assert.equal(plan.sources[0].id, 'source-1');
  assert.equal(plan.sources[0].title, '四则运算');
});

test('invented or empty source selections cannot turn recovery into a successful plan', async () => {
  for (const relevantSourceIds of [[], ['invented-id'], undefined, 'source-1']) {
    const { calls, options } = rig([
      { sufficient: false, searchQueries: ['四则运算'], relevantSourceIds: [] },
      { ...outline, relevantSourceIds },
    ]);
    await assert.rejects(
      () => createPlan(input, options),
      (error) => error.code === 'sources_insufficient' && error.sourceSearch.rounds === 2,
    );
    assert.equal(calls.inputs.length, 2);
  }
});

test('second refusal is final, actionable, bounded, and does not serialize model output', async () => {
  const { calls, options } = rig([
    { sufficient: false, searchQueries: ['四则运算'], relevantSourceIds: [] },
    {
      sufficient: false,
      searchQueries: ['运算顺序', 'https://private.example/file', 'x\ny', '方程', '比例', '函数'],
      debug: 'do-not-echo',
    },
  ]);
  await assert.rejects(
    () => createPlan(input, options),
    (error) => {
      assert.equal(error.code, 'sources_insufficient');
      assert.equal(error.sourceSearch.topic, input.topic);
      assert.equal(error.sourceSearch.rounds, 2);
      assert.deepEqual(error.sourceSearch.suggestedTopics, ['运算顺序', '方程', '比例']);
      assert.ok(error.sourceSearch.queries.length <= 4);
      assert.ok(!JSON.stringify(error).includes('do-not-echo'));
      return true;
    },
  );
  assert.equal(calls.inputs.length, 2);
  assert.ok(calls.queries.length <= 4);
});

test('invalid model keywords fall back to explicit concepts without fetching URLs', async () => {
  const { calls, options } = rig([
    { sufficient: false, searchQueries: ['https://private.example', 'abc\ndef', 1] },
    outline,
  ]);
  await createPlan(input, options);
  assert.deepEqual(calls.queries.slice(1), ['混合运算', '数量关系']);
  assert.ok(
    calls.destinations.every((host) => ['zh.wikipedia.org', 'api.openai.com'].includes(host)),
  );
});

test('a single concept with no usable hints fails without repeating the same search', async () => {
  const { calls, options } = rig([{ sufficient: false, searchQueries: ['Fractions'] }]);
  await assert.rejects(
    () => createPlan({ ...input, topic: 'Fractions' }, options),
    (error) => {
      assert.equal(error.sourceSearch.rounds, 1);
      assert.deepEqual(error.sourceSearch.suggestedTopics, []);
      return error.code === 'sources_insufficient';
    },
  );
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.inputs.length, 1);
});

test('provided material never triggers supplemental public search', async () => {
  for (const material of [
    { mode: 'text', text },
    { mode: 'upload', text },
    { mode: 'search', sources: [{ id: 'source-1', title: 'Private notes', kind: 'upload', text }] },
  ]) {
    const { calls, options } = rig([{ sufficient: false, searchQueries: ['Private terms'] }]);
    await assert.rejects(
      () => createPlan({ ...input, ...material }, options),
      (error) => error.code === 'sources_insufficient' && !error.sourceSearch,
    );
    assert.equal(calls.queries.length, 0);
    assert.equal(calls.inputs.length, 1);
  }
});

test('search and provider outages are not retried as content coverage failures', async () => {
  const search = rig([], { failSearch: true });
  await assert.rejects(
    () => createPlan(input, search.options),
    (error) => error.code === 'search_http' && !error.sourceSearch,
  );
  assert.equal(search.calls.inputs.length, 0);
  const provider = rig([response({}, 401)]);
  await assert.rejects(
    () => createPlan(input, provider.options),
    (error) => error.code === 'provider_auth' && !error.sourceSearch,
  );
  assert.equal(provider.calls.inputs.length, 1);
  assert.equal(provider.calls.queries.length, 1);
});

test('percentage word problems send relevant evidence and the complete original goal to the outline model', async () => {
  const topic = '求一个数比另一个多（少）百分之几的实际问题练习';
  const percentageText =
    '百分比表示一个量相对于另一个量的百分之几。求一个数比另一个数多百分之几，先求两个数的差，再除以作为比较标准的数，最后乘以百分之百。求少百分之几时仍要先确定比较的标准量。例如六十比五十多百分之二十，五十比六十少约百分之十六点七；因为标准量不同，两个百分比不相同。'.repeat(
      4,
    );
  const unrelatedMarker = 'UNRELATED_LONG_ARTICLE_MUST_NOT_REACH_MODEL';
  const unrelatedText =
    '这篇文章介绍历史人物的生平、任职经历和社会事件，与数学课程没有关系。'.repeat(200) +
    ` ${unrelatedMarker} 百分之几的变化只是文章末尾的一处统计。`;
  const pages = [
    { pageid: 10, title: '百分比', extract: percentageText },
    { pageid: 20, title: '白紙運動', extract: unrelatedText },
    { pageid: 30, title: '蔣經國', extract: unrelatedText },
  ];
  const queries = [];
  const modelInputs = [];
  const plan = await createPlan(
    { ...input, topic },
    {
      env,
      fetch: async (address, init) => {
        const url = new URL(address);
        if (url.hostname === 'api.openai.com') {
          const body = JSON.parse(init.body);
          modelInputs.push(
            JSON.parse(body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1]),
          );
          return response({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sufficient: true,
                    title: '百分比增减应用',
                    description: '确定比较标准并计算增加或减少的百分比。',
                    subject: '数学',
                    objectives: ['找出比较的标准量', '用差量除以标准量求百分比'],
                    relevantSourceIds: ['source-1'],
                  }),
                },
                finish_reason: 'stop',
              },
            ],
          });
        }
        assert.equal(url.hostname, 'zh.wikipedia.org');
        if (url.searchParams.get('list') === 'search') {
          queries.push(url.searchParams.get('srsearch'));
          return response({
            query: { search: pages.map(({ pageid, title }) => ({ pageid, title })) },
          });
        }
        const page = pages.find((item) => item.pageid === Number(url.searchParams.get('pageids')));
        assert.ok(page);
        return response({
          query: { pages: [{ ...page, fullurl: `https://zh.wikipedia.org/wiki/${page.pageid}` }] },
        });
      },
    },
  );
  assert.deepEqual(queries, ['百分比']);
  assert.equal(modelInputs.length, 1);
  assert.equal(
    modelInputs[0].topic,
    topic,
    'retrieval normalization must not narrow the course goal',
  );
  assert.equal(modelInputs[0].level, input.level);
  assert.deepEqual(
    modelInputs[0].sources.map((item) => item.title),
    ['百分比'],
  );
  assert.match(modelInputs[0].sources[0].text, /比较标准|比较的标准/);
  assert.doesNotMatch(JSON.stringify(modelInputs), /UNRELATED_LONG_ARTICLE|白紙運動|蔣經國/);
  assert.deepEqual(
    plan.sources.map((item) => item.title),
    ['百分比'],
  );
});
