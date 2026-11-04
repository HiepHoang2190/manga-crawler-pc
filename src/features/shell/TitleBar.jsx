import { useI18n } from '../../context/I18nContext';
import { useBranding } from '../../context/BrandingContext';

export default function TitleBar({ endSlot = null, beforeWindowControls = null }) {
  const { t } = useI18n();
  const { appName, currentIconUrl, showTitleBarIcon = true } = useBranding();
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const hasCustomName = typeof appName === 'string';
  const displayName = hasCustomName ? appName : t('titleBar.appName');
  const showText = Boolean(displayName && displayName.trim().length > 0);
  const showIcon = Boolean(showTitleBarIcon && currentIconUrl);

  return (
    <div className="flex justify-between items-center px-6 h-12 w-full" style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex items-center gap-2.5 min-w-0 select-none">
        {showIcon && (
          <img
            src={currentIconUrl}
            alt=""
            className="w-5 h-5 object-contain shrink-0 rounded-md shadow-xs"
            draggable={false}
          />
        )}
        {showText && (
          <span className="text-on-surface font-bold text-lg shrink-0 truncate tracking-tight">
            {displayName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
        {beforeWindowControls}
        {endSlot}
        <button
          type="button"
          onClick={handleMinimize}
          className="p-2 text-on-surface/60 hover:bg-surface-container-high transition-colors duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined">minimize</span>
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="p-2 text-on-surface/60 hover:bg-surface-container-high transition-colors duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined">maximize</span>
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-2 text-on-surface/60 hover:bg-error/20 hover:text-error transition-colors duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}
