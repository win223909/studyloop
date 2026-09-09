import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError, formatApiError, normalizeSourceSearch } from '../src/api-errors.js';

const valid = {
  topic: '混合运算与数量关系',
  rounds: 2,
  queries: ['混合运算与数量关系', '混合运算', '数量关系'],
  suggestedTopics: ['混合运算', '数量关系'],
};

test('source recovery preserves bounded search evidence without unknown fields', () => {
  const error = createApiError(
    {
      code: 'sources_insufficient',
      error: 'raw upstream <html>',
      sourceSearch: { ...valid, rawHtml: '<script>private</script>' },
    },
    422,
  );
  assert.deepEqual(error.sourceSearch, valid);
  assert.notEqual(error.sourceSearch.queries, valid.queries);
  assert.doesNotMatch(formatApiError(error, 'zh'), /raw|<html>/);
  assert.doesNotMatch(formatApiError(error, 'en'), /raw|<html>/);
  assert.equal(normalizeSourceSearch({ ...valid, rounds: 1 }).rounds, 1);
});

test('malformed diagnostics cannot claim search rounds or supply HTML topics', () => {
  for (const change of [
    { topic: '<svg onload=alert(1)>' },
    { topic: 'x'.repeat(201) },
    { rounds: 0 },
    { rounds: 3 },
    { rounds: '2' },
    { queries: 'not an array' },
    { queries: Array(7).fill('topic') },
    { suggestedTopics: Array(4).fill('topic') },
  ])
    assert.equal(normalizeSourceSearch({ ...valid, ...change }), undefined);
});

test('query and suggestion entries remain short plain keywords, never URLs or HTML', () => {
  const result = normalizeSourceSearch({
    ...valid,
    queries: ['<b>HTML query</b>', 'https://example.com', '混合运算', ' 混合运算 '],
    suggestedTopics: ['javascript:alert(1)', 'title\nwith control', '数量关系'],
  });
  assert.deepEqual(result.queries, ['混合运算']);
  assert.deepEqual(result.suggestedTopics, ['数量关系']);
});

test('search evidence is restricted to the two source coverage errors', () => {
  for (const code of ['sources_missing', 'sources_insufficient'])
    assert.deepEqual(createApiError({ code, sourceSearch: valid }, 422).sourceSearch, valid);
  for (const code of ['provider_response', 'search_auth', 'bank_invalid'])
    assert.equal(createApiError({ code, sourceSearch: valid }, 422).sourceSearch, undefined);
});
