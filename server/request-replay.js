import { createHash } from 'node:crypto';
import { HttpError } from './errors.js';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const invalid = () =>
  new HttpError(400, 'Invalid request identifier or payload. 请求编号或内容格式不正确。');
const conflict = () =>
  new HttpError(
    409,
    'This request identifier was already used for different content. Start a new request. 此请求编号已用于其他内容，请重新发起请求。',
  );

// Serialize only JSON data, without invoking getters or toJSON. Array order and
// strings are preserved; object keys are sorted at every level before hashing.
function canonicalJson(value, ancestors = new Set(), depth = 0) {
  if (depth > 64) throw invalid();
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || ancestors.has(value)) throw invalid();
  const array = Array.isArray(value);
  if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if (names.some((name) => typeof name !== 'string')) throw invalid();
  ancestors.add(value);
  try {
    if (array) {
      if (names.length !== value.length + 1) throw invalid();
      const entries = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = descriptors[i];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalid();
        entries.push(canonicalJson(descriptor.value, ancestors, depth + 1));
      }
      return `[${entries.join(',')}]`;
    }
    return `{${names
      .sort()
      .map((name) => {
        const descriptor = descriptors[name];
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalid();
        return `${JSON.stringify(name)}:${canonicalJson(descriptor.value, ancestors, depth + 1)}`;
      })
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function identity(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * Deduplicate in-flight requests in this guard instance. Completed results exist
 * only in the caller's original records, queried through findSaved on every run.
 */
export function createRequestReplayGuard({ findSaved }) {
  if (typeof findSaved !== 'function') throw new TypeError('findSaved must be a function.');
  const pending = new Map();

  function run(request, work) {
    if (!request || typeof request !== 'object' || typeof work !== 'function')
      return Promise.reject(invalid());
    const { owner, operation, key, payload } = request;
    if (key === undefined)
      return Promise.resolve().then(() => work({ key: undefined, fingerprint: undefined }));

    let fingerprint;
    let scope;
    try {
      if (typeof key !== 'string' || !KEY.test(key) || !identity(owner) || !identity(operation))
        throw invalid();
      fingerprint = createHash('sha256').update(canonicalJson(payload)).digest('hex');
      // Tuple encoding prevents delimiter collisions between owner/operation/key.
      scope = JSON.stringify([owner, operation, key]);
    } catch {
      return Promise.reject(invalid());
    }
    const active = pending.get(scope);
    if (active)
      return active.fingerprint === fingerprint ? active.promise : Promise.reject(conflict());

    const entry = { fingerprint, promise: undefined };
    entry.promise = Promise.resolve()
      .then(async () => {
        const saved = await findSaved({ owner, operation, key });
        if (saved !== undefined) {
          if (
            !saved ||
            typeof saved !== 'object' ||
            Array.isArray(saved) ||
            typeof saved.fingerprint !== 'string' ||
            !/^[a-f0-9]{64}$/.test(saved.fingerprint) ||
            !Object.hasOwn(saved, 'result')
          )
            throw new HttpError(
              500,
              'Unable to verify the saved request. Please retry later. 无法核对已保存的请求，请稍后重试。',
            );
          if (saved.fingerprint !== fingerprint) throw conflict();
          return saved.result;
        }
        return work({ key, fingerprint });
      })
      .finally(() => {
        if (pending.get(scope) === entry) pending.delete(scope);
      });
    // Reserve synchronously, before findSaved can await or execute caller code.
    pending.set(scope, entry);
    return entry.promise;
  }

  return { run };
}
