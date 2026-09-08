import { db } from '@/lib/utils/database';
import { deleteStageData } from '@/lib/utils/stage-storage';
import {
  getDocumentStore,
  canonicalizeLegacyStage,
  canonicalizeLegacyScene,
} from '@/lib/document-store';
import { getRuntimeStore } from '@/lib/runtime/store';
import { getAssetPool } from '@/lib/media/asset-pool';
import { loadStageAssetInventory } from '@/lib/media/reclaim-stage-assets';
import {
  collectStageAssetRefs,
  loadSurvivingDocumentAssetRefs,
} from '@/lib/media/collect-stage-asset-refs';
import { probeStageRealmPresence } from '@/lib/media/stage-realm-presence';
import { clearAllForScene } from '@/lib/quiz/persistence';
import {
  clearAttemptBrowserContext,
  markAttemptClassroomsDeleted,
  migrateLegacyClassroomLinks,
  readClassroomLinks,
  removeClassroomLink,
  saveCleanupInventory,
  validLocalId,
  type ClassroomLink,
  type CleanupInventory,
} from './classroom-links';

export interface ClassroomCleanupResult {
  ok: boolean;
  deleted: number;
  pending: number;
  legacyUnlinked?: number;
  sharedAssetsRetained?: number;
  message?: string;
}
interface DeletionReceipt {
  attemptId: string;
  handoffIds: string[];
  deletedAt: string;
  completed: true;
}
const requestValue = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browser storage read failed.'));
  });

/** Read only an existing database. Abort an upgrade rather than create an empty DB. */
async function openRuntimeDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maic-runtime');
    let missing = false;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Browser storage is busy; retry cleanup.'));
    }, 10000);
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else {
        settled = true;
        resolve(request.result);
      }
    };
    request.onerror = () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        missing ? resolve(null) : reject(request.error);
      }
    };
    request.onblocked = () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error('Close other classroom tabs and retry cleanup.'));
      }
    };
  });
}
async function runtimeInventory(stageId: string, previous: string[] = []) {
  const database = await openRuntimeDatabase();
  if (!database) return { ids: [], records: 0 };
  try {
    const transaction = database.transaction(['sessions', 'records'], 'readonly');
    const sessions = transaction.objectStore('sessions');
    const ids = await requestValue(sessions.index('by-stage').getAllKeys(stageId));
    const allIds = [
      ...new Set([...previous, ...ids.filter((id): id is string => typeof id === 'string')]),
    ];
    const counts = await Promise.all(
      allIds.map((id) =>
        requestValue(
          transaction.objectStore('records').count(IDBKeyRange.bound([id, 0], [id, Infinity])),
        ),
      ),
    );
    return { ids: ids as string[], records: counts.reduce((sum, count) => sum + count, 0) };
  } finally {
    database.close();
  }
}
const unique = (values: string[]) => [...new Set(values)];

async function captureInventory(link: ClassroomLink): Promise<CleanupInventory> {
  const document = await getDocumentStore().loadDocument(link.stageId);
  const legacy = await db.scenes.where('stageId').equals(link.stageId).toArray();
  const legacyStage = await db.stages.get(link.stageId);
  const assets = await loadStageAssetInventory(
    document || {
      stage: legacyStage
        ? canonicalizeLegacyStage(legacyStage).stage
        : { id: link.stageId, name: '', createdAt: 0, updatedAt: 0 },
      scenes: legacy.map(canonicalizeLegacyScene),
    },
  );
  const snapshotScenes = (await db.snapshots.toArray())
    .flatMap((snapshot) => snapshot.slides || [])
    .filter((scene) => scene.stageId === link.stageId)
    .map(canonicalizeLegacyScene);
  const snapshotRefs = collectStageAssetRefs(
    {
      stage: document?.stage || { id: link.stageId, name: '', createdAt: 0, updatedAt: 0 },
      scenes: snapshotScenes,
    },
    { mediaRows: [], audioRows: [] },
  );
  const runtime = await runtimeInventory(link.stageId, link.cleanup?.runtimeIds);
  const inventory = {
    sceneIds: unique([
      ...(link.cleanup?.sceneIds || []),
      ...legacy.map((scene) => scene.id),
      ...snapshotScenes.map((scene) => scene.id),
      ...(document?.scenes.map((scene) => scene.id) || []),
    ]),
    assetRefs: unique([
      ...(link.cleanup?.assetRefs || []),
      ...assets.refs.all,
      ...snapshotRefs.all,
    ]),
    runtimeIds: unique([...(link.cleanup?.runtimeIds || []), ...runtime.ids]),
  };
  await saveCleanupInventory(link.stageId, inventory);
  return inventory;
}

async function deleteLinkedClassroom(link: ClassroomLink): Promise<number> {
  // Updated tabs observe the tombstone before this probe. Old tabs must close:
  // their in-flight saves cannot be fenced by code they have not loaded yet.
  if ((await probeStageRealmPresence(link.stageId)) !== 'absent')
    throw new Error('Close other classroom tabs and retry cleanup.');
  const inventory = await captureInventory(link);
  if (!(await getDocumentStore().loadDocument(link.stageId))) {
    // A legacy-only classroom must not be migrated (written anew) after its
    // tombstone. Its exact inventory is durable before deleting these mirrors.
    await db.transaction('rw', db.stages, db.scenes, db.stageOutlines, async () => {
      await db.stages.delete(link.stageId);
      await db.scenes.where('stageId').equals(link.stageId).delete();
      await db.stageOutlines.delete(link.stageId);
    });
  }
  await deleteStageData(link.stageId);

  // Upstream runtime cleanup is fail-soft; repeat its idempotent operation
  // strictly and verify the captured record partitions before reporting success.
  const runtime = getRuntimeStore();
  await runtime.deleteStageRuntime(link.stageId);
  for (const id of inventory.runtimeIds) await runtime.deleteSession(id);
  await db.agentEditSessions.where('stageId').equals(link.stageId).delete();
  await db.chatRestoreStaging.where('stageId').equals(link.stageId).delete();
  await db.mediaFiles.where('stageId').equals(link.stageId).delete();

  // Legacy undo snapshots hold complete scenes without a stage-level index.
  // Retain any scenes belonging to another classroom in a mixed old snapshot.
  const snapshots = await db.snapshots.toArray();
  for (const snapshot of snapshots) {
    if (snapshot.id === undefined || !Array.isArray(snapshot.slides)) continue;
    const remaining = snapshot.slides.filter((scene) => scene.stageId !== link.stageId);
    if (remaining.length === snapshot.slides.length) continue;
    if (!remaining.length) await db.snapshots.delete(snapshot.id);
    else
      await db.snapshots.put({
        ...snapshot,
        slides: remaining,
        index: Math.min(snapshot.index, remaining.length - 1),
      });
  }
  for (const sceneId of inventory.sceneIds) clearAllForScene(sceneId);
  for (const prefix of ['playback-cursor:', 'editor-current-scene:'])
    localStorage.removeItem(`maic:device:${prefix}${link.stageId}`);

  let sharedAssets = 0;
  const survivors = await getDocumentStore().listDocuments();
  const survivorIds = new Set([
    ...survivors.map((item) => item.id),
    ...(await db.stages.toArray()).map((item) => item.id),
    ...(await db.snapshots.toArray()).flatMap(
      (snapshot) => snapshot.slides?.map((scene) => scene.stageId) || [],
    ),
  ]);
  survivorIds.delete(link.stageId);
  const liveRefs = await loadSurvivingDocumentAssetRefs();
  if (liveRefs === null && inventory.assetRefs.length)
    throw new Error('Media ownership could not be verified; cleanup remains pending.');
  const pool = inventory.assetRefs.length ? getAssetPool() : null;
  if (pool && typeof pool.exists !== 'function')
    throw new Error('Media ownership cannot be checked.');
  const poolCandidates: string[] = [];
  for (const ref of inventory.assetRefs) {
    if (liveRefs?.has(ref)) {
      sharedAssets++;
      continue;
    }
    if (await pool?.exists?.(ref)) poolCandidates.push(ref);
  }
  if (poolCandidates.length) {
    // Another classroom's unflushed editor may hold a shared asset reference.
    // Keep bytes until all potentially affected editors have closed.
    for (const stageId of survivorIds)
      if ((await probeStageRealmPresence(stageId)) !== 'absent')
        throw new Error('Close other classroom tabs to finish media cleanup.');
    for (const ref of poolCandidates) {
      await pool!.remove(ref); // backend removes bytes only after final hash reference
      await pool!.release(ref);
      if (await pool!.exists?.(ref)) throw new Error('A classroom media entry remains.');
    }
  }
  const ownedAudio = await db.audioFiles.where('stageId').equals(link.stageId).toArray();
  // A shared global audio row may retain its first creator's now-deleted stageId.
  // Once its final referencing classroom is removed, reclaim that exact ID too.
  const audio = (
    await db.audioFiles.bulkGet(
      unique([...ownedAudio.map((row) => row.id), ...inventory.assetRefs]),
    )
  ).filter((row) => row !== undefined);
  for (const row of audio) {
    if (liveRefs?.has(row.id)) {
      sharedAssets++;
      continue;
    }
    if (liveRefs === null) throw new Error('Audio ownership could not be verified.');
    await db.audioFiles.delete(row.id);
  }
  // Only exact referenced legacy image IDs are eligible; never clear the image table.
  for (const ref of inventory.assetRefs)
    if (liveRefs && !liveRefs.has(ref)) await db.imageFiles.delete(ref);

  const residualCounts = await Promise.all([
    db.stages.where('id').equals(link.stageId).count(),
    db.scenes.where('stageId').equals(link.stageId).count(),
    db.stageOutlines.where('stageId').equals(link.stageId).count(),
    db.stageFolders.where('stageId').equals(link.stageId).count(),
    db.chatSessions.where('stageId').equals(link.stageId).count(),
    db.chatRestoreStaging.where('stageId').equals(link.stageId).count(),
    db.agentEditSessions.where('stageId').equals(link.stageId).count(),
    db.generatedAgents.where('stageId').equals(link.stageId).count(),
    db.playbackState.where('stageId').equals(link.stageId).count(),
    db.mediaFiles.where('stageId').equals(link.stageId).count(),
  ]);
  const runtimeLeft = await runtimeInventory(link.stageId, inventory.runtimeIds);
  const snapshotLeft = (await db.snapshots.toArray()).some((snapshot) =>
    snapshot.slides?.some((scene) => scene.stageId === link.stageId),
  );
  if (
    (await getDocumentStore().loadDocument(link.stageId)) ||
    residualCounts.some(Boolean) ||
    runtimeLeft.ids.length ||
    runtimeLeft.records ||
    snapshotLeft
  )
    throw new Error('Some classroom data remains; retry cleanup.');
  for (const sceneId of inventory.sceneIds)
    for (const prefix of ['quizDraft:', 'quizAnswers:', 'quizResults:', 'quizAttemptId:'])
      if (localStorage.getItem(prefix + sceneId) !== null)
        throw new Error('Some classroom quiz data remains; retry cleanup.');
  await removeClassroomLink(link.stageId);
  return sharedAssets;
}

export async function cleanupAttemptClassrooms(attemptId: string): Promise<ClassroomCleanupResult> {
  if (!validLocalId(attemptId)) throw new Error('Invalid learning record identifier.');
  const response = await fetch(`/api/attempt-deletions/${encodeURIComponent(attemptId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('The server has not confirmed deletion for this session.');
  const receipt = (await response.json()) as DeletionReceipt;
  if (
    receipt.completed !== true ||
    receipt.attemptId !== attemptId ||
    !Array.isArray(receipt.handoffIds) ||
    !receipt.handoffIds.every(validLocalId) ||
    typeof receipt.deletedAt !== 'string'
  )
    throw new Error('Invalid deletion receipt.');
  await migrateLegacyClassroomLinks();
  let links = readClassroomLinks();
  let matched = Object.entries(links)
    .filter(
      ([stageId, link]) =>
        validLocalId(stageId) && link?.stageId === stageId && link.attemptId === attemptId,
    )
    .map(([, link]) => link);
  await markAttemptClassroomsDeleted({
    attemptId,
    handoffIds: receipt.handoffIds,
    stageIds: matched.map((link) => link.stageId),
    deletedAt: receipt.deletedAt,
  });
  // Binding and tombstones share one metadata lock. Re-read after the mark so
  // a classroom linked just before deletion cannot escape this cleanup batch.
  links = readClassroomLinks();
  matched = Object.entries(links)
    .filter(
      ([stageId, link]) =>
        validLocalId(stageId) && link?.stageId === stageId && link.attemptId === attemptId,
    )
    .map(([, link]) => link);
  clearAttemptBrowserContext(attemptId);
  // Give notified tabs a chance to abort generation and leave the deleted stage.
  await new Promise((resolve) => setTimeout(resolve, 100));
  let deleted = 0;
  let pending = 0;
  let sharedAssetsRetained = 0;
  for (const link of matched) {
    try {
      sharedAssetsRetained += await deleteLinkedClassroom(link);
      deleted++;
    } catch {
      pending++;
    }
  }
  pending = Math.max(
    pending,
    Object.values(readClassroomLinks()).filter((link) => link?.attemptId === attemptId).length,
  );
  const summaries = await getDocumentStore().listDocuments();
  const legacyStages = await db.stages.toArray();
  const legacyUnlinked = [
    ...new Set([...summaries, ...legacyStages].map((item) => item.id)),
  ].filter((id) => !links[id]).length;
  return {
    ok: pending === 0,
    deleted,
    pending,
    legacyUnlinked,
    sharedAssetsRetained,
    ...(pending
      ? {
          message:
            '部分课堂数据尚未清理，请关闭其他课堂标签页后重试。Some classroom data remains; close other classroom tabs and retry.',
        }
      : legacyUnlinked
        ? {
            message:
              '较早课堂缺少原答卷关联，已保留供单独管理。Older unlinked classrooms were preserved for separate management.',
          }
        : sharedAssetsRetained
          ? {
              message:
                '其他课堂仍在使用的共享媒体已保留。Media used by other classrooms was preserved.',
            }
          : {}),
  };
}
