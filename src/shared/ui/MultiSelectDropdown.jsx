import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

function renderOptionIcon(option, isSelected, isSm) {
  if (!option) return null;
  const iconVal = option.materialIcon || option.icon;
  if (!iconVal) return null;
  const isMaterial =
    option.materialIcon ||
    (typeof iconVal === 'string' &&
      !iconVal.includes('/') &&
      !iconVal.includes('.') &&
      !iconVal.startsWith('data:'));
  if (isMaterial) {
    return (
      <span
        className={`material-symbols-outlined ${
          isSm ? 'text-[16px]' : 'text-[18px]'
        } leading-none shrink-0 ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        {iconVal}
      </span>
    );
  }
  return (
    <img
      src={iconVal}
      alt=""
      className={`${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0 object-contain rounded`}
      onError={(e) => {
        e.target.style.display = 'none';
      }}
    />
  );
}

/**
 * MultiSelectDropdown - Dropdown cho phép chọn nhiều mục với master checkbox "Chọn tất cả".
 * Render menu qua React Portal ra document.body để chống tràn/cắt bởi overflow:hidden.
 */
export default function MultiSelectDropdown({
  options = [],
  selectedValues = [],
  onChange,
  selectAllLabel = '',
  placeholder = '',
  size = 'md',
  disabled = false,
  className = '',
  zIndex = 10050,
  variant = 'dropdown',
  defaultExpanded = true,
  maxHeightClass = '',
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const portalRef = useRef(null);
  const justOpenedRef = useRef(false);

  const isSm = size === 'sm';
  const total = options.length;
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const count = options.filter((o) => selectedSet.has(o.value)).length;

  const isAllSelected = total > 0 && count === total;
  const isNoneSelected = count === 0;
  const isIndeterminate = !isAllSelected && !isNoneSelected;

  const showSearch = options.length > 8;

  const filteredOptions = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label?.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q) ||
        o.value?.toLowerCase().includes(q),
    );
  }, [options, showSearch, query]);

  // Tính vị trí menu mỗi khi mở
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxH = 420;
    const minW = Math.max(rect.width, isSm ? 240 : 280);
    const targetLeft = Math.max(8, Math.min(rect.left, window.innerWidth - minW - 8));

    if (spaceBelow < Math.min(maxH, 220) && spaceAbove > spaceBelow) {
      setDropdownStyle({
        position: 'fixed',
        left: targetLeft,
        bottom: window.innerHeight - rect.top + 6,
        width: Math.max(rect.width, minW),
        minWidth: minW,
        maxWidth: Math.min(380, window.innerWidth - 16),
        maxHeight: Math.min(maxH, spaceAbove - 8),
        zIndex: zIndex || 10050,
      });
    } else {
      setDropdownStyle({
        position: 'fixed',
        left: targetLeft,
        top: rect.bottom + 6,
        width: Math.max(rect.width, minW),
        minWidth: minW,
        maxWidth: Math.min(380, window.innerWidth - 16),
        maxHeight: Math.min(maxH, spaceBelow - 8),
        zIndex: zIndex || 10050,
      });
    }
  }, [open, isSm, zIndex]);

  // Đóng khi click ra ngoài
  useEffect(() => {
    if (!open || disabled) return;
    justOpenedRef.current = true;
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (portalRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    const id = setTimeout(() => {
      justOpenedRef.current = false;
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, disabled]);

  // Đóng khi scroll ngoài dropdown hoặc resize
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (justOpenedRef.current) return;
      if (portalRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (open && showSearch) {
      inputRef.current?.focus();
    } else if (!open) {
      setQuery('');
    }
  }, [open, showSearch]);

  const handleToggleOption = (val) => {
    if (disabled || typeof onChange !== 'function') return;
    const next = new Set(selectedValues);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    onChange(Array.from(next));
  };

  const handleToggleAll = () => {
    if (disabled || typeof onChange !== 'function') return;
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      triggerRef.current?.focus();
    }
  };

  const triggerLabel = useMemo(() => {
    if (placeholder && isNoneSelected) return placeholder;
    if (total === 0 || isNoneSelected) {
      return t('latestUpdates.multiSearchNoneSelected');
    }
    if (isAllSelected) {
      return t('latestUpdates.multiSearchAllSelected', { count: total });
    }
    return t('latestUpdates.multiSearchPartialSelected', { count, total });
  }, [placeholder, isNoneSelected, isAllSelected, count, total, t]);

  const masterCheckboxIcon = isAllSelected
    ? 'check_box'
    : isIndeterminate
    ? 'indeterminate_check_box'
    : 'check_box_outline_blank';

  const menu = open ? (
    <div
      ref={portalRef}
      style={dropdownStyle}
      className="bg-surface-container-high/95 backdrop-blur-md rounded-2xl shadow-2xl border border-outline-variant/20 flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 select-none"
      onKeyDown={handleKeyDown}
    >
      {/* Header: Chọn tất cả */}
      <div className="p-2.5 px-3 border-b border-outline-variant/15 flex items-center justify-between gap-2 shrink-0 bg-surface-container-highest/40">
        <button
          type="button"
          onClick={handleToggleAll}
          className="flex items-center gap-2 text-xs font-semibold text-on-surface hover:text-primary transition-colors cursor-pointer min-w-0 select-none"
        >
          <span
            className={`material-symbols-outlined text-[18px] leading-none shrink-0 ${
              isAllSelected || isIndeterminate ? 'text-primary' : 'text-on-surface-variant/60'
            }`}
          >
            {masterCheckboxIcon}
          </span>
          <span className="truncate">
            {selectAllLabel || t('latestUpdates.selectAllSources')}
          </span>
        </button>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums shrink-0 transition-colors ${
            isAllSelected
              ? 'bg-primary/15 text-primary border border-primary/25'
              : count > 0
              ? 'bg-surface-container-highest text-on-surface border border-outline-variant/30'
              : 'bg-surface-container-highest text-on-surface-variant/60'
          }`}
        >
          {count}/{total}
        </span>
      </div>

      {/* Ô tìm kiếm lọc danh sách nếu có nhiều options */}
      {showSearch && (
        <div className="p-2 border-b border-outline-variant/15 shrink-0 bg-surface-container-high/40">
          <div className="flex items-center gap-2 bg-surface-container-highest rounded-xl px-2.5 h-8 border border-outline-variant/25 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <span className="material-symbols-outlined text-[16px] leading-none text-on-surface-variant/70 shrink-0">
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchableSelect.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-on-surface-variant/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center p-0.5 rounded hover:bg-surface-container-highest"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Danh sách options */}
      <div className="p-1.5 space-y-0.5 overflow-y-auto custom-scrollbar flex-1 max-h-[360px]">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-on-surface-variant/60 flex flex-col items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40">search_off</span>
            <span>{t('searchableSelect.noResults')}</span>
          </div>
        ) : (
          filteredOptions.map((opt) => {
            const isChecked = selectedSet.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleToggleOption(opt.value)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left select-none text-on-surface hover:bg-surface-container-highest"
              >
                <span
                  className={`material-symbols-outlined text-[18px] leading-none shrink-0 transition-colors ${
                    isChecked ? 'text-primary' : 'text-on-surface-variant/50'
                  }`}
                >
                  {isChecked ? 'check_box' : 'check_box_outline_blank'}
                </span>
                {renderOptionIcon(opt, isChecked, isSm)}
                <span className="truncate flex-1 font-medium">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  if (variant === 'inline') {
    return (
      <div
        ref={containerRef}
        className={`rounded-2xl border border-outline-variant/25 bg-surface-container-high/40 flex flex-col overflow-hidden select-none ${className}`}
      >
        {/* Header: Master Checkbox + Count + Collapse/Expand */}
        <div className="p-2 border-b border-outline-variant/15 flex items-center justify-between gap-2 shrink-0 bg-surface-container-highest/30">
          <button
            type="button"
            onClick={handleToggleAll}
            disabled={disabled}
            className="flex items-center gap-2 text-xs font-semibold text-on-surface hover:text-primary transition-colors cursor-pointer min-w-0"
          >
            <span
              className={`material-symbols-outlined text-[18px] leading-none shrink-0 ${
                isAllSelected || isIndeterminate ? 'text-primary' : 'text-on-surface-variant/60'
              }`}
            >
              {masterCheckboxIcon}
            </span>
            <span className="truncate">
              {selectAllLabel || t('latestUpdates.selectAllSources')}
            </span>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant shrink-0">
              {count}/{total}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label={expanded ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
              data-tooltip={expanded ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
              className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer flex items-center"
            >
              <span
                className={`material-symbols-outlined text-[18px] leading-none transition-transform duration-150 ${
                  expanded ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>
          </div>
        </div>

        {expanded && (
          <>
            {/* Ô tìm kiếm lọc danh sách nếu có nhiều options */}
            {showSearch && (
              <div className="p-1.5 border-b border-outline-variant/15 shrink-0">
                <div className="flex items-center gap-2 bg-surface-container-highest rounded-xl px-2.5 h-7 border border-outline-variant/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-[16px] leading-none text-on-surface-variant shrink-0">
                    search
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('searchableSelect.searchPlaceholder')}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-on-surface-variant"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center"
                    >
                      <span className="material-symbols-outlined text-[14px] leading-none">close</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Danh sách options */}
            <div
              className={`p-1 space-y-0.5 overflow-y-auto custom-scrollbar flex-1 ${
                maxHeightClass || 'max-h-[min(520px,calc(100vh-270px))] min-h-[260px]'
              }`}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-on-surface-variant/60">
                  {t('searchableSelect.noResults')}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = selectedSet.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleToggleOption(opt.value)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left select-none text-on-surface hover:bg-surface-container-highest ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] leading-none shrink-0 ${
                          isChecked ? 'text-primary' : 'text-on-surface-variant/50'
                        }`}
                      >
                        {isChecked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      {renderOptionIcon(opt, isChecked, isSm)}
                      <span className="truncate flex-1">{opt.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border transition-all text-left cursor-pointer select-none ${
          isSm ? 'h-9 px-2.5 text-xs' : 'h-10 px-3.5 text-xs sm:text-sm'
        } ${
          isNoneSelected
            ? 'border-error/40 bg-error/5 text-error hover:border-error/60'
            : open
            ? 'border-primary ring-2 ring-primary/20 bg-surface-container-highest shadow-xs'
            : 'border-outline-variant/25 bg-surface-container-highest hover:border-outline-variant/50 hover:bg-surface-container-high text-on-surface'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`material-symbols-outlined leading-none shrink-0 ${
              isSm ? 'text-[16px]' : 'text-[18px]'
            } ${isNoneSelected ? 'text-error' : 'text-primary'}`}
          >
            filter_list
          </span>
          <span className="truncate flex-1 font-medium">{triggerLabel}</span>
        </div>
        <span
          className={`material-symbols-outlined leading-none shrink-0 transition-transform duration-150 ${
            isSm ? 'text-[16px]' : 'text-[18px]'
          } ${open ? 'rotate-180 text-primary' : 'text-on-surface-variant'}`}
        >
          expand_more
        </span>
      </button>

      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

