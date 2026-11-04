import { useI18n } from '../../../context/I18nContext';

export default function QueueStatusCard({ runningCount, waitingCount, currentJob, onOpenQueue, onEmptyAction }) {
  const { t } = useI18n();
  const isEmpty = runningCount === 0 && waitingCount === 0;
  if (isEmpty) {
    return (
      <article className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2">
        <header className="font-semibold text-on-surface">{t('dashboard.queue.title')}</header>
        <p className="text-sm text-on-surface-variant">{t('dashboard.queue.empty')}</p>
        <button
          type="button"
          onClick={onEmptyAction}
          className="self-start mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/15 cursor-pointer"
        >
          {t('dashboard.queue.emptyCta')}
        </button>
      </article>
    );
  }
  const percent = Math.max(0, Math.min(100, Math.round((currentJob?.progress || 0) * 100)));
  return (
    <article
      onClick={onOpenQueue}
      className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2 cursor-pointer hover:bg-surface-container"
    >
      <header className="font-semibold">{t('dashboard.queue.title')}</header>
      <p className="text-sm text-on-surface">
        {t('dashboard.queue.summary', { running: runningCount, waiting: waitingCount })}
      </p>
      {currentJob ? (
        <>
          <p className="text-xs text-on-surface-variant truncate">
            {currentJob.mangaTitle} — {currentJob.chapterTitle}
          </p>
          <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} aria-label={`${percent}%`} />
          </div>
        </>
      ) : null}
    </article>
  );
}
