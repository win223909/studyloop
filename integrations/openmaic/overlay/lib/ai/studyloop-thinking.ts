import type { ThinkingConfig } from '@/lib/types/provider';

type StudyLoopThinking = ThinkingConfig & { studyloopGeneration?: true };

/** Carry the generation phase through the existing request-local thinking context. */
export function studyLoopThinkingContext(
  thinking: ThinkingConfig | undefined,
  source: string,
  embedded: boolean,
): StudyLoopThinking | undefined {
  if (!embedded || (source !== 'scene-content' && source !== 'scene-actions')) return thinking;
  return { ...thinking, studyloopGeneration: true };
}

/**
 * MiniMax M3 can exhaust its output limit on reasoning before emitting classroom
 * JSON. Change only these two embedded generation phases at the official chat
 * endpoint; grading, outlines and other providers retain their existing policy.
 */
export function applyStudyLoopThinking(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  context: unknown,
  embedded: boolean,
): RequestInit | undefined {
  if (
    !embedded ||
    !context ||
    typeof context !== 'object' ||
    (context as StudyLoopThinking).studyloopGeneration !== true ||
    init?.method?.toUpperCase() !== 'POST' ||
    typeof init.body !== 'string'
  )
    return init;

  try {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (
      url.protocol !== 'https:' ||
      !['api.minimax.cn', 'api.minimax.io'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/v1/chat/completions'
    )
      return init;
    const body = JSON.parse(init.body);
    if (!body || Array.isArray(body) || body.model !== 'MiniMax-M3') return init;
    return { ...init, body: JSON.stringify({ ...body, thinking: { type: 'disabled' } }) };
  } catch {
    // This adapter never repairs malformed requests or exposes their content.
    return init;
  }
}
