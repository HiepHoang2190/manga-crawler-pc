import React from 'react';
import { useI18n } from '../../context/I18nContext';

export default function OutputDestinationSelector({
  inPlace = true,
  onInPlaceChange,
  outputDir = '',
  onOutputDirChange,
  onBrowse,
  disabled = false,
  openFolderAfter = true,
  onOpenFolderAfterChange,
  overwriteWarning,
  radioName = 'output-destination',
  title,
  showOpenFolderAfter = true,
  extraOptions,
  className = '',
}) {
  const { t } = useI18n();
  const headingText = title ?? t('outputDestination.heading') ?? 'Thư mục xuất';

  return (
    <div className={`space-y-2.5 ${className}`.trim()}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
        {headingText}
      </p>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface select-none">
          <input
            type="radio"
            name={radioName}
            checked={inPlace}
            onChange={() => onInPlaceChange?.(true)}
            disabled={disabled}
            className="accent-primary"
          />
          {t('outputDestination.overwrite') || 'Ghi đè vào thư mục gốc'}
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface select-none">
          <input
            type="radio"
            name={radioName}
            checked={!inPlace}
            onChange={() => onInPlaceChange?.(false)}
            disabled={disabled}
            className="accent-primary"
          />
          {t('outputDestination.browse') || 'Chọn thư mục…'}
        </label>

        {!inPlace && (
          <div className="ml-5 flex gap-1.5">
            <input
              type="text"
              value={outputDir}
              onChange={(e) => onOutputDirChange?.(e.target.value)}
              placeholder={t('outputDestination.browse') || 'Chọn thư mục…'}
              disabled={disabled}
              className="h-9 min-w-0 flex-1 rounded-md border-none bg-surface-container-highest px-3 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {outputDir && !disabled && (
              <button
                type="button"
                onClick={() => onOutputDirChange?.('')}
                aria-label={t('outputDestination.clear') || 'Xóa thư mục đã chọn'}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-container-high text-on-surface-variant/70 hover:text-on-surface transition-colors hover:bg-surface-bright"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">close</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBrowse}
              disabled={disabled}
              aria-label={t('outputDestination.browse') || 'Chọn thư mục…'}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-container-high text-on-surface transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
            </button>
          </div>
        )}

        {inPlace && overwriteWarning && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            {typeof overwriteWarning === 'string' ? (
              overwriteWarning.trim().startsWith('⚠') ? (
                <span>{overwriteWarning}</span>
              ) : (
                <div className="flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">warning</span>
                  <span>{overwriteWarning}</span>
                </div>
              )
            ) : (
              overwriteWarning
            )}
          </div>
        )}

        {extraOptions}
      </div>

      {showOpenFolderAfter && onOpenFolderAfterChange && (
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-on-surface-variant hover:text-on-surface select-none">
          <input
            type="checkbox"
            checked={openFolderAfter}
            onChange={(e) => onOpenFolderAfterChange(e.target.checked)}
            disabled={disabled}
            className="rounded accent-primary"
          />
          {t('outputDestination.openFolderAfter') || 'Mở thư mục xuất khi xong'}
        </label>
      )}
    </div>
  );
}
