import { useI18n } from '../../../context/I18nContext';

export default function ContinueReadingCard({ data, onOpen, onEmptyAction }) {
  const { t } = useI18n();
  if (!data) {
    return (
      <article className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2">
        <header className="font-semibold text-on-surface">{t('dashboard.continueReading.title')}</header>
        <p className="text-sm text-on-surface-variant">{t('dashboard.continueReading.empty')}</p>
        <button
          type="button"
          onClick={onEmptyAction}
          className="self-start mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/15 cursor-pointer"
        >
          {t('dashboard.continueReading.emptyCta')}
        </button>
      </article>
    );
  }
  const percent = Math.max(0, Math.min(100, Math.round((data.percent || 0) * 100)));
  return (
    <article
      onClick={onOpen}
      className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3 cursor-pointer hover:bg-primary/10"
    >
      {data.coverUrl ? (
        <img src={data.coverUrl} alt="" className="h-28 w-20 rounded-md object-cover shrink-0" />
      ) : (
        <div className="h-28 w-20 rounded-md bg-surface-container-high shrink-0" />
      )}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <header className="text-xs font-semibold text-primary">{t('dashboard.continueReading.title')}</header>
        <h3 className="font-semibold truncate">{data.mangaTitle}</h3>
        <p className="text-sm text-on-surface-variant truncate">{data.chapterTitle}</p>
        {data.connectorName ? (
          <p className="text-xs text-on-surface-variant/70">{data.connectorName}</p>
        ) : null}
        <div className="mt-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} aria-label={`${percent}%`} />
        </div>
      </div>
    </article>
  );
}
