import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useTheme } from '../../context/ThemeContext';
import { StudioLayout, useStudioLayout, SearchableSelect, AdminContactLinks } from '../../shared';
import ChapterFolderControls from './ChapterFolderControls.jsx';
import UserDataBackupSection from './UserDataBackupSection.jsx';
import UpdateChecker from './UpdateChecker.jsx';
import ThemeCardPicker from './ThemeCardPicker.jsx';
import BrandingSettingsSection from './BrandingSettingsSection.jsx';
import { ExtrasSettingsSection } from '../extras';
import { SiteCookieSection } from '../download';
import { loadSavedWorkflows } from '../workflow';
import { hasAppSession, isAdminSession, FREE_USER_TOKEN_MAX } from '../../utils/authSession';
import { findLatestEntitlementRow } from '../../utils/packageEntitlementView.mjs';
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
          title={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          aria-label={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          className="size-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-150 cursor-pointer shrink-0"
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
  duplicateScanRecursive,
  setDuplicateScanRecursive,
  favoriteAutoCheckEnabled,
  setFavoriteAutoCheckEnabled,
  favoriteAutoCheckIntervalMin,
  setFavoriteAutoCheckIntervalMin,
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

  onAfterLogout,
  scrollToUpdate = false,
  onScrollToUpdateDone,
  knownUpdate = null,
  /** Phiên đăng nhập — đồng bộ từ App */
  authSession = null,
  /** (session | null) => void */
  onAuthSessionChange,
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
        ['all', 'account', 'appearance', 'downloads', 'cookies', 'favorites', 'backup', 'contact', 'update'].includes(saved)
      ) {
        return saved;
      }
    } catch {}
    return 'all';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [showAdminContactAfterLoginFail, setShowAdminContactAfterLoginFail] = useState(false);
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
    () => ['account', 'appearance', 'branding', 'downloads', 'cookies', 'favorites', 'backup', 'contact', 'update'],
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

  const isSignedIn = Boolean(authSession?.refreshToken);
  const has_app_package = hasAppSession(authSession);
  const app_entitlement_row = findLatestEntitlementRow(authSession, 'app');
  const remaining_token_count = Number.isFinite(Number(authSession?.remainingTokens))
    ? Math.max(0, Math.floor(Number(authSession.remainingTokens)))
    : 0;

  const format_package_status = (raw_expires_at) => {
    if (raw_expires_at == null || raw_expires_at === '') {
      return t('settings.account.lifetime');
    }
    return t('settings.account.expiresOn', {
      date: new Date(raw_expires_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });
  };

  const app_package_name = has_app_package
    ? isAdminSession(authSession)
      ? authSession?.userType || 'Admin'
      : 'Member'
    : 'Free';
  const app_package_status = has_app_package
    ? format_package_status(app_entitlement_row?.expiresAt ?? app_entitlement_row?.expires_at ?? null)
    : `${remaining_token_count} / ${FREE_USER_TOKEN_MAX} tokens`;

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

  const runGoogleLogin = async () => {
    setAuthMsg('');
    setShowAdminContactAfterLoginFail(false);
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.loginGoogle) {
      setAuthMsg(t('settings.account.loginDesktopOnly'));
      setShowAdminContactAfterLoginFail(true);
      return;
    }
    setAuthBusy(true);
    try {
      const r = await api.loginGoogle();
      if (r?.ok) {
        setAuthMsg('');
        setShowAdminContactAfterLoginFail(false);
        try {
          const s = await api.getAuthSession();
          onAuthSessionChange?.(s?.refreshToken ? s : null);
        } catch {
          onAuthSessionChange?.(null);
        }
      } else if (r?.error === 'NOT_WHITELISTED') {
        setAuthMsg(t('settings.account.notWhitelisted'));
        setShowAdminContactAfterLoginFail(true);
      } else if (r?.error === 'NOT_MEMBER') {
        setAuthMsg(t('settings.account.notMember'));
        setShowAdminContactAfterLoginFail(true);
      } else {
        setAuthMsg(r?.message || r?.error || t('auth.gate.loginFailed'));
        setShowAdminContactAfterLoginFail(true);
      }
    } catch (e) {
      setAuthMsg(String(e?.message || e));
      setShowAdminContactAfterLoginFail(true);
    } finally {
      setAuthBusy(false);
    }
  };

  const runLogout = async () => {
    setAuthMsg('');
    setShowAdminContactAfterLoginFail(false);
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.logout) return;
    setAuthBusy(true);
    try {
      await api.logout();
      onAuthSessionChange?.(null);
      onAfterLogout?.();
    } catch (e) {
      setAuthMsg(String(e?.message || e));
    } finally {
      setAuthBusy(false);
    }
  };

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
        id: 'account',
        label: t('settings.tab.account'),
        shortLabel: t('settings.tab.account'),
        icon: 'person',
        searchable: `${t('settings.tab.account')} ${authSession?.email || ''} ${app_package_name} tokens login logout`,
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
    [t, authSession, app_package_name, checkResult, appUpdateState, knownUpdate]
  );

  const isCardVisible = (cardId, searchableText = '') => {
    if (activeTab !== 'all' && activeTab !== cardId) {
      return false;
    }
    if (!searchTerm.trim()) {
      return true;
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
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-surface-container-highest border border-outline-variant/25 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
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

            {/* Bottom Account Card */}
            <div className="mt-auto pt-3 border-t border-outline-variant/15 shrink-0">
              <div className="rounded-xl p-3 bg-surface-container-high/60 border border-outline-variant/15 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                    {t('settings.account.type')}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                    {app_package_name}
                  </span>
                </div>
                {isSignedIn ? (
                  <>
                    <div className="text-xs font-medium text-on-surface truncate" data-tooltip={authSession?.email}>
                      {authSession?.email || '—'}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      {app_package_status}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-on-surface-variant leading-tight">
                    {t('settings.guestAccountHint')}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant/70 pt-1.5 border-t border-outline-variant/10">
                  <span>Manga Crawler</span>
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
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    {activeTab === 'all' ? t('settings.tab.all') : categories.find((c) => c.id === activeTab)?.label}
                  </span>
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

              {/* 1. Account */}
              {isCardVisible('account', categories.find((c) => c.id === 'account')?.searchable) ? (
                <SettingsSectionCard
                  id="account"
                  icon="person"
                  title={t('settings.tab.account')}
                  isCollapsed={isSectionCollapsed('account')}
                  onToggle={() => toggleSection('account')}
                >
                  <div className="space-y-4">
                    {isSignedIn && authSession ? (
                      <div className="rounded-xl bg-surface-container-highest/50 p-4 border border-outline-variant/15 text-sm text-on-surface space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-on-surface-variant">{t('settings.account.signedIn')}</span>
                            <p className="font-semibold text-base text-on-surface">{authSession.email || '—'}</p>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
                            {app_package_name}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-outline-variant/10 text-xs">
                          <div>
                            <span className="text-on-surface-variant">{t('settings.account.type')}: </span>
                            <span className="font-medium text-on-surface">{app_package_status}</span>
                          </div>
                          {!has_app_package && authSession.createdAt && (
                            <div>
                              <span className="text-on-surface-variant">{t('settings.account.registeredAt')}: </span>
                              <span className="font-medium text-on-surface">
                                {new Date(authSession.createdAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-surface-container-highest/40 p-4 border border-outline-variant/15 space-y-3">
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                          {t('settings.guestAccountHint')}
                        </p>
                      </div>
                    )}

                    {authMsg && (
                      <p className="text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap">{authMsg}</p>
                    )}

                    {isSignedIn ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={authBusy || !authSession}
                          onClick={runLogout}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">logout</span>
                          <span>{t('settings.account.logout')}</span>
                        </button>
                      </div>
                    ) : null}

                    {showAdminContactAfterLoginFail ? <AdminContactLinks className="mt-2" /> : null}
                  </div>
                </SettingsSectionCard>
              ) : null}

              {/* 2. Appearance & Language */}
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
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                        {t('settings.section.appearance')}
                      </label>
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
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                        {t('settings.section.language')}
                      </label>
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
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                        {t('sidebar.saveTo')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={savePath}
                          onChange={(e) => setSavePath(e.target.value)}
                          placeholder={t('sidebar.placeholder.savePath')}
                          className="flex-1 min-w-0 bg-surface-container-highest border border-outline-variant/25 rounded-xl text-xs h-10 px-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        />
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
                    />

                    {/* Parallel Threads & Auto Retry */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 flex flex-col justify-between">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                            {t('sidebar.threads')}
                          </label>
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
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                            {t('settings.autoRetry.label')}
                          </label>
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
                      <div className="p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10 space-y-2 max-w-md">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider shrink-0">
                            {t('settings.favoritesAutoCheckInterval')}
                          </label>
                          <span className="text-xs font-semibold text-primary tabular-nums px-2 py-0.5 rounded-md bg-primary/10">
                            {favoriteAutoCheckIntervalMin < 60
                              ? t('settings.time.minutes', { m: favoriteAutoCheckIntervalMin })
                              : favoriteAutoCheckIntervalMin % 60 === 0
                              ? t('settings.time.hours', { h: Math.floor(favoriteAutoCheckIntervalMin / 60) })
                              : t('settings.time.hoursMinutes', {
                                  h: Math.floor(favoriteAutoCheckIntervalMin / 60),
                                  m: favoriteAutoCheckIntervalMin % 60,
                                })}
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
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                            {t('settings.favoritesAutoDownloadMode')}
                          </label>
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
                            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                              {t('settings.favoritesAutoDownloadSelectWorkflow')}
                            </label>
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
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                        {t('settings.contact.channels')}
                      </span>
                      <AdminContactLinks />
                    </div>

                    {/* QR Code Donation / Support Card */}
                    <div className="space-y-3 pt-3 border-t border-outline-variant/10">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                        {t('donate.scanHint')}
                      </span>
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
