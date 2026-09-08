type RecordValue = Record<string, unknown>;
type ActionValidator = (value: unknown) => { valid: boolean };

export class StudyLoopActionOutputError extends Error {
  constructor() {
    super('The generated classroom actions do not match the playback format.');
    this.name = 'StudyLoopActionOutputError';
  }
}

const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(): never {
  throw new StudyLoopActionOutputError();
}

function matchingValue(values: unknown[]): unknown {
  const supplied = values.filter((value) => value !== undefined);
  if (supplied.some((value) => value !== supplied[0])) fail();
  return supplied[0];
}

/**
 * Normalize the complete model array before the upstream parser can skip invalid
 * items or repair partial JSON. The caller supplies the canonical DSL validator.
 * Only explicit text aliases are converted; missing teaching content is rejected.
 */
export function normalizeStudyLoopActionOutput(
  response: string,
  validateAction: ActionValidator,
): string {
  const cleaned = response
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  let items: unknown;
  try {
    if (start < 0 || end <= start) fail();
    items = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    fail();
  }
  if (!Array.isArray(items) || items.length === 0) fail();
  const ids = new Set<string>();
  const normalized = items.map((item) => {
    if (!isRecord(item)) fail();
    let type: unknown;
    let params: RecordValue;
    if (item.type === 'action') {
      type = matchingValue([item.name, item.tool_name]);
      if (typeof type !== 'string' || !type) fail();
      // Reject competing argument envelopes rather than selecting one silently.
      if (item.params !== undefined && item.parameters !== undefined) fail();
      const supplied = item.params ?? item.parameters;
      if (supplied !== undefined && !isRecord(supplied)) fail();
      params = { ...(supplied as RecordValue | undefined) };
      if (params.type !== undefined && params.type !== type) fail();
      delete params.type;
    } else {
      type = item.type;
      const { type: _type, id: _id, ...rest } = item;
      params = rest;
    }
    const suppliedId = matchingValue([item.id, item.action_id, item.tool_id, params.id]);
    if (suppliedId !== undefined && (typeof suppliedId !== 'string' || !suppliedId.trim())) fail();
    const id = (suppliedId as string | undefined) ?? `action_${crypto.randomUUID()}`;
    if (ids.has(id)) fail();
    ids.add(id);
    delete params.id;
    if (type === 'text') {
      const text = matchingValue([params.text, params.content]);
      if (typeof text !== 'string' || !text.trim()) fail();
      delete params.content;
      params.text = text;
      type = 'speech';
    }
    if (type === 'speech' && (typeof params.text !== 'string' || !params.text.trim())) fail();
    const action = { ...params, id, type };
    if (!validateAction(action).valid) fail();
    return { type: 'action', name: type, action_id: id, params };
  });
  return JSON.stringify(normalized);
}

/** Upstream filters and defaults must not silently replace accepted model actions. */
export function assertStudyLoopActionSequence(
  actions: readonly { id: string; type: string }[],
  normalized: string | undefined,
): void {
  if (!normalized) fail();
  const expected = JSON.parse(normalized) as Array<{ action_id: string; name: string }>;
  if (
    actions.length !== expected.length ||
    actions.some(
      (action, index) =>
        action.id !== expected[index].action_id || action.type !== expected[index].name,
    )
  )
    fail();
}
