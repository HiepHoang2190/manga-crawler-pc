import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout, useStudioLayout, useToolsSidebarResize } from '../../shared';
import { ToolsStudioActionContext, ToolsStudioCenterContext } from './ToolsStudioActionSlot';
import ImagePipelineTab from './image-pipeline/ImagePipelineTab';
import { resolveInitialToolsTab } from './toolsTabs';
import RenameTab from '../export/rename/RenameTab';
import DuplicateFinderTab from '../export/duplicates/DuplicateFinderTab';
import UpscaleTab from '../export/upscale/UpscaleTab';

const TOOLS_STUDIO_ACTIVE_TAB_KEY = 'manga_tools_studio_active_tab';

export const TOOLS_TABS = [
  { id: 'duplicates', labelKey: 'toolsStudio.tab.duplicates', defaultLabel: 'Trùng ảnh', icon: 'photo_library' },
  { id: 'rename', labelKey: 'toolsStudio.tab.rename', defaultLabel: 'Đổi tên', icon: 'drive_file_rename_outline' },
  { id: 'imagePipeline', labelKey: 'toolsStudio.tab.imagePipeline', defaultLabel: 'Xử lý ảnh', icon: 'tune' },
  { id: 'upscale', labelKey: 'toolsStudio.tab.upscale', defaultLabel: 'Upscale', icon: 'photo_size_select_large' },
];

export default function ToolsStudio({ savePath = '', onRunningChange }) {
  const { t } = useI18n();

  // Mặc định luôn mở khung xem trước của Tools Studio
  useState(() => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('tools_studio_right_open_v1') === 'false') {
        localStorage.setItem('tools_studio_right_open_v1', 'true');
      }
    } catch { }
  });

  // Đồng bộ layout co giãn theo chuẩn StudioLayout (kế thừa tương thích useToolsSidebarResize)
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth: sidebarWidth,
    handleLeftResizeStart: handleSplitPointerDown,
    showRightSidebar,
    toggleRightSidebar,
    rightWidth,
    handleRightResizeStart,
  } = useStudioLayout({
    storagePrefix: 'tools_studio',
    defaultLeftWidth: 380,
    minLeftWidth: 280,
    maxLeftWidth: 800,
    defaultRightWidth: 380,
    defaultRightOpen: true,
  });

  const [activeTab, setActiveTab] = useState(() => {
    try {
      return resolveInitialToolsTab(localStorage.getItem(TOOLS_STUDIO_ACTIVE_TAB_KEY));
    } catch {
      return 'duplicates';
    }
  });

  // Quản lý trạng thái đang thực thi của từng tab để hiển thị progress icon trên header
  const [tabBusyMap, setTabBusyMap] = useState({});
  const [actionSlotEl, setActionSlotEl] = useState(null);
  const [centerSlotEl, setCenterSlotEl] = useState(null);

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

  useEffect(() => {
    try {
      localStorage.setItem(TOOLS_STUDIO_ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* ignore storage errors */
    }
  }, [activeTab]);

  return (
    <StudioLayout>
      {/* Top Header Toolbar */}
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1 border border-outline-variant/20 overflow-x-auto no-scrollbar shrink-0">
              {TOOLS_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const isBusy = Boolean(tabBusyMap[tab.id]);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`subtab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group/ttab relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
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
                    <span className="whitespace-nowrap">{t(tab.labelKey) || tab.defaultLabel}</span>
                    {isBusy && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
            <div
              ref={setCenterSlotEl}
              data-testid="tools-studio-center-slot"
              className="flex items-center gap-2 shrink-0 empty:hidden pl-2.5 border-l border-outline-variant/25 ml-1"
            />
          </div>
        }
        rightSlot={
          <div
            ref={setActionSlotEl}
            data-testid="tools-studio-actions-slot"
            className="flex items-center gap-2 shrink-0"
          />
        }
      />

      {/* Main Workspace Body with Keep-Alive for each active tool */}
      <ToolsStudioActionContext.Provider value={actionSlotEl}>
        <ToolsStudioCenterContext.Provider value={centerSlotEl}>
          <StudioLayout.Body>
          <div
            className={activeTab === 'duplicates' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'duplicates'}
          >
            <DuplicateFinderTab
              isActive={activeTab === 'duplicates'}
              onRunningChange={(r) => handleTabRunningChange('duplicates', r)}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              showSidebar={showLeftSidebar}
            />
          </div>

          <div
            className={activeTab === 'rename' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'rename'}
          >
            <RenameTab
              isActive={activeTab === 'rename'}
              onRunningChange={(r) => handleTabRunningChange('rename', r)}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              showSidebar={showLeftSidebar}
            />
          </div>

          <div
            className={activeTab === 'imagePipeline' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'imagePipeline'}
          >
            <ImagePipelineTab
              isActive={activeTab === 'imagePipeline'}
              onRunningChange={(r) => handleTabRunningChange('imagePipeline', r)}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              showSidebar={showLeftSidebar}
              showRightSidebar={showRightSidebar}
              rightWidth={rightWidth}
              onRightResizeStart={handleRightResizeStart}
              onToggleRightSidebar={toggleRightSidebar}
            />
          </div>

          <div
            className={activeTab === 'upscale' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'}
            aria-hidden={activeTab !== 'upscale'}
          >
            <UpscaleTab
              isActive={activeTab === 'upscale'}
              onRunningChange={(r) => handleTabRunningChange('upscale', r)}
              sidebarWidth={sidebarWidth}
              handleSplitPointerDown={handleSplitPointerDown}
              showSidebar={showLeftSidebar}
            />
          </div>
        </StudioLayout.Body>
        </ToolsStudioCenterContext.Provider>
      </ToolsStudioActionContext.Provider>
    </StudioLayout>
  );
}
