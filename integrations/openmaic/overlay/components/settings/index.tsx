'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Settings2, Volume2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { STUDYLOOP_EMBEDDED } from '@/lib/studyloop/embedded';
import type { SettingsSection } from '@/lib/types/settings';
import { SettingsDialog as UpstreamSettingsDialog } from './upstream-settings-dialog';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSection;
}

function ManagedClassroomSettings({ open, onOpenChange }: SettingsDialogProps) {
  const { locale } = useI18n();
  const zh = locale.startsWith('zh');
  const modelId = useSettingsStore((state) => state.modelId);
  const providerId = useSettingsStore((state) => state.providerId);
  const providers = useSettingsStore((state) => state.providersConfig);
  const ttsEnabled = useSettingsStore((state) => state.ttsEnabled);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  useEffect(() => {
    setSpeechAvailable('speechSynthesis' in window);
  }, []);
  const managed = providers[providerId]?.isServerConfigured;
  const changeNarration = (enabled: boolean) => {
    const state = useSettingsStore.getState();
    useSettingsStore.setState({
      ttsProviderId: 'browser-native-tts',
      ttsEnabled: enabled,
      ttsProvidersConfig: {
        ...state.ttsProvidersConfig,
        'browser-native-tts': { ...state.ttsProvidersConfig['browser-native-tts'], enabled: true },
      },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studyloop-managed-settings" showCloseButton={false}>
        <div className="studyloop-managed-settings-heading">
          <Settings2 size={21} />
          <DialogTitle>{zh ? '课堂设置' : 'Classroom settings'}</DialogTitle>
          <button
            aria-label={zh ? '关闭设置' : 'Close settings'}
            onClick={() => onOpenChange(false)}
          >
            <X size={20} />
          </button>
        </div>
        <DialogDescription>
          {zh
            ? '模型由 StudyLoop 统一管理，课堂无需另一组密钥。'
            : 'StudyLoop manages the model. No separate classroom API key is needed.'}
        </DialogDescription>
        <section>
          <h3>{zh ? '当前模型' : 'Current model'}</h3>
          <p className="studyloop-managed-model">
            {managed && modelId ? modelId : zh ? '尚未配置' : 'Not configured'}
          </p>
          <a href="/?view=settings">
            {zh ? '前往 StudyLoop 模型与设置' : 'Open StudyLoop model settings'}
            <ExternalLink size={14} />
          </a>
        </section>
        <section>
          <label className="studyloop-narration-toggle">
            <Volume2 size={18} />
            <span>{zh ? '浏览器朗读' : 'Browser narration'}</span>
            <input
              type="checkbox"
              checked={ttsEnabled && speechAvailable}
              disabled={!speechAvailable}
              onChange={(event) => changeNarration(event.target.checked)}
            />
          </label>
          <p>
            {speechAvailable
              ? zh
                ? '使用浏览器与系统可用的语音；具体声音取决于设备。播放时才开始朗读。'
                : 'Uses voices available in your browser and operating system. Narration starts during playback.'
              : zh
                ? '当前浏览器不提供语音能力，仍可阅读全部课堂内容。'
                : 'This browser does not offer speech. All classroom content remains readable.'}
          </p>
          <p>
            {zh
              ? '图像、视频和云端语音未随文本模型自动配置。'
              : 'Image, video and cloud voice services are not configured automatically with the text model.'}
          </p>
        </section>
        <p className="studyloop-managed-attribution">
          {zh
            ? '感谢 THU-MAIC / OpenMAIC 团队与贡献者。原项目 MIT 许可与署名完整保留。'
            : 'Thanks to the THU-MAIC / OpenMAIC team and contributors. Upstream MIT licensing and attribution are retained.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsDialog(props: SettingsDialogProps) {
  return STUDYLOOP_EMBEDDED ? (
    <ManagedClassroomSettings {...props} />
  ) : (
    <UpstreamSettingsDialog {...props} />
  );
}
