export const CLASSROOM_LINKS_KEY = 'studyloop.classroom-links';
export const CLASSROOM_DELETIONS_KEY = 'studyloop.classroom-deletions';
export const CLASSROOM_CONTEXT_KEY = 'studyloop.classroom-context';
export const CLASSROOM_CONTEXTS_KEY = 'studyloop.classroom-contexts';
export const CLASSROOM_DELETION_EVENT = 'studyloop:classroom-deleted';
const CHANNEL = 'studyloop-classroom-deletions';
const embedded = () => process.env.NEXT_PUBLIC_STUDYLOOP_EMBEDDED === 'true';

export interface CleanupInventory {
  sceneIds: string[];
  assetRefs: string[];
  runtimeIds: string[];
}
export interface ClassroomLink {
  stageId: string;
  attemptId: string;
  handoffId?: string;
  returnUrl: string;
  courseTitle: string;
  language: 'zh' | 'en';
  createdAt: number;
  cleanup?: CleanupInventory;
}
export interface ClassroomDeletion {
  attemptId: string;
  handoffIds: string[];
  stageIds: string[];
  deletedAt: string;
}
export const validLocalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function readObject<T>(storage: Storage, key: string): Record<string, T> {
  const raw = storage.getItem(key);
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Classroom browser metadata is invalid; cleanup can be retried after repair.');
  return value as Record<string, T>;
}

export function attemptFromReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, window.location.origin);
    const id = url.searchParams.get('attempt');
    return url.origin === window.location.origin && url.pathname === '/' && validLocalId(id)
      ? id
      : null;
  } catch {
    return null;
  }
}

export function readClassroomLinks(): Record<string, ClassroomLink> {
  return readObject<ClassroomLink>(localStorage, CLASSROOM_LINKS_KEY);
}
export function readClassroomDeletions(): Record<string, ClassroomDeletion> {
  return readObject<ClassroomDeletion>(localStorage, CLASSROOM_DELETIONS_KEY);
}
export function readPendingContext(): Partial<ClassroomLink> | null {
  const raw = sessionStorage.getItem(CLASSROOM_CONTEXT_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<ClassroomLink>;
  const attemptId = attemptFromReturnUrl(value?.returnUrl);
  return attemptId ? { ...value, attemptId } : null;
}
async function withMetadataLock<T>(work: () => T | Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request('studyloop:classroom-metadata', work);
  return await work();
}
export async function migrateLegacyClassroomLinks(): Promise<void> {
  await withMetadataLock(() => {
    const links = readClassroomLinks();
    const legacy = readObject<Partial<ClassroomLink>>(sessionStorage, CLASSROOM_CONTEXTS_KEY);
    let changed = false;
    for (const [stageId, context] of Object.entries(legacy)) {
      const attemptId = attemptFromReturnUrl(context?.returnUrl);
      if (!validLocalId(stageId) || !attemptId || links[stageId]) continue;
      links[stageId] = {
        stageId,
        attemptId,
        returnUrl: `/?attempt=${encodeURIComponent(attemptId)}`,
        courseTitle: typeof context.courseTitle === 'string' ? context.courseTitle : '',
        language: context.language === 'en' ? 'en' : 'zh',
        createdAt: Date.now(),
        ...(validLocalId(context.handoffId) ? { handoffId: context.handoffId } : {}),
      };
      changed = true;
    }
    if (changed) localStorage.setItem(CLASSROOM_LINKS_KEY, JSON.stringify(links));
  });
}
export function assertAttemptNotDeleted(attemptId: string): void {
  if (embedded() && readClassroomDeletions()[attemptId])
    throw new Error('This learning record was deleted. 此学习记录已删除。');
}
export function isClassroomDeleted(stageId: string): boolean {
  if (!embedded() || typeof window === 'undefined') return false;
  const deletions = readClassroomDeletions();
  const link = readClassroomLinks()[stageId];
  return (
    Boolean(link?.attemptId && deletions[link.attemptId]) ||
    Object.values(deletions).some((item) => item.stageIds?.includes(stageId))
  );
}
export function assertClassroomWritable(stageId: string): void {
  if (isClassroomDeleted(stageId))
    throw new Error('This classroom was deleted. 此课堂已删除，不能继续保存。');
}
export async function bindClassroomToCurrentAttempt(stageId: string): Promise<void> {
  if (!embedded()) return;
  if (!validLocalId(stageId)) throw new Error('Invalid classroom identifier.');
  await withMetadataLock(() => {
    const context = readPendingContext();
    if (!context?.attemptId) throw new Error('Open a classroom from its StudyLoop result first.');
    assertAttemptNotDeleted(context.attemptId);
    assertClassroomWritable(stageId);
    const links = readClassroomLinks();
    links[stageId] = {
      stageId,
      attemptId: context.attemptId,
      ...(validLocalId(context.handoffId) ? { handoffId: context.handoffId } : {}),
      returnUrl: `/?attempt=${encodeURIComponent(context.attemptId)}`,
      courseTitle: typeof context.courseTitle === 'string' ? context.courseTitle : '',
      language: context.language === 'en' ? 'en' : 'zh',
      createdAt: Date.now(),
    };
    localStorage.setItem(CLASSROOM_LINKS_KEY, JSON.stringify(links));
  });
}
export async function saveCleanupInventory(
  stageId: string,
  cleanup: CleanupInventory,
): Promise<void> {
  await withMetadataLock(() => {
    const links = readClassroomLinks();
    if (!links[stageId]) throw new Error('Classroom link disappeared before cleanup.');
    links[stageId] = { ...links[stageId], cleanup };
    localStorage.setItem(CLASSROOM_LINKS_KEY, JSON.stringify(links));
  });
}
export async function removeClassroomLink(stageId: string): Promise<void> {
  await withMetadataLock(() => {
    const links = readClassroomLinks();
    delete links[stageId];
    localStorage.setItem(CLASSROOM_LINKS_KEY, JSON.stringify(links));
  });
}
export async function markAttemptClassroomsDeleted(deletion: ClassroomDeletion): Promise<void> {
  await withMetadataLock(() => {
    const records = readClassroomDeletions();
    const previous = records[deletion.attemptId];
    records[deletion.attemptId] = {
      ...deletion,
      stageIds: [
        ...new Set([
          ...(previous?.stageIds || []),
          ...deletion.stageIds,
          ...Object.values(readClassroomLinks())
            .filter((link) => link?.attemptId === deletion.attemptId)
            .map((link) => link.stageId),
        ]),
      ],
      handoffIds: [...new Set([...(previous?.handoffIds || []), ...deletion.handoffIds])],
    };
    localStorage.setItem(CLASSROOM_DELETIONS_KEY, JSON.stringify(records));
  });
  window.dispatchEvent(new Event(CLASSROOM_DELETION_EVENT));
  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: CLASSROOM_DELETION_EVENT });
    channel.close();
  }
}
export function watchClassroomDeletions(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CLASSROOM_DELETIONS_KEY) listener();
  };
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  if (channel) channel.onmessage = listener;
  window.addEventListener('storage', onStorage);
  window.addEventListener(CLASSROOM_DELETION_EVENT, listener);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CLASSROOM_DELETION_EVENT, listener);
  };
}

export function clearAttemptBrowserContext(attemptId: string): void {
  const pending = readPendingContext();
  const contexts = readObject<Partial<ClassroomLink>>(sessionStorage, CLASSROOM_CONTEXTS_KEY);
  for (const [stageId, value] of Object.entries(contexts))
    if (attemptFromReturnUrl(value?.returnUrl) === attemptId) delete contexts[stageId];
  sessionStorage.setItem(CLASSROOM_CONTEXTS_KEY, JSON.stringify(contexts));
  for (const key of ['generationSession', 'generationParams']) {
    const raw = sessionStorage.getItem(key);
    if (!raw) continue;
    const value = JSON.parse(raw) as { studyloopAttemptId?: string };
    if (value.studyloopAttemptId === attemptId || pending?.attemptId === attemptId)
      sessionStorage.removeItem(key);
  }
  if (pending?.attemptId === attemptId) sessionStorage.removeItem(CLASSROOM_CONTEXT_KEY);
}
