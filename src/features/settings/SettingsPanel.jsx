import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useTheme } from '../../context/ThemeContext';
import { StudioLayout, useStudioLayout, SearchableSelect, AdminContactLinks, SectionTitle } from '../../shared';
import ChapterFolderControls from './ChapterFolderControls.jsx';
import UserDataBackupSection from './UserDataBackupSection.jsx';
import UpdateChecker from './UpdateChecker.jsx';
import ThemeCardPicker from './ThemeCardPicker.jsx';
import BrandingSettingsSection from './BrandingSettingsSection.jsx';
import { ExtrasSettingsSection } from '../extras';
import { SiteCookieSection } from '../download';
import { loadSavedWorkflows } from '../workflow/utils/workflowStorage.mjs';
import {
  FAVORITE_AUTO_CHECK_INTERVAL_PRESETS,
  formatFavoriteAutoCheckInterval,
  formatFavoriteAutoCheckLastAt,
} from '../../utils/appSettings';
import { publicAsset } from '../../utils/publicAsset';
import packageJson from '../../../package.json';

/**
 * SettingsSectionCard — Thẻ cài đặt có header bo góc, icon và nút thu gọn/mở rộng (mặc định mở).
 */
function SettingsSectionCard({
  id,
  icon,
  title,
  subtitle,
  children,
  isCollapsed = false,
  onToggle,
  refTarget,
  className = '',
}) {
  const { t } = useI18n();

  return (
    <section
      id={id}
      ref={refTarget}
      className={`rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 shadow-xs transition-all duration-200 ${
        isCollapsed ? 'p-4' : 'p-5 space-y-5'
      } ${className}`}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        className={`flex items-center justify-between gap-3 select-none cursor-pointer transition-colors group ${
          isCollapsed ? '' : 'pb-3 border-b border-outline-variant/10'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0 transition-transform duration-150 group-hover:scale-105">
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-on-surface tracking-tight truncate group-hover:text-primary transition-colors">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          data-tooltip={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          aria-label={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          className="size-8 rounded-xl border border-outline-variant/20 bg-surface-container-highest/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-150 cursor-pointer shrink-0"
        >
          <span
            className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
              isCollapsed ? 'rotate-0 text-on-surface-variant' : 'text-primary'
            }`}
          >
            {isCollapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {/* Body Content */}
      {!isCollapsed && children}
    </section>
  );
}

/**
 * SettingsPanel — Cài đặt toàn hệ thống với kiến trúc StudioLayout chuẩn 3 cột.
 */
export default function SettingsPanel({
  savePath,
  setSavePath,
  onBrowse,
  threads,
  setThreads,
  autoRetryMax,
  setAutoRetryMax,
  chapterFolder,
  setChapterFolder,
  persistChapterFolder,
  mangadexVolumeFolderGrouping,
  setMangadexVolumeFolderGrouping,
  duplicateScanRecursive,
  setDuplicateScanRecursive,
  favoriteAutoCheckEnabled,
  setFavoriteAutoCheckEnabled,
  favoriteAutoCheckIntervalMin,
  setFavoriteAutoCheckIntervalMin,
  lastFavoriteAutoCheckAt = 0,
  favoritesWatchedCount = 0,
  favoriteAutoDownloadEnabled,
  setFavoriteAutoDownloadEnabled,
  favoriteAutoDownloadMode = 'queue',
  setFavoriteAutoDownloadMode,
  favoriteAutoDownloadWorkflowId = '',
  setFavoriteAutoDownloadWorkflowId,
  checkResult,
  setCheckResult,
  appUpdateState,
  setAppUpdateState,
  appUpdateError,
  setAppUpdateError,
  appUpdateDownloadProgress,
  setAppUpdateDownloadProgress,
  appUpdateDownloadedPath,
  setAppUpdateDownloadedPath,
  autoCheckUpdate = true,
  setAutoCheckUpdate,
  scrollSettingsToUpdate,
  setScrollSettingsToUpdate,
  scrollSettingsToSection,
  setScrollSettingsToSection,

  scrollToUpdate = false,
  onScrollToUpdateDone,
  knownUpdate = null,
}) {
  const { locale, setLocale, t } = useI18n();
  const { themePreference, setThemePreference } = useTheme();

  // StudioLayout integration
  const {
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'settings',
    defaultLeftWidth: 260,
    minLeftWidth: 200,
    maxLeftWidth: 380,
  });

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('settings_active_tab_v1');
      if (
        saved &&
        ['all', 'appearance', 'downloads', 'cookies', 'favorites', 'backup', 'contact', 'update', 'extras'].includes(saved)
      ) {
        return saved;
      }
    } catch {}
    return 'all';
  });

  const [savePathWarning, setSavePathWarning] = useState(false);

  useEffect(() => {
    const trimmed = String(savePath || '').trim();
    if (!trimmed) {
      setSavePathWarning(false);
      return undefined;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.validateSaveDir) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .validateSaveDir(trimmed)
        .then((res) => {
          if (cancelled) return;
          if (res && !res.ok && !res.canCreate) {
            setSavePathWarning(true);
          } else {
            setSavePathWarning(false);
          }
        })
        .catch(() => {
          if (!cancelled) setSavePathWarning(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [savePath]);

  const [searchTerm, setSearchTerm] = useState('');
  const [contactQrFailed, setContactQrFailed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const updateSectionRef = useRef(null);
  const downloadsSectionRef = useRef(null);

  const savedWorkflows = useMemo(() => {
    try {
      return loadSavedWorkflows() || [];
    } catch {
      return [];
    }
  }, []);

  const toggleSection = (id) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isSectionCollapsed = (id) => {
    // Khi người dùng đang tìm kiếm, tự động mở rộng để hiển thị kết quả
    if (searchTerm.trim()) return false;
    return Boolean(collapsedSections[id]);
  };

  const allSectionIds = useMemo(
    () => ['appearance', 'branding', 'downloads', 'cookies', 'favorites', 'backup', 'contact', 'update', 'extras'],
    []
  );

  const isAllCollapsed = useMemo(
    () => allSectionIds.every((id) => Boolean(collapsedSections[id])),
    [allSectionIds, collapsedSections]
  );

  const handleToggleAll = () => {
    if (isAllCollapsed) {
      setCollapsedSections({});
    } else {
      const all = {};
      allSectionIds.forEach((id) => {
        all[id] = true;
      });
      setCollapsedSections(all);
    }
  };

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    try {
      localStorage.setItem('settings_active_tab_v1', tabId);
    } catch {}
  };

  // Scroll to target section support (downloads, update, etc.)
  useEffect(() => {
    const targetSection =
      scrollSettingsToSection ||
      (scrollToUpdate || scrollSettingsToUpdate ? 'update' : null);
    if (!targetSection) return;

    setActiveTab(targetSection);
    try {
      localStorage.setItem('settings_active_tab_v1', targetSection);
    } catch {}

    // Ensure target section is expanded if it was collapsed
    setCollapsedSections((prev) => {
      if (prev[targetSection]) {
        return { ...prev, [targetSection]: false };
      }
      return prev;
    });

    const timer = setTimeout(() => {
      const targetEl =
        targetSection === 'downloads'
          ? downloadsSectionRef.current
          : targetSection === 'update'
            ? updateSectionRef.current
            : document.getElementById(targetSection);
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onScrollToUpdateDone?.();
      setScrollSettingsToUpdate?.(false);
      setScrollSettingsToSection?.(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [
    scrollSettingsToSection,
    scrollToUpdate,
    scrollSettingsToUpdate,
    onScrollToUpdateDone,
    setScrollSettingsToUpdate,
    setScrollSettingsToSection,
  ]);

  const bumpThreads = (delta) => {
    setThreads((prev) => {
      const cur = Math.floor(Number(prev) || 1);
      return Math.max(1, Math.min(5, cur + delta));
    });
  };

  const bumpAutoRetry = (delta) => {
    setAutoRetryMax((prev) => {
      const cur = Math.floor(Number(prev) || 0);
      return Math.max(0, Math.min(10, cur + delta));
    });
  };



  const categories = useMemo(
    () => [
      {
        id: 'all',
        label: t('settings.tab.all'),
        shortLabel: t('settings.tab.all'),
        icon: 'tune',
      },
      {
        id: 'appearance',
        label: t('settings.tab.appearance'),
        shortLabel: t('settings.tab.appearanceShort'),
        icon: 'palette',
        searchable: `${t('settings.tab.appearance')} ${t('settings.section.appearance')} ${t('settings.section.language')} ${t('settings.section.branding')} ${t('settings.branding.appNameLabel')} ${t('settings.branding.iconLabel')} light dark system theme branding icon app name biểu tượng tên`,
      },
      {
        id: 'downloads',
        label: t('settings.tab.downloads'),
        shortLabel: t('settings.tab.downloads'),
        icon: 'download',
        searchable: `${t('settings.tab.downloads')} ${t('sidebar.saveTo')} ${t('sidebar.threads')} ${t('settings.autoRetry.label')} folder`,
      },
      {
        id: 'cookies',
        label: t('settings.tab.cookies'),
        shortLabel: t('settings.tab.cookiesShort'),
        icon: 'cookie',
        searchable: `${t('settings.tab.cookies')} ${t('settings.siteCookies.sectionHint')} cloudflare cookies`,
      },
      {
        id: 'favorites',
        label: t('settings.tab.favorites'),
        shortLabel: t('settings.tab.favorites'),
        icon: 'favorite',
        searchable: `${t('settings.tab.favorites')} ${t('settings.favoritesSyncHint')} ${t('settings.favoritesAutoCheck')}`,
      },
      {
        id: 'backup',
        label: t('settings.tab.backup'),
        shortLabel: t('settings.tab.backupShort'),
        icon: 'backup',
        searchable: `${t('settings.tab.backup')} ${t('settings.backup.hint')} export import reset`,
      },
      {
        id: 'contact',
        label: t('settings.tab.contact'),
        shortLabel: t('settings.tab.contactShort'),
        icon: 'support_agent',
        searchable: `${t('settings.tab.contact')} ${t('donate.headline')} ${t('donate.scanHint')} zalo telegram facebook qr donate admin`,
      },
      {
        id: 'update',
        label: t('settings.tab.update'),
        shortLabel: t('settings.tab.updateShort'),
        icon: 'system_update',
        hasBadge: Boolean(checkResult?.hasUpdate || appUpdateState === 'available' || knownUpdate?.hasUpdate),
        searchable: `${t('settings.tab.update')} ${packageJson.version} ${checkResult?.version || ''} update changelog`,
      },
      {
        id: 'extras',
        label: t('extras.settings.title'),
        shortLabel: t('extras.settings.navShort'),
        icon: 'smart_toy',
        searchable: `${t('extras.settings.title')} ${t('extras.settings.subtitle')} ${t('extras.settings.desc')} ai upscale onnx`,
      },
    ],
    [t, checkResult, appUpdateState, knownUpdate]
  );

  const isCardVisible = (cardId, searchableText = '') => {
    if (!searchTerm.trim()) {
      return activeTab === 'all' || activeTab === cardId;
    }
    const term = searchTerm.trim().toLowerCase();
    return searchableText.toLowerCase().includes(term);
  };

  const hasVisibleCards = useMemo(() => {
    return categories
      .filter((c) => c.id !== 'all')
      .some((c) => isCardVisible(c.id, c.searchable || ''));
  }, [categories, activeTab, searchTerm]);

  return (
    <StudioLayout>
      {/* Main Workspace Body */}
      <StudioLayout.Body>
        {/* Left Sidebar: Navigation & Category Filters */}
        <StudioLayout.LeftSidebar
          open={true}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3 mr-1.5 flex flex-col h-full space-y-3 overflow-y-auto custom-scrollbar">
            {/* Search Box */}
            <div className="relative shrink-0">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('settings.searchPlaceholder')}
                className="w-full h-10 pl-9 pr-8 rounded-xl bg-surface-container-highest border border-outline-variant/25 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/70 pointer-events-none">
                search
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface cursor-pointer p-0.5"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Category Navigation Menu */}
            <div className="space-y-1 flex-1">
              {categories.map((cat) => {
                const isActive = activeTab === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectTab(cat.id)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer select-none ${
                      isActive
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`material-symbols-outlined text-[18px] shrink-0 ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {cat.icon}
                      </span>
                      <span className="truncate">{cat.label}</span>
                    </div>
                    {cat.hasBadge && (
                      <span className="size-2 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Open Source Info Card */}
            <div className="mt-auto pt-3 border-t border-outline-variant/15 shrink-0">
              <div className="rounded-xl p-3 bg-surface-container-high/60 border border-outline-variant/15 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-on-surface truncate">Manga Crawler</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                    {t('settings.openSourceBadge')}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-tight">
                  {t('settings.openSourceHint')}
                </p>
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant/70 pt-1.5 border-t border-outline-variant/10">
                  <span>MIT License</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/20">
                    v{packageJson.version}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content Area */}
        <StudioLayout.Content>
          <div className="h-full overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-4xl mx-auto space-y-6 pb-12">
              {/* Category Bar with Collapse / Expand All */}
              {hasVisibleCards && (
                <div className="flex items-center justify-between pb-1 select-none">
                  <SectionTitle as="span">
                    {activeTab === 'all' ? t('settings.tab.all') : categories.find((c) => c.id === activeTab)?.label}
                  </SectionTitle>
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isAllCollapsed ? 'unfold_more' : 'unfold_less'}
                    </span>
                    <span>{isAllCollapsed ? t('settings.expandAll') : t('settings.collapseAll')}</span>
                  </button>
                </div>
              )}

              {!hasVisibleCards ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <div className="size-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant/60">
                    <span className="material-symbols-outlined text-[32px]">search_off</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface">
                    {t('settings.noMatchingSettings')}
                  </h3>
                  <p className="text-xs text-on-surface-variant max-w-sm">
                    {t('settings.noMatchingSettingsHint')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      handleSelectTab('all');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    <span>{t('settings.tab.all')}</span>
                  </button>
                </div>
              ) : null}

              {/* 1. Appearance & Language */}
              {isCardVisible('appearance', categories.find((c) => c.id === 'appearance')?.searchable) ? (
                <SettingsSectionCard
                  id="appearance"
                  icon="palette"
                  title={t('settings.tab.appearance')}
                  isCollapsed={isSectionCollapsed('appearance')}
                  onToggle={() => toggleSection('appearance')}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
                      <SectionTitle as="label" className="block">
                        {t('settings.section.appearance')}
                      </SectionTitle>
                      <SearchableSelect
                        value={themePreference}
                        onChange={(v) => {
                          if (v === 'light' || v === 'dark' || v === 'system') setThemePreference(v);
                        }}
                        options={[
                          { value: 'light', label: t('settings.theme.light') },
                          { value: 'dark', label: t('settings.theme.dark') },
                          { value: 'system', label: t('settings.theme.system') },
                        ]}
                        placeholder=""
                        className="w-full"
                      />
                    </div>

                    <div
                      data-testid="language-setting-card"
                      className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10"
                    >
                      <SectionTitle as="label" className="block">
                        {t('settings.section.language')}
                      </SectionTitle>
                      <SearchableSelect
                        value={locale}
                        onChange={(v) => setLocale(v === 'vi' ? 'vi' : 'en')}
                        options={[
                          { value: 'en', label: t('settings.language.en') },
                          { value: 'vi', label: t('settings.language.vi') },
                        ]}
                        placeholder=""
                        className="w-full"
                      />
                    </div>
                  </div>

                  <ThemeCardPicker />
                </SettingsSectionCard>
              ) : null}

              {/* 2.1 App Branding (Name & Icon) */}
              {isCardVisible('appearance', categories.find((c) => c.id === 'appearance')?.searchable) ? (
                <BrandingSettingsSection
                  isCollapsed={isSectionCollapsed('branding')}
                  onToggleCollapse={() => toggleSection('branding')}
                />
              ) : null}

              {/* 3. Downloads & Storage */}
              {isCardVisible('downloads', categories.find((c) => c.id === 'downloads')?.searchable) ? (
                <SettingsSectionCard
                  id="downloads"
                  refTarget={downloadsSectionRef}
                  icon="download"
                  title={t('settings.tab.downloads')}
                  subtitle={t('settings.downloadsHint')}
                  isCollapsed={isSectionCollapsed('downloads')}
                  onToggle={() => toggleSection('downloads')}
                >
                  <div className="space-y-4">
                    {/* Save Path */}
                    <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
                      <SectionTitle as="label" className="block">
                        {t('sidebar.saveTo')}
                      </SectionTitle>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 flex items-center min-w-0">
                          <input
                            type="text"
                            value={savePath}
                            onChange={(e) => setSavePath(e.target.value)}
                            placeholder={t('sidebar.placeholder.savePath')}
                            className={`w-full min-w-0 bg-surface-container-highest border ${
                              savePathWarning
                                ? 'border-amber-500/60 ring-1 ring-amber-500/50 pr-8'
                                : 'border-outline-variant/25 focus:border-primary focus:ring-1 focus:ring-primary pr-3'
                            } rounded-xl text-xs h-10 pl-3 text-on-surface outline-none transition-all`}
                          />
                          {savePathWarning && (
                            <span
                              data-tooltip={t('sidebar.warning.invalidSavePath')}
                              className="material-symbols-outlined text-[18px] text-amber-500 absolute right-2.5 pointer-events-auto cursor-help select-none shrink-0"
                            >
                              warning
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={onBrowse}
                          className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[18px] text-primary">folder_open</span>
                          <span>{t('sidebar.browse')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Chapter Folder Controls */}
                    <ChapterFolderControls
                      chapterFolder={chapterFolder}
                      setChapterFolder={setChapterFolder}
                      persistChapterFolder={persistChapterFolder}
                      mangadexVolumeFolderGrouping={mangadexVolumeFolderGrouping}
                      setMangadexVolumeFolderGrouping={setMangadexVolumeFolderGrouping}
                    />

                    {/* Parallel Threads & Auto Retry */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 flex flex-col justify-between">
                        <div className="space-y-2">
                          <SectionTitle as="label" className="block">
                            {t('sidebar.threads')}
                          </SectionTitle>
                          <div className="flex h-10 w-full rounded-xl bg-surface-container-highest border border-outline-variant/25 box-border ring-1 ring-transparent focus-within:border-primary focus-within:ring-primary overflow-hidden">
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={threads}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setThreads(Number.isFinite(n) ? Math.max(1, Math.min(Math.floor(n), 5)) : 5);
                              }}
                              className="flex-1 min-w-0 border-none bg-transparent text-xs px-3 text-on-surface tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="flex flex-col w-8 shrink-0 border-l border-outline-variant/20">
                              <button
                                type="button"
                                aria-label={t('sidebar.threadUp')}
                                disabled={threads >= 5}
                                onClick={() => bumpThreads(1)}
                                className="flex-1 flex items-center justify-center min-h-0 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none">keyboard_arrow_up</span>
                              </button>
                              <button
                                type="button"
                                aria-label={t('sidebar.threadDown')}
                                disabled={threads <= 1}
                                onClick={() => bumpThreads(-1)}
                                className="flex-1 flex items-center justify-center min-h-0 border-t border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none">keyboard_arrow_down</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-on-surface-variant/80 leading-relaxed mt-1">
                          {t('settings.threadsHint')}
                        </p>
                      </div>

                      <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 flex flex-col justify-between">
                        <div className="space-y-2">
                          <SectionTitle as="label" className="block">
                            {t('settings.autoRetry.label')}
                          </SectionTitle>
                          <div className="flex h-10 w-full rounded-xl bg-surface-container-highest border border-outline-variant/25 box-border ring-1 ring-transparent focus-within:border-primary focus-within:ring-primary overflow-hidden">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={autoRetryMax}
                              onChange={(e) => {
                                const v = e.target.value;
                                setAutoRetryMax(Math.max(0, Math.min(10, Math.floor(Number(v) || 0))));
                              }}
                              className="flex-1 min-w-0 border-none bg-transparent text-xs px-3 text-on-surface tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="flex flex-col w-8 shrink-0 border-l border-outline-variant/20">
                              <button
                                type="button"
                                disabled={autoRetryMax >= 10}
                                onClick={() => bumpAutoRetry(1)}
                                className="flex-1 flex items-center justify-center min-h-0 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none">keyboard_arrow_up</span>
                              </button>
                              <button
                                type="button"
                                disabled={autoRetryMax <= 0}
                                onClick={() => bumpAutoRetry(-1)}
                                className="flex-1 flex items-center justify-center min-h-0 border-t border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none">keyboard_arrow_down</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-on-surface-variant/80 leading-relaxed mt-1">
                          {t('settings.autoRetry.hint')}
                        </p>
                      </div>
                    </div>
                  </div>
                </SettingsSectionCard>
              ) : null}

              {/* 4. Site Cookies */}
              {isCardVisible('cookies', categories.find((c) => c.id === 'cookies')?.searchable) ? (
                <SettingsSectionCard
                  id="cookies"
                  icon="cookie"
                  title={t('settings.tab.cookies')}
                  subtitle={t('settings.siteCookies.sectionHint')}
                  isCollapsed={isSectionCollapsed('cookies')}
                  onToggle={() => toggleSection('cookies')}
                >
                  <SiteCookieSection />
                </SettingsSectionCard>
              ) : null}

              {/* 5. Favorites Sync */}
              {isCardVisible('favorites', categories.find((c) => c.id === 'favorites')?.searchable) ? (
                <SettingsSectionCard
                  id="favorites"
                  icon="favorite"
                  title={t('settings.tab.favorites')}
                  subtitle={t('settings.favoritesSyncHint')}
                  isCollapsed={isSectionCollapsed('favorites')}
                  onToggle={() => toggleSection('favorites')}
                >
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer select-none max-w-full p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
                      <input
                        type="checkbox"
                        checked={Boolean(favoriteAutoCheckEnabled)}
                        onChange={(e) => setFavoriteAutoCheckEnabled?.(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-outline-variant accent-primary shrink-0"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-on-surface block leading-snug">
                          {t('settings.favoritesAutoCheck')}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block leading-snug">
                          {t('settings.favoritesSyncHint')}
                        </span>
                      </div>
                    </label>

                    {favoriteAutoCheckEnabled ? (
                      <div className="p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 space-y-3 max-w-lg">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-on-surface-variant rounded-lg bg-surface-container-low/70 border border-outline-variant/15 px-3 py-2">
                          <span className="inline-flex items-start gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">schedule</span>
                            <span className="leading-snug break-words">
                              {t('settings.favoritesAutoCheckStatusSummary', {
                                count: favoritesWatchedCount,
                                last: formatFavoriteAutoCheckLastAt(lastFavoriteAutoCheckAt, t),
                              })}
                            </span>
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <SectionTitle as="span" className="block">
                            {t('settings.favoritesAutoCheckPresets')}
                          </SectionTitle>
                          <div className="flex flex-wrap gap-1.5">
                            {FAVORITE_AUTO_CHECK_INTERVAL_PRESETS.map((presetMin) => {
                              const isSelected = Number(favoriteAutoCheckIntervalMin) === presetMin;
                              return (
                                <button
                                  key={presetMin}
                                  type="button"
                                  onClick={() => setFavoriteAutoCheckIntervalMin?.(presetMin)}
                                  className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'border-primary bg-primary/15 text-primary'
                                      : 'border-outline-variant/25 bg-surface-container-highest/70 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50'
                                  }`}
                                >
                                  {formatFavoriteAutoCheckInterval(presetMin, t)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <SectionTitle as="label" className="shrink-0">
                            {t('settings.favoritesAutoCheckInterval')}
                          </SectionTitle>
                          <span className="text-xs font-semibold text-primary tabular-nums px-2 py-0.5 rounded-md bg-primary/10">
                            {formatFavoriteAutoCheckInterval(favoriteAutoCheckIntervalMin, t)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={1440}
                          step={15}
                          value={favoriteAutoCheckIntervalMin}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            const v = Number.isFinite(n) ? Math.floor(n) : 60;
                            setFavoriteAutoCheckIntervalMin?.(Math.max(15, Math.min(1440, v || 60)));
                          }}
                          className="w-full accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-[11px] text-on-surface-variant/90 leading-snug">
                          {t('settings.favoritesAutoCheckIntervalHelp')}
                        </p>
                      </div>
                    ) : null}

                    <label
                      className={`flex items-start gap-3 select-none max-w-full p-3.5 rounded-xl border transition-all ${
                        favoriteAutoCheckEnabled
                          ? 'cursor-pointer bg-surface-container-highest/40 border-outline-variant/10 hover:bg-surface-container-highest/60'
                          : 'cursor-not-allowed opacity-50 bg-surface-container-highest/20 border-outline-variant/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!favoriteAutoCheckEnabled}
                        checked={Boolean(favoriteAutoDownloadEnabled)}
                        onChange={(e) => setFavoriteAutoDownloadEnabled?.(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-outline-variant accent-primary shrink-0 disabled:cursor-not-allowed"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-on-surface block leading-snug">
                          {t('settings.favoritesAutoDownload')}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block leading-snug">
                          {favoriteAutoCheckEnabled
                            ? t('settings.favoritesAutoDownloadHint')
                            : t('settings.favoritesAutoDownloadRequiresCheck')}
                        </span>
                      </div>
                    </label>

                    {favoriteAutoCheckEnabled && favoriteAutoDownloadEnabled ? (
                      <div className="p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 space-y-3 max-w-lg">
                        <div className="space-y-1.5">
                          <SectionTitle as="label" className="block">
                            {t('settings.favoritesAutoDownloadMode')}
                          </SectionTitle>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => setFavoriteAutoDownloadMode?.('queue')}
                              aria-label={t('settings.favoritesAutoDownloadModeQueue')}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer text-left w-full ${
                                favoriteAutoDownloadMode === 'queue'
                                  ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                                  : 'border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px] shrink-0">download</span>
                              <span className="flex-1 leading-normal">{t('settings.favoritesAutoDownloadModeQueue')}</span>
                              {favoriteAutoDownloadMode === 'queue' && (
                                <span className="material-symbols-outlined text-[18px] shrink-0 text-primary">check_circle</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setFavoriteAutoDownloadMode?.('workflow')}
                              aria-label={t('settings.favoritesAutoDownloadModeWorkflow')}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer text-left w-full ${
                                favoriteAutoDownloadMode === 'workflow'
                                  ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                                  : 'border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px] shrink-0">account_tree</span>
                              <span className="flex-1 leading-normal">{t('settings.favoritesAutoDownloadModeWorkflow')}</span>
                              {favoriteAutoDownloadMode === 'workflow' && (
                                <span className="material-symbols-outlined text-[18px] shrink-0 text-primary">check_circle</span>
                              )}
                            </button>
                          </div>
                        </div>

                        {favoriteAutoDownloadMode === 'workflow' ? (
                          <div className="space-y-1.5 pt-1">
                            <SectionTitle as="label" className="block">
                              {t('settings.favoritesAutoDownloadSelectWorkflow')}
                            </SectionTitle>
                            {savedWorkflows.length > 0 ? (
                              <SearchableSelect
                                value={favoriteAutoDownloadWorkflowId}
                                onChange={(val) => setFavoriteAutoDownloadWorkflowId?.(val)}
                                options={savedWorkflows.map((w) => ({
                                  value: w.id,
                                  label: w.name,
                                  icon: 'account_tree',
                                }))}
                                placeholder={t('settings.favoritesAutoDownloadWorkflowPlaceholder')}
                                className="w-full"
                              />
                            ) : (
                              <div className="text-xs text-amber-600 dark:text-amber-400 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                {t('settings.favoritesAutoDownloadNoWorkflow')}
                              </div>
                            )}
                            <p className="text-[11px] text-on-surface-variant/90 leading-snug">
                              {t('settings.favoritesAutoDownloadWorkflowNote')}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </SettingsSectionCard>
              ) : null}

              {/* 6. Backup & Restore */}
              {isCardVisible('backup', categories.find((c) => c.id === 'backup')?.searchable) ? (
                <SettingsSectionCard
                  id="backup"
                  icon="backup"
                  title={t('settings.tab.backup')}
                  subtitle={t('settings.backup.hint')}
                  isCollapsed={isSectionCollapsed('backup')}
                  onToggle={() => toggleSection('backup')}
                >
                  <UserDataBackupSection />
                </SettingsSectionCard>
              ) : null}

              {/* 7. Contact & Support */}
              {isCardVisible('contact', categories.find((c) => c.id === 'contact')?.searchable) ? (
                <SettingsSectionCard
                  id="contact"
                  icon="support_agent"
                  title={t('settings.tab.contact')}
                  subtitle={t('settings.contactHint')}
                  isCollapsed={isSectionCollapsed('contact')}
                  onToggle={() => toggleSection('contact')}
                >
                  <div className="space-y-6">
                    {/* Official Channels */}
                    <div className="space-y-3">
                      <SectionTitle as="span" className="block">
                        {t('settings.contact.channels')}
                      </SectionTitle>
                      <AdminContactLinks />
                    </div>

                    {/* QR Code Donation / Support Card */}
                    <div className="space-y-3 pt-3 border-t border-outline-variant/10">
                      <SectionTitle as="span" className="block">
                        {t('donate.scanHint')}
                      </SectionTitle>
                      <div className="rounded-2xl border border-outline-variant/20 bg-surface-bright/50 p-5 max-w-md mx-auto space-y-3 text-center">
                        {!contactQrFailed ? (
                          <div className="rounded-xl bg-surface-container-low overflow-hidden max-w-[280px] mx-auto shadow-xs border border-outline-variant/15">
                            <img
                              src={publicAsset('data/QR.jpg')}
                              alt="Donation QR Code"
                              className="w-full h-auto object-cover block"
                              onError={() => setContactQrFailed(true)}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-on-surface-variant py-6 leading-relaxed">
                            {t('donate.noQrImage')}
                          </p>
                        )}
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                          {t('donate.thanksFooter')}
                        </p>
                      </div>
                    </div>
                  </div>
                </SettingsSectionCard>
              ) : null}

              {/* 8. App Update */}
              {isCardVisible('update', categories.find((c) => c.id === 'update')?.searchable) ? (
                <SettingsSectionCard
                  id="update"
                  refTarget={updateSectionRef}
                  icon="system_update"
                  title={`${t('settings.tab.update')} (v${packageJson.version})`}
                  isCollapsed={isSectionCollapsed('update')}
                  onToggle={() => toggleSection('update')}
                >
                  <UpdateChecker
                    state={appUpdateState}
                    setState={setAppUpdateState}
                    error={appUpdateError}
                    setError={setAppUpdateError}
                    checkResult={checkResult}
                    setCheckResult={setCheckResult}
                    downloadProgress={appUpdateDownloadProgress}
                    setDownloadProgress={setAppUpdateDownloadProgress}
                    downloadedPath={appUpdateDownloadedPath}
                    setDownloadedPath={setAppUpdateDownloadedPath}
                    autoCheckEnabled={autoCheckUpdate}
                    onAutoCheckEnabledChange={setAutoCheckUpdate}
                  />
                </SettingsSectionCard>
              ) : null}

              {/* 9. AI & Upscale Extras */}
              {isCardVisible('extras', `${t('extras.settings.title')} ${t('extras.settings.subtitle')} ${t('extras.settings.desc')} ai upscale onnx`) ? (
                <SettingsSectionCard
                  id="extras"
                  icon="smart_toy"
                  title={t('extras.settings.title')}
                  subtitle={t('extras.settings.subtitle')}
                  isCollapsed={isSectionCollapsed('extras')}
                  onToggle={() => toggleSection('extras')}
                >
                  <ExtrasSettingsSection />
                </SettingsSectionCard>
              ) : null}
            </div>
          </div>
        </StudioLayout.Content>
      </StudioLayout.Body>
    </StudioLayout>
  );
}
