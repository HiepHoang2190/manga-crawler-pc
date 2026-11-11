import React from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * MangaStudioToolbar — Thanh công cụ đỉnh (Window Header Bar & Action Pills)
 * Gồm 3 vùng chức năng (Zones):
 * - Zone 1 (Trái): Toggle Left Sidebar, Selector dự án, Chỉ báo Auto-Save
 * - Zone 2 (Giữa): Selector Model/Provider Cloud & Local, Nút Run Action (dịch trang/chapter/selective steps), Chế độ Auto, Đối chiếu, Xuất file
 * - Zone 3 (Phải): Tab Properties/Settings, Toggle Right Sidebar, Trợ giúp (Guide Modal), Thoát (Close)
 */
export function MangaStudioToolbar({
  leftToggleBtn,
  currentProject,
  loadProjectsList,
  setShowProjectModal,
  isTranslating,
  pagesCount = 0,
  isSavingSession,
  modelPickerRef,
  showModelDropdown,
  setShowModelDropdown,
  refreshLocalEngines,
  activeProviderInfo,
  displayModelName,
  cloudProviders = [],
  activeProvider,
  settings,
  handleUpdateSetting,
  setActiveRightTab,
  isLocalOnline,
  localModels = [],
  currentModelId,
  translateProgress,
  handleCancelTranslate,
  runDropdownRef,
  defaultRunAction,
  isAutoModeEnabled,
  activeOutputDir,
  showRunDropdown,
  setShowRunDropdown,
  orderedRunActions = [],
  draggedRunActionId,
  setDraggedRunActionId,
  dragOverRunActionId,
  setDragOverRunActionId,
  isRunActionDraggingRef,
  handleReorderRunAction,
  handleRunDetection,
  handleRunOCR,
  handleRunTranslation,
  handleRunInpainting,
  toggleAutoMode,
  isAutoProcessing,
  autoProgress,
  setShowAutoModal,
  setShowComparisonModal,
  residualLayersCount = 0,
  layersCount = 0,
  exportDropdownRef,
  isExporting,
  activePage,
  handleExportCurrentPage,
  showExportDropdown,
  setShowExportDropdown,
  handleExportAllChapter,
  handleExportCbz,
  handleOpenFolder,
  autoOpenExportFolder,
  setAutoOpenExportFolder,
  showRightSidebar,
  activeRightTab,
  toggleRightSidebar,
  setGuideInitialTab,
  setShowGuideModal,
  isStandaloneView,
  onClose,
}) {
  const { t } = useI18n();

  return (
    <div
      className="relative z-50 flex items-center justify-between px-3 py-1.5 bg-surface-container-lowest border-b border-outline-variant/20 shrink-0 text-xs select-none shadow-2xs flex-nowrap gap-2"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {/* Zone 1: Left - Dự án Selector & Auto-save Indicator */}
      <div className="flex items-center gap-2 shrink-0 font-medium text-on-surface-variant select-none cursor-default" style={{ WebkitAppRegion: 'no-drag' }}>
        {leftToggleBtn}

        {/* Project Selector Button (Mở danh sách các dự án đang làm để chuyển đổi hoặc tạo mới) */}
        <button
          type="button"
          onClick={() => {
            loadProjectsList?.();
            setShowProjectModal?.(true);
          }}
          disabled={isTranslating}
          style={{ WebkitAppRegion: 'no-drag' }}
          className="h-7 px-2.5 rounded-full border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs shrink-0 max-w-[200px] hover:border-primary/40 whitespace-nowrap"
          data-tooltip={t('translate.studio.projectManageTitle')}
        >
          <span className="material-symbols-outlined text-[15px] text-primary shrink-0">folder_open</span>
          <span className="truncate max-w-[100px] sm:max-w-[130px] text-left font-medium">
            {currentProject?.name || t('translate.studio.projectDefaultName')}
          </span>
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">expand_more</span>
        </button>

        {/* Auto-Save Indicator */}
        {pagesCount > 0 && (
          <div
            className={`text-[11px] h-7 px-2 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap transition-opacity duration-300 ${isSavingSession
              ? 'text-primary bg-primary/10 border border-primary/20'
              : 'text-on-surface-variant/60 hover:text-on-surface-variant'
              }`}
            data-tooltip={isSavingSession ? t('translate.studio.projectAutoSaving') : t('translate.studio.projectAutoSaved')}
          >
            <span className={`material-symbols-outlined text-[13px] ${isSavingSession ? 'animate-spin' : ''}`}>
              {isSavingSession ? 'sync' : 'cloud_done'}
            </span>
            <span className="text-[10px] font-medium hidden sm:inline">
              {isSavingSession ? t('translate.studio.savingLabel') : t('translate.studio.savedLabel')}
            </span>
          </div>
        )}
      </div>

      {/* Zone 2: Center - Action Buttons Group (Model Selector, Run Button, Đối chiếu, Xuất file) */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-1" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Provider / Model Selector Pill */}
        <div ref={modelPickerRef} className="relative shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            type="button"
            onClick={() => {
              if (!showModelDropdown) {
                refreshLocalEngines?.();
              }
              setShowModelDropdown?.(!showModelDropdown);
            }}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="h-7 px-2.5 rounded-full border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface shadow-2xs flex items-center gap-1.5 cursor-pointer text-xs font-medium transition-all shrink-0 whitespace-nowrap"
            data-tooltip={t('translate.studio.providerTooltip', { name: activeProviderInfo?.name, status: activeProviderInfo?.statusText })}
          >
            <span className="text-xs select-none shrink-0">{activeProviderInfo?.icon}</span>
            <span className="font-semibold text-on-surface truncate max-w-[90px] sm:max-w-[120px]">
              {activeProviderInfo?.shortName || displayModelName}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${activeProviderInfo?.status === 'online'
                ? 'bg-emerald-500 animate-pulse'
                : activeProviderInfo?.status === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-error'
                }`}
              data-tooltip={activeProviderInfo?.statusText}
            />
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant/70">keyboard_arrow_down</span>
          </button>

          {showModelDropdown && (
            <div
              className="absolute left-0 top-full mt-1.5 w-80 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-2.5 z-[100] space-y-2.5 animate-fadeIn text-on-surface"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              {/* Active Info Header */}
              <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20 text-xs font-bold text-on-surface">
                <div className="flex items-center gap-1.5 truncate">
                  <span>{activeProviderInfo?.icon}</span>
                  <span className="truncate">{activeProviderInfo?.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${activeProviderInfo?.status === 'online'
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : activeProviderInfo?.status === 'warning'
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-error/15 text-error'
                      }`}
                  >
                    {activeProviderInfo?.statusText}
                  </span>
                  {!activeProviderInfo?.isReady && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRightTab?.('settings');
                        setShowModelDropdown?.(false);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 font-bold cursor-pointer transition-colors"
                      data-tooltip={t('translate.studio.openSettingsAddKey')}
                    >
                      + Key
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: Cloud Providers */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider px-1">
                  {t('translate.studio.cloudProvidersGroup')}
                </div>
                {cloudProviders.map((p) => {
                  const isSelected = activeProvider === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`w-full p-1.5 rounded-xl text-xs flex items-center justify-between gap-1.5 transition-colors ${isSelected
                        ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                        : p.isReady
                          ? 'hover:bg-surface-container-high text-on-surface'
                          : 'opacity-50 text-on-surface-variant bg-surface-container/20'
                        }`}
                    >
                      <button
                        type="button"
                        disabled={!p.isReady}
                        onClick={() => {
                          const targetModel = settings?.providers?.[p.id]?.defaultModel || p.defaultModel;
                          handleUpdateSetting?.({
                            translationProvider: p.id,
                            ...(targetModel ? { activeModel: targetModel } : {}),
                          });
                          setShowModelDropdown?.(false);
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className={`flex items-center gap-1.5 min-w-0 flex-1 text-left ${p.isReady ? 'cursor-pointer' : 'cursor-not-allowed'
                          }`}
                        data-tooltip={p.isReady ? p.name : t('translate.studio.cloudProviderNotConfigured', { name: p.name })}
                      >
                        <span className="text-sm shrink-0">{p.icon}</span>
                        <span className="truncate">{p.name}</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
                        {p.isReady ? (
                          <>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                              {p.badge}
                            </span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[15px] text-primary font-bold">check</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                              {t('translate.studio.badgeMissingKey')}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRightTab?.('settings');
                                setShowModelDropdown?.(false);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 hover:bg-primary/25 text-primary font-bold cursor-pointer transition-colors"
                              data-tooltip={t('translate.studio.openSettingsAddKey')}
                            >
                              + Key
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Section 2: Local Models */}
              <div className="space-y-1 pt-1 border-t border-outline-variant/20">
                <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider px-1">
                  <span>{t('translate.studio.localLlmGroup')}</span>
                  <span className={isLocalOnline ? 'text-emerald-600 font-semibold flex items-center gap-1' : 'text-amber-600 font-medium flex items-center gap-1'}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isLocalOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    {isLocalOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                {localModels.length === 0 ? (
                  <div className="p-2.5 text-center text-xs text-on-surface-variant">
                    {t('translate.studio.noLocalModels', { defaultValue: 'Chưa có mô hình Local nào trong máy' })}
                  </div>
                ) : (
                  localModels.map((m) => {
                    const isSelected =
                      (activeProvider === 'openai_compatible' || activeProvider === 'ollama' || activeProvider === 'lmstudio') &&
                      (currentModelId === m.id || currentModelId === m.name);
                    return (
                      <div
                        key={m.id}
                        className={`w-full p-1.5 rounded-xl text-xs flex items-center justify-between gap-1.5 transition-colors ${isSelected
                          ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                          : m.isReady
                            ? 'hover:bg-surface-container-high text-on-surface'
                            : 'opacity-50 text-on-surface-variant bg-surface-container/20'
                          }`}
                      >
                        <button
                          type="button"
                          disabled={!m.isReady}
                          onClick={() => {
                            const updatedProviders = {
                              ...(settings?.providers || {}),
                              ollama: {
                                ...(settings?.providers?.ollama || {}),
                                defaultModel: m.id,
                              },
                            };
                            delete updatedProviders.openai_compatible;

                            handleUpdateSetting?.({
                              translationProvider: 'ollama',
                              activeModel: m.id,
                              apiKeys: {
                                ...settings?.apiKeys,
                                openaiCompatible: {
                                  ...settings?.apiKeys?.openaiCompatible,
                                  model: m.id,
                                  endpoint: settings?.apiKeys?.openaiCompatible?.endpoint || 'http://localhost:11434/v1',
                                },
                              },
                              providers: updatedProviders,
                            });
                            setShowModelDropdown?.(false);
                          }}
                          style={{ WebkitAppRegion: 'no-drag' }}
                          className={`flex items-center gap-1.5 min-w-0 flex-1 text-left ${m.isReady ? 'cursor-pointer' : 'cursor-not-allowed'
                            }`}
                          data-tooltip={
                            !isLocalOnline
                              ? t('translate.studio.localLlmOff')
                              : t('translate.studio.localLlmSelect', { name: m.name })
                          }
                        >
                          <span className="text-sm shrink-0">🤖</span>
                          <span className="truncate">{m.name}</span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                            {m.badge}
                          </span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[15px] text-primary font-bold">check</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer link to settings */}
              <div className="pt-1.5 border-t border-outline-variant/20 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRightTab?.('settings');
                    setShowModelDropdown?.(false);
                  }}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="text-[11px] text-primary hover:text-primary/80 hover:bg-primary/8 px-1.5 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer font-medium transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">tune</span>
                  <span>{t('translate.studio.openSettingsOcr')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Run Button & Dropdown for Batch Run */}
        {isTranslating ? (
          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
            <div
              className="px-3.5 py-1 rounded-full bg-primary text-on-primary font-semibold text-xs flex items-center gap-1.5 shadow-sm animate-pulse"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
              <span>
                {translateProgress?.imageIndex !== undefined && translateProgress?.total
                  ? t('translate.studio.runningProgress', { current: translateProgress.imageIndex + 1, total: translateProgress.total })
                  : t('translate.studio.running')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelTranslate}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="px-2.5 py-1 rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-error/10 hover:text-error text-xs font-medium cursor-pointer transition-all shadow-xs"
              data-tooltip={t('translate.studio.stopTitle')}
            >
              {t('translate.studio.stop')}
            </button>
          </div>
        ) : (
          <div
            ref={runDropdownRef}
            className="relative inline-flex items-center rounded-full bg-primary hover:brightness-110 shadow-sm text-on-primary transition-all shrink-0 whitespace-nowrap h-7"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <button
              type="button"
              onClick={defaultRunAction?.run}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="h-7 px-2.5 rounded-l-full font-semibold text-xs flex items-center gap-1 cursor-pointer hover:bg-black/10 transition-colors whitespace-nowrap"
              data-tooltip={
                isAutoModeEnabled
                  ? `${defaultRunAction?.buttonTitle} — ⚡ ${t('translate.studio.auto100')}: ${activeOutputDir || ''}`
                  : defaultRunAction?.buttonTitle
              }
            >
              <span className="material-symbols-outlined text-[15px]">{defaultRunAction?.icon}</span>
              <span>{defaultRunAction?.buttonLabel}</span>
              {isAutoModeEnabled && (
                <span className="px-1 py-0.2 rounded-full bg-amber-400 text-amber-950 text-[9px] font-extrabold tracking-wide uppercase shadow-2xs ml-0.5">
                  Auto
                </span>
              )}
            </button>
            <div className="w-px h-3.5 bg-on-primary/20" />
            <button
              type="button"
              onClick={() => setShowRunDropdown?.(!showRunDropdown)}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="h-7 px-1 rounded-r-full cursor-pointer hover:bg-black/10 transition-colors flex items-center justify-center"
              data-tooltip={t('translate.studio.optionsTitle')}
            >
              <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
            </button>

            {showRunDropdown && (
              <div
                className="absolute right-0 top-full mt-1.5 w-80 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-2.5 z-[100] text-xs space-y-1.5 animate-fadeIn text-on-surface select-none whitespace-normal"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <div className="px-1 pb-1 border-b border-outline-variant/20 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <span>{t('translate.studio.optionsTitle')}</span>
                </div>

                <div className="space-y-1">
                  {orderedRunActions.map((action, idx) => {
                    const isDefault = idx === 0;
                    const isDragging = draggedRunActionId === action.id;
                    const isDragOver = dragOverRunActionId === action.id && draggedRunActionId !== action.id;

                    return (
                      <div
                        key={action.id}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          if (isRunActionDraggingRef) isRunActionDraggingRef.current = true;
                          setDraggedRunActionId?.(action.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverRunActionId !== action.id) {
                            setDragOverRunActionId?.(action.id);
                          }
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          if (dragOverRunActionId !== action.id) {
                            setDragOverRunActionId?.(action.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverRunActionId === action.id) {
                            setDragOverRunActionId?.(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedRunActionId && draggedRunActionId !== action.id) {
                            handleReorderRunAction?.(draggedRunActionId, action.id);
                          }
                          setDraggedRunActionId?.(null);
                          setDragOverRunActionId?.(null);
                          setTimeout(() => {
                            if (isRunActionDraggingRef) isRunActionDraggingRef.current = false;
                          }, 120);
                        }}
                        onDragEnd={() => {
                          setDraggedRunActionId?.(null);
                          setDragOverRunActionId?.(null);
                          setTimeout(() => {
                            if (isRunActionDraggingRef) isRunActionDraggingRef.current = false;
                          }, 120);
                        }}
                        onClick={() => {
                          if (isRunActionDraggingRef?.current) return;
                          setShowRunDropdown?.(false);
                          action.run?.();
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${isDragging
                          ? 'opacity-30 scale-95 border border-dashed border-primary bg-primary/5'
                          : isDragOver
                            ? 'border-t-2 border-primary bg-primary/10'
                            : isDefault
                              ? 'bg-primary/8 border border-primary/25 hover:bg-primary/15'
                              : 'hover:bg-surface-container-high border border-transparent'
                          }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className="text-on-surface-variant/40 hover:text-on-surface cursor-grab active:cursor-grabbing shrink-0"
                            data-tooltip={t('translate.studio.dragReorderHint')}
                          >
                            <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
                          </div>
                          <span className={`material-symbols-outlined text-[18px] shrink-0 ${action.iconColor}`}>
                            {action.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-xs text-on-surface truncate">{action.title}</p>
                              {isDefault && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary text-on-primary font-bold tracking-wide shrink-0">
                                  {t('translate.studio.defaultBadge')}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-on-surface-variant truncate">{action.subtitle}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selective Pipeline: Chạy từng bước riêng biệt chuẩn Koharu */}
                <div className="pt-2 mt-1 border-t border-outline-variant/20 space-y-1">
                  <div className="px-1 pb-0.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>{t('translate.studio.selectiveSteps')}</span>
                  </div>

                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRunDropdown?.(false);
                        handleRunDetection?.();
                      }}
                      style={{ WebkitAppRegion: 'no-drag' }}
                      className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                      data-tooltip={t('translate.studio.runDetectionTitle')}
                    >
                      <span className="material-symbols-outlined text-[17px] text-blue-500 shrink-0 group-hover/step:scale-110 transition-transform">
                        crop_free
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runDetection')}</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runDetectionSub')}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRunDropdown?.(false);
                        handleRunOCR?.();
                      }}
                      style={{ WebkitAppRegion: 'no-drag' }}
                      className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                      data-tooltip={t('translate.studio.runOcrTitle')}
                    >
                      <span className="material-symbols-outlined text-[17px] text-emerald-500 shrink-0 group-hover/step:scale-110 transition-transform">
                        document_scanner
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runOcr')}</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runOcrSub')}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRunDropdown?.(false);
                        handleRunTranslation?.();
                      }}
                      style={{ WebkitAppRegion: 'no-drag' }}
                      className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                      data-tooltip={t('translate.studio.runTranslationTitle')}
                    >
                      <span className="material-symbols-outlined text-[17px] text-primary shrink-0 group-hover/step:scale-110 transition-transform">
                        translate
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runTranslation')}</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runTranslationSub')}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRunDropdown?.(false);
                        handleRunInpainting?.();
                      }}
                      style={{ WebkitAppRegion: 'no-drag' }}
                      className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                      data-tooltip={t('translate.studio.runInpaintingTitle')}
                    >
                      <span className="material-symbols-outlined text-[17px] text-purple-500 shrink-0 group-hover/step:scale-110 transition-transform">
                        brush
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runInpainting')}</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runInpaintingSub')}</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="pt-2 mt-0.5 border-t border-outline-variant/20 px-1 text-[10px] text-on-surface-variant/80 flex items-start gap-1.5 leading-normal whitespace-normal break-words">
                  <span className="material-symbols-outlined text-[13px] text-primary shrink-0 mt-0.5">info</span>
                  <span className="flex-1 min-w-0 break-words">{t('translate.studio.dragReorderHint')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Option: Chế độ Tự Động Hoá 100% (Auto Mode Checkbox & Quick Config) */}
        <div
          className={`h-7 px-2 rounded-full border flex items-center gap-1 text-xs font-semibold shadow-2xs transition-all shrink-0 whitespace-nowrap ${isAutoModeEnabled
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-amber-500/10'
            : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant'
            }`}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <label
            className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
            data-tooltip={
              isAutoModeEnabled
                ? t('translate.studio.auto100TitleOn')
                : t('translate.studio.auto100TitleOff')
            }
          >
            <input
              type="checkbox"
              checked={isAutoModeEnabled}
              onChange={(e) => toggleAutoMode?.(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
            />
            <span className={`material-symbols-outlined text-[15px] ${isAutoProcessing ? 'text-amber-500 animate-spin' : 'text-amber-500'}`}>
              {isAutoProcessing ? 'sync' : 'auto_mode'}
            </span>
            <span className={`text-xs ${isAutoModeEnabled ? 'font-bold text-amber-700 dark:text-amber-300' : 'font-medium text-on-surface'}`}>
              {isAutoProcessing ? `Auto (${autoProgress?.percent ?? 0}%)` : t('translate.studio.auto100')}
            </span>
          </label>

          {/* Quick Config Icon: Mở Cấu hình Thư mục Đầu ra & Nâng cao */}
          <button
            type="button"
            onClick={() => setShowAutoModal?.(true)}
            className="w-5 h-5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer text-on-surface-variant hover:text-on-surface"
            data-tooltip={t('translate.studio.openAutoModal')}
          >
            <span className="material-symbols-outlined text-[13px]">settings</span>
          </button>
        </div>

        {/* Nút Mở Bảng Đối Chiếu Dịch Thuật & Soát Lỗi */}
        <button
          type="button"
          onClick={() => setShowComparisonModal?.(true)}
          style={{ WebkitAppRegion: 'no-drag' }}
          className={`h-7 px-2.5 rounded-full border flex items-center gap-1 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 whitespace-nowrap ${residualLayersCount > 0
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
            : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface'
            }`}
          data-tooltip={t('translate.studio.comparisonTableTitle')}
        >
          <span className={`material-symbols-outlined text-[15px] ${residualLayersCount > 0 ? 'text-amber-500' : 'text-primary'}`}>
            table_chart
          </span>
          <span>{t('translate.studio.comparisonTable')} ({layersCount})</span>
          {residualLayersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white dark:text-amber-950 text-[10px] font-bold">
              {residualLayersCount}
            </span>
          )}
        </button>

        {/* Primary Action Button: "Xuất file" (Export) with Split Dropdown */}
        <div ref={exportDropdownRef} className="relative flex items-center shrink-0 whitespace-nowrap" style={{ WebkitAppRegion: 'no-drag' }}>
          {/* Main Export Button */}
          <button
            type="button"
            disabled={isExporting || !activePage}
            onClick={handleExportCurrentPage}
            className="h-7 px-2.5 rounded-l-full bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            data-tooltip={t('translate.studio.exportCurrentPage')}
          >
            {isExporting ? (
              <>
                <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                <span>...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[15px]">file_download</span>
                <span>{t('translate.studio.exportMenu')}</span>
              </>
            )}
          </button>

          {/* Split Arrow Dropdown Button */}
          <button
            type="button"
            disabled={isExporting || pagesCount === 0}
            onClick={() => setShowExportDropdown?.((prev) => !prev)}
            className="h-7 px-1 rounded-r-full border-l border-white/20 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            data-tooltip={t('translate.studio.exportMenu')}
          >
            <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
          </button>

          {/* Export Dropdown Menu */}
          {showExportDropdown && (
            <div
              className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-1.5 z-[100] text-xs space-y-1 animate-fadeIn text-on-surface"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <button
                type="button"
                disabled={!activePage || isExporting}
                onClick={() => {
                  setShowExportDropdown?.(false);
                  handleExportCurrentPage?.();
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
              >
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">image</span>
                <div>
                  <p className="font-bold text-xs text-on-surface">{t('translate.studio.exportCurrentPage')}</p>
                  <p className="text-[10px] text-on-surface-variant truncate max-w-[190px]">
                    {activePage?.filename ? t('translate.studio.pageColon', { name: activePage.filename }) : ''}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={pagesCount === 0 || isExporting}
                onClick={() => {
                  setShowExportDropdown?.(false);
                  handleExportAllChapter?.();
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
              >
                <span className="material-symbols-outlined text-teal-500 text-[18px]">folder_zip</span>
                <div>
                  <p className="font-bold text-xs text-on-surface">{t('translate.studio.exportAllPages')}</p>
                  <p className="text-[10px] text-on-surface-variant">{t('translate.studio.actionAllChapterSub', { count: pagesCount })}</p>
                </div>
              </button>

              <button
                type="button"
                disabled={pagesCount === 0 || isExporting}
                onClick={() => {
                  setShowExportDropdown?.(false);
                  handleExportCbz?.();
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
              >
                <span className="material-symbols-outlined text-primary text-[18px]">archive</span>
                <div>
                  <p className="font-bold text-xs text-on-surface">{t('translate.studio.menuPackCbz')}</p>
                  <p className="text-[10px] text-on-surface-variant">{t('translate.studio.menuPackCbzSub')}</p>
                </div>
              </button>

              <div className="h-px bg-outline-variant/20 my-1" />

              <button
                type="button"
                disabled={!activePage}
                onClick={() => {
                  setShowExportDropdown?.(false);
                  handleOpenFolder?.();
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">folder_open</span>
                <div>
                  <p className="font-bold text-xs text-on-surface">{t('translate.studio.menuOpenFolder')}</p>
                  <p className="text-[10px] text-on-surface-variant">{t('translate.studio.menuOpenFolderSub')}</p>
                </div>
              </button>

              <div className="h-px bg-outline-variant/20 my-1" />

              {/* Tùy chọn tự động mở thư mục khi xuất xong */}
              <label
                style={{ WebkitAppRegion: 'no-drag' }}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer select-none"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-primary">folder_managed</span>
                  <span>{t('translate.studio.autoOpenFolder')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={autoOpenExportFolder}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoOpenExportFolder?.(val);
                    try {
                      localStorage.setItem('manga_studio_auto_open_export_folder', String(val));
                    } catch { }
                  }}
                  className="accent-primary w-3.5 h-3.5 rounded cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Right - Tab Switcher (Khung thoại, Quy trình, Cài đặt) + Toggle Sidebar + Close */}
      <div className="flex items-center justify-end gap-1.5 shrink-0 whitespace-nowrap" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Segmented control: [ 💬 Khung thoại ] [ 📋 Quy trình ] [ ⚙️ Cài đặt ] + [ ◨ Ẩn/Hiện thanh bên ] */}
        <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="flex items-center p-0.5 rounded-xl bg-surface-container border border-outline-variant/20 shrink-0 whitespace-nowrap">
            <button
              type="button"
              onClick={() => {
                if (showRightSidebar && activeRightTab === 'properties') {
                  toggleRightSidebar?.(false);
                } else {
                  setActiveRightTab?.('properties');
                  toggleRightSidebar?.(true);
                }
              }}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${showRightSidebar && activeRightTab === 'properties'
                ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              data-tooltip={t('translate.studio.tabPropertiesTitle')}
            >
              <span className="material-symbols-outlined text-[14px]">edit_note</span>
              <span className="whitespace-nowrap">{t('translate.studio.tabProperties')}</span>
              {layersCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono shrink-0 ${showRightSidebar && activeRightTab === 'properties'
                  ? 'bg-primary/15 text-primary font-bold'
                  : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                  {layersCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (showRightSidebar && activeRightTab === 'settings') {
                  toggleRightSidebar?.(false);
                } else {
                  setActiveRightTab?.('settings');
                  toggleRightSidebar?.(true);
                }
              }}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${showRightSidebar && activeRightTab === 'settings'
                ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              data-tooltip={t('translate.studio.tabSettingsTitle')}
              aria-label={t('translate.studio.tabSettingsTitle')}
            >
              <span className="material-symbols-outlined text-[14px]">settings</span>
              <span className="whitespace-nowrap">{t('translate.studio.tabSettings')}</span>
            </button>
          </div>

          {/* Nút chuyên dụng Ẩn / Hiện thanh bên phải */}
          <button
            type="button"
            onClick={() => toggleRightSidebar?.()}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0 ${showRightSidebar
              ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 shadow-2xs'
              : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            data-tooltip={showRightSidebar ? t('translate.studio.rightSidebarHide') : t('translate.studio.rightSidebarShow')}
            aria-label={showRightSidebar ? t('translate.studio.rightSidebarHide') : t('translate.studio.rightSidebarShow')}
          >
            <span className="material-symbols-outlined text-[17px]">
              {showRightSidebar ? 'dock_to_right' : 'view_sidebar'}
            </span>
          </button>

          {/* Nút Trợ giúp & Hướng dẫn Quy trình (?) */}
          <button
            type="button"
            onClick={() => {
              setGuideInitialTab?.('workflow');
              setShowGuideModal?.(true);
            }}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-primary hover:border-primary/30 hover:bg-primary/5 shadow-2xs shrink-0 font-bold"
            data-tooltip={t('translate.studio.helpBtnTitle')}
            aria-label={t('translate.studio.helpBtnTitle')}
          >
            <span className="material-symbols-outlined text-[17px]">help</span>
          </button>
        </div>

        {/* Close Studio / Exit — chỉ hiển thị khi không phải standalone view */}
        {!isStandaloneView && typeof onClose === 'function' && (
          <button
            type="button"
            onClick={onClose}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors cursor-pointer shrink-0"
            data-tooltip={t('translate.studio.exitStudio')}
            aria-label={t('translate.studio.exitStudio')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>
    </div>
  );
}

