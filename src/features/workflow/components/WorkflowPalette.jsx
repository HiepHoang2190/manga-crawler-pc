import React, { useState, useMemo } from 'react';
import { ResizeSplitter } from '../../../shared';
import { useI18n } from '../../../context/I18nContext';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';

const CATEGORIES = [
  { id: 'trigger', defaultLabel: 'Khởi Động', icon: 'bolt' },
  { id: 'crawler', defaultLabel: 'Thu Thập', icon: 'cloud_download' },
  { id: 'image', defaultLabel: 'Xử Lý Ảnh', icon: 'photo_filter' },
  { id: 'ai', defaultLabel: 'Dịch Thuật AI', icon: 'smart_toy' },
  { id: 'export', defaultLabel: 'Đóng Gói', icon: 'inventory_2' },
  { id: 'delivery', defaultLabel: 'Phân Phối & Dọn Dẹp', icon: 'send' },
];

export default function WorkflowPalette({
  onAddNode,
  width = 260,
  onResizeStart,
  onClose,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const list = Object.values(NODE_DEFINITIONS).filter((item) => !item.hidden);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((item) => {
      const title = t(`workflow.nodeDef.${item.type}.title`, item.title);
      const desc = t(`workflow.nodeDef.${item.type}.desc`, item.description);
      return (
        title.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [search, t]);

  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/workflow-node-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col h-full shrink-0 select-none z-20 text-on-surface relative min-h-0 overflow-visible"
    >
      {/* Draggable Resize Handle on the right border (Manga Studio style) */}
      {onResizeStart && (
        <ResizeSplitter
          variant="overlay"
          side="right"
          onPointerDown={onResizeStart}
          ariaLabel={t('workflow.palette.resizeTooltip')}
          data-tooltip={t('workflow.palette.resizeTooltip')}
        />
      )}

      {/* Header & Search */}
      <div className="p-3 border-b border-outline-variant/20 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant truncate">
            {t('workflow.palette.title')}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-on-surface-variant/70 font-mono">
              {t('workflow.palette.nodesCount', { count: filteredItems.length })}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer ml-1"
                data-tooltip={t('workflow.palette.collapse')}
                aria-label={t('workflow.palette.collapse')}
              >
                <span className="material-symbols-outlined text-[15px]">dock_to_left</span>
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('workflow.palette.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {/* Categorized List */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar mr-1.5 p-2 space-y-3">
        {CATEGORIES.map((cat) => {
          const items = filteredItems.filter((i) => i.category === cat.id);
          if (items.length === 0) return null;

          return (
            <div key={cat.id} className="space-y-1">
              <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                <span className="material-symbols-outlined text-sm text-on-surface-variant/70">
                  {cat.icon}
                </span>
                <span>{t(`workflow.category.${cat.id}`, cat.defaultLabel)}</span>
              </div>

              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.type}
                    data-node-type={item.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    className="p-2 rounded-xl bg-surface-container/60 hover:bg-surface-container-high border border-outline-variant/20 hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing group shadow-2xs flex items-start gap-2.5"
                  >
                    <div className="w-6 h-6 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-sm">
                        {item.icon}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-on-surface group-hover:text-primary truncate">
                        {t(`workflow.nodeDef.${item.type}.title`, item.title)}
                      </div>
                      <div className="text-[10px] text-on-surface-variant line-clamp-2 leading-relaxed">
                        {t(`workflow.nodeDef.${item.type}.desc`, item.description)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 border-t border-outline-variant/20 bg-surface-container-low/40 text-[10px] text-on-surface-variant/70 text-center">
        {t('workflow.palette.footerHint')}
      </div>
    </aside>
  );
}
