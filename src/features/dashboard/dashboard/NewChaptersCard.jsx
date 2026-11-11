import { useI18n } from '../../../context/I18nContext';

export default function NewChaptersCard({ items, totalCount, onSelect, onViewAll, onEmptyAction }) {
  const { t } = useI18n();
  if (!items || items.length === 0) {
    return (
      <article className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2">
        <header className="font-semibold text-on-surface">{t('dashboard.newChapters.title')}</header>
        <p className="text-sm text-on-surface-variant">{t('dashboard.newChapters.empty')}</p>
        <button
          type="button"
          onClick={onEmptyAction}
          className="self-start mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/15 cursor-pointer"
        >
          {t('dashboard.newChapters.emptyCta')}
        </button>
      </article>
    );
  }
  const extra = Math.max(0, totalCount - items.length);
  return (
    <article className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <span className="font-semibold">{t('dashboard.newChapters.title')} ({totalCount})</span>
        <button type="button" onClick={onViewAll} className="text-xs text-primary hover:opacity-80 transition-opacity cursor-pointer">
          {t('dashboard.newChapters.viewAll')}
        </button>
      </header>
      <div className="flex items-center gap-2 overflow-x-auto">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it)}
            className="shrink-0 cursor-pointer"
            data-tooltip={it.title}
          >
            {it.coverUrl ? (
              <img src={it.coverUrl} alt={it.title} className="h-16 w-12 rounded object-cover" />
            ) : (
              <div className="h-16 w-12 rounded bg-surface-container-high" />
            )}
          </button>
        ))}
        {extra > 0 ? (
          <div className="h-16 w-12 rounded bg-surface-container-high flex items-center justify-center text-xs font-semibold">
            +{extra}
          </div>
        ) : null}
      </div>
    </article>
  );
}
