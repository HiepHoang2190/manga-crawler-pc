import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

export default function MenuTabCustomizeModal({
  isOpen,
  onClose,
  tabOrder = [],
  hiddenTabIds = [],
  allTabs = [],
  onMoveTab,
  onReorderTab,
  onToggleHiddenTab,
  onResetPrefs,
}) {
  const { t } = useI18n();
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build ordered tab list
  const tabMap = useMemo(() => {
    const map = new Map();
    for (const tab of allTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [allTabs]);

  const orderedTabs = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const id of tabOrder) {
      if (tabMap.has(id)) {
        result.push(tabMap.get(id));
        seen.add(id);
      }
    }
    for (const tab of allTabs) {
      if (!seen.has(tab.id)) {
        result.push(tab);
      }
    }
    return result;
  }, [tabOrder, allTabs, tabMap]);

  const visibleTabsCount = useMemo(() => {
    return orderedTabs.filter((tab) => !hiddenTabIds.includes(tab.id)).length;
  }, [orderedTabs, hiddenTabIds]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-tab-customize-title"
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-lg max-h-[85vh] rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 bg-surface-container-low shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
            <h2 id="menu-tab-customize-title" className="text-base font-semibold text-on-surface">
              {t('menu.customizeTabs.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            aria-label={t('common.close') || 'Close'}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Hint banner */}
        <div className="px-6 py-3 bg-surface-container-lowest border-b border-outline-variant/10 text-xs text-on-surface-variant/80 shrink-0 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary/70 shrink-0">
            info
          </span>
          <span>{t('menu.customizeTabs.hint')}</span>
        </div>

        {/* Tab Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 flex flex-col gap-2 custom-scrollbar">
          {orderedTabs.map((tab, index) => {
            const isNonHidable = tab.hidable === false;
            const isHidden = !isNonHidable && hiddenTabIds.includes(tab.id);
            const isLastVisible = !isHidden && visibleTabsCount <= 1;
            const isDragging = draggedId === tab.id;
            const isDragOver = dragOverId === tab.id && draggedId !== tab.id;
            const isFirst = index === 0;
            const isLast = index === orderedTabs.length - 1;

            return (
              <div
                key={tab.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggedId(tab.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverId !== tab.id) {
                    setDragOverId(tab.id);
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (dragOverId !== tab.id) {
                    setDragOverId(tab.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverId === tab.id) {
                    setDragOverId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedId && draggedId !== tab.id) {
                    onReorderTab?.(draggedId, tab.id);
                  }
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`group flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-all min-h-[3rem] select-none ${
                  isDragging
                    ? 'opacity-30 border-dashed border-primary bg-surface-container-highest'
                    : isDragOver
                    ? 'border-primary bg-primary/10 shadow-md scale-[1.01]'
                    : isHidden
                    ? 'border-outline-variant/15 bg-surface-container-lowest/50 opacity-60 hover:opacity-90'
                    : 'border-outline-variant/20 bg-surface-container-low hover:bg-surface-container-high/60'
                }`}
              >
                {/* Left: Drag Handle & Icon & Name */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="material-symbols-outlined text-[20px] text-on-surface-variant/40 group-hover:text-primary transition-colors cursor-grab active:cursor-grabbing shrink-0"
                    data-tooltip={t('common.drag') || 'Drag'}
                  >
                    drag_indicator
                  </span>

                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${
                      isHidden ? 'text-on-surface-variant/50' : 'text-primary'
                    }`}
                  >
                    {tab.icon}
                  </span>

                  <span
                    className={`text-sm font-medium truncate ${
                      isHidden ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'
                    }`}
                  >
                    {t(tab.key)}
                  </span>

                  {isNonHidable && (
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/20 shrink-0">
                      {t('menu.customizeTabs.fixed')}
                    </span>
                  )}
                </div>

                {/* Right: Up / Down arrows & Visibility Toggle */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Up button */}
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => onMoveTab?.(tab.id, 'up')}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                      isFirst
                        ? 'opacity-20 cursor-not-allowed'
                        : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface cursor-pointer'
                    }`}
                    title={t('menu.customizeTabs.moveUp')}
                    aria-label={t('menu.customizeTabs.moveUp')}
                  >
                    <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                  </button>

                  {/* Down button */}
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => onMoveTab?.(tab.id, 'down')}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                      isLast
                        ? 'opacity-20 cursor-not-allowed'
                        : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface cursor-pointer'
                    }`}
                    title={t('menu.customizeTabs.moveDown')}
                    aria-label={t('menu.customizeTabs.moveDown')}
                  >
                    <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                  </button>

                  <div className="w-px h-5 bg-outline-variant/20 mx-1" aria-hidden />

                  {/* Visibility Checkbox / Toggle */}
                  {isNonHidable ? (
                    <div
                      className="flex items-center justify-center w-8 h-8 opacity-40 cursor-not-allowed"
                      title={t('menu.customizeTabs.fixed')}
                    >
                      <span className="material-symbols-outlined text-[20px] text-primary">
                        visibility
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isLastVisible}
                      onClick={() => {
                        if (!isLastVisible) onToggleHiddenTab?.(tab.id);
                      }}
                      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                        isLastVisible
                          ? 'text-primary/30 cursor-not-allowed'
                          : isHidden
                          ? 'text-on-surface-variant/40 hover:bg-surface-container-highest hover:text-on-surface cursor-pointer'
                          : 'text-primary hover:bg-primary/10 cursor-pointer'
                      }`}
                      title={
                        isLastVisible
                          ? t('menu.customizeTabs.minOneVisible')
                          : isHidden
                          ? t('menu.customizeTabs.hidden')
                          : t('menu.customizeTabs.visible')
                      }
                      aria-label={
                        isLastVisible
                          ? t('menu.customizeTabs.minOneVisible')
                          : isHidden
                          ? t('menu.customizeTabs.hidden')
                          : t('menu.customizeTabs.visible')
                      }
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isHidden ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/15 bg-surface-container-low shrink-0">
          <button
            type="button"
            onClick={onResetPrefs}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-on-surface-variant hover:text-primary rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">restart_alt</span>
            <span>{t('menu.customizeTabs.reset')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">check</span>
            <span>{t('menu.customizeTabs.done')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
