import { assertClassroomWritable, isClassroomDeleted } from '@/lib/studyloop/classroom-links';
import type { DocumentStore } from '@openmaic/storage';

import type { AppScene } from '@/lib/types/stage';
import { omitUndefinedObjectMembers } from '@/lib/persistence/plain-json';

import type { AppStage } from './persistence-types';

let wrappers = new WeakMap<DocumentStore<AppScene, AppStage>, DocumentStore<AppScene, AppStage>>();

export function resetPlainJsonDocumentWritesForTests(): void {
  wrappers = new WeakMap();
}

/**
 * Wrap a document store so every write strips undefined-valued members before
 * persisting (the agent tools' boundary). The wrapper is a Proxy over the
 * underlying store, so capabilities the `DocumentStore` interface does not
 * declare (such as the PG store's `readFreshnessManifest`) fall through to the
 * store itself; the generic return type keeps them visible to callers.
 */
export function withPlainJsonDocumentWrites<TStore extends DocumentStore<AppScene, AppStage>>(
  store: TStore,
): TStore {
  const existing = wrappers.get(store);
  if (existing) return existing as TStore;

  const write = async <T>(stageId: string, operation: () => Promise<T>): Promise<T> => {
    assertClassroomWritable(stageId);
    const result = await operation();
    // A deletion can arrive while the underlying store opens its transaction.
    // Remove a late commit before allowing the caller to persist legacy mirrors.
    if (isClassroomDeleted(stageId)) {
      await store.deleteDocument(stageId);
      assertClassroomWritable(stageId);
    }
    return result;
  };
  const methods: DocumentStore<AppScene, AppStage> = {
    saveDocument(document) {
      return write(document.stage.id, () =>
        store.saveDocument(omitUndefinedObjectMembers(document)),
      );
    },
    loadDocument(stageId) {
      return store.loadDocument(stageId);
    },
    listDocuments() {
      return store.listDocuments();
    },
    deleteDocument(stageId) {
      return store.deleteDocument(stageId);
    },
    putStage(stageId, stage) {
      return write(stageId, () => store.putStage(stageId, omitUndefinedObjectMembers(stage)));
    },
    putScene(stageId, scene) {
      return write(stageId, () => store.putScene(stageId, omitUndefinedObjectMembers(scene)));
    },
    getScene(stageId, sceneId) {
      return store.getScene(stageId, sceneId);
    },
    deleteScene(stageId, sceneId) {
      return store.deleteScene(stageId, sceneId);
    },
  };
  const facade = Object.create(Object.getPrototypeOf(store)) as TStore;
  Object.defineProperties(facade, Object.getOwnPropertyDescriptors(methods));
  const wrapper = new Proxy(facade, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return Reflect.get(store, property, store) as unknown;
    },
  });
  wrappers.set(store, wrapper);
  wrappers.set(wrapper, wrapper);
  return wrapper as TStore;
}
