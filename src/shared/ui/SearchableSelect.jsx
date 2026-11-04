import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

/**
 * Custom styled dropdown thay thế <select> native.
 * - Dropdown render qua Portal ra body — không bị cắt bởi overflow:hidden của container cha.
 * - Hỗ trợ options mảng phẳng hoặc groups nhóm danh mục ({ label, icon, options }).
 * - Ô tìm kiếm chỉ xuất hiện khi tổng số options > 10.
 *
 * Props:
 *   value, onChange(newValue), options: [{value, label, icon?}],
 *   groups: [{ label, icon?, options: [{value, label, icon?}] }],
 *   placeholder (empty = no clearable empty option in the list; Site passes "—" when needed),
 *   searchPlaceholder, className, disabled
 */
function renderOptionIcon(option, isSelected, isSm) {
  if (!option) return null;
  const iconVal = option.materialIcon || option.icon;
  if (!iconVal) return null;
  const isMaterial = option.materialIcon || (typeof iconVal === 'string' && !iconVal.includes('/') && !iconVal.includes('.') && !iconVal.startsWith('data:'));
  if (isMaterial) {
    return (
      <span className={`material-symbols-outlined ${isSm ? 'text-[16px]' : 'text-[18px]'} leading-none shrink-0 ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
        {iconVal}
      </span>
    );
  }
  return (
    <img
      src={iconVal}
      alt=""
      className={`${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0 object-contain rounded`}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  groups = null,
  placeholder = '',
  searchPlaceholder = '',
  className = '',
  disabled = false,
  size = 'md',
  zIndex = 10050,
  showPlaceholderOption = true,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const portalRef = useRef(null);
  const justOpenedRef = useRef(false);

  const allOptions = useMemo(() => {
    if (groups && Array.isArray(groups) && groups.length > 0) {
      return groups.flatMap((g) => g.options || []);
    }
    return options || [];
  }, [groups, options]);

  const showSearch = allOptions.length > 10;
  const selected = allOptions.find((o) => o.value === value);
  const effectiveSearchPlaceholder = searchPlaceholder || t('searchableSelect.searchPlaceholder');

  const filteredGroups = useMemo(() => {
    if (!groups || !Array.isArray(groups) || groups.length === 0) return null;
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        options: (g.options || []).filter((o) => o.alwaysShow || o.value === '__custom__' || o.label?.toLowerCase().includes(q)),
      }))
      .filter((g) => g.options && g.options.length > 0);
  }, [groups, query]);

  const filtered = useMemo(() => {
    if (filteredGroups) return [];
    if (!showSearch || !query.trim()) return allOptions;
    const q = query.trim().toLowerCase();
    const matched = allOptions.filter((o) => o.label?.toLowerCase().includes(q));
    // Luôn giữ các option có alwaysShow hoặc value === '__custom__' ở đầu danh sách kể cả khi đang gõ tìm kiếm
    const alwaysVisible = allOptions.filter((o) => o.alwaysShow || o.value === '__custom__');
    const combined = [...alwaysVisible];
    for (const opt of matched) {
      if (!combined.some((c) => c.value === opt.value)) {
        combined.push(opt);
      }
    }
    return combined;
  }, [filteredGroups, showSearch, query, allOptions]);

  // Tính vị trí dropdown mỗi khi mở
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxH = 320;
    const isSm = size === 'sm';
    const minW = Math.max(rect.width, isSm ? 120 : rect.width);
    const targetLeft = Math.max(8, Math.min(rect.left, window.innerWidth - minW - 8));

    if (spaceBelow < Math.min(maxH, 200) && spaceAbove > spaceBelow) {
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
  }, [open, size, zIndex]);

  // Đóng khi click ngoài — dùng portalRef thay vì getElementById
  useEffect(() => {
    if (!open || disabled) return;
    justOpenedRef.current = true;
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (portalRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    // defer để tránh bắt chính mousedown đã trigger open
    const id = setTimeout(() => {
      justOpenedRef.current = false;
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, disabled]);

  // Đóng khi scroll bên ngoài dropdown hoặc resize
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      // Ignore scroll ngay sau khi mở (scrollIntoView selected item)
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
    if (open) {
      if (showSearch) inputRef.current?.focus();
      // scrollIntoView dùng requestAnimationFrame để không trigger scroll listener
      requestAnimationFrame(() => {
        listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      });
    } else {
      setQuery('');
    }
  }, [open, showSearch]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled, open]);

  const handleSelect = (val) => {
    if (disabled) return;
    onChange(val, query.trim());
    setOpen(false);
    setQuery('');
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      triggerRef.current?.focus();
    }
  };

  const hasDuplicatePlaceholderOption =
    Boolean(placeholder) &&
    allOptions.some(
      (o) =>
        o.value === '' ||
        o.value === null ||
        o.value === 'all' ||
        o.label === placeholder
    );

  const dropdown = open ? (
    <div
      ref={portalRef}
      style={dropdownStyle}
      className="bg-surface-container-high/95 backdrop-blur-md rounded-2xl shadow-2xl border border-outline-variant/20 flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
      onKeyDown={handleKeyDown}
    >
      {showSearch && (
        <div className="p-1.5 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2 bg-surface-container-highest rounded-xl px-2.5 h-8 border border-outline-variant/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <span className="material-symbols-outlined text-[18px] leading-none text-on-surface-variant shrink-0">search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={effectiveSearchPlaceholder}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      <ul ref={listRef} role="listbox" className="p-1 overflow-y-auto flex-1 space-y-0.5 custom-scrollbar">
        {showPlaceholderOption && placeholder && !hasDuplicatePlaceholderOption && (
          <li
            role="option"
            aria-selected={!value}
            data-selected={String(!value)}
            onClick={() => handleSelect('')}
            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs sm:text-sm cursor-pointer select-none transition-colors ${
              !value
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
            }`}
          >
            <span className="truncate">{placeholder}</span>
            {!value && (
              <span className="material-symbols-outlined text-[18px] leading-none text-primary shrink-0">
                check
              </span>
            )}
          </li>
        )}

        {filteredGroups ? (
          filteredGroups.length === 0 ? (
            <li className="px-3 py-4 text-xs sm:text-sm text-on-surface-variant text-center select-none">
              {t('searchableSelect.noResults')}
            </li>
          ) : (
            filteredGroups.map((g, gIdx) => (
              <Fragment key={g.label || `grp-${gIdx}`}>
                <li
                  role="presentation"
                  className={`px-2.5 ${gIdx === 0 ? 'pt-1.5' : 'pt-2.5'} pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 flex items-center gap-1.5 select-none pointer-events-none`}
                >
                  {g.icon && (
                    <span className="material-symbols-outlined text-[14px] text-primary shrink-0">
                      {g.icon}
                    </span>
                  )}
                  <span className="truncate">{g.label}</span>
                  <div className="flex-1 h-px bg-outline-variant/15 ml-1" />
                </li>
                {g.options.map((o) => {
                  const isSelected = o.value === value;
                  return (
                    <li
                      key={o.value}
                      role="option"
                      aria-selected={isSelected}
                      data-selected={String(isSelected)}
                      onClick={() => handleSelect(o.value)}
                      className={`flex items-center justify-between gap-2 pl-5 pr-2.5 py-2 rounded-xl text-xs sm:text-sm cursor-pointer select-none transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-on-surface hover:bg-surface-container-highest hover:text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {renderOptionIcon(o, isSelected, false)}
                        <span className="truncate">{o.label}</span>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-[18px] leading-none text-primary shrink-0">
                          check
                        </span>
                      )}
                    </li>
                  );
                })}
              </Fragment>
            ))
          )
        ) : (
          <>
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-xs sm:text-sm text-on-surface-variant text-center select-none">
                {t('searchableSelect.noResults')}
              </li>
            )}

            {filtered.map((o) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  data-selected={String(isSelected)}
                  onClick={() => handleSelect(o.value)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs sm:text-sm cursor-pointer select-none transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-on-surface hover:bg-surface-container-highest hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {renderOptionIcon(o, isSelected, false)}
                    <span className="truncate">
                      {o.value === '__custom__' && query.trim()
                        ? `✏️ Nhập model tùy chỉnh: "${query.trim()}"`
                        : o.label}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[18px] leading-none text-primary shrink-0">
                      check
                    </span>
                  )}
                </li>
              );
            })}
          </>
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={`w-full flex items-center justify-between ${
          size === 'sm'
            ? 'gap-1.5 h-8 px-2.5 rounded-lg text-xs'
            : 'gap-2 h-10 px-3.5 rounded-xl text-xs sm:text-sm'
        } bg-surface-container-highest box-border border transition-all outline-none text-left ${
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-xs'
            : 'border-outline-variant/25 hover:border-outline-variant/50 hover:bg-surface-container-high focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
      >
        <span className={`flex items-center ${size === 'sm' ? 'gap-1.5' : 'gap-2'} truncate min-w-0 flex-1 ${!selected ? 'text-on-surface-variant' : 'text-on-surface'}`}>
          {renderOptionIcon(selected, false, size === 'sm')}
          <span className="truncate font-medium">{selected ? selected.label : placeholder}</span>
        </span>
        <span
          className={`material-symbols-outlined ${size === 'sm' ? 'text-[16px]' : 'text-[18px]'} leading-none shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-primary' : 'text-on-surface-variant'
          }`}
        >
          expand_more
        </span>
      </button>

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
