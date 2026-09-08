const STOP_WORDS = new Set([
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
]);

function normalizeWhitespace(value) {
  return value
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function characterEnd(text, end) {
  // String length limits use UTF-16, but excerpts must not split a code point.
  const code = text.charCodeAt(end - 1);
  return code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

function prefix(text, limit) {
  if (text.length <= limit) return text;
  const end = characterEnd(text, limit);
  const paragraph = text.lastIndexOf('\n\n', end);
  const line = text.lastIndexOf('\n', end);
  const boundary = paragraph >= end * 0.9 ? paragraph : line >= end * 0.9 ? line : end;
  return text.slice(0, boundary).trimEnd();
}

function topicTerms(topic) {
  if (typeof topic !== 'string') return [];
  const text = topic.normalize('NFKC').toLowerCase();
  const segmenter = new Intl.Segmenter(/\p{Script=Han}/u.test(text) ? 'zh' : 'en', {
    granularity: 'word',
  });
  return [
    ...new Set(
      [...segmenter.segment(text)]
        .filter((part) => part.isWordLike && !STOP_WORDS.has(part.segment))
        .map((part) => part.segment),
    ),
  ].slice(0, 16);
}

function chunksOf(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = characterEnd(text, Math.min(start + size, text.length));
    if (end < text.length) {
      const paragraph = text.lastIndexOf('\n\n', end);
      const line = text.lastIndexOf('\n', end);
      const space = text.lastIndexOf(' ', end);
      const minimum = start + size * 0.6;
      if (paragraph >= minimum) end = paragraph;
      else if (line >= minimum) end = line;
      else if (space >= minimum) end = space;
    }
    // A very small caller limit must still make progress over a surrogate pair.
    if (end <= start) end = Math.min(start + 2, text.length);
    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    start = end;
    while (/\s/u.test(text[start] || '') && start < text.length) start++;
  }
  return chunks;
}

function joinPassages(selected) {
  const ordered = [...selected].sort(([a], [b]) => a - b);
  return ordered.reduce((text, [index, content], position) => {
    if (!position) return content;
    const separator = index === ordered[position - 1][0] + 1 ? '\n\n' : '\n\n[…]\n\n';
    return text + separator + content;
  }, '');
}

/**
 * Bound retrieved plain text after removing extraction whitespace. For long
 * articles, an optional topic selects original passages, never a model summary.
 * The lead is retained and all selected passages remain in source order.
 */
export function sourceExcerpt(value, maxLength = 10000, topic = '') {
  if (!Number.isInteger(maxLength) || maxLength < 1)
    throw new RangeError('Source excerpt length must be a positive integer.');
  if (typeof value !== 'string') return '';
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) return text;
  const terms = topicTerms(topic);
  if (!terms.length || maxLength < 80) return prefix(text, maxLength);

  const chunks = chunksOf(text, Math.min(1000, Math.max(80, Math.floor(maxLength / 4))));
  const matches = chunks.map((chunk) => {
    const comparable = chunk.normalize('NFKC').toLowerCase();
    return terms.map((term) => comparable.includes(term));
  });
  const weights = terms.map(
    (_, term) =>
      1 + Math.log((chunks.length + 1) / (matches.filter((row) => row[term]).length + 1)),
  );
  const scores = matches.map((row) =>
    row.reduce((score, present, term) => score + (present ? 100 + weights[term] : 0), 0),
  );
  if (!scores.some((score) => score > 0)) return prefix(text, maxLength);

  // Adjacent passages supply definitions, headings and worked-example context.
  // Direct matches always outrank context-only passages.
  const ranked = scores
    .map((score, index) => ({
      index,
      score: score || Math.max(scores[index - 1] || 0, scores[index + 1] || 0) / (terms.length + 2),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Map([[0, chunks[0]]]);
  for (const { index } of ranked) {
    if (selected.has(index)) continue;
    selected.set(index, chunks[index]);
    // Count omission markers too; inserting an adjacent passage can remove one.
    if (joinPassages(selected).length > maxLength) selected.delete(index);
  }
  return joinPassages(selected);
}
