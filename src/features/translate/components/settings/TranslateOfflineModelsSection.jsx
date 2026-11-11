import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { SettingCard } from './SettingCard';
import { ModelCard } from './ModelCard';

export function TranslateOfflineModelsSection({
  models = [],
  downloadProgressMap = {},
  importStatus,
  setImportStatus,
  isCardOpen,
  toggleCard,
  onRefreshModels,
  onOpenModelFolder,
  onDownloadAll,
  onDownloadModel,
  onCancelDownload,
  onDeleteModel,
  onImportModelFile,
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3.5">
      <SettingCard
        isOpen={isCardOpen('models')}
        onToggle={() => toggleCard('models')}
        icon="deployed_code"
        title={t('translate.settings.modelsTitle')}
        subtitle={t('translate.settings.offlineModelsDesc')}
        badge={
          models && models.length > 0 ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-primary/15 text-primary border border-primary/25">
              {models.filter((m) => m.installed).length}/{models.length}
            </span>
          ) : null
        }
        extraHeaderActions={
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRefreshModels}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
              data-tooltip={t('translate.settings.rescanModels')}
            >
              <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenModelFolder?.()}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
              data-tooltip={t('translate.settings.openModelsFolder')}
            >
              <span className="material-symbols-outlined text-[15px] leading-none">folder_open</span>
            </button>
          </div>
        }
      >
        {(models || []).some((m) => !m.installed && !downloadProgressMap[m.id]) && (
          <button
            type="button"
            onClick={onDownloadAll}
            className="w-full cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-2xs transition-all mb-3"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            <span>
              {t('translate.settings.downloadAllModels', {
                count: (models || []).filter((m) => !m.installed).length,
              })}
            </span>
          </button>
        )}

        {importStatus && (
          <div
            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs mb-3 ${
              importStatus.success
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-error/30 bg-error/10 text-error'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">
                {importStatus.success ? 'check_circle' : 'error'}
              </span>
              <span>{importStatus.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportStatus?.(null)}
              className="cursor-pointer p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        <div className="space-y-2">
          {(models || []).map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              onDownload={onDownloadModel}
              onCancel={onCancelDownload}
              onDelete={onDeleteModel}
              onImport={onImportModelFile}
              onOpenFolder={onOpenModelFolder}
              progress={downloadProgressMap[m.id]}
            />
          ))}
        </div>
      </SettingCard>
    </div>
  );
}

export default TranslateOfflineModelsSection;
