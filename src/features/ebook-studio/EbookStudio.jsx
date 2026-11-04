import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout, useStudioLayout } from '../../shared';
import MangaPackagingSubTab from './components/MangaPackagingSubTab';
import FormatConverterSubTab from './components/FormatConverterSubTab';
import EbookToolsSubTab from './components/EbookToolsSubTab';
import SendToKindleTab from '../export/kindle/SendToKindleTab';
import { EbookStudioActionContext, EbookStudioCenterContext } from './EbookStudioActionSlot';

export default function EbookStudio({ savePath = '', initialMangaDir = '', onRunningChange }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('ebook_studio_active_subtab') || 'packaging';
    } catch {
      return 'packaging';
    }
  }); // 'packaging' | 'converter' | 'tools' | 'kindle'
  const [actionSlotEl, setActionSlotEl] = useState(null);
  const [centerSlotEl, setCenterSlotEl] = useState(null);

  // Listen for cross-component subtab switch event
  useEffect(() => {
    const handleSwitch = (e) => {
      if (e.detail?.subtab) {
        setActiveTab(e.detail.subtab);
        try {
          localStorage.setItem('ebook_studio_active_subtab', e.detail.subtab);
        } catch {}
      }
    };
    window.addEventListener('ebook_studio:switch_subtab', handleSwitch);
    return () => window.removeEventListener('ebook_studio:switch_subtab', handleSwitch);
  }, []);

  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth: sidebarWidth,
    handleLeftResizeStart: handleSplitPointerDown,
  } = useStudioLayout({
    storagePrefix: 'ebook_studio',
    defaultLeftWidth: 380,
    minLeftWidth: 280,
    maxLeftWidth: 800,
  });

  // Quản lý trạng thái đang thực thi của từng tab để hiển thị progress icon trên header
  const [tabBusyMap, setTabBusyMap] = useState({});

  const handleTabRunningChange = useCallback(
    (tabId, isRunning) => {
      setTabBusyMap((prev) => {
        const runningBool = Boolean(isRunning);
        if (Boolean(prev[tabId]) === runningBool) return prev;
        const next = { ...prev, [tabId]: runningBool };
        const anyRunning = Object.values(next).some(Boolean);
        onRunningChange?.(anyRunning);
        return next;
      });
    },
    [onRunningChange]
  );

  const subtabs = [
    { id: 'packaging', label: t('ebookStudio.tabPackaging'), icon: 'archive' },
    { id: 'converter', label: t('ebookStudio.tabConverter'), icon: 'sync_alt' },
    { id: 'tools', label: t('ebookStudio.tabTools'), icon: 'construction' },
    { id: 'kindle', label: t('ebookStudio.tabKindle'), icon: 'tablet_android' },
  ];

  return (
    <StudioLayout>
      {/* Top Header Bar */}
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1 border border-outline-variant/20 overflow-x-auto no-scrollbar shrink-0">
              {subtabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const isBusy = Boolean(tabBusyMap[tab.id]);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`subtab-${tab.id}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      try {
                        localStorage.setItem('ebook_studio_active_subtab', tab.id);
                      } catch {}
                    }}
                    className={`group/etab relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                      isActive
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    {isBusy ? (
                      <span className="relative flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[15px] leading-none text-cyan-400 animate-spin shrink-0">
                          progress_activity
                        </span>
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px] leading-none shrink-0">{tab.icon}</span>
                    )}
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {isBusy && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
            <div
              ref={setCenterSlotEl}
              data-testid="ebook-studio-center-slot"
              className="flex items-center gap-2 shrink-0 empty:hidden pl-2.5 border-l border-outline-variant/25 ml-1"
            />
          </div>
        }
        rightSlot={
          <div
            ref={setActionSlotEl}
            data-testid="ebook-studio-actions-slot"
            className="flex items-center gap-2 shrink-0"
          />
        }
      />

      {/* Main Workspace Body with Keep-Alive */}
      <EbookStudioActionContext.Provider value={actionSlotEl}>
        <EbookStudioCenterContext.Provider value={centerSlotEl}>
          <StudioLayout.Body>
          <div
            className={activeTab === 'packaging' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'packaging'}
          >
            <MangaPackagingSubTab
              isActive={activeTab === 'packaging'}
              savePath={savePath}
              initialMangaDir={initialMangaDir}
              showCol1={showLeftSidebar}
              showSidebar={showLeftSidebar}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              onRunningChange={(isRunning) => handleTabRunningChange('packaging', isRunning)}
            />
          </div>

          <div
            className={activeTab === 'converter' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'converter'}
          >
            <FormatConverterSubTab
              isActive={activeTab === 'converter'}
              savePath={savePath}
              showCol1={showLeftSidebar}
              showSidebar={showLeftSidebar}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              onRunningChange={(isRunning) => handleTabRunningChange('converter', isRunning)}
            />
          </div>

          <div
            className={activeTab === 'tools' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'tools'}
          >
            <EbookToolsSubTab
              isActive={activeTab === 'tools'}
              savePath={savePath}
              showCol1={showLeftSidebar}
              showSidebar={showLeftSidebar}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              onRunningChange={(isRunning) => handleTabRunningChange('tools', isRunning)}
            />
          </div>

          <div
            className={activeTab === 'kindle' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'kindle'}
          >
            <SendToKindleTab
              isActive={activeTab === 'kindle'}
              showCol1={showLeftSidebar}
              showSidebar={showLeftSidebar}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              onRunningChange={(isRunning) => handleTabRunningChange('kindle', isRunning)}
            />
          </div>
        </StudioLayout.Body>
        </EbookStudioCenterContext.Provider>
      </EbookStudioActionContext.Provider>
    </StudioLayout>
  );
}
