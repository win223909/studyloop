const MESSAGE =
  'The model returned invalid JSON. Retry or choose a model that follows structured-output instructions.';
const MAX_CHARACTERS = 2 * 1024 * 1024;
const MAX_DEPTH = 64;

// Reasons are fixed diagnostic categories, never excerpts or JSON.parse messages.
export class ModelJsonError extends Error {
  constructor(reason) {
    super(MESSAGE);
    this.name = 'ModelJsonError';
    this.code = 'model_format';
    this.publicMessage = MESSAGE;
    this.reason = reason;
  }
}

const fail = (reason) => {
  throw new ModelJsonError(reason);
};

function quotedEnd(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return i + 1;
  }
  fail('incomplete_json');
}

function stripThinking(text) {
  let remaining = text.trim();
  let count = 0;
  while (/^<think>/i.test(remaining)) {
    if (++count > 8) fail('wrapper_limit');
    const close = /<\/think>/i.exec(remaining);
    if (!close) fail('incomplete_thinking');
    const thought = remaining.slice(7, close.index);
    if (/<think>/i.test(thought)) fail('invalid_wrapper');
    remaining = remaining.slice(close.index + close[0].length).trimStart();
  }
  return remaining;
}

function isJsonValue(text) {
  if (!text.trim()) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function rejectJsonRemainder(text) {
  if (isJsonValue(text)) fail('multiple_values');
  if (text.trim() && /^[\s,:]+$/.test(text)) fail('invalid_json');
}

// This locates an intact container; JSON.parse remains the only syntax parser.
// It never chooses a later candidate after an invalid or incomplete first one.
function extractObject(text) {
  const stack = [];
  let start = -1;
  let end = -1;
  let fenceStart = -1;
  let fenceContent = -1;
  let fenceEnd = -1;
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === '"') {
      const end = quotedEnd(text, i);
      // A detached JSON key is a broken container, not explanatory prose.
      if (!stack.length && /^\s*:/.test(text.slice(end))) fail('invalid_json');
      i = end;
      continue;
    }
    if (!stack.length) {
      if (/^<\/?think\b/i.test(text.slice(i, i + 9))) fail('invalid_wrapper');
      if (text.startsWith('```', i)) {
        if (text[i + 3] === '`') fail('invalid_wrapper');
        if (fenceStart < 0) {
          if (start >= 0) fail('invalid_wrapper');
          const opener = /^```(?:json)?[ \t]*(?:\r?\n|(?=[{\[]))/i.exec(text.slice(i));
          if (!opener) fail('invalid_wrapper');
          fenceStart = i;
          fenceContent = i + opener[0].length;
          i = fenceContent;
          continue;
        }
        if (fenceEnd >= 0 || end < 0) fail('invalid_wrapper');
        if (text.slice(fenceContent, i).trim() !== text.slice(start, end)) fail('invalid_wrapper');
        fenceEnd = i + 3;
        i = fenceEnd;
        continue;
      }
    }
    if (char === '{' || char === '[') {
      if (!stack.length) {
        if (start >= 0) fail('multiple_values');
        start = i;
      }
      stack.push(char);
      if (stack.length > MAX_DEPTH) fail('depth_limit');
    } else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) fail('invalid_json');
      if (!stack.length) end = i + 1;
    }
    i++;
  }
  if (stack.length) fail('incomplete_json');
  if (fenceStart >= 0 && fenceEnd < 0) fail('invalid_wrapper');
  if (start < 0) fail('no_object');
  if (text[start] !== '{') fail('root_type');
  rejectJsonRemainder(text.slice(0, fenceStart >= 0 ? fenceStart : start));
  rejectJsonRemainder(text.slice(fenceEnd >= 0 ? fenceEnd : end));
  return text.slice(start, end);
}

// On already valid JSON, a string followed by ':' is always an object key.
// A small lexical pass catches duplicate keys without reimplementing JSON syntax.
function rejectDuplicateKeys(json) {
  const objects = [];
  for (let i = 0; i < json.length; i++) {
    if (json[i] === '{') objects.push(new Set());
    else if (json[i] === '[') objects.push(null);
    else if (json[i] === '}' || json[i] === ']') objects.pop();
    else if (json[i] === '"') {
      const end = quotedEnd(json, i);
      let next = end;
      while (/[ \t\r\n]/.test(json[next] || 'x')) next++;
      if (json[next] === ':') {
        const key = JSON.parse(json.slice(i, end));
        const keys = objects.at(-1);
        if (keys.has(key)) fail('duplicate_key');
        keys.add(key);
      }
      i = end - 1;
    }
  }
}

/** Extract only unambiguous, complete JSON. Never repairs or completes its contents. */
export function parseModelJson(content) {
  if (typeof content !== 'string') fail('content_type');
  if (content.length > MAX_CHARACTERS) fail('size_limit');
  const text = stripThinking(content);
  if (!text.trim()) fail('empty');
  const json = extractObject(text);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('invalid_json');
  }
  rejectDuplicateKeys(json);
  return parsed;
}
