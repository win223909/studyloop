import type { RuntimeStore } from '@openmaic/storage';
import { assertClassroomWritable, isClassroomDeleted } from './classroom-links';

/** Check after the caller's runtime lock is acquired, immediately before writes. */
export function guardStudyLoopRuntime(store: RuntimeStore): RuntimeStore {
  return new Proxy(store, {
    get(target, property) {
      const method = Reflect.get(target, property, target) as unknown;
      if (typeof method !== 'function') return method;
      if (!['createSession', 'appendRecord', 'setSessionStatus'].includes(String(property)))
        return method.bind(target);
      return async (...args: unknown[]) => {
        let stageId: string | undefined;
        let sessionId: string | undefined;
        if (property === 'createSession') {
          stageId = (args[0] as { stageId: string }).stageId;
        } else {
          sessionId =
            property === 'appendRecord'
              ? (args[0] as { sessionId: string }).sessionId
              : (args[0] as string);
          const session = await target.getSession(sessionId);
          stageId = session?.stageId;
        }
        if (stageId) assertClassroomWritable(stageId);
        const result = await Reflect.apply(method, target, args);
        if (stageId && isClassroomDeleted(stageId)) {
          if (property === 'createSession') sessionId = (result as { id: string }).id;
          if (sessionId) await target.deleteSession(sessionId);
          assertClassroomWritable(stageId);
        }
        return result;
      };
    },
  });
}
