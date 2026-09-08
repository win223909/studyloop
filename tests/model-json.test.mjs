import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelJsonError, parseModelJson } from '../server/core/model-json.js';

function rejected(content, reason) {
  assert.throws(
    () => parseModelJson(content),
    (error) => {
      assert.ok(error instanceof ModelJsonError);
      assert.equal(error.code, 'model_format');
      if (reason) assert.equal(error.reason, reason);
      return true;
    },
  );
}

test('complete JSON values retain their exact fields, strings, arrays, and numbers', () => {
  const value = {
    title: '数学与 English',
    empty: {},
    questions: [{ answerIndex: 0, options: ['3', '4', '5', '6'] }],
    sufficient: false,
    nullable: null,
    exponent: 1.5e-6,
    punctuation: 'A quote " and braces { [ ] }, ```json, <think>, \\ and a newline\n.',
  };
  assert.deepEqual(parseModelJson(`\uFEFF\n ${JSON.stringify(value)} \t`), value);
});

test('complete leading thinking blocks, fences, and surrounding prose can be removed losslessly', () => {
  const expected = { sufficient: false, relevantSourceIds: [], title: '保持原文' };
  const json = JSON.stringify(expected);
  for (const content of [
    `<think>A tentative {"sufficient":true} is reasoning only.</think>\n${json}`,
    `<think>First.</think> <THINK>Second.</THINK>\n\`\`\`JSON\n${json}\n\`\`\``,
    `Here is the requested JSON:\n${json}\nEnd of response.`,
    `结果如下：\n\`\`\`json\r\n${json}\r\n\`\`\`\n以上是结果。`,
    `\`\`\`${json}\`\`\``,
    `\`\`\`json${json}\`\`\``,
  ]) {
    assert.deepEqual(parseModelJson(content), expected);
  }
});

test('braces, escaped quotes, and reasoning-looking text inside JSON strings are data', () => {
  const expected = { note: 'literal "} {\\\"" and </think> ```', answer: 0 };
  assert.deepEqual(parseModelJson(`Result: ${JSON.stringify(expected)} Done.`), expected);
});

test('multiple objects, containers, fenced answers, and primitive candidates remain ambiguous', () => {
  for (const content of [
    '{"ok":false}\n{"ok":true}',
    '[{"ok":false}]\n{"ok":true}',
    '{"ok":true}\n[]',
    '```json\n{"ok":false}\n```\n```json\n{"ok":true}\n```',
    'true {"ok":true}',
    '{"ok":true} null',
    '"example" {"ok":true}',
  ]) {
    rejected(content);
  }
});

test('an incomplete or invalid first object never permits selecting a later nested object', () => {
  for (const content of [
    '{"missing": {"ok":true}',
    '{invalid}\n{"ok":true}',
    '{"ok":true}\n{"later":',
    '{"ok":true, "tail":"unfinished}',
    '<think>unfinished {"ok":true}',
    '<think>outer<think>inner</think>{"ok":true}',
    'A preface <think>{"ok":true}</think>',
    '"result": {"ok":true}',
    '{"ok":true},',
  ]) {
    rejected(content);
  }
});

test('an extra closing brace between otherwise complete questions is rejected, never deleted', () => {
  const malformed =
    '{"sufficient":true,"questions":[{"id":"q1","practice":{"answerIndex":0},"choices_note":"fixture"}},{"id":"q2"}]}';
  rejected(malformed, 'invalid_json');
  rejected(`<think>Fixture only.</think>\n\`\`\`json\n${malformed}\n\`\`\``, 'invalid_json');
});

test('incomplete, unsupported, or multiple markdown fences are not treated as safe wrapping', () => {
  for (const content of [
    '```json\n{"ok":true}',
    '```yaml\n{"ok":true}\n```',
    '```json\nExplanation {"ok":true}\n```',
    '````json\n{"ok":true}\n````',
    '{"ok":true}\n```',
    '```json\n{"ok":true}\n```\n```',
  ]) {
    rejected(content, 'invalid_wrapper');
  }
});

test('duplicate keys are rejected, including escaped aliases and nested answer fields', () => {
  for (const content of [
    '{"sufficient":false,"sufficient":true}',
    String.raw`{"ok":false,"\u006fk":true}`,
    '{"questions":[{"answerIndex":0,"answerIndex":1}]}',
    '{"__proto__":1,"__proto__":2}',
  ]) {
    rejected(content, 'duplicate_key');
  }
  assert.deepEqual(parseModelJson('{"a":{"x":1},"b":{"x":2}}'), {
    a: { x: 1 },
    b: { x: 2 },
  });
});

test('syntax errors and mathematical backslashes are never silently repaired', () => {
  for (const content of [
    '{"ok": true,}',
    '{"a":1 "b":2}',
    "{'ok':true}",
    '{“ok”:true}',
    String.raw`{"work":"\(1 + 2\)"}`,
    String.raw`{"work":"\div"}`,
    '{"work":"a\nb"}',
    '{"ok":undefined}',
  ]) {
    rejected(content);
  }
  const validMath = String.raw`{"work":"\\(1 + 2\\) and \\frac{1}{2}"}`;
  assert.deepEqual(parseModelJson(validMath), { work: String.raw`\(1 + 2\) and \frac{1}{2}` });
});

test('only object roots are accepted, and quoted JSON is not an object candidate', () => {
  for (const content of [null, {}, [], 42, '', ' \n ', 'true', 'null', '[]', '[{"ok":true}]']) {
    rejected(content);
  }
  rejected(JSON.stringify('{"ok":true}'), 'no_object');
});

test('input size, nesting, and wrapper counts have explicit bounds', () => {
  rejected(' '.repeat(2 * 1024 * 1024 + 1), 'size_limit');
  rejected(`{"deep":${'['.repeat(64)}0${']'.repeat(64)}}`, 'depth_limit');
  rejected(`${'<think>done</think>'.repeat(9)}{"ok":true}`, 'wrapper_limit');
  assert.deepEqual(parseModelJson(`{"deep":${'['.repeat(5)}0${']'.repeat(5)}}`), {
    deep: [[[[[0]]]]],
  });
});

test('all failures expose only fixed diagnostics, never source text or parse error excerpts', () => {
  const marker = 'PRIVATE_FIXTURE_MARKER_123';
  try {
    parseModelJson(`{"answer":"${marker}",broken}`);
    assert.fail('expected a parsing failure');
  } catch (error) {
    assert.ok(error instanceof ModelJsonError);
    assert.equal(error.reason, 'invalid_json');
    assert.ok(!String(error.stack).includes(marker));
    assert.ok(!JSON.stringify(error).includes(marker));
    assert.equal(error.message, error.publicMessage);
  }
});
