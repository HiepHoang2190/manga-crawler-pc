import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

export default function HomeToolsDropdown({
  tools = [],
  activeTab,
  onSelectTab,
  tabBusyMap = {},
  onOpenHelp,
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
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
        title={t('home.toolsDropdown.tooltip')}
        className={`group/tools relative flex items-center h-full gap-2 px-3.5 sm:px-5 text-sm font-medium transition-all cursor-pointer border-b-2 -mb-px select-none shrink-0 ${
          isToolActive
            ? 'bg-primary/10 text-primary border-primary font-semibold'
            : 'text-on-surface-variant border-transparent hover:bg-surface-container-high hover:text-on-surface'
        }`}
      >
        {/* Busy Spinner or Icon */}
        {isAnyToolBusy ? (
          <span className="relative flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[18px] leading-none text-cyan-500 dark:text-cyan-400 animate-spin shrink-0">
              progress_activity
            </span>
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
          </span>
        ) : (
          <span className="material-symbols-outlined text-[18px] leading-none shrink-0">
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

        {/* Help Icon if Active Tool has Guide */}
        {isToolActive && onOpenHelp && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHelp(activeTool.id);
            }}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity duration-200 cursor-pointer text-current shrink-0"
            data-tooltip={t('help.tabGuideTooltip')}
            aria-label={t('help.tabGuideAria')}
          >
            <span className="material-symbols-outlined text-[13px] leading-none">help</span>
          </button>
        )}

        {/* Caret icon */}
        <span
          className={`material-symbols-outlined text-[18px] leading-none transition-transform duration-200 opacity-70 ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        >
          arrow_drop_down
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
            className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest dark:bg-zinc-900 shadow-2xl py-1.5 animate-fade-in backdrop-blur-md"
          >
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 border-b border-outline-variant/10 mb-1 select-none">
              {t('home.toolsDropdown.tooltip')}
            </div>

            <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto custom-scrollbar px-1">
              {tools.map((tool) => {
                const isItemActive = tool.id === activeTab;
                const isItemBusy = Boolean(tabBusyMap[tool.id]);

                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectTab(tool.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 text-xs font-medium rounded-lg text-left transition-colors cursor-pointer select-none ${
                      isItemActive
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-on-surface hover:bg-surface-container-high dark:hover:bg-zinc-800'
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
