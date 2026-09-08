import { randomUUID } from 'node:crypto';

const PHASES = new Set([
  'search',
  'outline',
  'questions',
  'answer_review',
  'teaching_review',
  'classroom',
]);
const EVENTS = new Set(['started', 'received', 'retrying', 'recovering', 'succeeded', 'failed']);
const CODES = new Set([
  'model_format',
  'model_truncated',
  'model_refused',
  'model_context_limit',
  'provider_unavailable',
  'provider_context_limit',
  'provider_content_filter',
  'bank_invalid',
  'plan_invalid',
  'review_invalid',
  'review_rejected',
  'teaching_review_rejected',
  'sources_insufficient',
  'sources_missing',
  'sources_large',
  'source_invalid',
  'generation_unconfigured',
  'objectives_invalid',
  'question_count_invalid',
  ...['provider', 'search'].flatMap((prefix) =>
    [
      'auth',
      'http',
      'rate_limit',
      'connection',
      'timeout',
      'response',
      'model',
      'request',
      'endpoint',
      'quota',
    ].map((suffix) => `${prefix}_${suffix}`),
  ),
]);

/** Safe operational metadata only. Never log topics, answers, source text or model bodies. */
export function createGenerationDiagnostics(
  operation,
  write = (event) => console.info(JSON.stringify(event)),
) {
  const requestId = randomUUID();
  const kind = ['plan', 'course', 'classroom'].includes(operation) ? operation : 'course';
  let phase = kind === 'plan' ? 'outline' : kind === 'classroom' ? 'classroom' : 'questions';
  let attempts = 1;
  const record = (input) => {
    if (!input || !EVENTS.has(input.event) || !PHASES.has(input.phase)) return;
    if (phase !== input.phase) attempts = 1;
    phase = input.phase;
    if ([1, 2].includes(input.attempt)) attempts = Math.max(attempts, input.attempt);
    const event = {
      type: 'studyloop_generation',
      requestId,
      operation: kind,
      phase,
      event: input.event,
    };
    for (const [key, limit] of [
      ['attempt', 2],
      ['batch', 4],
      ['outputChars', 2_000_000],
      ['durationMs', 3_600_000],
    ]) {
      if (Number.isInteger(input[key]) && input[key] >= 0 && input[key] <= limit)
        event[key] = input[key];
    }
    if (input.code) event.code = CODES.has(input.code) ? input.code : 'internal_error';
    try {
      write(event);
    } catch {
      /* Logging must not fail a request. */
    }
  };
  return {
    record,
    details: () => ({ requestId, operation: kind, phase, attempts }),
  };
}

export function publicGenerationDetails(value) {
  if (
    !value ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value.requestId || '',
    ) ||
    !['plan', 'course', 'classroom'].includes(value.operation) ||
    !PHASES.has(value.phase) ||
    ![1, 2].includes(value.attempts)
  )
    return undefined;
  return {
    requestId: value.requestId,
    operation: value.operation,
    phase: value.phase,
    attempts: value.attempts,
  };
}
