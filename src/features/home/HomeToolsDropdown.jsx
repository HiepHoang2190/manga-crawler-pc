import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { SectionTitle } from '../../shared';

export default function HomeToolsDropdown({
  tools = [],
  activeTab,
  onSelectTab,
  tabBusyMap = {},
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const portalRef = useRef(null);

  // Position calculation for portal floating dropdown
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const minWidth = Math.max(220, rect.width);
      const maxLeft = typeof window !== 'undefined' ? window.innerWidth - minWidth - 12 : rect.left;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, maxLeft));

      const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - rect.bottom : 300;
      const spaceAbove = rect.top;

      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        setDropdownStyle({
          position: 'fixed',
          left: `${left}px`,
          bottom: `${(typeof window !== 'undefined' ? window.innerHeight : 800) - rect.top + 4}px`,
          minWidth: `${minWidth}px`,
          maxWidth: '300px',
          zIndex: 9999,
        });
      } else {
        setDropdownStyle({
          position: 'fixed',
          left: `${left}px`,
          top: `${rect.bottom + 4}px`,
          minWidth: `${minWidth}px`,
          maxWidth: '300px',
          zIndex: 9999,
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close when clicking outside trigger and portal
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (portalRef.current && portalRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Keyboard navigation inside portaled menu + Escape focus restoration
  useEffect(() => {
    if (!isOpen) return;
    const menuEl = portalRef.current;
    if (menuEl) {
      const activeOrFirst =
        menuEl.querySelector('[role="menuitem"][aria-current="true"]') ||
        menuEl.querySelector('[role="menuitem"]');
      activeOrFirst?.focus();
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!portalRef.current) return;
      const items = Array.from(portalRef.current.querySelectorAll('[role="menuitem"]'));
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === 'Tab') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!tools || tools.length === 0) return null;

  const activeTool = tools.find((tool) => tool.id === activeTab);
  const isToolActive = Boolean(activeTool);
  const isAnyToolBusy = tools.some((tool) => Boolean(tabBusyMap[tool.id]));

  return (
    <div className="relative inline-flex items-center shrink-0">
      {/* Main Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-tooltip={t('home.toolsDropdown.tooltip')}
        className={`group/tools relative inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
          isToolActive
            ? 'bg-primary text-on-primary font-semibold shadow-xs'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
        }`}
      >
        {/* Busy Spinner or Icon */}
        {isAnyToolBusy ? (
          <span className="relative flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[15px] leading-none text-cyan-500 dark:text-cyan-400 animate-spin shrink-0">
              progress_activity
            </span>
          </span>
        ) : (
          <span className="material-symbols-outlined text-[16px] leading-none shrink-0">
            {isToolActive ? activeTool.icon : 'handyman'}
          </span>
        )}

        {/* Tab / Dropdown Label */}
        <span>
          {isToolActive ? t(`queue.tab.${activeTool.id}`) : t('home.toolsDropdown.label')}
        </span>

        {/* Busy badge for running task in tool */}
        {isAnyToolBusy && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400"></span>
            <span className="hidden xl:inline">{t('queue.tab.running')}</span>
          </span>
        )}

        {/* Caret icon */}
        <span
          className={`material-symbols-outlined text-[16px] leading-none transition-transform duration-150 opacity-80 ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Floating Dropdown via Portal to avoid overflow clipping */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={portalRef}
            role="menu"
            aria-orientation="vertical"
            style={dropdownStyle}
            className="rounded-xl border border-outline-variant/20 bg-surface-container-high/95 shadow-2xl py-1.5 animate-fade-in backdrop-blur-md"
          >
            <SectionTitle className="px-3 py-1.5 border-b border-outline-variant/10 mb-1">
              {t('home.toolsDropdown.tooltip')}
            </SectionTitle>

            <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto custom-scrollbar px-1">
              {tools.map((tool) => {
                const isItemActive = tool.id === activeTab;
                const isItemBusy = Boolean(tabBusyMap[tool.id]);

                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitem"
                    aria-current={isItemActive ? 'true' : undefined}
                    onClick={() => {
                      onSelectTab(tool.id);
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 text-xs font-medium rounded-lg text-left transition-colors cursor-pointer select-none ${
                      isItemActive
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-on-surface hover:bg-surface-container-highest'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {isItemBusy ? (
                        <span className="material-symbols-outlined text-[17px] text-cyan-500 animate-spin shrink-0">
                          progress_activity
                        </span>
                      ) : (
                        <span
                          className={`material-symbols-outlined text-[18px] shrink-0 ${
                            isItemActive ? 'text-primary' : 'text-on-surface-variant/70'
                          }`}
                        >
                          {tool.icon}
                        </span>
                      )}
                      <span className="truncate">{t(`queue.tab.${tool.id}`)}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isItemBusy && (
                        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                      )}
                      {isItemActive && (
                        <span className="material-symbols-outlined text-[17px] text-primary">
                          check
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
