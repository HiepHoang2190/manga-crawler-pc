import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSettings } from './SettingsProvider';

/**
 * Badge thông báo có phiên bản mới — hiện cạnh chuông yêu thích.
 * Bấm vào → mở Modal xem chi tiết changelog hoặc chuyển sang Settings.
 */
export default function UpdateBadge({ remoteVersion, onGoToSettings, onOpenUpdateModal }) {
  const { t } = useI18n();
  const settings = useSettings();
  const [dismissed, setDismissed] = useState(false);

  if (!remoteVersion || dismissed) return null;

  const handleClick = () => {
    if (onOpenUpdateModal) {
      onOpenUpdateModal();
    } else if (settings?.openUpdateModal) {
      settings.openUpdateModal();
    } else {
      onGoToSettings?.();
    }
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleClick}
        data-tooltip={t('updateBadge.newVersionTitle', { version: remoteVersion })}
        aria-label={t('updateBadge.newVersionAria', { version: remoteVersion })}
        className={[
          'relative flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold',
          'bg-primary-container/90 text-primary shadow-md shadow-primary/15',
          'ring-2 ring-primary/35 hover:bg-primary-container hover:ring-primary/50',
          'transition-all duration-200 cursor-pointer',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        ].join(' ')}
      >
        <span
          className="material-symbols-outlined text-[18px] leading-none"
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 500" }}
        >
          system_update
        </span>
        <span className="hidden sm:inline">v{remoteVersion}</span>
        {/* dot pulse */}
        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
      </button>

      {/* nút dismiss nhỏ */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
        data-tooltip={t('updateBadge.dismissTitle')}
        aria-label={t('updateBadge.dismissAria')}
        className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-on-surface-variant/50 hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[14px] leading-none">close</span>
      </button>
    </div>
  );
}
