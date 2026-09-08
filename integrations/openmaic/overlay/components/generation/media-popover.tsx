'use client';

import { Volume2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { STUDYLOOP_EMBEDDED } from '@/lib/studyloop/embedded';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover as UpstreamMediaPopover } from './upstream-media-popover';

interface MediaPopoverProps {
  onSettingsOpen: (section: SettingsSection) => void;
}

function BrowserNarrationSettings({ onSettingsOpen }: MediaPopoverProps) {
  const { locale } = useI18n();
  const enabled = useSettingsStore((state) => state.ttsEnabled);
  const zh = locale.startsWith('zh');
  return (
    <button
      type="button"
      className="studyloop-media-settings"
      onClick={() => onSettingsOpen('tts')}
      aria-label={zh ? '设置浏览器朗读' : 'Configure browser narration'}
    >
      <Volume2 size={15} aria-hidden="true" />
      <span>{zh ? '浏览器朗读' : 'Browser narration'}</span>
      {enabled && <span className="studyloop-media-dot" aria-label={zh ? '已启用' : 'Enabled'} />}
    </button>
  );
}

export function MediaPopover(props: MediaPopoverProps) {
  return STUDYLOOP_EMBEDDED ? (
    <BrowserNarrationSettings {...props} />
  ) : (
    <UpstreamMediaPopover {...props} />
  );
}
