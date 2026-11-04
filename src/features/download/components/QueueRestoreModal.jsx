import { useI18n } from '../../../context/I18nContext';

export default function QueueRestoreModal({ stats, onRestore, onDiscard }) {
  const { t } = useI18n();
  const { mangaWithPending = 0, pendingChapters = 0 } = stats || {};

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-restore-title"
    >
      <div className="w-full max-w-md rounded-xl border border-outline-variant/20 bg-surface-container-high shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 text-3xl shrink-0">history</span>
          <div className="min-w-0 space-y-1">
            <h2 id="queue-restore-title" className="text-lg font-bold text-on-surface">
              {t('queue.restore.title')}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {t('queue.restore.body', { manga: mangaWithPending, chapters: pendingChapters })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            {t('queue.restore.discard')}
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary shadow-md hover:brightness-110 transition-[filter] cursor-pointer"
          >
            {t('queue.restore.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
