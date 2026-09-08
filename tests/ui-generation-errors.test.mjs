import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiError,
  formatApiError,
  normalizeGenerationDiagnostic,
} from '../src/api-errors.js';

const diagnostic = {
  requestId: '11111111-2222-4333-8444-555555555555',
  operation: 'plan',
  phase: 'outline',
  attempts: 2,
};
test('refusal and context errors give distinct safe corrective actions', () => {
  for (const code of ['model_refused', 'model_context_limit']) {
    const error = createApiError({ code, error: 'private upstream body' }, 502);
    assert.doesNotMatch(
      formatApiError(error, 'zh') + formatApiError(error, 'en'),
      /private upstream|HTTP/,
    );
  }
  assert.match(
    formatApiError(createApiError({ code: 'model_refused' }, 502), 'en'),
    /not retried automatically/,
  );
  assert.match(
    formatApiError(createApiError({ code: 'model_context_limit' }, 502), 'zh'),
    /缩短课程资料.*更长上下文/,
  );
});
test('generation diagnostics keep only the allowed phase and correlation fields', () => {
  const error = createApiError(
    { code: 'model_format', generation: { ...diagnostic, raw: 'secret body' } },
    502,
  );
  assert.deepEqual(error.generation, diagnostic);
  assert.equal('raw' in error.generation, false);
  for (const change of [
    { requestId: '<script>raw</script>' },
    { phase: 'raw body' },
    { operation: 'shell' },
    { attempts: 0 },
    { attempts: '2' },
  ])
    assert.equal(normalizeGenerationDiagnostic({ ...diagnostic, ...change }), undefined);
});
