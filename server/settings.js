import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { HttpError } from './errors.js';

const DEFAULTS = Object.freeze({
  LLM_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: '',
  LLM_MODEL: '',
  LLM_REVIEW_MODEL: '',
  LLM_ALLOW_KEYLESS: 'false',
  LLM_TIMEOUT_MS: '90000',
  LLM_MAX_OUTPUT_TOKENS: '8192',
  LLM_JSON_MODE: 'false',
  LLM_TOKEN_PARAMETER: 'auto',
  OPENMAIC_URL: '',
  DAILY_GENERATION_LIMIT: '20',
  MAX_CONCURRENT_GENERATIONS: '2',
});
const SECRET_KEYS = ['LLM_API_KEY', 'BRAVE_SEARCH_API_KEY'];
const VALUE_KEYS = Object.keys(DEFAULTS);
const KEYS = [...VALUE_KEYS, ...SECRET_KEYS];
const ALLOWED = new Set(KEYS);
const CONTROL = /[\u0000-\u001f\u007f]/;
const ENUMS = {
  LLM_PROVIDER: ['openai-compatible', 'anthropic', 'gemini'],
  LLM_ALLOW_KEYLESS: ['true', 'false'],
  LLM_JSON_MODE: ['true', 'false'],
  LLM_TOKEN_PARAMETER: ['', 'auto', 'max_tokens', 'max_completion_tokens'],
};
const RANGES = {
  LLM_TIMEOUT_MS: [1000, 180000],
  LLM_MAX_OUTPUT_TOKENS: [1024, 20000],
  DAILY_GENERATION_LIMIT: [1, 1000],
  MAX_CONCURRENT_GENERATIONS: [1, 4],
};
// Managers in the same server serialize edits to the same configured file.
const queues = new Map();
const invalid = () =>
  new HttpError(
    400,
    'Invalid settings. Check the allowed fields, formats, and limits. 设置格式或范围不正确。',
  );
const conflict = () =>
  new HttpError(
    409,
    'Settings changed since this form was opened. Reload settings before saving or testing. 配置已变化，请重新载入。',
  );
const fileFailure = () =>
  new HttpError(
    500,
    'Unable to read or save the settings file. Check its permissions and available disk space. 无法读写配置文件，请检查权限与磁盘空间。',
  );

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function managedFrom(env) {
  return Object.fromEntries(
    KEYS.filter((key) => Object.hasOwn(env, key)).map((key) => [key, env[key]]),
  );
}

function serializeValue(value) {
  // Node's .env parser does not implement shell escaping. Select a representation
  // by round-tripping it, including literal backslashes, hashes, and quote marks.
  const candidates = [value, `'${value}'`, `"${value}"`, `\`${value}\``];
  for (const encoded of candidates) {
    try {
      const parsed = parseEnv(`SETTING=${encoded}\n`);
      if (parsed.SETTING === value && Object.keys(parsed).length === 1) return encoded;
    } catch {
      /* Try the next supported quote style. */
    }
  }
  throw new HttpError(
    400,
    'A setting contains characters that cannot be stored safely in .env. Please check its value. 配置包含无法安全保存的字符。',
  );
}

function validateValue(key, value) {
  if (typeof value !== 'string' || CONTROL.test(value)) throw invalid();
  const normalized = value.trim();
  if (ENUMS[key] && !ENUMS[key].includes(normalized)) throw invalid();
  if (key === 'LLM_TOKEN_PARAMETER' && !normalized) return 'auto';
  if (RANGES[key]) {
    const [min, max] = RANGES[key];
    const number = Number(normalized);
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(number) || number < min || number > max)
      throw invalid();
    return String(number);
  }
  if (key === 'LLM_BASE_URL' || key === 'OPENMAIC_URL') {
    if (normalized.length > 2000 || /\s/.test(normalized)) throw invalid();
    if (normalized) {
      let url;
      try {
        url = new URL(normalized);
      } catch {
        throw invalid();
      }
      // Reject delimiter-only queries/fragments as well as nonempty components.
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        /^[a-z][a-z0-9+.-]*:\/\/[^/\\?#]*@/i.test(normalized) ||
        /[?#]/.test(normalized) ||
        url.search ||
        url.hash ||
        /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(normalized)
      )
        throw invalid();
    }
  } else if (normalized.length > 250) throw invalid();
  serializeValue(normalized);
  return normalized;
}

function validateSecret(value) {
  if (typeof value !== 'string' || CONTROL.test(value) || value.length > 8192) throw invalid();
  const normalized = value.trim();
  serializeValue(normalized);
  return normalized;
}

function inputParts(payload) {
  if (
    !record(payload) ||
    Object.keys(payload).some((key) => !['values', 'secrets', 'revision'].includes(key))
  )
    throw invalid();
  const values = payload.values === undefined ? {} : payload.values;
  const secrets = payload.secrets === undefined ? {} : payload.secrets;
  if (
    !record(values) ||
    !record(secrets) ||
    Object.keys(values).some((key) => !Object.hasOwn(DEFAULTS, key)) ||
    Object.keys(secrets).some((key) => !SECRET_KEYS.includes(key))
  )
    throw invalid();
  if (typeof payload.revision !== 'string' || !/^[a-f0-9]{64}$/.test(payload.revision))
    throw conflict();
  return { values, secrets, revision: payload.revision };
}

function replaceManaged(raw, values) {
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) || [];
  const seen = new Set();
  const result = [];
  for (let index = 0; index < lines.length; index++) {
    let block = lines[index];
    const match = block.match(
      /^([ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*)([^\r\n]*)/,
    );
    if (!match) {
      result.push(block);
      continue;
    }
    const [, prefix, key, initial] = match;
    const quote = ['"', "'", '`'].includes(initial[0]) ? initial[0] : null;
    let valueText = initial;
    let closing = quote ? valueText.indexOf(quote, 1) : -1;
    // Keep unrelated multiline records intact, including apparent managed-key
    // assignments inside their quoted content.
    while (quote && closing < 0 && index + 1 < lines.length) {
      const line = lines[++index];
      block += line;
      valueText += newline + line.replace(/[\r\n]+$/, '');
      closing = valueText.indexOf(quote, 1);
    }
    if (!ALLOWED.has(key)) {
      result.push(block);
      continue;
    }
    if (quote && closing < 0) throw fileFailure();
    seen.add(key);
    const tail = quote ? valueText.slice(closing + 1) : valueText;
    const hash = tail.indexOf('#');
    const comment = hash < 0 ? '' : ` ${tail.slice(hash)}`;
    const ending = block.match(/(\r\n|\n|\r)$/)?.[0] || '';
    result.push(`${prefix}${serializeValue(values[key])}${comment}${ending}`);
  }
  let output = result.join('');
  const missing = KEYS.filter((key) => !seen.has(key));
  if (missing.length) {
    if (output && !/[\r\n]$/.test(output)) output += newline;
    if (output) output += newline;
    output += `# StudyLoop managed settings${newline}`;
    output += missing.map((key) => `${key}=${serializeValue(values[key])}${newline}`).join('');
  }
  // Refuse to change a file if an unusual original record or quote interaction
  // would alter any unmanaged variable or lose a managed setting.
  let before;
  let after;
  try {
    before = parseEnv(raw);
    after = parseEnv(output);
  } catch {
    throw fileFailure();
  }
  if (
    KEYS.some((key) => after[key] !== values[key]) ||
    Object.entries(before).some(([key, value]) => !ALLOWED.has(key) && after[key] !== value) ||
    Object.keys(after).some((key) => !ALLOWED.has(key) && !Object.hasOwn(before, key))
  )
    throw fileFailure();
  return output;
}

/** All returned snapshots are public-safe; preview is strictly server-internal. */
export async function createSettingsManager({ env, filePath }) {
  if (
    !record(env) ||
    (filePath !== false && (typeof filePath !== 'string' || !path.isAbsolute(filePath)))
  )
    throw invalid();
  const enabled = filePath !== false;
  const initial = managedFrom(env);
  if (Object.values(initial).some((value) => typeof value !== 'string')) throw invalid();
  const revisionKey = randomBytes(32);
  const fallback = { ...DEFAULTS, LLM_API_KEY: '', BRAVE_SEARCH_API_KEY: '', ...initial };
  let applied;

  async function disk() {
    if (!enabled) return { raw: null, values: {} };
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw fileFailure();
      const raw = await readFile(filePath, 'utf8');
      if (Buffer.byteLength(raw) > 1024 * 1024) throw fileFailure();
      return { raw, values: managedFrom(parseEnv(raw)) };
    } catch (error) {
      if (error.code === 'ENOENT') return { raw: null, values: {} };
      throw fileFailure();
    }
  }

  function resolved(state) {
    const values = { ...fallback, ...state.values };
    // Empty optional knobs have the same behavior as omitted environment knobs.
    for (const key of [
      'LLM_PROVIDER',
      ...Object.keys(RANGES),
      'LLM_ALLOW_KEYLESS',
      'LLM_JSON_MODE',
    ]) {
      if (!values[key]) values[key] = DEFAULTS[key];
    }
    if (values.LLM_PROVIDER === 'openai') values.LLM_PROVIDER = 'openai-compatible';
    return values;
  }

  function revision(state) {
    return createHmac('sha256', revisionKey)
      .update(JSON.stringify([state.raw, fallback]))
      .digest('hex');
  }

  function snapshot(state) {
    const current = resolved(state);
    return {
      values: Object.fromEntries(VALUE_KEYS.map((key) => [key, current[key]])),
      secrets: Object.fromEntries(SECRET_KEYS.map((key) => [key, Boolean(current[key]?.trim())])),
      revision: revision(state),
    };
  }

  async function candidate(payload, state) {
    if (!enabled)
      throw new HttpError(
        503,
        'Editing settings is disabled for this instance. 此实例未开放配置编辑。',
      );
    const parts = inputParts(payload);
    if (parts.revision !== revision(state)) throw conflict();
    const current = resolved(state);
    const next = { ...current };
    for (const [key, value] of Object.entries(parts.values)) next[key] = validateValue(key, value);
    for (const [key, value] of Object.entries(parts.secrets)) {
      if (value === null) next[key] = '';
      else if (value !== undefined) {
        const replacement = validateSecret(value);
        if (replacement) next[key] = replacement;
      }
    }
    const vendorChanged =
      next.LLM_PROVIDER !== current.LLM_PROVIDER || next.LLM_BASE_URL !== current.LLM_BASE_URL;
    // A file editor may have changed only the endpoint since this runtime last
    // applied settings. Refreshing the form must not authorize forwarding that
    // runtime's old key to the externally changed endpoint.
    const appliedVendorChanged =
      next.LLM_PROVIDER !== applied.LLM_PROVIDER || next.LLM_BASE_URL !== applied.LLM_BASE_URL;
    const reusesAppliedKey =
      Boolean(applied.LLM_API_KEY?.trim()) && next.LLM_API_KEY === applied.LLM_API_KEY;
    const explicitKey =
      Object.hasOwn(parts.secrets, 'LLM_API_KEY') &&
      (parts.secrets.LLM_API_KEY === null ||
        (typeof parts.secrets.LLM_API_KEY === 'string' && parts.secrets.LLM_API_KEY.trim()));
    if (
      ((vendorChanged && current.LLM_API_KEY?.trim()) ||
        (appliedVendorChanged && reusesAppliedKey)) &&
      !explicitKey
    )
      throw new HttpError(
        400,
        'Changing the model provider or API URL requires a replacement API key or explicitly clearing the saved key. 更换服务商或地址时，请填写新密钥或明确清除原密钥。',
      );
    // Validate the complete candidate, including existing externally configured
    // fields, before either testing a model or writing the file.
    for (const key of VALUE_KEYS) next[key] = validateValue(key, next[key]);
    for (const key of SECRET_KEYS) next[key] = validateSecret(next[key]);
    return next;
  }

  function serial(operation) {
    const key = enabled ? filePath : revisionKey.toString('hex');
    const prior = queues.get(key) || Promise.resolve();
    const pending = prior.then(operation);
    const settled = pending.catch(() => {});
    queues.set(key, settled);
    settled.finally(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return pending;
  }

  const first = await disk();
  applied = resolved(first);
  // Bootstrap only file-present allowlisted fields; never import deployment,
  // process, cookie, instance-password, or arbitrary shell environment fields.
  for (const [key, value] of Object.entries(first.values)) env[key] = value;

  return {
    read: () => serial(async () => snapshot(await disk())),
    preview: (payload) =>
      serial(async () => ({ ...env, ...(await candidate(payload, await disk())) })),
    save: (payload) =>
      serial(async () => {
        const state = await disk();
        const next = await candidate(payload, state);
        const output = replaceManaged(state.raw || '', next);
        const temporary = path.join(
          path.dirname(filePath),
          `.${path.basename(filePath)}.${randomUUID()}.tmp`,
        );
        let handle;
        try {
          handle = await open(temporary, 'wx', 0o600);
          await handle.writeFile(output, 'utf8');
          await handle.sync();
          await handle.close();
          handle = null;
          // A text editor can change any part of the file while we prepare it.
          if ((await disk()).raw !== state.raw) throw conflict();
          await rename(temporary, filePath);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw fileFailure();
        } finally {
          await handle?.close().catch(() => {});
          await rm(temporary, { force: true }).catch(() => {});
        }
        for (const key of KEYS) env[key] = next[key];
        // If a line is later removed externally, inherit the last committed
        // runtime value instead of resurrecting a key cleared by an earlier save.
        Object.assign(fallback, next);
        applied = { ...next };
        return snapshot({ raw: output, values: next });
      }),
  };
}
