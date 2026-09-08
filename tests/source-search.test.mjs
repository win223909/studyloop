import test from 'node:test';
import assert from 'node:assert/strict';
import { CoreError, searchSources } from '../server/core/providers.js';
import {
  fallbackSearchQueries,
  mergeSearchSources,
  normalizeSearchQueries,
} from '../server/core/source-search.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const text = 'These original fixture notes explain the subject and a worked example. '.repeat(5);
const source = (id, overrides = {}) => ({
  id: `prior-${id}`,
  title: `Source ${id}`,
  text,
  url: `https://example.org/lesson/${id}`,
  kind: 'web',
  license: 'Original test fixture',
  ...overrides,
});
const wikiPage = (id, extract = text) =>
  json({
    query: {
      pages: [
        {
          pageid: Number(id),
          title: `Page ${id}`,
          extract,
          fullurl: `https://en.wikipedia.org/wiki/Page_${id}`,
        },
      ],
    },
  });

test('query normalization rejects URLs, control characters and invalid lengths before limiting', () => {
  assert.deepEqual(normalizeSearchQueries('not an array'), []);
  assert.deepEqual(
    normalizeSearchQueries([
      null,
      {},
      7,
      '',
      'x',
      'x'.repeat(121),
      'alpha\nbeta',
      'alpha\u2028beta',
      'https://example.org',
      'example.org/lesson',
      'mailto:person@example.org',
      '??',
      '😀😀',
      'Read https://example.org/lesson',
      '//example.org',
      'www.example.org',
      'data:text/plain,lesson',
      'ｈｔｔｐｓ：／／example.org',
      '  Alpha   lesson  ',
      'ALPHA lesson',
      'Ｂｅｔａ',
      'Beta',
      'C++',
      'fourth query',
    ]),
    ['Alpha lesson', 'Ｂｅｔａ', 'C++'],
  );
  assert.deepEqual(normalizeSearchQueries(['aa', 'a'.repeat(120), 'third']), [
    'aa',
    'a'.repeat(120),
    'third',
  ]);
});

test('query exclusions accept one topic or a list without corrupting subject names', () => {
  assert.deepEqual(
    normalizeSearchQueries(['Fractions', 'Decimals', 'decimals'], {
      exclude: ' fractions ',
    }),
    ['Decimals'],
  );
  assert.deepEqual(
    normalizeSearchQueries(['Ａlpha', 'Beta', 'Gamma'], {
      exclude: ['alpha', 'BETA'],
    }),
    ['Gamma'],
  );
});

test('fallback queries split explicit parallel concepts without a subject dictionary', () => {
  assert.deepEqual(fallbackSearchQueries('混合运算与数量关系'), ['混合运算', '数量关系']);
  assert.deepEqual(fallbackSearchQueries('电流和电压、磁场；能量'), ['电流', '电压', '磁场']);
  assert.deepEqual(fallbackSearchQueries('Forces and motion; energy'), [
    'Forces',
    'motion',
    'energy',
  ]);
  assert.deepEqual(fallbackSearchQueries('C++与目的地'), ['C++', '目的地']);
  assert.deepEqual(fallbackSearchQueries('目的地'), []);
  assert.deepEqual(fallbackSearchQueries('Anderson localization'), []);
  assert.deepEqual(fallbackSearchQueries('https://example.org/alpha,and,beta'), []);
});

test('merging keeps earlier evidence, deduplicates canonical URLs and titles, and reassigns IDs', () => {
  const preferred = source('preferred');
  const groups = [
    [preferred],
    [
      source('anchor', { url: preferred.url + '#section' }),
      source('title', { title: ' SOURCE   preferred ' }),
      source('new', { id: preferred.id }),
    ],
  ];
  const snapshot = structuredClone(groups);
  const merged = mergeSearchSources(groups, 'lesson');
  assert.deepEqual(
    merged.map(({ title, id }) => ({ title, id })),
    [
      { title: 'Source preferred', id: 'source-1' },
      { title: 'Source new', id: 'source-2' },
    ],
  );
  assert.equal(merged[0].license, preferred.license);
  assert.equal(merged[0].text, preferred.text.trim());
  assert.deepEqual(groups, snapshot);
});

test('invalid sources cannot claim deduplication keys and every merge obeys both budgets', () => {
  const merged = mergeSearchSources([
    [
      source('bad', { title: 'Shared title', url: 'javascript:alert(1)' }),
      source('good', { title: 'Shared title' }),
      source('short', { text: 'Too short' }),
      ...Array.from({ length: 15 }, (_, i) => source(`item-${i}`)),
    ],
  ]);
  assert.equal(merged[0].url, 'https://example.org/lesson/good');
  assert.equal(merged.length, 8);
  assert.deepEqual(
    merged.map((item) => item.id),
    Array.from({ length: 8 }, (_, i) => `source-${i + 1}`),
  );
  const oversized = mergeSearchSources([
    Array.from({ length: 5 }, (_, i) => source(i, { text: '证'.repeat(10000) })),
  ]);
  assert.equal(
    oversized.reduce((sum, item) => sum + item.text.length, 0),
    36000,
  );
  assert.ok(oversized.every((item) => item.text.length >= 150 && item.text.length <= 10000));
  assert.ok(oversized.every((item) => /^证+$/u.test(item.text)));
});

test('multiple Wikipedia queries run concurrently with a hard bound of twelve requests', async () => {
  const calls = [];
  let releaseSearches;
  const allSearchesStarted = new Promise((resolve) => {
    releaseSearches = resolve;
  });
  const queryIndexes = new Map();
  const sources = await searchSources('combined topic', 'en', {
    env: {},
    searchQueries: ['Alpha', 'Beta', 'Gamma', 'Ignored fourth'],
    fetch: async (url) => {
      const request = new URL(url);
      calls.push(request);
      if (request.searchParams.get('list') === 'search') {
        const query = request.searchParams.get('srsearch');
        const index = queryIndexes.size;
        queryIndexes.set(query, index);
        if (queryIndexes.size === 3) releaseSearches();
        await allSearchesStarted;
        return json({
          query: {
            search: Array.from({ length: 7 }, (_, i) => ({
              pageid: index * 10 + i + 1,
            })),
          },
        });
      }
      return wikiPage(request.searchParams.get('pageids'));
    },
  });
  assert.deepEqual([...queryIndexes.keys()], ['Alpha', 'Beta', 'Gamma']);
  assert.equal(calls.length, 12);
  assert.equal(sources.length, 8);
  assert.deepEqual(
    sources.map((source) => source.title),
    [1, 11, 21, 2, 12, 22, 3, 13].map((id) => `Page ${id}`),
  );
  assert.ok(calls.every((url) => url.hostname === 'en.wikipedia.org'));
  assert.ok(calls.every((url) => !url.searchParams.has('exchars')));
});

test('Wikipedia caches equivalent query URLs and shared page responses across groups', async () => {
  const calls = [];
  const sources = await searchSources('小数与分数', 'zh', {
    env: {},
    searchQueries: ['小数的除法', '小数 除法', '分数'],
    fetch: async (url) => {
      const request = new URL(url);
      calls.push(request);
      if (request.searchParams.get('list') === 'search')
        return json({ query: { search: [{ pageid: 10 }, { pageid: 10 }, { pageid: 20 }] } });
      return wikiPage(request.searchParams.get('pageids'));
    },
  });
  assert.equal(calls.filter((url) => url.searchParams.get('list') === 'search').length, 2);
  assert.equal(calls.filter((url) => url.searchParams.has('pageids')).length, 2);
  assert.deepEqual(
    sources.map((item) => item.id),
    ['source-1', 'source-2'],
  );
  assert.deepEqual(
    sources.map((item) => item.title),
    ['Page 10', 'Page 20'],
  );
});

test('each query selects passages using its own concept instead of the compound title', async () => {
  const lateRule = 'Orchids use this specific fixture rule to demonstrate the concept.';
  const article = `Introduction.\n\n${'General historical background. '.repeat(1500)}\n\n${lateRule}`;
  const sources = await searchSources('A broad interdisciplinary course', 'en', {
    env: {},
    searchQueries: ['Orchids'],
    fetch: async (url) =>
      new URL(url).searchParams.get('list') === 'search'
        ? json({ query: { search: [{ pageid: 10 }] } })
        : wikiPage(10, article),
  });
  assert.ok(sources[0].text.includes(lateRule));
  assert.ok(sources[0].text.length <= 10000);
});

test('one failed query or article does not discard another query with usable evidence', async () => {
  const sources = await searchSources('combined topic', 'en', {
    env: {},
    searchQueries: ['unavailable query', 'available query'],
    fetch: async (url) => {
      const request = new URL(url);
      if (request.searchParams.get('srsearch') === 'unavailable query')
        return json({ error: 'upstream-private-marker' }, 503);
      if (request.searchParams.get('list') === 'search')
        return json({ query: { search: [{ pageid: 10 }, { pageid: 20 }] } });
      return request.searchParams.get('pageids') === '10' ? json({}, 503) : wikiPage(20);
    },
  });
  assert.deepEqual(
    sources.map((item) => item.title),
    ['Page 20'],
  );
  assert.equal(JSON.stringify(sources).includes('upstream-private-marker'), false);
});

test('all network failures retain safe CoreError classification while empty results are missing', async () => {
  for (const status of [503, 429]) {
    await assert.rejects(
      searchSources('combined topic', 'en', {
        env: {},
        searchQueries: ['first query', 'second query'],
        fetch: async () => json({ error: 'never expose this upstream body' }, status),
      }),
      (error) =>
        error instanceof CoreError &&
        error.code === (status === 429 ? 'search_rate_limit' : 'search_http') &&
        !error.message.includes('upstream body'),
    );
  }
  await assert.rejects(
    searchSources('combined topic', 'en', {
      env: {},
      searchQueries: ['first empty query', 'second empty query'],
      fetch: async () => json({ query: { search: [] } }),
    }),
    (error) => error.code === 'sources_missing',
  );
});

test('empty successful queries cannot hide another query operational failure', async () => {
  await assert.rejects(
    searchSources('combined topic', 'en', {
      env: {},
      searchQueries: ['first empty query', 'failed query', 'second empty query'],
      fetch: async (url) =>
        new URL(url).searchParams.get('srsearch') === 'failed query'
          ? json({ error: 'private upstream failure details' }, 503)
          : json({ query: { search: [] } }),
    }),
    (error) =>
      error instanceof CoreError &&
      error.code === 'search_http' &&
      !error.message.includes('private upstream'),
  );
});

test('Brave excerpts share the overall budget and never fetch a result URL', async () => {
  const calls = [];
  const sources = await searchSources('original topic', 'en', {
    env: { BRAVE_SEARCH_API_KEY: 'fixture-search-placeholder' },
    searchQueries: ['first query', 'second query'],
    fetch: async (url) => {
      const request = new URL(url);
      calls.push(request);
      const query = request.searchParams.get('q');
      return json({
        web: {
          results: Array.from({ length: 5 }, (_, i) => ({
            title: `${query} source ${i}`,
            url: `https://example.org/${encodeURIComponent(query)}/${i}`,
            description: 'x'.repeat(10000),
          })),
        },
      });
    },
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.hostname === 'api.search.brave.com'));
  assert.equal(
    sources.reduce((sum, item) => sum + item.text.length, 0),
    36000,
  );
  assert.deepEqual(
    sources.map((item) => item.title),
    [
      'first query source 0 (search excerpts)',
      'second query source 0 (search excerpts)',
      'first query source 1 (search excerpts)',
      'second query source 1 (search excerpts)',
    ],
  );
});

test('long Wikipedia hits cannot consume the budget before another concept gets its first source', async () => {
  const topics = ['First concept', 'Second concept', 'Third concept'];
  const sources = await searchSources('A course with three separate concepts', 'en', {
    env: {},
    searchQueries: topics,
    fetch: async (url) => {
      const request = new URL(url);
      if (request.searchParams.get('list') === 'search') {
        const index = topics.indexOf(request.searchParams.get('srsearch'));
        return json({ query: { search: [1, 2, 3].map((id) => ({ pageid: index * 10 + id })) } });
      }
      const id = request.searchParams.get('pageids');
      return wikiPage(id, `Unique evidence for page ${id}. ` + 'x'.repeat(12000));
    },
  });
  assert.deepEqual(
    sources.slice(0, 3).map((source) => source.title),
    ['Page 1', 'Page 11', 'Page 21'],
  );
  for (const id of [1, 11, 21])
    assert.ok(sources.some((source) => source.text.includes(`Unique evidence for page ${id}.`)));
  assert.ok(sources.reduce((total, source) => total + source.text.length, 0) <= 36000);
  assert.ok(sources.length <= 8);
});

test('one shared Wikipedia page retains distant passages for both query concepts with one fetch', async () => {
  const firstRule = 'Orchids depend on the first specific teaching rule in this fixture.';
  const secondRule = 'Mosses depend on a separate specific teaching rule in this fixture.';
  const filler = 'Background historical context with no matching subject. '.repeat(300);
  const article = `Unique article introduction.\n\n${filler}\n\n${firstRule}\n\n${filler}\n\n${secondRule}\n\n${filler}`;
  let pageFetches = 0;
  const sources = await searchSources('Two distinct botany concepts', 'en', {
    env: {},
    searchQueries: ['Orchids', 'Mosses'],
    fetch: async (url) => {
      if (new URL(url).searchParams.get('list') === 'search')
        return json({ query: { search: [{ pageid: 10 }] } });
      pageFetches++;
      return wikiPage(10, article);
    },
  });
  assert.equal(pageFetches, 1);
  assert.equal(sources.length, 1);
  assert.ok(sources[0].text.includes(firstRule));
  assert.ok(sources[0].text.includes(secondRule));
  assert.ok(sources[0].text.indexOf(firstRule) < sources[0].text.indexOf(secondRule));
  assert.equal(sources[0].text.split('Unique article introduction.').length - 1, 1);
  assert.ok(sources[0].text.length <= 10000);
});

test('missing or invalid searchQueries preserve the original single-query behavior', async () => {
  for (const searchQueries of [undefined, [], ['x', 'https://example.org']]) {
    const calls = [];
    const sources = await searchSources('小数的除法', 'zh', {
      env: {},
      searchQueries,
      fetch: async (url) => {
        const request = new URL(url);
        calls.push(request);
        if (request.searchParams.get('list') === 'search') {
          assert.equal(request.searchParams.get('srsearch'), '小数 除法');
          return json({ query: { search: [{ pageid: 10 }] } });
        }
        return wikiPage(10);
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(sources.length, 1);
  }
});

test('malformed Wikipedia metadata is unusable evidence rather than an unclassified failure', async () => {
  await assert.rejects(
    searchSources('Course topic', 'en', {
      env: {},
      searchQueries: ['First concept', 'Second concept'],
      fetch: async (url) =>
        new URL(url).searchParams.get('list') === 'search'
          ? json({ query: { search: [{ pageid: 10 }] } })
          : json({
              query: {
                pages: [{ pageid: 10, title: 'Invalid URL', extract: text, fullurl: 'not a URL' }],
              },
            }),
    }),
    (error) => error instanceof CoreError && error.code === 'sources_missing',
  );
});
