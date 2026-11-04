import { useEffect, useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';

/**
 * @param {{
 *   items: Array<{ id?: string, title?: string, href?: string } | number>,
 *   currentIndex: number,
 *   bookType: 'epub' | 'pdf',
 *   onNavigate: (index: number) => void,
 *   onClose: () => void,
 * }} props
 */
export default function EbookChapterPanel({ items, currentIndex, bookType, onNavigate, onClose }) {
  const { t } = useI18n();
  const activeRef = useRef(null);

  // Scroll active item into view when panel opens
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const title = bookType === 'epub' ? t('ebook.chapterPanelTitle') : t('ebook.pagesPanelTitle');

  return (
    /* Overlay backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full sm:w-80 max-h-[80dvh] rounded-t-2xl sm:rounded-2xl bg-surface text-on-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 shrink-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ebook.close')}
            className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        {/* Scrollable list */}
        <ul className="overflow-y-auto flex-1 divide-y divide-outline-variant/15">
          {items.map((item, idx) => {
            const isActive = idx === currentIndex;
            const label =
              bookType === 'epub'
                ? (item?.title || `${t('ebook.chapterPanelTitle')} ${idx + 1}`)
                : `${t('ebook.pagesPanelTitle')} ${idx + 1}`;

            return (
              <li key={bookType === 'epub' ? (item?.id ?? idx) : idx}>
                <button
                  ref={isActive ? activeRef : null}
                  type="button"
                  onClick={() => onNavigate(idx)}
                  className={[
                    'w-full text-left px-5 py-3 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-on-surface hover:bg-surface-variant/40',
                  ].join(' ')}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
