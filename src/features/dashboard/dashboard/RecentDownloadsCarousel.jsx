import { useI18n } from '../../../context/I18nContext';

export default function RecentDownloadsCarousel({ items, totalMangas, totalChapters, onSelectChapter }) {
  const { t } = useI18n();
  if (!items || items.length === 0) return null;
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <span className="font-semibold">{t('dashboard.recentDownloads.title')}</span>
        <span className="text-xs text-on-surface-variant">
          {t('dashboard.recentDownloads.summary', { mangas: totalMangas, chapters: totalChapters })}
        </span>
      </header>
      <div className="flex items-stretch gap-2 overflow-x-auto custom-scrollbar pb-1">
        {items.map((it) => (
          <button
            key={`${it.mangaId}::${it.chapterUrl}`}
            type="button"
            onClick={() => onSelectChapter(it)}
            className="shrink-0 cursor-pointer w-12 flex flex-col gap-1 items-center"
            data-tooltip={`${it.mangaTitle} — ${it.chapterTitle}`}
          >
            {it.coverUrl ? (
              <img src={it.coverUrl} alt={it.mangaTitle} className="h-16 w-12 rounded object-cover" />
            ) : (
              <div className="h-16 w-12 rounded bg-surface-container-high" />
            )}
            <span className="text-[10px] text-on-surface-variant truncate w-full text-center">
              {it.chapterTitle}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
