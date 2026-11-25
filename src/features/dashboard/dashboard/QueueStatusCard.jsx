import { useI18n } from '../../../context/I18nContext';

export default function QueueStatusCard({
  runningCount = 0,
  waitingCount = 0,
  currentJob = null,
  onOpenQueue,
  onEmptyAction,
}) {
  const { t } = useI18n();
  const safeRunning = Math.max(0, Number(runningCount) || 0);
  const safeWaiting = Math.max(0, Number(waitingCount) || 0);
  const isEmpty = safeRunning === 0 && safeWaiting === 0;

  if (isEmpty) {
    return (
      <article className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/60 dark:bg-surface-container-low/30 p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg border border-outline-variant/20 bg-surface-container-high inline-flex items-center justify-center text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-[16px] leading-none">
              download_for_offline
            </span>
          </span>
          <header className="text-xs font-bold text-on-surface truncate">
            {t('dashboard.queue.title')}
          </header>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t('dashboard.queue.empty')}
        </p>
        {onEmptyAction ? (
          <button
            type="button"
            onClick={onEmptyAction}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant/20 bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-on-surface transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] leading-none text-primary">
              add_circle
            </span>
            <span>{t('dashboard.queue.emptyCta')}</span>
          </button>
        ) : null}
      </article>
    );
  }

  const percent = Math.max(0, Math.min(100, Math.round((Number(currentJob?.progress) || 0) * 100)));

  return (
    <button
      type="button"
      onClick={onOpenQueue}
      className="w-full text-left rounded-2xl border border-primary/25 bg-primary/5 hover:bg-primary/10 p-3.5 space-y-2.5 transition-all active:scale-[0.99] cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            {safeRunning > 0 ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            ) : null}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs font-bold text-on-surface truncate">
            {t('dashboard.queue.title')}
          </span>
        </span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0 leading-none">
          chevron_right
        </span>
      </div>

      <p className="text-xs font-medium text-on-surface">
        {t('dashboard.queue.summary', { running: safeRunning, waiting: safeWaiting })}
      </p>

      {currentJob ? (
        <div className="space-y-1.5 min-w-0">
          <p className="text-[11px] text-on-surface-variant truncate">
            {[currentJob.mangaTitle, currentJob.chapterTitle].filter(Boolean).join(' — ')}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
                aria-label={`${percent}%`}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-primary shrink-0">
              {percent}%
            </span>
          </div>
        </div>
      ) : null}
    </button>
  );
}
