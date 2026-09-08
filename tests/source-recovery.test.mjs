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
            title: pageid === 1 ? '中央处理器' : `数学概念${pageid}`,
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
  assert.ok(plan.sources.every((source) => source.title !== '中央处理器'));
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
  assert.equal(plan.sources[0].title, '数学概念2');
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
