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

/** Validate model-suggested search keywords; these are queries, never fetch URLs. */
export function normalizeSearchQueries(value, { exclude } = {}) {
  if (!Array.isArray(value)) return [];
  const exclusions = Array.isArray(exclude) ? exclude : [exclude];
  const seen = new Set(exclusions.filter((item) => typeof item === 'string').map(queryKey));
  const queries = [];
  for (const item of value) {
    if (typeof item !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(item))
      continue;
    const query = item.trim().replace(/\s+/gu, ' ');
    if (
      query.length < 2 ||
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
  const connectors = new Set(['与', '和', '及', '以及', 'and', 'or', '&']);
  const segmenter = new Intl.Segmenter(/\p{Script=Han}/u.test(topic) ? 'zh' : 'en', {
    granularity: 'word',
  });
  const separated = [...segmenter.segment(topic)]
    .map(({ segment }) => (connectors.has(segment.toLowerCase()) ? '\n' : segment))
    .join('');
  return normalizeSearchQueries(separated.split(/[\n,，、;；|]+/u), { exclude: topic });
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
