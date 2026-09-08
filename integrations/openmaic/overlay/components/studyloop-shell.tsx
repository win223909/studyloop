'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStageStore, clearStoreForDeletedStage } from '@/lib/store/stage';
import { markStageDeleted } from '@/lib/utils/deleted-stages';
import {
  readClassroomLinks,
  migrateLegacyClassroomLinks,
  watchClassroomDeletions,
  isClassroomDeleted,
  clearAttemptBrowserContext,
} from '@/lib/studyloop/classroom-links';
import { ArrowLeft, ExternalLink, FileCheck2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  CLASSROOM_CONTEXT_KEY,
  CLASSROOM_CONTEXTS_KEY,
  safeStudyLoopReturnUrl,
  STUDYLOOP_EMBEDDED,
  type StudyLoopClassroomContext,
} from '@/lib/studyloop/embedded';

export function StudyLoopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const previousPath = useRef(pathname);
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const [context, setContext] = useState<StudyLoopClassroomContext | null>(null);
  useEffect(() => {
    if (!STUDYLOOP_EMBEDDED) return;
    try {
      const pending = JSON.parse(
        sessionStorage.getItem(CLASSROOM_CONTEXT_KEY) || 'null',
      ) as StudyLoopClassroomContext | null;
      const contexts = JSON.parse(sessionStorage.getItem(CLASSROOM_CONTEXTS_KEY) || '{}') as Record<
        string,
        StudyLoopClassroomContext
      >;
      const priorPath = previousPath.current;
      previousPath.current = pathname;
      const classroomId = pathname?.match(/^\/classroom\/([^/]+)$/)?.[1];
      let next = classroomId ? readClassroomLinks()[classroomId] || contexts[classroomId] : pending;
      if (classroomId && !next && pending && priorPath === '/generation-preview') {
        next = pending;
        contexts[classroomId] = pending;
        sessionStorage.setItem(
          CLASSROOM_CONTEXTS_KEY,
          JSON.stringify(Object.fromEntries(Object.entries(contexts).slice(-40))),
        );
        sessionStorage.removeItem(CLASSROOM_CONTEXT_KEY);
      }
      if (next && typeof next.courseTitle === 'string') {
        setContext({ ...next, returnUrl: safeStudyLoopReturnUrl(next.returnUrl) });
      } else {
        setContext(null);
      }
    } catch {
      setContext(null);
    }
  }, [pathname]);
  useEffect(() => {
    if (!STUDYLOOP_EMBEDDED) return;
    const leaveDeleted = () => {
      const stageId = pathname?.match(/^\/classroom\/([^/]+)$/)?.[1];
      if (!stageId) return;
      try {
        if (!isClassroomDeleted(stageId)) return;
        const link = readClassroomLinks()[stageId];
        if (link) clearAttemptBrowserContext(link.attemptId);
      } catch {
        // Corrupt deletion metadata must not permit an old classroom to save.
      }
      useStageStore.getState().bumpGenerationEpoch();
      markStageDeleted(stageId);
      clearStoreForDeletedStage(stageId);
      window.speechSynthesis?.cancel();
      setContext(null);
      router.replace('/studio');
    };
    const unwatch = watchClassroomDeletions(leaveDeleted);
    void migrateLegacyClassroomLinks()
      .then(() => {
        const stageId = pathname?.match(/^\/classroom\/([^/]+)$/)?.[1];
        const link = stageId ? readClassroomLinks()[stageId] : null;
        if (link) setContext(link);
        leaveDeleted();
      })
      .catch(leaveDeleted);
    leaveDeleted();
    return unwatch;
  }, [pathname, router]);
  if (!STUDYLOOP_EMBEDDED) return children;
  const showAttempt = pathname !== '/studio' && context?.returnUrl && context.returnUrl !== '/';
  return (
    <div className="studyloop-runtime-root">
      <header className="studyloop-runtime-bar">
        <a className="studyloop-runtime-home" href="/">
          <ArrowLeft size={17} />
          <strong>StudyLoop</strong>
        </a>
        <span className="studyloop-runtime-name">{zh ? '互动课堂' : 'Interactive classroom'}</span>
        <nav aria-label={zh ? '课堂导航' : 'Classroom navigation'}>
          {showAttempt && (
            <a href={context?.returnUrl || '/'}>
              <FileCheck2 size={15} />
              {zh ? '返回原答卷' : 'Original attempt'}
            </a>
          )}
          <a
            className="studyloop-runtime-credit"
            href="https://github.com/THU-MAIC/OpenMAIC"
            target="_blank"
            rel="noreferrer"
          >
            {zh ? '基于' : 'Powered by'} THU-MAIC / OpenMAIC
            <ExternalLink size={12} />
          </a>
        </nav>
      </header>
      <div className="studyloop-runtime-content">{children}</div>
    </div>
  );
}
