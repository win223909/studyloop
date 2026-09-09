import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSearchQueries, isSearchCandidateRelevant } from '../server/core/source-search.js';

test('percentage word-problem instructions search for the explicit mathematical concept', () => {
  assert.deepEqual(initialSearchQueries('求一个数比另一个多（少）百分之几的实际问题练习'), [
    '百分比',
  ]);
  assert.deepEqual(initialSearchQueries('求一個數比另一個多（少）百分之幾的實際問題練習'), [
    '百分比',
  ]);
});

test('query cleanup retains every explicit concept and stays within the search-query cap', () => {
  assert.deepEqual(initialSearchQueries('百分数与分数的实际问题练习'), ['百分比', '分数']);
  assert.deepEqual(initialSearchQueries('速度提高百分之几的实际问题练习'), ['速度 提高 百分比']);
  assert.deepEqual(initialSearchQueries('电流、电压、电阻和功率练习'), ['电流 电压 电阻 功率']);
});

test('concise subject queries preserve their spelling and existing first-round request count', () => {
  for (const topic of ['混合运算与数量关系', 'C++与目的地', '学习理论', 'Forces and motion']) {
    assert.deepEqual(initialSearchQueries(topic), [topic]);
  }
  assert.deepEqual(initialSearchQueries('Simple past tense exercises'), ['simple past tense']);
  assert.deepEqual(initialSearchQueries('课程：Photosynthesis'), ['photosynthesis']);
  assert.deepEqual(initialSearchQueries('https://example.org/course'), []);
});

test('incidental numeric percentages do not turn unrelated search results into mathematics sources', () => {
  for (const candidate of [
    { title: '白紙運動', snippet: '一個事件在多個地方引起實際問題。部分人數佔百分之三十。' },
    { title: '蔣經國', snippet: '人物生平與歷史，文章包含百分之幾十的數字。' },
    { title: '八一五全臺大停電', snippet: '停電的實際問題，一個地區比另一個地區多百分之五。' },
  ]) {
    assert.equal(isSearchCandidateRelevant(candidate, '百分比'), false, candidate.title);
  }
});

test('simplified and traditional mathematical concept titles qualify', () => {
  for (const title of ['百分比', '百分率', '百分数', '百分數']) {
    assert.equal(isSearchCandidateRelevant({ title }, '百分比'), true, title);
  }
  assert.equal(
    isSearchCandidateRelevant({ title: '數量關係', extract: '數量之間的關係。' }, '数量关系'),
    true,
  );
  assert.equal(
    isSearchCandidateRelevant({ title: '電壓', extract: '電壓是物理學的概念。' }, '电压'),
    true,
  );
  for (const [title, query] of [
    ['細胞', '细胞'],
    ['遺傳學', '遗传学'],
    ['數據統計', '数据统计'],
    ['有機化學', '有机化学'],
  ]) {
    assert.equal(isSearchCandidateRelevant({ title }, query), true, title);
  }
});

test('single-character subjects require an exact title or a parenthesized disambiguator', () => {
  for (const subject of ['力', '光', '水']) {
    assert.deepEqual(initialSearchQueries(subject), [subject]);
    assert.deepEqual(initialSearchQueries(`${subject}的练习`), [subject]);
    assert.equal(isSearchCandidateRelevant({ title: subject }, subject), true);
    assert.equal(isSearchCandidateRelevant({ title: `${subject}（物理學）` }, subject), true);
    assert.equal(
      isSearchCandidateRelevant(
        { title: '生活記事', snippet: `這篇文章提到${subject}。` },
        subject,
      ),
      false,
    );
    assert.equal(isSearchCandidateRelevant({ title: `無關${subject}事件` }, subject), false);
  }
  assert.equal(isSearchCandidateRelevant({ title: '的' }, '的'), false);
});

test('all subjects are screened by relevance with no forbidden-title list', () => {
  for (const title of ['白紙運動', '蔣經國', '八一五全臺大停電']) {
    assert.equal(isSearchCandidateRelevant({ title }, title), true, title);
  }
});

test('English matching uses whole words, regular plurals and meaningful query coverage', () => {
  assert.equal(
    isSearchCandidateRelevant(
      { title: 'Fraction', description: 'A mathematical definition.' },
      'fractions',
    ),
    true,
  );
  assert.equal(
    isSearchCandidateRelevant({ title: 'Earth', description: 'The planet Earth.' }, 'art'),
    false,
  );
  assert.equal(
    isSearchCandidateRelevant(
      { title: 'Past tense', snippet: 'The simple past tense describes completed actions.' },
      'simple past tense',
    ),
    true,
  );
  assert.equal(
    isSearchCandidateRelevant(
      { title: 'Past elections', snippet: 'A history of past events.' },
      'simple past tense',
    ),
    false,
  );
  assert.equal(
    isSearchCandidateRelevant(
      { title: 'Chemical equation', description: 'Chemistry notation.' },
      'linear equations',
    ),
    false,
  );
});

test('search snippets and article leads can qualify sources without an exact title match', () => {
  assert.equal(
    isSearchCandidateRelevant(
      {
        title: 'Grammar guide',
        snippet: 'Learn the <span class="searchmatch">simple past tense</span> with examples.',
      },
      'simple past tense',
    ),
    true,
  );
  assert.equal(
    isSearchCandidateRelevant(
      { title: '数学概念', extract: '百分比表示一个数是另一个数的百分之几。' },
      '百分比',
    ),
    true,
  );
  assert.equal(
    isSearchCandidateRelevant(
      {
        title: 'Generic page',
        extract:
          'Unrelated introduction. '.repeat(100) + 'A distant discussion of simple past tense.',
      },
      'simple past tense',
    ),
    false,
  );
});

test('generic word-problem scaffolding and absent metadata never count as evidence', () => {
  assert.equal(
    isSearchCandidateRelevant({ title: '实际问题', description: '一个比另一个多。' }, '百分比'),
    false,
  );
  assert.equal(isSearchCandidateRelevant({ title: '一个' }, '一个'), false);
  assert.equal(isSearchCandidateRelevant({}, '百分比'), false);
  assert.equal(isSearchCandidateRelevant(null, 'fractions'), false);
});
