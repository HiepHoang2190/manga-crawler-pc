// src/features/tools-studio/image-pipeline/ActionStackPanel.jsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { ACTION_TYPES, ACTION_TYPE_ORDER } from './actionTypes';
import { countEnabled } from './actionStack';
import ActionParamsForm from './ActionParamsForm';
import { SectionLabel } from './formControls';

const ICON_BTN =
  'flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer';

export default function ActionStackPanel({ actions, selectedId, onEvent, disabled = false }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const addBtnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  useEffect(() => {
    if (!adding || !addBtnRef.current) return;
    const updatePosition = () => {
      if (!addBtnRef.current) return;
      const rect = addBtnRef.current.getBoundingClientRect();
      const menuWidth = 288;
      const menuHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < menuHeight && rect.top > menuHeight;
      const top = flipUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6;
      let left = rect.right - menuWidth;
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
      setMenuStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [adding]);

  useEffect(() => {
    if (!adding) return;
    const handlePointerDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !addBtnRef.current?.contains(e.target)
      ) {
        setAdding(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setAdding(false);
        addBtnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [adding]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{t('imagePipeline.actions.heading', { enabled: countEnabled(actions), total: actions.length })}</SectionLabel>
        <div className="flex items-center gap-1">
          <button
            ref={addBtnRef}
            type="button"
            disabled={disabled}
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            aria-haspopup="true"
            className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 ${
              adding
                ? 'border-primary bg-primary/15 text-primary ring-2 ring-primary/20'
                : 'border-primary/40 text-primary hover:bg-primary/10'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            {t('imagePipeline.actions.add')}
            <span className={`material-symbols-outlined text-[14px] transition-transform duration-150 ${adding ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>
          <button
            type="button"
            disabled={disabled || actions.length === 0}
            onClick={() => onEvent({ type: 'clear' })}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              actions.length > 0
                ? 'text-error hover:bg-error/10'
                : 'text-on-surface-variant/40'
            }`}
            aria-label={t('imagePipeline.actions.clearAll')}
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
          </button>
        </div>
      </div>

      {adding &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            role="menu"
            aria-label={t('imagePipeline.actions.selectAction')}
            className="z-[9999] w-72 rounded-2xl border border-outline-variant/20 bg-surface-container-high/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col space-y-1"
          >
            <div className="px-2.5 pt-1.5 pb-1 flex items-center justify-between border-b border-outline-variant/15">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                {t('imagePipeline.actions.selectAction')}
              </span>
              <span className="text-[10px] text-on-surface-variant/50 font-mono">
                {ACTION_TYPE_ORDER.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-0.5 p-0.5">
              {ACTION_TYPE_ORDER.map((type) => {
                const meta = ACTION_TYPES[type];
                return (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onEvent({ type: 'add', actionType: type });
                      setAdding(false);
                    }}
                    className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-surface-container-highest cursor-pointer select-none"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-primary group-hover:bg-primary group-hover:text-on-primary group-hover:border-primary transition-colors shadow-xs">
                      <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-semibold text-on-surface group-hover:text-primary transition-colors">
                        {t(meta.labelKey)}
                      </span>
                      {meta.descKey && (
                        <span className="line-clamp-2 text-[10px] text-on-surface-variant/70 leading-tight">
                          {t(meta.descKey)}
                        </span>
                      )}
                    </div>
                    <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/40 group-hover:text-primary transition-colors">
                      add
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}

      {actions.length === 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="w-full rounded-lg border border-dashed border-outline-variant/30 p-3 text-center text-[11px] text-on-surface-variant hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('imagePipeline.actions.empty')}
        </button>
      ) : (
        <ul className="space-y-1.5">
          {actions.map((action, index) => {
            const meta = ACTION_TYPES[action.type];
            const selected = action.id === selectedId;
            return (
              <li
                key={action.id}
                className={`rounded-xl border bg-surface-container-low transition-colors ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant/20'
                  } ${action.enabled ? '' : 'opacity-60'}`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={!action.collapsed}
                  onClick={() => onEvent({ type: 'select', id: action.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onEvent({ type: 'select', id: action.id });
                  }}
                  className="flex items-center gap-1 px-1.5 py-1.5 cursor-pointer select-none"
                >
                  <button
                    type="button"
                    className={ICON_BTN}
                    onClick={stop(() => onEvent({ type: 'toggleCollapsed', id: action.id }))}
                    data-tooltip={action.collapsed ? t('imagePipeline.actions.expand') : t('imagePipeline.actions.collapse')}
                    aria-label={action.collapsed ? t('imagePipeline.actions.expand') : t('imagePipeline.actions.collapse')}
                  >
                    <span className={`material-symbols-outlined text-[18px] transition-transform ${action.collapsed ? '' : 'rotate-90'}`}>chevron_right</span>
                  </button>
                  <span className="material-symbols-outlined text-[17px] text-primary">{meta.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-on-surface">{t(meta.labelKey)}</span>
                  {action.type === 'crop' && action.params?.pageScope && action.params.pageScope !== 'all' && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-primary/30 bg-primary/10 text-primary"
                      data-tooltip={t(action.params.pageScope === 'odd' ? 'imagePipeline.crop.pageScopeOddHint' : 'imagePipeline.crop.pageScopeEvenHint')}
                    >
                      {t(action.params.pageScope === 'odd' ? 'imagePipeline.crop.pageScopeOddShort' : 'imagePipeline.crop.pageScopeEvenShort')}
                    </span>
                  )}
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={disabled || index === 0}
                    onClick={stop(() => onEvent({ type: 'move', id: action.id, delta: -1 }))}
                    data-tooltip={t('imagePipeline.actions.moveUp')}
                    aria-label={t('imagePipeline.actions.moveUp')}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={disabled || index === actions.length - 1}
                    onClick={stop(() => onEvent({ type: 'move', id: action.id, delta: 1 }))}
                    data-tooltip={t('imagePipeline.actions.moveDown')}
                    aria-label={t('imagePipeline.actions.moveDown')}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                  </button>
                  <input
                    type="checkbox"
                    className="mx-1 rounded accent-primary cursor-pointer"
                    checked={action.enabled}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onEvent({ type: 'toggleEnabled', id: action.id })}
                    data-tooltip={t('imagePipeline.actions.enabled')}
                    aria-label={t('imagePipeline.actions.enabled')}
                  />
                  <button
                    type="button"
                    className={`${ICON_BTN} hover:bg-error/10 hover:text-error`}
                    disabled={disabled}
                    onClick={stop(() => onEvent({ type: 'remove', id: action.id }))}
                    aria-label={t('imagePipeline.actions.remove')}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove_circle_outline</span>
                  </button>
                </div>
                {!action.collapsed && (
                  <div className="border-t border-outline-variant/15 px-3 py-3">
                    <ActionParamsForm
                      action={action}
                      disabled={disabled}
                      onChange={(params) => onEvent({ type: 'setParams', id: action.id, params })}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
