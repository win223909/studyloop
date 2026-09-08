'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { GenerationSessionState } from '@/app/generation-preview/types';
import {
  CLASSROOM_CONTEXT_KEY,
  safeStudyLoopReturnUrl,
  STUDYLOOP_EMBEDDED,
  syncStudyLoopModel,
} from '@/lib/studyloop/embedded';

function LaunchClassroom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, setLocale } = useI18n();
  const lang = locale.startsWith('zh') ? 'zh' : 'en';
  const [error, setError] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [returnUrl, setReturnUrl] = useState('/');
  const [retry, setRetry] = useState(0);
  const setLocaleRef = useRef(setLocale);
  setLocaleRef.current = setLocale;
  const handoff = searchParams.get('handoff');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void (async () => {
      if (!STUDYLOOP_EMBEDDED || !handoff) throw new Error('INVALID_HANDOFF');
      const response = await fetch(`/api/classroom-handoffs/${encodeURIComponent(handoff)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'SESSION_REQUIRED'
            : 'HANDOFF_UNAVAILABLE',
        );
      const data = (await response.json()) as {
        brief?: unknown;
        courseTitle?: unknown;
        language?: unknown;
        returnUrl?: unknown;
      };
      if (
        typeof data.brief !== 'string' ||
        !data.brief.trim() ||
        typeof data.courseTitle !== 'string'
      ) {
        throw new Error('INVALID_HANDOFF');
      }
      const language =
        typeof data.language === 'string' && data.language.startsWith('en') ? 'en' : 'zh';
      const safeReturn = safeStudyLoopReturnUrl(data.returnUrl);
      setCourseTitle(data.courseTitle);
      setReturnUrl(safeReturn);
      setLocaleRef.current(language === 'en' ? 'en-US' : 'zh-CN');
      await syncStudyLoopModel();
      if (controller.signal.aborted) return;
      const requirement =
        language === 'zh'
          ? `请为《${data.courseTitle}》创建中文互动课堂。根据所附学习简报，重点讲解学生尚未掌握的概念，用分步示例、可理解的图示和练习帮助巩固。先提供可供确认的课堂大纲。`
          : `Create an interactive classroom in English for “${data.courseTitle}”. Use the attached learning brief to focus on concepts the learner has not mastered, with step-by-step examples, clear diagrams and practice. Begin with an outline for review.`;
      const session: GenerationSessionState = {
        sessionId: nanoid(),
        requirements: { requirement, webSearch: false, interactiveMode: false },
        pdfText: data.brief,
        pdfImages: [],
        imageStorageIds: [],
        sceneOutlines: null,
        currentStep: 'generating',
        previewPhase: 'preparing',
        courseTitle: data.courseTitle,
      };
      sessionStorage.setItem(
        CLASSROOM_CONTEXT_KEY,
        JSON.stringify({
          courseTitle: data.courseTitle,
          language,
          returnUrl: safeReturn,
        }),
      );
      sessionStorage.setItem('generationSession', JSON.stringify(session));
      router.replace('/generation-preview');
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'LAUNCH_FAILED');
    });
    return () => controller.abort();
  }, [handoff, retry, router]);

  const errorText = error.startsWith('MODEL_')
    ? lang === 'zh'
      ? '请先在 StudyLoop 配置可用模型，再重试进入课堂。'
      : 'Configure a model in StudyLoop, then try opening the classroom again.'
    : error === 'SESSION_REQUIRED'
      ? lang === 'zh'
        ? '当前会话无法访问这份学习简报，请返回 StudyLoop 登录并打开原答卷。'
        : 'This session cannot access the learning brief. Return to StudyLoop and open the original attempt.'
      : lang === 'zh'
        ? '课堂交接暂未完成，简报可能已过期。可以重试，或返回原答卷重新进入。'
        : 'The classroom could not be opened. The brief may have expired. Retry or open it again from the original attempt.';

  return (
    <main className="studyloop-launch">
      <span className="studyloop-runtime-eyebrow">STUDYLOOP × OPENMAIC</span>
      <h1>{lang === 'zh' ? '准备你的互动课堂' : 'Preparing your interactive classroom'}</h1>
      {courseTitle && <p className="studyloop-launch-course">{courseTitle}</p>}
      {error ? (
        <>
          <p role="alert">{errorText}</p>
          <div className="studyloop-launch-actions">
            <button onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw size={16} />
              {lang === 'zh' ? '重试' : 'Retry'}
            </button>
            <a href={error.startsWith('MODEL_') ? '/?view=settings' : returnUrl}>
              <ArrowLeft size={16} />
              {lang === 'zh' ? '返回 StudyLoop' : 'Back to StudyLoop'}
            </a>
          </div>
        </>
      ) : (
        <p className="studyloop-launch-progress" role="status">
          <Loader2 size={19} />
          {lang === 'zh'
            ? '正在载入学习简报并同步模型配置…'
            : 'Loading your learning brief and model configuration…'}
        </p>
      )}
      <p className="studyloop-launch-note">
        {lang === 'zh'
          ? '下一步将生成可确认的大纲，再进入 OpenMAIC 的真实课堂。'
          : 'Next, review the generated outline before entering the OpenMAIC classroom.'}
      </p>
    </main>
  );
}

export default function StudyLoopLaunchPage() {
  return (
    <Suspense
      fallback={
        <main className="studyloop-launch" role="status">
          StudyLoop × OpenMAIC…
        </main>
      }
    >
      <LaunchClassroom />
    </Suspense>
  );
}
