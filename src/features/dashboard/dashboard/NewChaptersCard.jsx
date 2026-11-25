import { useI18n } from '../../../context/I18nContext';
import { QueueCoverThumb } from '../../download';

export default function NewChaptersCard({
  items,
  totalCount = 0,
  onSelect,
  onViewAll,
  onEmptyAction,
}) {
  const { t } = useI18n();
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];

  if (safeItems.length === 0) {
    return (
      <article className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/60 dark:bg-surface-container-low/30 p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg border border-outline-variant/20 bg-surface-container-high inline-flex items-center justify-center text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-[16px] leading-none">
              auto_awesome
            </span>
          </span>
          <header className="text-xs font-bold text-on-surface truncate">
            {t('dashboard.newChapters.title')}
          </header>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t('dashboard.newChapters.empty')}
        </p>
        {onEmptyAction ? (
          <button
            type="button"
            onClick={onEmptyAction}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant/20 bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-on-surface transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] leading-none text-primary">
              explore
            </span>
            <span>{t('dashboard.newChapters.emptyCta')}</span>
          </button>
        ) : null}
      </article>
    );
  }

  const safeTotal = Number(totalCount) || safeItems.length;
  const extra = Math.max(0, safeTotal - safeItems.length);

  return (
    <article className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/60 dark:bg-surface-container-low/30 p-3.5 space-y-2.5">
      <header className="flex items-center justify-between gap-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 leading-none">
            auto_awesome
          </span>
          <span className="text-xs font-bold text-on-surface truncate">
            {t('dashboard.newChapters.title')}
          </span>
          <span className="inline-flex items-center justify-center rounded-full bg-primary/12 border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums shrink-0">
            {safeTotal}
          </span>
        </span>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          >
            {t('dashboard.newChapters.viewAll')}
          </button>
        ) : null}
      </header>

      <div className="space-y-1.5">
        {safeItems.map((it, idx) => (
          <button
            key={it.id || it.mangaUrl || idx}
            type="button"
            onClick={() => onSelect?.(it)}
            data-tooltip={it.title}
            className="group w-full flex items-center gap-2.5 rounded-xl border border-outline-variant/15 bg-surface-container-lowest/60 hover:border-outline-variant/35 hover:bg-surface-container-high/60 p-1.5 text-left transition-colors cursor-pointer"
          >
            <QueueCoverThumb
              coverUrl={it.coverUrl}
              frameClassName="h-11 w-8 rounded-lg bg-surface-container-high border border-outline-variant/20 flex items-center justify-center overflow-hidden shrink-0"
              placeholderIconClassName="text-[15px]"
            />
            <span className="min-w-0 flex-1 text-xs font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
              {it.title}
            </span>
            <span className="material-symbols-outlined text-[15px] text-on-surface-variant/60 group-hover:text-primary shrink-0 leading-none">
              chevron_right
            </span>
          </button>
        ))}

        {extra > 0 && onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="w-full rounded-xl border border-dashed border-outline-variant/25 py-1.5 text-center text-[11px] font-semibold text-primary hover:bg-primary/5 transition-colors cursor-pointer tabular-nums"
          >
            +{extra}
          </button>
        ) : null}
      </div>
    </article>
  );
}
