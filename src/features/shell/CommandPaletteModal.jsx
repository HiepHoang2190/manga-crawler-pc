import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { filterPaletteItems } from './commandPaletteUtils.mjs';

export default function CommandPaletteModal({ open, items = [], onClose }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filteredItems = useMemo(() => filterPaletteItems(items, query).slice(0, 50), [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex((idx) => {
      if (filteredItems.length === 0) return 0;
      return Math.min(idx, filteredItems.length - 1);
    });
  }, [filteredItems.length]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredItems.length > 0) {
          setActiveIndex((idx) => (idx + 1) % filteredItems.length);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length > 0) {
          setActiveIndex((idx) => (idx - 1 + filteredItems.length) % filteredItems.length);
        }
        return;
      }
      if (e.key === 'Enter') {
        const selected = filteredItems[activeIndex];
        if (selected && typeof selected.onSelect === 'function') {
          e.preventDefault();
          onClose?.();
          selected.onSelect();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, filteredItems, activeIndex, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-palette-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  if (!open || typeof document === 'undefined') return null;

  const grouped = [];
  let lastGroup = null;
  filteredItems.forEach((item, idx) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      grouped.push({ type: 'header', label: item.group, key: `hdr-${item.group}-${idx}` });
    }
    grouped.push({ type: 'item', item, idx, key: item.id });
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[230] flex items-start justify-center pt-[14vh] px-4 bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette.placeholder')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-outline-variant/25 bg-surface-container-high/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-outline-variant/20">
          <span className="material-symbols-outlined text-[20px] text-primary shrink-0">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={t('commandPalette.placeholder')}
            className="flex-1 min-w-0 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none border-none"
          />
          <kbd className="px-1.5 py-0.5 rounded-md border border-outline-variant/30 bg-surface-container-highest text-[10px] font-mono text-on-surface-variant shrink-0">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto custom-scrollbar p-2 space-y-0.5">
          {grouped.length === 0 ? (
            <div className="py-10 text-center text-xs text-on-surface-variant select-none">
              {t('commandPalette.noResults')}
            </div>
          ) : (
            grouped.map((entry) => {
              if (entry.type === 'header') {
                return (
                  <div
                    key={entry.key}
                    className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 select-none"
                  >
                    {entry.label}
                  </div>
                );
              }
              const { item, idx } = entry;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={entry.key}
                  type="button"
                  data-palette-index={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onClose?.();
                    item.onSelect?.();
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-on-surface hover:bg-surface-container-highest/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.icon ? (
                      <span
                        className={`material-symbols-outlined text-[18px] shrink-0 ${
                          isSelected ? 'text-primary' : 'text-on-surface-variant'
                        }`}
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/25">
                        {item.badge}
                      </span>
                    ) : null}
                    {item.active ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25">
                        {t('commandPalette.activeBadge')}
                      </span>
                    ) : null}
                    {item.shortcut ? (
                      <kbd className="px-1.5 py-0.5 rounded-md border border-outline-variant/25 bg-surface-container-highest text-[10px] font-mono text-on-surface-variant">
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-outline-variant/20 bg-surface-container-low/60 text-[11px] text-on-surface-variant select-none">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-outline-variant/25 bg-surface-container-highest font-mono text-[10px]">↑↓</kbd>
              {t('commandPalette.hint.navigate')}
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-outline-variant/25 bg-surface-container-highest font-mono text-[10px]">↵</kbd>
              {t('commandPalette.hint.select')}
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-outline-variant/25 bg-surface-container-highest font-mono text-[10px]">ESC</kbd>
            {t('commandPalette.hint.close')}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
