'use client';

import { useEffect } from 'react';
import { cleanupAttemptClassrooms } from '@/lib/studyloop/cleanup';
import { validLocalId } from '@/lib/studyloop/classroom-links';

export default function StudyLoopCleanupPage() {
  useEffect(() => {
    if (window.parent === window || process.env.NEXT_PUBLIC_STUDYLOOP_EMBEDDED !== 'true') return;
    const origin = window.location.origin;
    const requests = new Map<string, Promise<unknown>>();
    let active = false;
    let disposed = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== origin) return;
      const message = event.data;
      if (
        message?.type !== 'studyloop:cleanup' ||
        !validLocalId(message.attemptId) ||
        typeof message.requestId !== 'string' ||
        message.requestId.length > 128 ||
        !message.requestId
      )
        return;
      const { requestId, attemptId } = message as { requestId: string; attemptId: string };
      const key = `${requestId}:${attemptId}`;
      const reply = (result: unknown) => {
        if (!disposed) window.parent.postMessage(result, origin);
      };
      const previous = requests.get(key);
      if (previous) {
        void previous.then(reply);
        return;
      }
      if (active || requests.size >= 32) {
        reply({
          type: 'studyloop:cleanup-result',
          requestId,
          attemptId,
          ok: false,
          deleted: 0,
          pending: 1,
          message: 'Cleanup is busy. Please retry.',
        });
        return;
      }
      active = true;
      const work = cleanupAttemptClassrooms(attemptId)
        .catch(() => ({
          ok: false,
          deleted: 0,
          pending: 1,
          message:
            '无法确认本地课堂已清理，请重试。Classroom cleanup could not be confirmed; retry.',
        }))
        .then((result) => ({ type: 'studyloop:cleanup-result', requestId, attemptId, ...result }))
        .finally(() => {
          active = false;
        });
      requests.set(key, work);
      void work.then(reply);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'studyloop:cleanup-ready' }, origin);
    return () => {
      disposed = true;
      window.removeEventListener('message', onMessage);
    };
  }, []);
  return <p role="status">StudyLoop 本地课堂清理 · Local classroom cleanup</p>;
}
