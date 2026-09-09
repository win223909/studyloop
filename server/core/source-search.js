import { validateSource } from './schema.js';
import { sourceExcerpt } from './source-excerpts.js';

const MAX_QUERIES = 3;
const MAX_SOURCES = 8;
const MAX_SOURCE_CHARS = 10000;
const TOTAL_SOURCE_CHARS = 36000;
const MIN_SOURCE_CHARS = 150;
const queryKey = (value) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const isUrl = (value) =>
  /(?:\b[a-z][a-z\d+.-]*:\/\/|\b(?:data|javascript|file|mailto|tel|blob|about|urn):|(?:^|\s)(?:www\.|\/\/)|(?:^|\s)(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?[/?#])/iu.test(
    value,
  );

// These are orthographic equivalents used for matching, not a subject taxonomy.
// Keep the user's original topic outside this search-only normalization.
const TRADITIONAL =
  '數學運關係電壓質點線變體動聲熱學幾個實際問題練習課程與種語歷萬時總計機應論義細遺傳態構組織據統複簡單讀寫畫樂';
const SIMPLIFIED =
  '数学运关系电压质点线变体动声热学几个实际问题练习课程与种语历万时总计机应论义细遗传态构组织据统复简单读写画乐';
const HAN_EQUIVALENTS = new Map(
  [...TRADITIONAL].map((character, index) => [character, [...SIMPLIFIED][index]]),
);
const SEARCH_STOP_WORDS = new Set([
  '的',
  '地',
  '得',
  '与',
  '和',
  '及',
  '或',
  '是',
  '在',
  '了',
  '求',
  '一个',
  '另一个',
  '另一',
  '实际',
  '问题',
  '练习',
  '习题',
  '题目',
  '课程',
  '教程',
  '如何',
  '什么',
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'for',
  'in',
  'on',
  'with',
  'is',
  'are',
  'how',
  'what',
  'exercise',
  'exercises',
  'practice',
  'lesson',
  'lessons',
  'course',
]);

function comparableSearchText(value) {
  if (typeof value !== 'string') return '';
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/<[^>]*>/gu, ' ')
      .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/giu, ' ')
      .replace(/[\p{Script=Han}]/gu, (character) => HAN_EQUIVALENTS.get(character) || character)
      // These names denote the same explicit concept. A bare numeric percentage
      // such as 百分之三十 is deliberately not a match for the concept 百分比.
      .replace(/百分(?:之几(?![十百千万亿\d])|数|率)/gu, '百分比')
      .replace(/\s+/gu, ' ')
      .trim()
  );
}

function parallelSearchSegments(topic) {
  const connectors = new Set(['与', '和', '及', '以及', 'and', 'or', '&']);
  const segmenter = new Intl.Segmenter(/\p{Script=Han}/u.test(topic) ? 'zh' : 'en', {
    granularity: 'word',
  });
  return [...segmenter.segment(topic)]
    .map(({ segment }) => (connectors.has(segment.toLowerCase()) ? '\n' : segment))
    .join('')
    .split(/[\n,，、;；|]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function courseSearchTerms(topic) {
  const text = comparableSearchText(topic);
  const segmenter = new Intl.Segmenter(/\p{Script=Han}/u.test(text) ? 'zh' : 'en', {
    granularity: 'word',
  });
  return [
    ...new Set(
      [...segmenter.segment(text)]
        .filter(
          ({ segment, isWordLike }) =>
            isWordLike &&
            !SEARCH_STOP_WORDS.has(segment) &&
            !/^\p{N}+$/u.test(segment) &&
            (!/\p{Script=Han}/u.test(segment) || [...segment].length > 1),
        )
        .map(({ segment }) => segment),
    ),
  ];
}

function isSingleHanSubject(value) {
  return /^\p{Script=Han}$/u.test(value) && !SEARCH_STOP_WORDS.has(value);
}

/** Use subject keywords for the first search while leaving the full course goal intact. */
export function initialSearchQueries(topic) {
  if (typeof topic !== 'string' || isUrl(topic.normalize('NFKC'))) return [];
  const normalized = comparableSearchText(topic);
  let query = normalized
    .replace(/^(?:课程|练习|习题|题目)\s*[:：]\s*/u, '')
    .replace(/(?:的)?(?:实际问题)?(?:练习|习题|复习|课程|教程|入门)(?:题)?$/u, '')
    .replace(
      /\s+(?:exercises?|practice(?:\s+problems?)?|lessons?|course|tutorial|for beginners)$/iu,
      '',
    )
    .trim();
  const percentageQuestion = /百分之[几幾](?![十百千萬万億亿\d])/u.test(topic);
  // Existing concise subject queries keep their spelling and request budget.
  // Explicit concept splitting already exists in the supplemental search path.
  if (query === normalized && !percentageQuestion)
    return normalizeSearchQueries([topic], { allowSingleHan: true });
  const parts = parallelSearchSegments(query).map((part) => {
    // A percentage question often supplies an entire word-problem instruction
    // instead of a subject name. Extract its explicit terms, not the numbers or
    // the comparison's one-character scaffolding; keep any other named concept.
    if (percentageQuestion) return courseSearchTerms(part).join(' ');
    return part;
  });
  // A broad compound topic must not silently lose its fourth concept to the
  // per-round query cap. Keep the compound query when it cannot all be split.
  query = parts.length > MAX_QUERIES ? parts.join(' ') : query;
  return normalizeSearchQueries(parts.length > MAX_QUERIES ? [query] : parts, {
    allowSingleHan: true,
  });
}

/**
 * A lexical prerequisite for retrieved evidence, not a claim of full coverage.
 * Inspect only metadata and the article lead: incidental words buried in a long
 * unrelated page must not qualify it. The model still checks the complete goal.
 */
export function isSearchCandidateRelevant(candidate, query) {
  if (!candidate || typeof candidate !== 'object') return false;
  const title = comparableSearchText(candidate.title).slice(0, 300);
  const subject = comparableSearchText(query);
  if (isSingleHanSubject(subject)) {
    // A one-character subject can be legitimate (力, 光, 水), but counting that
    // character anywhere in prose would admit unrelated articles. Require the
    // complete title, optionally followed by an encyclopedia disambiguator.
    return title === subject || new RegExp(`^${subject}\\s*\\([^()]{1,40}\\)$`, 'u').test(title);
  }
  // A canonical subject title is useful even when the word segmenter splits
  // short terms such as 等式 into individual characters. Generic scaffolding
  // still does not qualify, and the full course coverage check remains required.
  if (
    title === subject &&
    subject.length >= 2 &&
    /\p{L}/u.test(subject) &&
    !SEARCH_STOP_WORDS.has(subject)
  )
    return true;
  const terms = courseSearchTerms(query);
  if (!terms.length) return false;
  const summary = comparableSearchText(
    [candidate.snippet, candidate.description, candidate.extract]
      .filter((value) => typeof value === 'string')
      .map((value) => value.slice(0, 1200))
      .join(' '),
  ).slice(0, 1800);
  const text = `${title} ${summary}`;
  const words = new Set(courseSearchTerms(text));
  const matched = terms.filter((term) => {
    if (/\p{Script=Han}/u.test(term)) return text.includes(term);
    // Whole words prevent e.g. "art" matching "earth". Permit a regular plural
    // without turning this filter into a general-purpose language stemmer.
    return (
      words.has(term) ||
      words.has(`${term}s`) ||
      (term.length > 3 &&
        term.endsWith('s') &&
        !term.endsWith('ss') &&
        words.has(term.slice(0, -1)))
    );
  }).length;
  return matched >= Math.ceil(terms.length * 0.6);
}

/** Validate model-suggested search keywords; these are queries, never fetch URLs. */
export function normalizeSearchQueries(value, { exclude, allowSingleHan = false } = {}) {
  if (!Array.isArray(value)) return [];
  const exclusions = Array.isArray(exclude) ? exclude : [exclude];
  const seen = new Set(exclusions.filter((item) => typeof item === 'string').map(queryKey));
  const queries = [];
  for (const item of value) {
    if (typeof item !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(item))
      continue;
    const query = item.trim().replace(/\s+/gu, ' ');
    if (
      (query.length < 2 && !(allowSingleHan && isSingleHanSubject(query))) ||
      query.length > 120 ||
      !/[\p{L}\p{N}]/u.test(query) ||
      isUrl(query.normalize('NFKC'))
    )
      continue;
    const key = queryKey(query);
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length === MAX_QUERIES) break;
  }
  return queries;
}

/** Split only explicit parallel concepts; do not guess a subject or rewrite facts. */
export function fallbackSearchQueries(topic) {
  if (typeof topic !== 'string' || isUrl(topic.normalize('NFKC'))) return [];
  return normalizeSearchQueries(parallelSearchSegments(topic), { exclude: topic });
}

function sourceUrlKey(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

/** Retain earlier groups first and enforce the complete source budget in one place. */
export function mergeSearchSources(groups, topic = '') {
  if (!Array.isArray(groups)) return [];
  const sources = [];
  const urls = new Set();
  const titles = new Set();
  let remaining = TOTAL_SOURCE_CHARS;
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const source of group) {
      if (sources.length === MAX_SOURCES || remaining < MIN_SOURCE_CHARS) return sources;
      if (!source || typeof source !== 'object' || typeof source.title !== 'string') continue;
      const titleKey = queryKey(source.title);
      const urlKey = sourceUrlKey(source.url);
      if (titles.has(titleKey) || (urlKey && urls.has(urlKey))) continue;
      const text = sourceExcerpt(source.text, Math.min(MAX_SOURCE_CHARS, remaining), topic);
      if (text.length < MIN_SOURCE_CHARS) continue;
      let clean;
      try {
        clean = validateSource({ ...source, id: `source-${sources.length + 1}`, text });
      } catch {
        continue;
      }
      sources.push(clean);
      titles.add(titleKey);
      if (urlKey) urls.add(urlKey);
      remaining -= clean.text.length;
    }
  }
  return sources;
}
