import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout, useStudioLayout, EmptyState } from '../../shared';

const BTN_ROW =
  'inline-flex items-center justify-center gap-2 min-h-9 px-3.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none';
const BTN_SURFACE = `${BTN_ROW} bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20`;
const BTN_PRIMARY = `${BTN_ROW} bg-primary text-on-primary border border-primary hover:opacity-95 shadow-2xs`;

const PANEL_CARD =
  'rounded-xl border border-outline-variant/15 bg-surface-container-low/50 shadow-sm dark:bg-surface-container-low/25';

/** Official example plugin Gist — matches assets/example_plugin.js in the repo. */
const EXAMPLE_PLUGIN_GIST_URL =
  'https://gist.github.com/suutamebooktruyentranh-sudo/427cc3b313ab675b1177ec344b672a2e';
const CREATE_PLUGIN_GUIDE_GIST_URL =
  'https://gist.github.com/suutamebooktruyentranh-sudo/3e77db4860c3c766415d4a172efa87b7';
const PLUGIN_DEVELOPER_GUIDE_GIST_URL =
  'https://gist.github.com/suutamebooktruyentranh-sudo/3e657ccb7d6954fadc4f30612ea7f3d1';

function openGistUrl(url) {
  window.electronAPI?.openExternal?.(url);
}

/**
 * PluginManagementPanel — Quản lý plugins JavaScript chuẩn StudioLayout.
 */
export default function PluginManagementPanel({ onPluginsChanged }) {
  const { t } = useI18n();

  // StudioLayout integration
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'plugins',
    defaultLeftWidth: 280,
    minLeftWidth: 220,
    maxLeftWidth: 460,
  });

  const [activeSubtab, setActiveSubtab] = useState('installed'); // 'installed' | 'add' | 'generator'
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'enabled' | 'disabled'
  const [message, setMessage] = useState(null);

  // Import from URL state
  const [importUrl, setImportUrl] = useState('');

  // Modals state
  const [selectedPluginForSource, setSelectedPluginForSource] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null); // { id, name }
  const [replaceConfirmTarget, setReplaceConfirmTarget] = useState(null); // { metadata, oldVersion, newVersion, onConfirm }

  // Auto-Generator state
  const [autoGenPhase, setAutoGenPhase] = useState('idle'); // idle | input | analyzing | review | needChapter | analyzingChapter | generating
  const [autoGenUrl, setAutoGenUrl] = useState('');
  const [autoGenChapterUrl, setAutoGenChapterUrl] = useState('');
  const [autoGenData, setAutoGenData] = useState(null);
  const [autoGenChapterData, setAutoGenChapterData] = useState(null);
  const [autoGenError, setAutoGenError] = useState(null);
  const [autoGenEditName, setAutoGenEditName] = useState('');
  const [autoGenEditId, setAutoGenEditId] = useState('');
  const [autoGenSource, setAutoGenSource] = useState('');
  const [copiedAutoGenSource, setCopiedAutoGenSource] = useState(false);

  const handleCopyAutoGenSource = async () => {
    try {
      await navigator.clipboard.writeText(autoGenSource);
      setCopiedAutoGenSource(true);
      setTimeout(() => setCopiedAutoGenSource(false), 2000);
    } catch (e) {}
  };

  useEffect(() => {
    if (autoGenPhase === 'review' && autoGenData) {
      const siteInfo = {
        ...autoGenData.siteInfo,
        name: autoGenEditName || autoGenData.siteInfo.name,
        id: autoGenEditId || autoGenData.siteInfo.id,
      };
      const detected = {
        ...autoGenData.detected,
        ...(autoGenChapterData
          ? {
              imageSelector: autoGenChapterData.imageSelector,
              imageContainerSelector: autoGenChapterData.imageContainerSelector,
            }
          : {}),
      };
      window.electronAPI
        ?.generatePluginSource?.(siteInfo, detected)
        .then((res) => {
          if (res?.ok) setAutoGenSource(res.source || '');
        })
        .catch(() => {});
    }
  }, [autoGenPhase, autoGenData, autoGenChapterData, autoGenEditName, autoGenEditId]);

  const handleSavePluginSource = async (pluginId, editedSource) => {
    const res = await window.electronAPI.updatePlugin(pluginId, editedSource);
    if (res?.success) {
      await loadPlugins();
      notifyConnectorListChanged();
    }
    return res;
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  async function loadPlugins() {
    try {
      const result = await window.electronAPI.listPlugins();
      setPlugins(result || []);
    } catch (e) {
      console.error('Failed to load plugins:', e);
    }
  }

  function notifyConnectorListChanged() {
    if (typeof onPluginsChanged === 'function') onPluginsChanged();
  }

  // --- Handlers: Import from File with React Modal ---
  async function handleImportFromFile() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.importPluginFromFile();
      if (!result) return;

      if (result.requiresConfirmation) {
        const existing = plugins.find((p) => p.metadata.id === result.metadata.id);
        setReplaceConfirmTarget({
          name: result.metadata.name,
          id: result.metadata.id,
          oldVersion: existing?.metadata?.version || t('plugins.unknownVersion'),
          newVersion: result.metadata.version,
          onConfirm: async () => {
            const confirmResult = await window.electronAPI.confirmPluginReplacement(result.metadata.id);
            if (confirmResult?.success) {
              setMessage({ type: 'success', text: t('plugins.msg.updated', { name: result.metadata.name }) });
              await loadPlugins();
              notifyConnectorListChanged();
            } else {
              setMessage({ type: 'error', text: confirmResult?.errorMessage || 'Update failed' });
            }
          },
        });
      } else if (result.success) {
        setMessage({ type: 'success', text: t('plugins.msg.imported', { name: result.metadata.name }) });
        await loadPlugins();
        notifyConnectorListChanged();
        setActiveSubtab('installed');
      } else if (result.errorMessage) {
        setMessage({ type: 'error', text: result.errorMessage });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  // --- Handlers: Import from URL with React Modal ---
  async function handleImportFromUrl() {
    if (!importUrl.trim()) {
      setMessage({ type: 'error', text: t('plugins.urlEmpty') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.importPluginFromUrl(importUrl.trim());
      if (!result) return;

      if (result.requiresConfirmation) {
        const existing = plugins.find((p) => p.metadata.id === result.metadata.id);
        setReplaceConfirmTarget({
          name: result.metadata.name,
          id: result.metadata.id,
          oldVersion: existing?.metadata?.version || t('plugins.unknownVersion'),
          newVersion: result.metadata.version,
          onConfirm: async () => {
            const confirmResult = await window.electronAPI.confirmPluginReplacement(result.metadata.id);
            if (confirmResult?.success) {
              setMessage({ type: 'success', text: t('plugins.msg.updated', { name: result.metadata.name }) });
              setImportUrl('');
              await loadPlugins();
              notifyConnectorListChanged();
            } else {
              setMessage({ type: 'error', text: confirmResult?.errorMessage || 'Update failed' });
            }
          },
        });
      } else if (result.success) {
        setMessage({ type: 'success', text: t('plugins.msg.imported', { name: result.metadata.name }) });
        setImportUrl('');
        await loadPlugins();
        notifyConnectorListChanged();
        setActiveSubtab('installed');
      } else if (result.errorMessage) {
        setMessage({ type: 'error', text: result.errorMessage });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  // --- Toggle Plugin ---
  async function handleTogglePlugin(pluginId, currentlyEnabled) {
    setLoading(true);
    setMessage(null);
    try {
      if (currentlyEnabled) {
        await window.electronAPI.disablePlugin(pluginId);
        setMessage({ type: 'success', text: t('plugins.msg.toggledOff') });
      } else {
        await window.electronAPI.enablePlugin(pluginId);
        setMessage({ type: 'success', text: t('plugins.msg.toggledOn') });
      }
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableAll() {
    const targets = plugins.filter((p) => !p.isEnabled);
    if (targets.length === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      for (const p of targets) {
        await window.electronAPI.enablePlugin(p.metadata.id);
      }
      setMessage({ type: 'success', text: t('plugins.msg.enableAllOk', { count: targets.length }) });
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
      await loadPlugins();
      notifyConnectorListChanged();
    } finally {
      setLoading(false);
    }
  }

  async function handleDisableAll() {
    const targets = plugins.filter((p) => p.isEnabled);
    if (targets.length === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      for (const p of targets) {
        await window.electronAPI.disablePlugin(p.metadata.id);
      }
      setMessage({ type: 'success', text: t('plugins.msg.disableAllOk', { count: targets.length }) });
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
      await loadPlugins();
      notifyConnectorListChanged();
    } finally {
      setLoading(false);
    }
  }

  // --- Delete Plugin with React Modal ---
  function requestDeletePlugin(pluginId, pluginName) {
    setDeleteConfirmTarget({ id: pluginId, name: pluginName });
  }

  async function executeDeletePlugin() {
    if (!deleteConfirmTarget) return;
    const { id, name } = deleteConfirmTarget;
    setDeleteConfirmTarget(null);

    setLoading(true);
    setMessage(null);
    try {
      await window.electronAPI.deletePlugin(id);
      setMessage({ type: 'success', text: t('plugins.msg.deleted', { name }) });
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleReloadPlugin(pluginId, sourceUrl) {
    if (!sourceUrl) {
      setMessage({ type: 'error', text: t('plugins.msg.noUrlReload') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.importPluginFromUrl(sourceUrl);
      if (result.requiresConfirmation) {
        const confirmResult = await window.electronAPI.confirmPluginReplacement(pluginId);
        if (confirmResult?.success) {
          setMessage({ type: 'success', text: t('plugins.msg.reloadOk') });
          await loadPlugins();
          notifyConnectorListChanged();
        } else {
          setMessage({ type: 'error', text: confirmResult?.errorMessage || 'Reload failed' });
        }
      } else if (result.success) {
        setMessage({ type: 'success', text: t('plugins.msg.reloadOk') });
        await loadPlugins();
        notifyConnectorListChanged();
      } else {
        setMessage({ type: 'error', text: result.errorMessage });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  // ── Auto-Generator handlers ──
  function handleStartAutoGen() {
    setActiveSubtab('generator');
    setAutoGenPhase('input');
    setAutoGenUrl('');
    setAutoGenChapterUrl('');
    setAutoGenData(null);
    setAutoGenChapterData(null);
    setAutoGenError(null);
    setAutoGenEditName('');
    setAutoGenEditId('');
    setAutoGenSource('');
  }

  function handleCancelAutoGen() {
    setAutoGenPhase('idle');
    setAutoGenData(null);
    setAutoGenChapterData(null);
    setAutoGenError(null);
    setAutoGenSource('');
  }

  async function handleAnalyzeMangaPage() {
    if (!autoGenUrl.trim()) return;
    setAutoGenPhase('analyzing');
    setAutoGenError(null);
    try {
      const result = await window.electronAPI.analyzeMangaPage(autoGenUrl.trim());
      if (!result.ok) {
        setAutoGenError(result.error);
        setAutoGenPhase('input');
        return;
      }
      setAutoGenData(result);
      setAutoGenEditName(result.siteInfo.name);
      setAutoGenEditId(result.siteInfo.id);

      if (result.needsChapterUrl) {
        setAutoGenPhase('needChapter');
      } else {
        const chapterUrl = result.detected.chapterFirstUrl;
        if (chapterUrl) {
          setAutoGenPhase('analyzingChapter');
          try {
            const chResult = await window.electronAPI.analyzeChapterPage(chapterUrl, result.siteInfo.baseUrl);
            if (chResult?.ok) {
              setAutoGenChapterData(chResult);
              if (chResult.extraDomains && chResult.extraDomains.length > 0) {
                const merged = new Set([...result.siteInfo.domains, ...chResult.extraDomains]);
                result.siteInfo.domains = [...merged].slice(0, 15);
              }
            }
          } catch (e) {
            console.warn('Chapter analysis failed:', e);
          }
        }
        setAutoGenPhase('review');
      }
    } catch (e) {
      setAutoGenError(e.message);
      setAutoGenPhase('input');
    }
  }

  async function handleAnalyzeChapterPage() {
    if (!autoGenChapterUrl.trim()) return;
    setAutoGenPhase('analyzingChapter');
    setAutoGenError(null);
    try {
      const chResult = await window.electronAPI.analyzeChapterPage(
        autoGenChapterUrl.trim(),
        autoGenData?.siteInfo?.baseUrl || autoGenUrl
      );
      if (!chResult.ok) {
        setAutoGenError(chResult.error);
        setAutoGenPhase('needChapter');
        return;
      }
      setAutoGenChapterData(chResult);
      if (autoGenData && chResult.extraDomains) {
        const merged = new Set([...autoGenData.siteInfo.domains, ...chResult.extraDomains]);
        autoGenData.siteInfo.domains = [...merged].slice(0, 15);
      }
      setAutoGenPhase('review');
    } catch (e) {
      setAutoGenError(e.message);
      setAutoGenPhase('needChapter');
    }
  }

  async function handleGeneratePlugin() {
    if (!autoGenData) return;
    setAutoGenPhase('generating');
    setAutoGenError(null);
    try {
      const siteInfo = {
        ...autoGenData.siteInfo,
        name: autoGenEditName || autoGenData.siteInfo.name,
        id: autoGenEditId || autoGenData.siteInfo.id,
      };
      const detected = {
        ...autoGenData.detected,
        ...(autoGenChapterData
          ? {
              imageSelector: autoGenChapterData.imageSelector,
              imageContainerSelector: autoGenChapterData.imageContainerSelector,
            }
          : {}),
      };
      const result = await window.electronAPI.generateAndInstallPlugin(siteInfo, detected, autoGenSource || null);
      if (result.ok) {
        setMessage({ type: 'success', text: t('plugins.autoGen.success', { name: siteInfo.name }) });
        setAutoGenPhase('idle');
        setAutoGenData(null);
        setAutoGenChapterData(null);
        await loadPlugins();
        notifyConnectorListChanged();
        setActiveSubtab('installed');
      } else {
        setAutoGenError(result.error);
        setAutoGenPhase('review');
      }
    } catch (e) {
      setAutoGenError(e.message);
      setAutoGenPhase('review');
    }
  }

  // Statistics calculation
  const stats = useMemo(() => {
    const total = plugins.length;
    const enabled = plugins.filter((p) => p.isEnabled).length;
    const disabled = plugins.filter((p) => !p.isEnabled).length;
    return { total, enabled, disabled };
  }, [plugins]);

  // Filtered plugins list
  const filteredPlugins = useMemo(() => {
    return plugins.filter((p) => {
      const name = String(p.metadata?.name || '').toLowerCase();
      const id = String(p.metadata?.id || '').toLowerCase();
      const author = String(p.metadata?.author || '').toLowerCase();
      const domains = Array.isArray(p.metadata?.allowedDomains)
        ? p.metadata.allowedDomains.join(' ').toLowerCase()
        : '';
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || name.includes(q) || id.includes(q) || author.includes(q) || domains.includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === 'enabled') return p.isEnabled;
      if (statusFilter === 'disabled') return !p.isEnabled;
      return true;
    });
  }, [plugins, searchTerm, statusFilter]);

  const subtabs = [
    {
      id: 'installed',
      label: t('plugins.subtabInstalled'),
      icon: 'extension',
      badge: plugins.length,
    },
    {
      id: 'add',
      label: t('plugins.subtabAdd'),
      icon: 'add_circle',
    },
    {
      id: 'generator',
      label: t('plugins.subtabGenerator'),
      icon: 'auto_fix_high',
    },
  ];

  return (
    <StudioLayout>
      {/* Top Header Bar */}
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1 border border-outline-variant/20">
            {subtabs.map((tab) => {
              const isActive = activeSubtab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveSubtab(tab.id);
                    if (tab.id === 'generator' && autoGenPhase === 'idle') {
                      setAutoGenPhase('input');
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                    isActive
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-1.5">
            {activeSubtab === 'installed' && plugins.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleEnableAll}
                  disabled={loading || !plugins.some((p) => !p.isEnabled)}
                  className={BTN_SURFACE}
                  title={t('plugins.enableAll')}
                >
                  <span className="material-symbols-outlined text-[16px]">done_all</span>
                  <span>{t('plugins.enableAll')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisableAll}
                  disabled={loading || !plugins.some((p) => p.isEnabled)}
                  className={BTN_SURFACE}
                  title={t('plugins.disableAll')}
                >
                  <span className="material-symbols-outlined text-[16px]">block</span>
                  <span>{t('plugins.disableAll')}</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Main Workspace Body */}
      <StudioLayout.Body>
        {/* Left Sidebar: Filters, KPI and Guides */}
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 space-y-4">
            {/* Search Box */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('plugins.searchPlaceholder')}
                className="w-full bg-surface-container-high border-none rounded-xl text-xs h-9 pl-8 pr-7 text-on-surface outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60 absolute left-2.5 top-2.5">
                search
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 rounded-full p-0.5 text-on-surface-variant/60 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                {t('common.filter') || 'Trạng thái'}
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container-high/60 p-1 border border-outline-variant/15">
                {[
                  { id: 'all', label: t('plugins.filterAll') },
                  { id: 'enabled', label: t('plugins.filterEnabled') },
                  { id: 'disabled', label: t('plugins.filterDisabled') },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStatusFilter(item.id)}
                    className={`py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center ${
                      statusFilter === item.id
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Stats Grid */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                {t('dashboard.stats') || 'Thống kê'}
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubtab('installed');
                    setStatusFilter('all');
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'all' && activeSubtab === 'installed'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs'
                      : 'border-outline-variant/15 bg-surface-container-low/60 hover:bg-surface-container-high hover:border-outline-variant/30'
                  }`}
                  title={t('plugins.filterAll')}
                >
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase">{t('plugins.statTotal')}</span>
                  <span className="text-base font-extrabold text-on-surface mt-0.5">{stats.total}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSubtab('installed');
                    setStatusFilter((prev) => (prev === 'enabled' ? 'all' : 'enabled'));
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'enabled' && activeSubtab === 'installed'
                      ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-xs'
                      : 'border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                  }`}
                  title={t('plugins.filterEnabled')}
                >
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{t('plugins.statEnabled')}</span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.enabled}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSubtab('installed');
                    setStatusFilter((prev) => (prev === 'disabled' ? 'all' : 'disabled'));
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'disabled' && activeSubtab === 'installed'
                      ? 'border-outline-variant/60 bg-surface-container-high ring-2 ring-outline-variant/40 shadow-xs'
                      : 'border-outline-variant/15 bg-surface-container-low/60 hover:bg-surface-container-high hover:border-outline-variant/30'
                  }`}
                  title={t('plugins.filterDisabled')}
                >
                  <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase">{t('plugins.statDisabled')}</span>
                  <span className="text-base font-extrabold text-on-surface-variant/70 mt-0.5">{stats.disabled}</span>
                </button>
              </div>
            </div>

            {/* Quick Gist Guide Links */}
            <div className="space-y-2 pt-2 border-t border-outline-variant/15">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-primary">menu_book</span>
                <span>{t('plugins.quickGuides')}</span>
              </span>
              <div className="space-y-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => openGistUrl(EXAMPLE_PLUGIN_GIST_URL)}
                  className="w-full text-left p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate font-medium">{t('plugins.exampleTemplateTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openGistUrl(CREATE_PLUGIN_GUIDE_GIST_URL)}
                  className="w-full text-left p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate font-medium">{t('plugins.createGuideTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openGistUrl(PLUGIN_DEVELOPER_GUIDE_GIST_URL)}
                  className="w-full text-left p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate font-medium">{t('plugins.devGuideTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
              </div>
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content Area */}
        <StudioLayout.Content className="overflow-y-auto custom-scrollbar p-5 sm:p-7">
          <div className="max-w-4xl mx-auto w-full space-y-5">
            {/* Status Alert Banner */}
            {message ? (
              <div
                role="status"
                className={`rounded-xl px-4 py-3 text-xs sm:text-sm flex items-start gap-3 border shadow-sm ${
                  message.type === 'error'
                    ? 'bg-error-container/90 text-on-error-container border-error/20'
                    : 'bg-surface-container-high text-on-surface border-outline-variant/15'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px] leading-none shrink-0 mt-px"
                  aria-hidden
                >
                  {message.type === 'error' ? 'error' : 'check_circle'}
                </span>
                <p className="flex-1 min-w-0 whitespace-pre-wrap leading-snug">{message.text}</p>
                <button
                  type="button"
                  onClick={() => setMessage(null)}
                  className="shrink-0 -m-1 p-1.5 rounded-lg text-current opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                  aria-label={t('plugins.msg.dismissAria')}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">close</span>
                </button>
              </div>
            ) : null}

            {/* Subtab: Installed Plugins */}
            {activeSubtab === 'installed' && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">extension</span>
                  <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                    {t('plugins.sectionInstalled')} ({filteredPlugins.length}/{plugins.length})
                  </h2>
                </div>

                {filteredPlugins.length === 0 ? (
                  <EmptyState
                    icon="extension"
                    title={plugins.length === 0 ? t('plugins.emptyTitle') : 'Không tìm thấy plugin phù hợp'}
                    description={plugins.length === 0 ? t('plugins.emptyHint') : 'Thử thay đổi từ khóa tìm kiếm hoặc chuyển bộ lọc về "Tất cả".'}
                    action={
                      plugins.length === 0 ? (
                        <div className="flex justify-center gap-2.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setActiveSubtab('add')}
                            className={BTN_PRIMARY}
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            {t('plugins.subtabAdd')}
                          </button>
                          <button
                            type="button"
                            onClick={handleStartAutoGen}
                            className={BTN_SURFACE}
                          >
                            <span className="material-symbols-outlined text-[16px] text-primary">auto_fix_high</span>
                            {t('plugins.autoGen.button')}
                          </button>
                        </div>
                      ) : null
                    }
                  />
                ) : (
                  <ul className="flex flex-col gap-3 list-none p-0 m-0">
                    {filteredPlugins.map((plugin) => (
                      <li key={plugin.metadata.id}>
                        <PluginCard
                          plugin={plugin}
                          onToggle={handleTogglePlugin}
                          onDelete={requestDeletePlugin}
                          onReload={handleReloadPlugin}
                          onEditSource={(p) => setSelectedPluginForSource(p)}
                          disabled={loading}
                          t={t}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Subtab: Add & Import */}
            {activeSubtab === 'add' && (
              <section className="space-y-5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">download</span>
                  <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                    {t('plugins.sectionImport')}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* File Import Card */}
                  <div className={`${PANEL_CARD} p-5 flex flex-col justify-between space-y-4`}>
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <span className="material-symbols-outlined text-[22px]">folder_open</span>
                      </div>
                      <h3 className="text-sm font-bold text-on-surface">
                        {t('plugins.importFromFile')}
                      </h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Cài đặt plugin trực tiếp từ file script JavaScript (.js) trên máy tính của bạn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleImportFromFile}
                      disabled={loading}
                      className={`${BTN_PRIMARY} w-full`}
                    >
                      <span className="material-symbols-outlined text-[18px]">file_open</span>
                      <span>{t('plugins.importFromFile')}</span>
                    </button>
                  </div>

                  {/* URL Import Card */}
                  <div className={`${PANEL_CARD} p-5 flex flex-col justify-between space-y-4`}>
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[22px]">link</span>
                      </div>
                      <h3 className="text-sm font-bold text-on-surface">
                        {t('plugins.importFromUrl')}
                      </h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Nhập đường link trực tiếp (URL raw từ GitHub, Gist hoặc CDN) để tải và cài đặt.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImportFromUrl()}
                        placeholder={t('plugins.urlPlaceholder')}
                        className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-lg text-xs h-9 px-3 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={handleImportFromUrl}
                        disabled={loading || !importUrl.trim()}
                        className={`${BTN_SURFACE} w-full`}
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        <span>{t('plugins.importSubmit')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Subtab: Auto-Generator Wizard */}
            {activeSubtab === 'generator' && (
              <AutoGeneratorWizard
                t={t}
                phase={autoGenPhase}
                url={autoGenUrl}
                onUrlChange={setAutoGenUrl}
                chapterUrl={autoGenChapterUrl}
                onChapterUrlChange={setAutoGenChapterUrl}
                data={autoGenData}
                chapterData={autoGenChapterData}
                error={autoGenError}
                editName={autoGenEditName}
                onEditNameChange={setAutoGenEditName}
                editId={autoGenEditId}
                onEditIdChange={setAutoGenEditId}
                autoGenSource={autoGenSource}
                onAutoGenSourceChange={setAutoGenSource}
                copiedAutoGenSource={copiedAutoGenSource}
                onCopyAutoGenSource={handleCopyAutoGenSource}
                onAnalyze={handleAnalyzeMangaPage}
                onAnalyzeChapter={handleAnalyzeChapterPage}
                onGenerate={handleGeneratePlugin}
                onCancel={() => {
                  handleCancelAutoGen();
                  setActiveSubtab('installed');
                }}
                onClearError={() => setAutoGenError(null)}
              />
            )}
          </div>
        </StudioLayout.Content>
      </StudioLayout.Body>

      {/* Modal: View & Edit Plugin Source */}
      <PluginSourceModal
        t={t}
        plugin={selectedPluginForSource}
        isOpen={!!selectedPluginForSource}
        onClose={() => setSelectedPluginForSource(null)}
        onSave={handleSavePluginSource}
      />

      {/* Modal: Custom Delete Confirmation */}
      {deleteConfirmTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-error-container/80 text-on-error-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </div>
                <h3 className="font-bold text-base text-on-surface">
                  {t('plugins.confirmDeleteTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              {t('plugins.confirm.deleteBody', { name: deleteConfirmTarget.name })}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className={BTN_SURFACE}
              >
                {t('plugins.confirmCancel')}
              </button>
              <button
                type="button"
                onClick={executeDeletePlugin}
                className="inline-flex items-center justify-center gap-2 min-h-9 px-4 rounded-lg text-xs font-semibold bg-error text-on-error hover:opacity-95 shadow-sm transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>{t('plugins.confirmDelete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Custom Replace / Update Confirmation */}
      {replaceConfirmTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">published_with_changes</span>
                </div>
                <h3 className="font-bold text-base text-on-surface">
                  {t('plugins.confirmReplaceTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReplaceConfirmTarget(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
              {t('plugins.confirm.replaceBody', {
                name: replaceConfirmTarget.name,
                id: replaceConfirmTarget.id,
                oldVersion: replaceConfirmTarget.oldVersion,
                newVersion: replaceConfirmTarget.newVersion,
              })}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setReplaceConfirmTarget(null)}
                className={BTN_SURFACE}
              >
                {t('plugins.confirmCancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = replaceConfirmTarget.onConfirm;
                  setReplaceConfirmTarget(null);
                  if (fn) await fn();
                }}
                className={BTN_PRIMARY}
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                <span>{t('plugins.confirmReplace')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioLayout>
  );
}

/** Toggle track + thumb — symmetric padding, thumb vertically centered via flex */
function PluginEnableSwitch({ enabled, disabled, onToggle, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex h-[26px] w-[42px] shrink-0 items-center rounded-full px-[3px] box-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest ${
        enabled ? 'bg-primary' : 'bg-outline-variant/35'
      } ${disabled ? 'opacity-45 pointer-events-none' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none block size-5 shrink-0 rounded-full bg-surface-bright shadow-md ring-1 ring-black/10 dark:ring-white/10 transition-transform duration-200 ease-out will-change-transform ${
          enabled ? 'translate-x-[16px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function PluginSourceModal({ t, plugin, isOpen, onClose, onSave }) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !plugin) return;
    setLoading(true);
    setError(null);
    window.electronAPI
      .getPluginSource(plugin.metadata.id)
      .then((res) => {
        if (res.ok) setSource(res.source || '');
        else setError(res.error || 'Could not load source');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, plugin]);

  if (!isOpen || !plugin) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await onSave(plugin.metadata.id, source);
      if (res && !res.success) {
        setError(res.errorMessage || 'Cập nhật plugin thất bại');
      } else {
        onClose();
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="max-w-3xl w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-outline-variant/15">
          <h3 className="font-semibold text-on-surface text-sm sm:text-base">
            {t('plugins.sourceModalTitle', { name: plugin.metadata.name })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('plugins.sourceModalHint')}
          </p>
          {error ? (
            <div className="text-xs text-error bg-error-container/50 p-2.5 rounded-lg border border-error/20">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              Đang tải code...
            </div>
          ) : (
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full h-80 font-mono text-xs bg-surface-container-highest border border-outline-variant/15 rounded-lg p-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
              spellCheck={false}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 p-3.5 border-t border-outline-variant/15 bg-surface-container-low/50">
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !source}
            className={BTN_SURFACE}
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? t('plugins.codeCopied') : t('plugins.copyCode')}</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={BTN_SURFACE}>
              {t('plugins.autoGen.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || !source}
              className={BTN_PRIMARY}
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              <span>{t('plugins.saveAndReinstall')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PluginCard({ plugin, onToggle, onDelete, onReload, onEditSource, disabled, t }) {
  const [expanded, setExpanded] = useState(false);
  const { metadata, isEnabled, autoDisabled, sourceUrl } = plugin;
  const allowedDomains = Array.isArray(metadata.allowedDomains) ? metadata.allowedDomains : [];

  const accentBg = isEnabled ? 'bg-primary' : autoDisabled ? 'bg-error' : 'bg-surface-container-high';

  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 shadow-sm overflow-hidden transition-[box-shadow,border-color] hover:shadow-md hover:border-outline-variant/25 dark:bg-surface-container-low/20 flex min-w-0">
      <div className={`w-1 shrink-0 self-stretch ${accentBg}`} aria-hidden />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="p-4 sm:p-5">
          <div className="flex gap-4 min-w-0 items-start">
            {metadata.icon ? (
              <img
                src={metadata.icon}
                alt=""
                className="size-13 rounded-xl object-cover shrink-0 bg-surface-container-high ring-1 ring-outline-variant/10 self-start"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div
                className="size-13 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 text-on-surface-variant ring-1 ring-outline-variant/10 self-start"
                aria-hidden
              >
                <span className="material-symbols-outlined text-[26px]">extension</span>
              </div>
            )}

            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-bold text-on-surface text-sm sm:text-base leading-snug">{metadata.name}</h3>
                <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/15">
                  {t('plugins.version', { version: metadata.version })}
                </span>
                {isEnabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-primary-container text-on-primary-container">
                    {t('plugins.statusActive')}
                  </span>
                ) : null}
                {autoDisabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-error-container text-on-error-container">
                    {t('plugins.statusAutoDisabled')}
                  </span>
                ) : null}
              </div>

              {metadata.description ? (
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed line-clamp-2">{metadata.description}</p>
              ) : null}
              <p className="text-xs text-on-surface-variant/80 truncate">
                {t('plugins.authorLine', { author: metadata.author, baseUrl: metadata.baseUrl })}
              </p>

              {allowedDomains.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {allowedDomains.map((domain) => (
                    <span
                      key={domain}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/10 font-mono"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              ) : null}

              {sourceUrl ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-on-surface-variant truncate max-w-md font-mono" title={sourceUrl}>
                    {sourceUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => onReload(metadata.id, sourceUrl)}
                    disabled={disabled}
                    aria-label={t('plugins.reloadFromSavedUrl')}
                    className={`${BTN_SURFACE} shrink-0 self-start sm:self-center text-xs min-h-8`}
                  >
                    <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
                    <span>{t('plugins.reload')}</span>
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => onEditSource(plugin)}
                  disabled={disabled}
                  className={`${BTN_SURFACE} shrink-0 text-xs min-h-8 border border-outline-variant/20 hover:border-primary/40`}
                >
                  <span className="material-symbols-outlined text-[16px] leading-none text-primary">code</span>
                  <span>{t('plugins.editSourceBtn')}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-0.5 shrink-0 self-center pt-0.5">
              <PluginEnableSwitch
                enabled={isEnabled}
                disabled={disabled}
                onToggle={() => onToggle(metadata.id, isEnabled)}
                ariaLabel={isEnabled ? t('plugins.toggleOff') : t('plugins.toggleOn')}
              />
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                data-tooltip={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
                aria-label={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
              >
                <span
                  className="material-symbols-outlined text-[20px] leading-none block transition-transform duration-200 ease-out"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
              </button>
            </div>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-outline-variant/15 bg-surface-container-highest/60 dark:bg-surface-container-highest/25 px-4 py-3.5 sm:px-5 sm:py-4 space-y-3">
            {metadata.tags && metadata.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2.5 py-0.5 rounded-lg bg-primary-container/25 text-on-surface border border-outline-variant/10"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {allowedDomains.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant mb-1.5">
                  {t('plugins.allowedDomains')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allowedDomains.map((domain) => (
                    <span
                      key={domain}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/10 font-mono"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onDelete(metadata.id, metadata.name)}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1.5 min-h-8 px-3 rounded-lg text-xs font-semibold border border-error/25 bg-error-container/80 text-on-error-container hover:opacity-95 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
                <span>{t('plugins.delete')}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** ── Auto-Generator Wizard ── */
function AutoGeneratorWizard({
  t,
  phase,
  url,
  onUrlChange,
  chapterUrl,
  onChapterUrlChange,
  data,
  chapterData,
  error,
  editName,
  onEditNameChange,
  editId,
  onEditIdChange,
  autoGenSource,
  onAutoGenSourceChange,
  copiedAutoGenSource,
  onCopyAutoGenSource,
  onAnalyze,
  onAnalyzeChapter,
  onGenerate,
  onCancel,
  onClearError,
}) {
  const isLoading = phase === 'analyzing' || phase === 'analyzingChapter' || phase === 'generating';

  const statusLabel =
    phase === 'analyzing'
      ? t('plugins.autoGen.analyzing')
      : phase === 'analyzingChapter'
      ? t('plugins.autoGen.analyzingChapter')
      : phase === 'generating'
      ? t('plugins.autoGen.generating')
      : null;

  return (
    <section className={`${PANEL_CARD} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-5 pb-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden>
            auto_fix_high
          </span>
          <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            {t('plugins.autoGen.title')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="shrink-0 p-1.5 -m-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
          aria-label={t('plugins.autoGen.cancel')}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">close</span>
        </button>
      </div>

      <div className="p-5 pt-4 space-y-4">
        {/* Error banner */}
        {error ? (
          <div className="rounded-lg px-3.5 py-2.5 text-xs sm:text-sm flex items-start gap-2.5 bg-error-container/90 text-on-error-container border border-error/20">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden>
              error
            </span>
            <p className="flex-1 min-w-0 whitespace-pre-wrap leading-snug">{error}</p>
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 p-1 rounded text-current opacity-70 hover:opacity-100 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ) : null}

        {/* Loading spinner */}
        {isLoading ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <span className="material-symbols-outlined text-[24px] text-primary animate-spin">
              progress_activity
            </span>
            <span className="text-xs sm:text-sm text-on-surface-variant font-medium">{statusLabel}</span>
          </div>
        ) : null}

        {/* Phase: Input — URL entry */}
        {phase === 'input' || phase === 'analyzing' ? (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              {t('plugins.autoGen.urlHint')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
                placeholder={t('plugins.autoGen.urlPlaceholder')}
                className="min-w-0 flex-1 bg-surface-container-highest border border-outline-variant/15 rounded-lg text-xs sm:text-sm h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none transition-shadow"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isLoading || !url.trim()}
                className={`${BTN_PRIMARY} sm:w-auto sm:min-w-[8rem] h-10`}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">search</span>
                <span>{t('plugins.autoGen.analyze')}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Phase: Need Chapter URL */}
        {phase === 'needChapter' ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-outline-variant/15 bg-surface-container-highest/70 px-4 py-3 space-y-1">
              <p className="text-xs sm:text-sm font-medium text-on-surface">
                {t('plugins.autoGen.needChapterUrl')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={chapterUrl}
                onChange={(e) => onChapterUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAnalyzeChapter()}
                placeholder={t('plugins.autoGen.chapterUrlPlaceholder')}
                className="min-w-0 flex-1 bg-surface-container-highest border border-outline-variant/15 rounded-lg text-xs sm:text-sm h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none transition-shadow"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={onAnalyzeChapter}
                disabled={isLoading || !chapterUrl.trim()}
                className={`${BTN_PRIMARY} sm:w-auto sm:min-w-[8rem] h-10`}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">search</span>
                <span>{t('plugins.autoGen.analyzeChapter')}</span>
              </button>
            </div>
            <button type="button" onClick={onCancel} className={BTN_SURFACE}>
              {t('plugins.autoGen.cancel')}
            </button>
          </div>
        ) : null}

        {/* Phase: Review results */}
        {phase === 'review' && data ? (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              {t('plugins.autoGen.resultTitle')}
            </h3>

            {/* Editable site name and ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
                  {t('plugins.autoGen.siteName')}
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-lg text-xs sm:text-sm h-9 px-3 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
                  {t('plugins.autoGen.siteId')}
                </label>
                <input
                  type="text"
                  value={editId}
                  onChange={(e) => onEditIdChange(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-lg text-xs sm:text-sm h-9 px-3 text-on-surface font-mono focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Detection results table */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-highest/50 divide-y divide-outline-variant/10 overflow-hidden">
              {/* Base URL */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide w-28 shrink-0">
                  {t('plugins.autoGen.baseUrl')}
                </span>
                <span className="text-xs sm:text-sm text-on-surface font-mono truncate">{data.siteInfo.baseUrl}</span>
              </div>

              {/* Detected title */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide w-28 shrink-0">
                  {t('plugins.autoGen.detectedTitle')}
                </span>
                <span className="text-xs sm:text-sm text-on-surface truncate">{data.detected.title || '—'}</span>
              </div>

              {/* Chapters */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide w-28 shrink-0">
                  {t('plugins.autoGen.chaptersOk')}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      data.detected.chapterCount > 0 ? 'text-green-500' : 'text-on-surface-variant/50'
                    }`}
                  >
                    {data.detected.chapterCount > 0 ? 'check_circle' : 'help'}
                  </span>
                  <span className="text-xs sm:text-sm text-on-surface">
                    {data.detected.chapterCount > 0
                      ? t('plugins.autoGen.detectedChapters', { count: data.detected.chapterCount })
                      : t('plugins.autoGen.notDetected')}
                  </span>
                </div>
              </div>

              {/* Images */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide w-28 shrink-0">
                  {t('plugins.autoGen.imagesOk')}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      chapterData?.imageCount > 0 ? 'text-green-500' : 'text-on-surface-variant/50'
                    }`}
                  >
                    {chapterData?.imageCount > 0 ? 'check_circle' : 'help'}
                  </span>
                  <span className="text-xs sm:text-sm text-on-surface">
                    {chapterData?.imageCount > 0
                      ? t('plugins.autoGen.detectedImages', { count: chapterData.imageCount })
                      : t('plugins.autoGen.notDetected')}
                  </span>
                </div>
              </div>

              {/* Domains */}
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide w-28 shrink-0 pt-0.5">
                  {t('plugins.autoGen.domains')}
                </span>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {data.siteInfo.domains.map((d) => (
                    <span
                      key={d}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/10 font-mono"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning if no images detected */}
            {!chapterData?.imageCount ? (
              <div className="rounded-lg px-3.5 py-2.5 text-xs sm:text-sm flex items-start gap-2.5 bg-surface-container-high/80 text-on-surface-variant border border-outline-variant/15">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden>
                  info
                </span>
                <p className="flex-1 min-w-0 leading-snug">{t('plugins.autoGen.noImages')}</p>
              </div>
            ) : null}

            {/* Source Code preview / copy */}
            {autoGenSource ? (
              <details className="group rounded-xl border border-outline-variant/15 bg-surface-container-highest/50 p-3">
                <summary className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide cursor-pointer hover:text-on-surface transition-colors flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">
                      chevron_right
                    </span>
                    <span>{t('plugins.autoGen.viewSourceHint')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onCopyAutoGenSource();
                    }}
                    className={BTN_SURFACE}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedAutoGenSource ? 'check' : 'content_copy'}
                    </span>
                    <span>{copiedAutoGenSource ? t('plugins.codeCopied') : t('plugins.copyCode')}</span>
                  </button>
                </summary>
                <div className="mt-3 space-y-2">
                  <textarea
                    value={autoGenSource}
                    onChange={(e) => onAutoGenSourceChange(e.target.value)}
                    className="w-full h-64 font-mono text-xs bg-surface-container-highest border border-outline-variant/15 rounded-lg p-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                    spellCheck={false}
                  />
                </div>
              </details>
            ) : null}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className={BTN_PRIMARY}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">auto_fix_high</span>
                <span>{t('plugins.autoGen.generate')}</span>
              </button>
              <button type="button" onClick={onCancel} disabled={isLoading} className={BTN_SURFACE}>
                {t('plugins.autoGen.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
