'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { STUDYLOOP_EMBEDDED, syncStudyLoopModel } from '@/lib/studyloop/embedded';

export function ServerProvidersInit() {
  const fetchServerProviders = useSettingsStore((state) => state.fetchServerProviders);
  useEffect(() => {
    if (STUDYLOOP_EMBEDDED) {
      // The launch page displays actionable errors. A plain studio visit can
      // still browse saved classrooms when the model has not been configured.
      void syncStudyLoopModel().catch(() => undefined);
    } else {
      void fetchServerProviders();
    }
  }, [fetchServerProviders]);
  return null;
}
