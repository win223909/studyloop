import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudyLoopActionOutput,
  assertStudyLoopActionSequence,
  StudyLoopActionOutputError,
} from '../../integrations/openmaic/overlay/lib/studyloop/action-output.ts';

const { validateAction } =
  await import('../../.runtime/openmaic/packages/@openmaic/dsl/dist/index.js');
const { parseActionsFromStructuredOutput } =
  await import('../../.runtime/openmaic/packages/@openmaic/generation/dist/index.js');

test('mixed model actions conform to the actual playback/storage DSL without inventing or dropping content', () => {
  const original = [
    { type: 'text', content: '  Keep this exact speech.  ' },
    { type: 'action', name: 'spotlight', params: { elementId: 'visible-element' } },
    { type: 'action', tool_name: 'wb_open', parameters: {} },
    { type: 'action', name: 'wb_draw_text', params: { content: '2/4 = 1/2', x: 10, y: 20 } },
    { type: 'speech', id: 'canonical-speech', text: 'Already canonical.' },
    { type: 'action', name: 'text', params: { content: 'Explicit speech alias.' } },
  ];
  const normalized = normalizeStudyLoopActionOutput(JSON.stringify(original), validateAction);
  const actions = parseActionsFromStructuredOutput(normalized, 'slide');
  assert.doesNotThrow(() => assertStudyLoopActionSequence(actions, normalized));
  assert.deepEqual(
    actions.map((action) => action.type),
    ['speech', 'spotlight', 'wb_open', 'wb_draw_text', 'speech', 'speech'],
  );
  assert.equal(actions[0].text, original[0].content);
  assert.equal(actions[4].id, 'canonical-speech');
  assert.equal(actions[5].text, 'Explicit speech alias.');
  assert.ok(actions.every((action) => validateAction(action).valid));

  for (const invalid of [
    { type: 'text' },
    { type: 'action', name: 'text', params: {} },
    { type: 'text', content: '' },
    { type: 'text', content: 42 },
    { type: 'text', content: 'one', text: 'a different claim' },
    {
      type: 'action',
      name: 'unknown_meaningful_action',
      params: { content: 'Do not discard me.' },
    },
    { type: 'unrecognized', content: 'Do not discard me either.' },
    { type: 'action', name: 'spotlight', params: {} },
    { type: 'action', name: 'widget_setState', params: {} },
    { type: 'action', name: 'speech', params: { type: 'text', text: 'Conflicting type.' } },
    { type: 'action', name: 'wb_open', params: {}, parameters: {} },
  ]) {
    assert.throws(
      () => normalizeStudyLoopActionOutput(JSON.stringify([...original, invalid]), validateAction),
      StudyLoopActionOutputError,
      'A bad mixed item rejects the entire response instead of retaining a partial lesson.',
    );
  }
  for (const [raw, sceneType] of [
    [
      [
        { type: 'action', name: 'discussion', params: { topic: 'Equal parts' } },
        { type: 'text', content: 'Do not silently drop this.' },
      ],
      'slide',
    ],
    [
      [
        { type: 'text', content: 'Keep the complete sequence.' },
        { type: 'action', name: 'spotlight', params: { elementId: 'visible-element' } },
      ],
      'quiz',
    ],
    [[{ type: 'action', name: 'spotlight', params: { elementId: 'visible-element' } }], 'quiz'],
  ]) {
    const accepted = normalizeStudyLoopActionOutput(JSON.stringify(raw), validateAction);
    assert.throws(
      () =>
        assertStudyLoopActionSequence(
          parseActionsFromStructuredOutput(accepted, sceneType),
          accepted,
        ),
      StudyLoopActionOutputError,
      'Upstream truncation/filtering must fail rather than replace model content with defaults.',
    );
  }
  assert.throws(() => assertStudyLoopActionSequence([], undefined), StudyLoopActionOutputError);
  for (const raw of ['[]', '[{"type":"text","content":"Truncated array"}', 'not JSON'])
    assert.throws(
      () => normalizeStudyLoopActionOutput(raw, validateAction),
      StudyLoopActionOutputError,
    );
  assert.throws(
    () =>
      normalizeStudyLoopActionOutput(
        JSON.stringify([
          { type: 'speech', id: 'same', text: 'First.' },
          { type: 'speech', id: 'same', text: 'Second.' },
        ]),
        validateAction,
      ),
    StudyLoopActionOutputError,
  );
});
