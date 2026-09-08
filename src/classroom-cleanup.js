const QUEUE_KEY = 'studyloop.pending-classroom-cleanups';
const QUEUE_PREFIX = `${QUEUE_KEY}.`;
const LINKS_KEY = 'studyloop.classroom-links';
const ID = /^[a-zA-Z0-9_-]{1,100}$/;

function normalize(input) {
  if (
    typeof input?.attemptId !== 'string' ||
    !ID.test(input.attemptId) ||
    !Array.isArray(input.handoffIds)
  )
    throw new Error('Invalid classroom cleanup request.');
  if (input.handoffIds.some((id) => typeof id !== 'string' || !ID.test(id)))
    throw new Error('Invalid classroom cleanup request.');
  return { attemptId: input.attemptId, handoffIds: [...new Set(input.handoffIds)] };
}

function relatedContext(storage, sessionStorage, attemptId) {
  for (const [source, key] of [
    [storage, LINKS_KEY],
    [sessionStorage, 'studyloop.classroom-contexts'],
  ]) {
    if (!source) continue;
    const raw = source.getItem(key);
    if (!raw) continue;
    const links = JSON.parse(raw);
    if (!links || typeof links !== 'object' || Array.isArray(links))
      throw new Error('Invalid classroom association data.');
    for (const value of Object.values(links)) {
      if (value?.attemptId === attemptId) return true;
      if (typeof value?.returnUrl !== 'string') continue;
      const url = new URL(value.returnUrl, 'https://studyloop.invalid');
      if (
        url.origin === 'https://studyloop.invalid' &&
        url.searchParams.get('attempt') === attemptId
      )
        return true;
    }
  }
  return false;
}

// The iframe reuses the bundled classroom's own storage implementation. It must
// independently verify the server receipt before touching any browser data.
async function browserBridge(input) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    const requestId = crypto.randomUUID();
    iframe.hidden = true;
    iframe.title = 'StudyLoop classroom cleanup';
    iframe.src = '/studyloop-cleanup';
    let sent = false;
    const finish = (error, result) => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      iframe.remove();
      if (error) reject(error);
      else resolve(result);
    };
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== iframe.contentWindow) return;
      const value = event.data;
      if (value?.type === 'studyloop:cleanup-ready' && !sent) {
        sent = true;
        iframe.contentWindow.postMessage(
          { type: 'studyloop:cleanup', requestId, ...input },
          window.location.origin,
        );
      } else if (
        value?.type === 'studyloop:cleanup-result' &&
        value.requestId === requestId &&
        value.attemptId === input.attemptId
      ) {
        if (
          typeof value.ok !== 'boolean' ||
          !Number.isInteger(value.deleted) ||
          !Number.isInteger(value.pending) ||
          value.deleted < 0 ||
          value.pending < 0
        )
          return;
        finish(null, value);
      }
    };
    const timer = setTimeout(() => finish(new Error('Classroom cleanup timed out.')), 60000);
    iframe.addEventListener('error', () => finish(new Error('Classroom cleanup unavailable.')), {
      once: true,
    });
    window.addEventListener('message', receive);
    document.body.append(iframe);
  });
}

// Dependencies make interrupted deletion and owner changes testable without a
// real model request or access to a user's browser storage.
export function createClassroomCleanup({
  storage,
  sessionStorage,
  fetcher,
  runBridge = browserBridge,
}) {
  const keyFor = (attemptId, phase) => `${QUEUE_PREFIX}${phase}.${attemptId}`;
  const readKey = (attemptId, phase) => {
    const raw = storage.getItem(keyFor(attemptId, phase));
    if (raw === null) return null;
    const row = JSON.parse(raw);
    const job = normalize(row);
    if (job.attemptId !== attemptId || row.phase !== phase)
      throw new Error('Invalid pending cleanup data.');
    return { ...job, phase };
  };
  const writeJob = (job) => storage.setItem(keyFor(job.attemptId, job.phase), JSON.stringify(job));
  const readJob = (attemptId) => readKey(attemptId, 'confirmed') || readKey(attemptId, 'staged');
  const migrateLegacy = () => {
    const raw = storage.getItem(QUEUE_KEY);
    if (raw === null) return;
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error('Invalid pending cleanup data.');
    // Preserve the legacy queue until every row has a durable individual entry.
    const jobs = rows.map((row) => ({
      ...normalize(row),
      phase: row.phase === 'confirmed' ? 'confirmed' : 'staged',
    }));
    for (const job of jobs) if (!readKey(job.attemptId, job.phase)) writeJob(job);
    storage.removeItem(QUEUE_KEY);
  };
  const read = () => {
    migrateLegacy();
    const ids = new Set();
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(QUEUE_PREFIX)) continue;
      const match = /^(staged|confirmed)\.([a-zA-Z0-9_-]{1,100})$/.exec(
        key.slice(QUEUE_PREFIX.length),
      );
      if (!match) throw new Error('Invalid pending cleanup data.');
      ids.add(match[2]);
    }
    return [...ids].sort().map(readJob).filter(Boolean);
  };
  const remove = (attemptId) => {
    storage.removeItem(keyFor(attemptId, 'staged'));
    storage.removeItem(keyFor(attemptId, 'confirmed'));
  };
  const pendingMessage = () => {
    let language;
    try {
      language = storage.getItem('studyloop-language');
    } catch {
      /* Storage may be unavailable. */
    }
    return language === 'en'
      ? 'Classroom cleanup is pending. Keep this browser data and retry cleanup.'
      : '关联课堂尚未清理完成，请保留此浏览器数据并重试清理。';
  };
  const queue = (input) => {
    const job = normalize(input);
    migrateLegacy();
    if (!readJob(job.attemptId)) writeJob({ ...job, phase: 'staged' });
  };
  const active = new Map();
  const cleanup = (input) => {
    const job = normalize(input);
    if (active.has(job.attemptId)) return active.get(job.attemptId);
    const operation = (async () => {
      let deleted = 0;
      let confirmedJob;
      try {
        queue(job);
        const response = await fetcher(
          `/api/attempt-deletions/${encodeURIComponent(job.attemptId)}`,
          {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok) return { ok: false, deleted: 0, pending: 1, message: pendingMessage() };
        const receipt = await response.json();
        if (
          receipt?.completed !== true ||
          receipt.attemptId !== job.attemptId ||
          !['attempts', 'practice', 'handoffs', 'courses', 'plans'].every(
            (key) => Number.isInteger(receipt.deleted?.[key]) && receipt.deleted[key] >= 0,
          ) ||
          receipt.deleted.attempts !== 1
        )
          throw new Error('The server has not confirmed this deletion.');
        const confirmed = normalize(receipt);
        // A separate confirmation key cannot be downgraded by another tab's
        // delayed staging write. Cached confirmation is never authorization.
        confirmedJob = { ...confirmed, phase: 'confirmed' };
        writeJob(confirmedJob);
        const result =
          confirmed.handoffIds.length || relatedContext(storage, sessionStorage, job.attemptId)
            ? await runBridge(confirmed)
            : { ok: true, deleted: 0, pending: 0 };
        if (
          typeof result?.ok !== 'boolean' ||
          !Number.isInteger(result.deleted) ||
          result.deleted < 0 ||
          !Number.isInteger(result.pending) ||
          result.pending < 0
        )
          throw new Error('Invalid classroom cleanup result.');
        deleted = result.deleted;
        if (result.ok !== true || result.pending !== 0) {
          // Another tab may have finished and removed the entry while this
          // bridge was pending. Preserve any still-incomplete work for retry.
          writeJob(confirmedJob);
          return { ok: false, deleted, pending: 1, message: pendingMessage() };
        }
        remove(job.attemptId);
        return { ok: true, deleted, pending: 0 };
      } catch {
        if (confirmedJob) {
          try {
            writeJob(confirmedJob);
          } catch {
            /* Report pending even when storage is unavailable. */
          }
        }
        return { ok: false, deleted, pending: 1, message: pendingMessage() };
      }
    })().finally(() => active.delete(job.attemptId));
    active.set(job.attemptId, operation);
    return operation;
  };
  const retry = async () => {
    let deleted = 0;
    try {
      const jobs = read();
      const messages = [];
      for (const job of jobs) {
        const result = await cleanup(job);
        deleted += result.deleted;
        if (result.message) messages.push(result.message);
      }
      const pending = read().length;
      return { ok: pending === 0, deleted, pending, message: [...new Set(messages)].join(' ') };
    } catch {
      return { ok: false, deleted, pending: 1, message: pendingMessage() };
    }
  };
  return {
    queue,
    cleanup,
    pending: read,
    retry,
    discard: (attemptId) => {
      if (typeof attemptId !== 'string' || !ID.test(attemptId))
        throw new Error('Invalid classroom cleanup request.');
      migrateLegacy();
      if (readJob(attemptId)?.phase === 'staged') storage.removeItem(keyFor(attemptId, 'staged'));
    },
  };
}

let client;
function current() {
  client ||= createClassroomCleanup({
    storage: window.localStorage,
    sessionStorage: window.sessionStorage,
    fetcher: (...args) => fetch(...args),
  });
  return client;
}
export const queueAttemptClassroomCleanup = (input) => current().queue(input);
export const cleanupAttemptClassrooms = (input) => current().cleanup(input);
export const getPendingClassroomCleanups = () => current().pending();
export const retryPendingClassroomCleanups = () => current().retry();
export const discardQueuedClassroomCleanup = (attemptId) => current().discard(attemptId);
