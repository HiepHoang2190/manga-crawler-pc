import { useState, useMemo } from 'react';
import { useI18n } from '../../context/I18nContext';
import { sortViewsByOrder } from '../../utils/menuOrderPrefs.mjs';
import MenuTabCustomizeModal from './MenuTabCustomizeModal.jsx';

export const VIEWS = [
  { id: 'explore', key: 'menu.explore', icon: 'explore', hidable: true },
  { id: 'home', key: 'menu.home', icon: 'download', hidable: true },
  { id: 'toolsStudio', key: 'menu.toolsStudio', icon: 'handyman', hidable: true },
  { id: 'ebookStudio', key: 'menu.ebookStudio', icon: 'menu_book', hidable: true },
  { id: 'translate', key: 'menu.translate', icon: 'translate', hidable: true },
  { id: 'workflow', key: 'menu.workflow', icon: 'account_tree', hidable: true },
  { id: 'plugins', key: 'menu.plugins', icon: 'extension', hidable: true },
  { id: 'siteChecker', key: 'menu.siteChecker', icon: 'health_and_safety', hidable: true },
  { id: 'settings', key: 'menu.settings', icon: 'settings', hidable: true },
  { id: 'dashboard', key: 'menu.dashboard', icon: 'dashboard', hidable: true },
];

const NO_HELP_ICON = new Set();

export default function MenuBar({
  activeView,
  onViewChange,
  hiddenMenuIds = [],
  menuOrder = [],
  tabBusyMap = {},
  onHelpClick,
  onMoveMenu,
  onReorderMenu,
  onToggleHiddenMenu,
  onResetMenuPrefs,
}) {
  const { t } = useI18n();
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const hidden = useMemo(() => new Set(hiddenMenuIds), [hiddenMenuIds]);
  const views = useMemo(() => {
    let v = VIEWS.filter((tab) => !hidden.has(tab.id));
    if (v.length === 0) {
      const fallbackTab = VIEWS.find((tab) => tab.id === 'explore') || VIEWS[0];
      v = [fallbackTab];
    }
    return sortViewsByOrder(v, menuOrder);
  }, [hidden, menuOrder]);

  return (
    <div className="flex items-center justify-between w-full min-h-10 pr-3">
      <nav
        className="flex items-end justify-start pl-2 pr-1.5 min-h-10 gap-3 font-headline font-semibold text-sm tracking-tight overflow-x-auto overflow-y-visible custom-scrollbar isolate flex-1"
        aria-label="Main menu"
      >
        {views.map((tab) => {
          const isActive = tab.id === activeView;
          const isBusy = Boolean(tabBusyMap[tab.id]);
          const showHelpIcon = isActive && !NO_HELP_ICON.has(tab.id) && typeof onHelpClick === 'function';
          return (
            <a
              key={tab.id}
              href="#"
              data-testid={`menu-tab-${tab.id}`}
              onClick={(e) => {
                e.preventDefault();
                onViewChange(tab.id);
              }}
              className={`group relative inline-flex min-w-0 shrink-0 select-none flex-col items-stretch justify-end rounded-md px-2.5 py-1.5 outline-none transition-colors duration-200 ${isActive
                ? 'text-[#0078D4] hover:bg-[#0078D4]/10'
                : 'text-on-surface/60 hover:bg-surface-container-high'
                }`}
            >
              <div className="flex items-center justify-center pb-0.5 gap-2">
                <div className="relative flex items-center gap-1.5">
                  {tab.icon && (
                    isBusy ? (
                      <span className="relative flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[15px] leading-none text-cyan-400 animate-spin shrink-0">
                          progress_activity
                        </span>
                      </span>
                    ) : (
                      <span
                        className={`material-symbols-outlined text-[17px] leading-none shrink-0 transition-colors ${isActive ? 'text-[#0078D4]' : 'text-on-surface-variant/70 group-hover:text-on-surface'
                          }`}
                        aria-hidden="true"
                      >
                        {tab.icon}
                      </span>
                    )
                  )}
                  <span className="whitespace-nowrap leading-snug">
                    {t(tab.key)}
                  </span>
                  {isBusy && (
                    <span
                      data-testid={`menu-tab-busy-${tab.id}`}
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5 shrink-0"
                    />
                  )}
                  <span
                    className={`absolute -bottom-[2px] left-0 h-0.5 w-full rounded-t ${isActive ? 'bg-[#0078D4]' : 'bg-transparent'}`}
                    aria-hidden
                  />
                </div>
                {/* Help icon — luôn hiện khi tab được chọn */}
                {showHelpIcon && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onHelpClick(tab.id);
                    }}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity duration-200 cursor-pointer text-current shrink-0 translate-y-[1.5px]"
                    data-testid={`help-btn-${tab.id}`}
                    data-tooltip={t('help.tabGuideTooltip')}
                    aria-label={t('help.tabGuideAria')}
                  >
                    <span className="material-symbols-outlined text-[14px] leading-none">help</span>
                  </button>
                )}
              </div>
              <span className="h-0.5 w-full min-w-0" aria-hidden />
            </a>
          );
        })}
      </nav>

      {/* Nút tùy chỉnh thanh menu ngay bên ngoài */}
      <button
        type="button"
        onClick={() => setIsCustomizeOpen(true)}
        className="flex items-center justify-center w-7 h-7 -translate-y-[6px] rounded-lg text-on-surface-variant/60 hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer shrink-0 ml-2"
        data-tooltip={t('menu.customizeTabs.button')}
        aria-label={t('menu.customizeTabs.button')}
      >
        <span className="material-symbols-outlined text-[18px]">tune</span>
      </button>

      {/* Modal tùy chỉnh thanh menu */}
      <MenuTabCustomizeModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        tabOrder={menuOrder}
        hiddenTabIds={hiddenMenuIds}
        allTabs={VIEWS}
        onMoveTab={onMoveMenu}
        onReorderTab={onReorderMenu}
        onToggleHiddenTab={onToggleHiddenMenu}
        onResetPrefs={onResetMenuPrefs}
      />
    </div>
  );
}

