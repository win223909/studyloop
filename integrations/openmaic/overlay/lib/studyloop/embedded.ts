import { useSettingsStore } from '@/lib/store/settings';
import type { ProviderId } from '@/lib/types/provider';

export const STUDYLOOP_EMBEDDED = process.env.NEXT_PUBLIC_STUDYLOOP_EMBEDDED === 'true';
export {
  CLASSROOM_CONTEXT_KEY,
  CLASSROOM_CONTEXTS_KEY,
  CLASSROOM_LINKS_KEY,
} from './classroom-links';

export interface StudyLoopClassroomContext {
  attemptId?: string;
  handoffId?: string;
  stageId?: string;
  courseTitle: string;
  language: 'zh' | 'en';
  returnUrl: string;
}

export function safeStudyLoopReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== '/') return '/';
    const attempt = url.searchParams.get('attempt');
    return attempt ? `/?attempt=${encodeURIComponent(attempt)}` : '/';
  } catch {
    return '/';
  }
}

let managedSync: Promise<void> | undefined;

function managedMediaSettings(state: ReturnType<typeof useSettingsStore.getState>) {
  const disableRemote = <
    T extends Record<string, { apiKey: string; baseUrl: string; enabled: boolean }>,
  >(
    configs: T,
    localProvider?: string,
  ): T =>
    Object.fromEntries(
      Object.entries(configs).map(([id, config]) => [
        id,
        {
          ...config,
          apiKey: '',
          baseUrl: '',
          providerOptions: undefined,
          customDefaultBaseUrl: '',
          enabled: id === localProvider,
          isServerConfigured: false,
          serverDisabled: id !== localProvider,
        },
      ]),
    ) as unknown as T;
  return {
    imageGenerationEnabled: false,
    videoGenerationEnabled: false,
    imageProvidersConfig: disableRemote(state.imageProvidersConfig),
    videoProvidersConfig: disableRemote(state.videoProvidersConfig),
    ttsProvidersConfig: disableRemote(state.ttsProvidersConfig, 'browser-native-tts'),
    asrProvidersConfig: disableRemote(state.asrProvidersConfig, 'browser-native'),
    ttsProviderId: 'browser-native-tts' as const,
    ttsVoice: state.ttsProviderId === 'browser-native-tts' ? state.ttsVoice : 'default',
    ttsEnabled: state.ttsProviderId === 'browser-native-tts' && state.ttsEnabled,
    asrProviderId: 'browser-native' as const,
    asrEnabled: false,
  };
}

/** Hydrate first, then select only the model advertised by the parent-managed runtime. */
export function syncStudyLoopModel(): Promise<void> {
  if (managedSync) return managedSync;
  managedSync = (async () => {
    if (!useSettingsStore.persist.hasHydrated()) await useSettingsStore.persist.rehydrate();
    const hydrated = useSettingsStore.getState();
    useSettingsStore.setState({
      ...managedMediaSettings(hydrated),
      providersConfig: Object.fromEntries(
        Object.entries(hydrated.providersConfig).map(([id, value]) => [
          id,
          { ...value, apiKey: '', baseUrl: '', isServerConfigured: false, serverModels: undefined },
        ]),
      ) as typeof hydrated.providersConfig,
      providerId: '' as ProviderId,
      modelId: '',
    });
    await useSettingsStore.getState().fetchServerProviders();
    // Upstream treats this endpoint as optional and swallows failures. The launch
    // bridge requires a fresh successful response before starting paid generation.
    const response = await fetch('/api/server-providers', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('MODEL_CONFIGURATION_UNAVAILABLE');
    const data = (await response.json()) as {
      providers?: Record<string, { models?: string[] }>;
    };
    const state = useSettingsStore.getState();
    const managed = Object.entries(data.providers || {}).find(
      ([id, entry]) =>
        state.providersConfig[id as ProviderId] && entry.models?.some((model) => model.trim()),
    );
    if (!managed) throw new Error('MODEL_NOT_CONFIGURED');
    const [provider, entry] = managed;
    const modelId = entry.models!.find((model) => model.trim())!;
    const providersConfig = Object.fromEntries(
      Object.entries(state.providersConfig).map(([id, value]) => [
        id,
        {
          ...value,
          apiKey: '',
          baseUrl: '',
          isServerConfigured: Boolean(data.providers?.[id]),
          serverModels: data.providers?.[id]?.models,
        },
      ]),
    ) as typeof state.providersConfig;
    useSettingsStore.setState({
      ...managedMediaSettings(state),
      providersConfig,
      providerId: provider as ProviderId,
      modelId,
      reviewOutlineEnabled: true,
    });
  })().finally(() => {
    managedSync = undefined;
  });
  return managedSync;
}
