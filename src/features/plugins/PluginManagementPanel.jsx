import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  StudioLayout,
  useStudioLayout,
  EmptyState,
  SectionTitle,
  SearchableSelect,
  ViewModeToggle,
} from '../../shared';
import AnalysisProgressMatrix from './AnalysisProgressMatrix';
import {
  createInitialAnalysisMatrix,
  prepareChapterRetryMatrix,
  applyAnalysisProgressEvent,
  completeAnalysisMatrix,
  sanitizePluginId,
  extractPluginIdFromSource,
} from './analysisProgressState.mjs';
import {
  filterAndSortPlugins,
  loadPluginViewMode,
  savePluginViewMode,
  loadPluginSortPref,
  savePluginSortPref,
} from './pluginListUtils.mjs';

const BTN_ROW =
  'inline-flex items-center justify-center gap-2 min-h-9 px-3.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none';
const BTN_SURFACE = `${BTN_ROW} bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20`;
const BTN_PRIMARY = `${BTN_ROW} bg-primary text-on-primary border border-primary hover:opacity-95 shadow-2xs`;
const BTN_TOOLBAR =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none whitespace-nowrap shrink-0 bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20';

const PANEL_CARD =
  'rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 shadow-sm dark:bg-surface-container-low/25';

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

function buildEffectiveDetected(
  autoGenData,
  autoGenChapterData,
  autoGenSelectors,
  autoGenDetectedChapterSel,
  autoGenDetectedImageSel,
) {
  const customChapSel = autoGenSelectors.chapterSelector.trim();
  const chapOverridden = Boolean(customChapSel && customChapSel !== autoGenDetectedChapterSel);
  const customImgSel = autoGenSelectors.imageSelector.trim();
  const imgOverridden = Boolean(customImgSel && customImgSel !== autoGenDetectedImageSel);
  return {
    ...autoGenData.detected,
    ...(autoGenChapterData
      ? {
          imageSelector: autoGenChapterData.imageSelector,
          imageContainerSelector: autoGenChapterData.imageContainerSelector,
          usesTsReader: Boolean(autoGenChapterData.usesTsReader),
          imageStrategy: autoGenChapterData.imageStrategy,
          embeddedImageConfig: autoGenChapterData.embeddedImageConfig || null,
          imageApi: autoGenChapterData.imageApi || null,
        }
      : {}),
    ...(autoGenSelectors.titleSelector.trim() ? { titleSelector: autoGenSelectors.titleSelector.trim() } : {}),
    ...(autoGenSelectors.coverSelector.trim() ? { coverSelector: autoGenSelectors.coverSelector.trim() } : {}),
    ...(customChapSel ? { chapterSelector: customChapSel } : {}),
    ...(chapOverridden ? { chapterStrategy: 'html' } : {}),
    ...(imgOverridden
      ? {
          imageSelector: customImgSel,
          imageContainerSelector: null,
          imageStrategy: 'html',
          usesTsReader: false,
        }
      : {}),
  };
}

/**
 * PluginManagementPanel — Quản lý plugins JavaScript chuẩn StudioLayout.
 */
export default function PluginManagementPanel({ onPluginsChanged }) {
  const { t } = useI18n();

  // StudioLayout integration
  const {
    leftWidth,
    showLeftSidebar,
    toggleLeftSidebar,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'plugins',
    defaultLeftWidth: 320,
    minLeftWidth: 260,
    maxLeftWidth: 560,
    defaultLeftOpen: true,
  });

  const [activeSubtab, setActiveSubtab] = useState('installed'); // 'installed' | 'add' | 'generator'
  const [plugins, setPlugins] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'enabled' | 'disabled' | 'url'
  const [viewMode, setViewMode] = useState(() => loadPluginViewMode('grid'));
  const [sortBy, setSortBy] = useState(() => loadPluginSortPref('enabled_first'));
  const [message, setMessage] = useState(null);
  const [isToastHovered, setIsToastHovered] = useState(false);

  const handleViewModeChange = useCallback((nextMode) => {
    const safeMode = nextMode === 'list' ? 'list' : 'grid';
    setViewMode(safeMode);
    savePluginViewMode(safeMode);
  }, []);

  const handleSortChange = useCallback((nextSort) => {
    setSortBy(nextSort);
    savePluginSortPref(nextSort);
  }, []);

  const showMessage = useCallback((type, text) => {
    setIsToastHovered(false);
    setMessage(text ? { id: `${Date.now()}-${Math.random()}`, type, text } : null);
  }, []);

  useEffect(() => {
    if (!message?.text || isToastHovered) return undefined;
    const duration = message.type === 'error' ? 6000 : 3500;
    const timer = setTimeout(() => {
      setMessage(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [message?.id, message?.text, message?.type, isToastHovered]);

  // Import from URL state
  const [importUrl, setImportUrl] = useState('');

  // Modals state
  const [selectedPluginForSource, setSelectedPluginForSource] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null); // { id, name }
  const [replaceConfirmTarget, setReplaceConfirmTarget] = useState(null); // { metadata, oldVersion, newVersion, onConfirm }

  useEffect(() => {
    if (!deleteConfirmTarget && !replaceConfirmTarget) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirmTarget) setDeleteConfirmTarget(null);
      else if (replaceConfirmTarget) setReplaceConfirmTarget(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmTarget, replaceConfirmTarget]);

  // Auto-Generator state
  const [autoGenPhase, setAutoGenPhase] = useState('idle'); // idle | input | analyzing | review | needChapter | analyzingChapter | generating
  const [autoGenUrl, setAutoGenUrl] = useState('');
  const [autoGenChapterUrl, setAutoGenChapterUrl] = useState('');
  const [autoGenData, setAutoGenData] = useState(null);
  const [autoGenChapterData, setAutoGenChapterData] = useState(null);
  const [autoGenError, setAutoGenError] = useState(null);
  const [autoGenEditName, setAutoGenEditName] = useState('');
  const [autoGenEditId, setAutoGenEditId] = useState('');
  const [autoGenSelectors, setAutoGenSelectors] = useState({
    titleSelector: '',
    coverSelector: '',
    chapterSelector: '',
    imageSelector: '',
  });
  const [autoGenDetectedChapterSel, setAutoGenDetectedChapterSel] = useState('');
  const [autoGenDetectedImageSel, setAutoGenDetectedImageSel] = useState('');
  const [autoGenIncludeLatest, setAutoGenIncludeLatest] = useState(true);
  const [autoGenSource, setAutoGenSource] = useState('');
  const [autoGenManualEdit, setAutoGenManualEdit] = useState(false);
  const [autoGenTestRunning, setAutoGenTestRunning] = useState(false);
  const [autoGenTestResult, setAutoGenTestResult] = useState(null);
  const [copiedAutoGenSource, setCopiedAutoGenSource] = useState(false);
  const [analysisMatrix, setAnalysisMatrix] = useState(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const activeAnalyzeRunIdRef = useRef('');

  useEffect(() => {
    if (typeof window.electronAPI?.subscribePluginAnalyzeProgress !== 'function') return undefined;
    return window.electronAPI.subscribePluginAnalyzeProgress((ev) => {
      if (!ev || !activeAnalyzeRunIdRef.current) return;
      if (ev.runId !== activeAnalyzeRunIdRef.current) return;
      setAnalysisMatrix((prev) => (prev ? applyAnalysisProgressEvent(prev, ev) : prev));
    });
  }, []);

  useEffect(() => {
    const isRunning = autoGenPhase === 'analyzing' || autoGenPhase === 'analyzingChapter';
    if (!analysisMatrix?.startedAt) return undefined;
    if (!isRunning) {
      if (analysisMatrix.finishedAt) {
        setAnalysisElapsedMs(Math.max(0, analysisMatrix.finishedAt - analysisMatrix.startedAt));
      }
      return undefined;
    }
    setAnalysisElapsedMs(Date.now() - analysisMatrix.startedAt);
    const timer = setInterval(() => {
      setAnalysisElapsedMs(Date.now() - analysisMatrix.startedAt);
    }, 100);
    return () => clearInterval(timer);
  }, [autoGenPhase, analysisMatrix?.startedAt, analysisMatrix?.finishedAt]);

  const handleCopyAutoGenSource = async () => {
    try {
      await navigator.clipboard.writeText(autoGenSource);
      setCopiedAutoGenSource(true);
      setTimeout(() => setCopiedAutoGenSource(false), 2000);
    } catch (e) {}
  };

  useEffect(() => {
    if (autoGenPhase !== 'review' || !autoGenData || autoGenManualEdit) return undefined;
    let cancelled = false;
    const siteInfo = {
      ...autoGenData.siteInfo,
      name: autoGenEditName || autoGenData.siteInfo.name,
      id: autoGenEditId || autoGenData.siteInfo.id,
    };
    const detected = buildEffectiveDetected(
      autoGenData,
      autoGenChapterData,
      autoGenSelectors,
      autoGenDetectedChapterSel,
      autoGenDetectedImageSel,
    );
    window.electronAPI
      ?.generatePluginSource?.(siteInfo, detected, { includeLatestUpdates: autoGenIncludeLatest })
      .then((res) => {
        if (!cancelled && res?.ok) {
          setAutoGenSource(res.source || '');
          setAutoGenTestResult(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    autoGenPhase,
    autoGenData,
    autoGenChapterData,
    autoGenEditName,
    autoGenEditId,
    autoGenSelectors,
    autoGenDetectedChapterSel,
    autoGenDetectedImageSel,
    autoGenIncludeLatest,
    autoGenManualEdit,
  ]);

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
    } finally {
      setInitialLoading(false);
    }
  }

  async function handleRefreshPlugins() {
    if (loading) return;
    setLoading(true);
    try {
      await loadPlugins();
    } finally {
      setLoading(false);
    }
  }

  function notifyConnectorListChanged() {
    if (typeof onPluginsChanged === 'function') onPluginsChanged();
  }

  // --- Handlers: Import from File with React Modal ---
  async function handleImportFromFile() {
    setLoading(true);
    showMessage(null, null);
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
              showMessage('success', t('plugins.msg.updated', { name: result.metadata.name }));
              await loadPlugins();
              notifyConnectorListChanged();
            } else {
              showMessage('error', confirmResult?.errorMessage || t('plugins.msg.updateFailed'));
            }
          },
        });
      } else if (result.success) {
        showMessage('success', t('plugins.msg.imported', { name: result.metadata.name }));
        await loadPlugins();
        notifyConnectorListChanged();
        setActiveSubtab('installed');
      } else if (result.errorMessage) {
        showMessage('error', result.errorMessage);
      }
    } catch (e) {
      showMessage('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Handlers: Import from URL with React Modal ---
  async function handleImportFromUrl() {
    if (!importUrl.trim()) {
      showMessage('error', t('plugins.urlEmpty'));
      return;
    }

    setLoading(true);
    showMessage(null, null);
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
              showMessage('success', t('plugins.msg.updated', { name: result.metadata.name }));
              setImportUrl('');
              await loadPlugins();
              notifyConnectorListChanged();
            } else {
              showMessage('error', confirmResult?.errorMessage || t('plugins.msg.updateFailed'));
            }
          },
        });
      } else if (result.success) {
        showMessage('success', t('plugins.msg.imported', { name: result.metadata.name }));
        setImportUrl('');
        await loadPlugins();
        notifyConnectorListChanged();
        setActiveSubtab('installed');
      } else if (result.errorMessage) {
        showMessage('error', result.errorMessage);
      }
    } catch (e) {
      showMessage('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Toggle Plugin ---
  async function handleTogglePlugin(pluginId, currentlyEnabled) {
    setLoading(true);
    showMessage(null, null);
    try {
      if (currentlyEnabled) {
        await window.electronAPI.disablePlugin(pluginId);
        showMessage('success', t('plugins.msg.toggledOff'));
      } else {
        await window.electronAPI.enablePlugin(pluginId);
        showMessage('success', t('plugins.msg.toggledOn'));
      }
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      showMessage('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableAll() {
    const targets = plugins.filter((p) => !p.isEnabled);
    if (targets.length === 0) return;
    setLoading(true);
    showMessage(null, null);
    try {
      for (const p of targets) {
        await window.electronAPI.enablePlugin(p.metadata.id);
      }
      showMessage('success', t('plugins.msg.enableAllOk', { count: targets.length }));
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      showMessage('error', e.message);
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
    showMessage(null, null);
    try {
      for (const p of targets) {
        await window.electronAPI.disablePlugin(p.metadata.id);
      }
      showMessage('success', t('plugins.msg.disableAllOk', { count: targets.length }));
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      showMessage('error', e.message);
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
    showMessage(null, null);
    try {
      await window.electronAPI.deletePlugin(id);
      showMessage('success', t('plugins.msg.deleted', { name }));
      await loadPlugins();
      notifyConnectorListChanged();
    } catch (e) {
      showMessage('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReloadPlugin(pluginId, sourceUrl) {
    if (!sourceUrl) {
      showMessage('error', t('plugins.msg.noUrlReload'));
      return;
    }

    setLoading(true);
    showMessage(null, null);
    try {
      const result = await window.electronAPI.importPluginFromUrl(sourceUrl);
      if (result.requiresConfirmation) {
        const confirmResult = await window.electronAPI.confirmPluginReplacement(pluginId);
        if (confirmResult?.success) {
          showMessage('success', t('plugins.msg.reloadOk'));
          await loadPlugins();
          notifyConnectorListChanged();
        } else {
          showMessage('error', confirmResult?.errorMessage || t('plugins.msg.reloadFailed'));
        }
      } else if (result.success) {
        showMessage('success', t('plugins.msg.reloadOk'));
        await loadPlugins();
        notifyConnectorListChanged();
      } else {
        showMessage('error', result.errorMessage);
      }
    } catch (e) {
      showMessage('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const reloadablePlugins = useMemo(
    () => plugins.filter((p) => Boolean(p?.sourceUrl || p?.metadata?.sourceUrl)),
    [plugins]
  );

  async function handleReloadAllUrlPlugins() {
    if (reloadablePlugins.length === 0 || loading) return;
    setLoading(true);
    showMessage(null, null);
    let okCount = 0;
    let failCount = 0;

    try {
      for (const p of reloadablePlugins) {
        const srcUrl = p.sourceUrl || p.metadata?.sourceUrl;
        const pluginId = p.metadata?.id || p.id;
        try {
          const result = await window.electronAPI.importPluginFromUrl(srcUrl);
          if (result?.requiresConfirmation) {
            const confirmResult = await window.electronAPI.confirmPluginReplacement(pluginId);
            if (confirmResult?.success) okCount += 1;
            else failCount += 1;
          } else if (result?.success) {
            okCount += 1;
          } else {
            failCount += 1;
          }
        } catch {
          failCount += 1;
        }
      }
      await loadPlugins();
      notifyConnectorListChanged();
      showMessage(
        failCount > 0 && okCount === 0 ? 'error' : 'success',
        t('plugins.msg.reloadAllResult', { ok: okCount, fail: failCount }),
      );
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
    setAutoGenTestResult(null);
    setAutoGenTestRunning(false);
    setAutoGenManualEdit(false);
    setAutoGenDetectedChapterSel('');
    setAutoGenDetectedImageSel('');
    setAutoGenIncludeLatest(true);
    activeAnalyzeRunIdRef.current = '';
    setAnalysisMatrix(null);
    setAnalysisElapsedMs(0);
    setAutoGenSelectors({
      titleSelector: '',
      coverSelector: '',
      chapterSelector: '',
      imageSelector: '',
    });
  }

  function handleCancelAutoGen() {
    setAutoGenPhase('idle');
    setAutoGenData(null);
    setAutoGenChapterData(null);
    setAutoGenError(null);
    setAutoGenSource('');
    setAutoGenManualEdit(false);
    setAutoGenDetectedChapterSel('');
    setAutoGenDetectedImageSel('');
    setAutoGenTestResult(null);
    setAutoGenTestRunning(false);
    activeAnalyzeRunIdRef.current = '';
    setAnalysisMatrix(null);
    setAnalysisElapsedMs(0);
    setAutoGenSelectors({
      titleSelector: '',
      coverSelector: '',
      chapterSelector: '',
      imageSelector: '',
    });
  }

  async function handleAnalyzeMangaPage() {
    if (!autoGenUrl.trim()) return;
    const runId = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeAnalyzeRunIdRef.current = runId;
    setAnalysisElapsedMs(0);
    setAnalysisMatrix(createInitialAnalysisMatrix(autoGenUrl.trim(), 'manga', runId));
    setAutoGenPhase('analyzing');
    setAutoGenChapterData(null);
    setAutoGenError(null);
    setAutoGenTestResult(null);
    setAutoGenManualEdit(false);
    try {
      const rawResult = await window.electronAPI.analyzeMangaPage(autoGenUrl.trim(), { runId });
      if (activeAnalyzeRunIdRef.current !== runId) return;
      if (!rawResult.ok) {
        setAnalysisMatrix((prev) => completeAnalysisMatrix(prev, { status: 'error', detail: rawResult.error }));
        setAutoGenError(rawResult.error);
        setAutoGenPhase('input');
        return;
      }
      let nextData = rawResult;
      setAutoGenData(nextData);
      setAutoGenEditName(nextData.siteInfo.name);
      setAutoGenEditId(nextData.siteInfo.id);
      setAutoGenIncludeLatest(Boolean(nextData.detected?.latestUpdates?.detected));
      setAutoGenDetectedChapterSel(nextData.detected?.chapterSelector || '');
      setAutoGenDetectedImageSel('');
      setAutoGenSelectors({
        titleSelector: nextData.detected?.titleSelector || '',
        coverSelector: nextData.detected?.coverSelector || '',
        chapterSelector: nextData.detected?.chapterSelector || '',
        imageSelector: '',
      });

      if (nextData.needsChapterUrl) {
        setAutoGenPhase('needChapter');
      } else {
        const chapterUrl = nextData.detected.chapterFirstUrl;
        if (chapterUrl) {
          setAutoGenPhase('analyzingChapter');
          try {
            const chResult = await window.electronAPI.analyzeChapterPage(chapterUrl, nextData.siteInfo.baseUrl, { runId });
            if (activeAnalyzeRunIdRef.current !== runId) return;
            if (chResult?.ok) {
              setAutoGenChapterData(chResult);
              setAutoGenDetectedImageSel(chResult.imageSelector || '');
              setAutoGenSelectors((prev) => ({
                ...prev,
                imageSelector: chResult.imageSelector || '',
              }));
              if (chResult.extraDomains && chResult.extraDomains.length > 0) {
                const merged = new Set([...nextData.siteInfo.domains, ...chResult.extraDomains]);
                nextData = {
                  ...nextData,
                  siteInfo: { ...nextData.siteInfo, domains: [...merged].slice(0, 15) },
                };
                setAutoGenData(nextData);
              }
            } else {
              setAnalysisMatrix((prev) =>
                applyAnalysisProgressEvent(prev, {
                  step: 'chapter_images',
                  status: 'warn',
                  progress: 94,
                  detail: chResult?.error || '',
                }),
              );
            }
          } catch (e) {
            if (activeAnalyzeRunIdRef.current !== runId) return;
            console.warn('Chapter analysis failed:', e);
            setAnalysisMatrix((prev) =>
              applyAnalysisProgressEvent(prev, {
                step: 'chapter_images',
                status: 'warn',
                progress: 94,
                detail: e.message || '',
              }),
            );
          }
        }
        setAnalysisMatrix((prev) => completeAnalysisMatrix(prev, { status: 'done', percent: 100 }));
        setAutoGenPhase('review');
      }
    } catch (e) {
      if (activeAnalyzeRunIdRef.current !== runId) return;
      setAnalysisMatrix((prev) => completeAnalysisMatrix(prev, { status: 'error', detail: e.message }));
      setAutoGenError(e.message);
      setAutoGenPhase('input');
    }
  }

  async function handleAnalyzeChapterPage() {
    if (!autoGenChapterUrl.trim()) return;
    const runId = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeAnalyzeRunIdRef.current = runId;
    setAnalysisMatrix((prev) => prepareChapterRetryMatrix(prev, autoGenChapterUrl.trim(), runId));
    setAutoGenPhase('analyzingChapter');
    setAutoGenError(null);
    setAutoGenTestResult(null);
    try {
      const chResult = await window.electronAPI.analyzeChapterPage(
        autoGenChapterUrl.trim(),
        autoGenData?.siteInfo?.baseUrl || autoGenUrl,
        { runId },
      );
      if (activeAnalyzeRunIdRef.current !== runId) return;
      if (!chResult.ok) {
        setAnalysisMatrix((prev) =>
          completeAnalysisMatrix(prev, { status: 'error', stepId: 'chapter_images', detail: chResult.error }),
        );
        setAutoGenError(chResult.error);
        setAutoGenPhase('needChapter');
        return;
      }
      setAutoGenChapterData(chResult);
      setAutoGenDetectedImageSel(chResult.imageSelector || '');
      setAutoGenSelectors((prev) => ({
        ...prev,
        imageSelector: chResult.imageSelector || prev.imageSelector,
      }));
      if (autoGenData && chResult.extraDomains) {
        setAutoGenData((prev) => {
          if (!prev) return prev;
          const merged = new Set([...(prev.siteInfo?.domains || []), ...chResult.extraDomains]);
          return {
            ...prev,
            siteInfo: { ...prev.siteInfo, domains: [...merged].slice(0, 15) },
          };
        });
      }
      setAnalysisMatrix((prev) => completeAnalysisMatrix(prev, { status: 'done', percent: 100 }));
      setAutoGenPhase('review');
    } catch (e) {
      if (activeAnalyzeRunIdRef.current !== runId) return;
      setAnalysisMatrix((prev) =>
        completeAnalysisMatrix(prev, { status: 'error', stepId: 'chapter_images', detail: e.message }),
      );
      setAutoGenError(e.message);
      setAutoGenPhase('needChapter');
    }
  }

  async function handleTestGeneratedPlugin() {
    if (!autoGenSource || autoGenTestRunning) return;
    setAutoGenTestRunning(true);
    setAutoGenError(null);
    try {
      const chapterUrlToTest =
        autoGenChapterUrl.trim() || autoGenData?.detected?.chapterFirstUrl || '';
      const res = await window.electronAPI.testGeneratedPlugin({
        source: autoGenSource,
        mangaUrl: autoGenUrl.trim(),
        chapterUrl: chapterUrlToTest,
        testLatest: autoGenIncludeLatest && Boolean(autoGenData?.detected?.latestUpdates?.detected),
      });
      setAutoGenTestResult(res || { ok: false, error: t('plugins.autoGen.testNoResult') });
    } catch (e) {
      setAutoGenTestResult({ ok: false, error: e.message || String(e), durationMs: 0 });
    } finally {
      setAutoGenTestRunning(false);
    }
  }

  const existingMatchedPlugin = useMemo(() => {
    if (!autoGenData) return null;
    const sourceId = autoGenManualEdit ? extractPluginIdFromSource(autoGenSource) : '';
    const targetId = sourceId || sanitizePluginId(autoGenEditId || autoGenData.siteInfo?.id);
    if (!targetId) return null;
    return plugins.find((p) => String(p.metadata?.id || p.id || '').toLowerCase() === targetId) || null;
  }, [autoGenData, autoGenEditId, autoGenManualEdit, autoGenSource, plugins]);

  async function executeGeneratePlugin(confirmOverwrite = false) {
    if (!autoGenData) return;
    setAutoGenPhase('generating');
    setAutoGenError(null);
    try {
      const siteInfo = {
        ...autoGenData.siteInfo,
        name: autoGenEditName || autoGenData.siteInfo.name,
        id: autoGenEditId || autoGenData.siteInfo.id,
      };
      const detected = buildEffectiveDetected(
        autoGenData,
        autoGenChapterData,
        autoGenSelectors,
        autoGenDetectedChapterSel,
        autoGenDetectedImageSel,
      );
      const result = await window.electronAPI.generateAndInstallPlugin(
        siteInfo,
        detected,
        autoGenSource || null,
        { includeLatestUpdates: autoGenIncludeLatest, confirmOverwrite },
      );
      if (result.requiresConfirmation) {
        setAutoGenPhase('review');
        setReplaceConfirmTarget({
          name: result.existingMetadata?.name || siteInfo.name,
          id: result.existingMetadata?.id || sanitizePluginId(siteInfo.id),
          oldVersion: result.existingMetadata?.version || t('plugins.unknownVersion'),
          newVersion: '1.0.0',
          onConfirm: () => executeGeneratePlugin(true),
        });
      } else if (result.ok) {
        showMessage('success', t('plugins.autoGen.success', { name: siteInfo.name }));
        setAutoGenPhase('idle');
        setAutoGenData(null);
        setAutoGenChapterData(null);
        setAutoGenTestResult(null);
        activeAnalyzeRunIdRef.current = '';
        setAnalysisMatrix(null);
        setAnalysisElapsedMs(0);
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

  function handleGeneratePlugin() {
    if (!autoGenData) return;
    const targetId = sanitizePluginId(autoGenEditId || autoGenData.siteInfo.id);
    if (existingMatchedPlugin) {
      setReplaceConfirmTarget({
        name: existingMatchedPlugin.metadata?.name || autoGenEditName || autoGenData.siteInfo.name,
        id: existingMatchedPlugin.metadata?.id || targetId,
        oldVersion: existingMatchedPlugin.metadata?.version || t('plugins.unknownVersion'),
        newVersion: '1.0.0',
        onConfirm: () => executeGeneratePlugin(true),
      });
      return;
    }
    executeGeneratePlugin(false);
  }

  // Statistics calculation
  const stats = useMemo(() => {
    const total = plugins.length;
    const enabled = plugins.filter((p) => p.isEnabled).length;
    const disabled = plugins.filter((p) => !p.isEnabled).length;
    return { total, enabled, disabled };
  }, [plugins]);

  // Filtered & sorted plugins list
  const filteredPlugins = useMemo(
    () => filterAndSortPlugins(plugins, { searchTerm, statusFilter, sortBy }),
    [plugins, searchTerm, statusFilter, sortBy],
  );

  const sortOptions = useMemo(
    () => [
      { value: 'enabled_first', label: t('plugins.sort.enabledFirst'), icon: 'check_circle' },
      { value: 'disabled_first', label: t('plugins.sort.disabledFirst'), icon: 'pause_circle' },
      { value: 'name_asc', label: t('plugins.sort.nameAsc'), icon: 'sort_by_alpha' },
      { value: 'name_desc', label: t('plugins.sort.nameDesc'), icon: 'sort_by_alpha' },
    ],
    [t],
  );

  const isAutoGenBusy =
    autoGenPhase === 'analyzing' ||
    autoGenPhase === 'analyzingChapter' ||
    autoGenPhase === 'generating';

  const hasActiveFilters = statusFilter !== 'all' || searchTerm.trim().length > 0;
  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
  };
  const handleSelectKpiFilter = (targetFilter) => {
    const wasInstalled = activeSubtab === 'installed';
    setActiveSubtab('installed');
    if (targetFilter === 'all') {
      setStatusFilter('all');
      return;
    }
    setStatusFilter((prev) => (wasInstalled && prev === targetFilter ? 'all' : targetFilter));
  };

  const subtabs = [
    {
      id: 'installed',
      label: t('plugins.subtabInstalled'),
      icon: 'extension',
      badge: plugins.length,
      busy: false,
    },
    {
      id: 'add',
      label: t('plugins.subtabAdd'),
      icon: 'add_circle',
      busy: false,
    },
    {
      id: 'generator',
      label: t('plugins.subtabGenerator'),
      icon: 'auto_fix_high',
      busy: isAutoGenBusy,
    },
  ];

  return (
    <StudioLayout>
      {/* Top Header Bar */}
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSlot={
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            <div
              role="tablist"
              aria-label={t('menu.plugins')}
              className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25 overflow-x-auto no-scrollbar shrink-0"
            >
              {subtabs.map((tab) => {
                const isActive = activeSubtab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveSubtab(tab.id);
                      if (tab.id === 'generator' && autoGenPhase === 'idle') {
                        setAutoGenPhase('input');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-primary text-on-primary font-semibold shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
                    }`}
                  >
                    {tab.busy ? (
                      <span className="material-symbols-outlined text-[15px] leading-none text-cyan-400 animate-spin shrink-0">
                        progress_activity
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px] leading-none shrink-0">{tab.icon}</span>
                    )}
                    <span>{tab.label}</span>
                    {tab.busy && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
                    )}
                    {tab.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {activeSubtab === 'installed' && plugins.length > 0 ? (
              <div
                data-testid="plugins-primary-action-slot"
                className="flex items-center gap-2 shrink-0 empty:hidden pl-2.5 border-l border-outline-variant/25 ml-1"
              >
                {reloadablePlugins.length > 0 && (
                  <button
                    type="button"
                    onClick={handleReloadAllUrlPlugins}
                    disabled={loading}
                    className={BTN_TOOLBAR}
                    data-tooltip={t('plugins.reloadAllTooltip')}
                  >
                    <span className={`material-symbols-outlined text-[15px] leading-none ${loading ? 'animate-spin' : ''}`}>sync</span>
                    <span>{t('plugins.reloadAll', { count: reloadablePlugins.length })}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEnableAll}
                  disabled={loading || !plugins.some((p) => !p.isEnabled)}
                  className={BTN_TOOLBAR}
                  aria-label={t('plugins.enableAll')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">done_all</span>
                  <span>{t('plugins.enableAll')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisableAll}
                  disabled={loading || !plugins.some((p) => p.isEnabled)}
                  className={BTN_TOOLBAR}
                  aria-label={t('plugins.disableAll')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">block</span>
                  <span>{t('plugins.disableAll')}</span>
                </button>
              </div>
            ) : null}
          </div>
        }
        rightSlot={
          activeSubtab === 'installed' ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <ViewModeToggle viewMode={viewMode} onChange={handleViewModeChange} size="md" />
              <button
                type="button"
                onClick={handleRefreshPlugins}
                disabled={loading}
                data-tooltip={t('plugins.refreshList')}
                aria-label={t('plugins.refreshList')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-45 cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[18px] leading-none ${loading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
          ) : null
        }
      />

      {/* Main Workspace Body */}
      <StudioLayout.Body>
        {/* Left Sidebar: Search, Sort, KPI Cards and Guides */}
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-4 space-y-4 flex flex-col min-h-full">
            {/* 1. Search Box */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('plugins.searchTitle')}
              </SectionTitle>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearchTerm(next);
                    if (next.trim() && activeSubtab !== 'installed') {
                      setActiveSubtab('installed');
                    }
                  }}
                  placeholder={t('plugins.searchPlaceholder')}
                  aria-label={t('plugins.searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest pl-9 pr-8 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                />
                <span className="material-symbols-outlined text-[17px] text-on-surface-variant/60 absolute left-3 pointer-events-none">
                  search
                </span>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    data-tooltip={t('plugins.clearSearch')}
                    aria-label={t('plugins.clearSearch')}
                    className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5 rounded"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. Sort Selector */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('plugins.sortTitle')}
              </SectionTitle>
              <SearchableSelect
                value={sortBy}
                onChange={handleSortChange}
                options={sortOptions}
                showPlaceholderOption={false}
                ariaLabel={t('plugins.sortTitle')}
              />
            </div>

            {/* 3. KPI Cards Grid (matching Explore / Site Checker standard) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <SectionTitle as="span" className="block">
                  {t('plugins.statsTitle')}
                </SectionTitle>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">filter_alt_off</span>
                    <span>{t('plugins.resetFilters')}</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectKpiFilter('all')}
                  aria-pressed={statusFilter === 'all' && activeSubtab === 'installed'}
                  data-tooltip={t('plugins.filterAll')}
                  aria-label={t('plugins.filterAll')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'all' && activeSubtab === 'installed'
                      ? 'border-primary bg-primary/15 ring-2 ring-primary/30 shadow-xs'
                      : 'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10'
                  }`}
                >
                  <span className="text-[10px] font-bold text-primary uppercase">{t('plugins.statTotal')}</span>
                  <span className="text-xl font-extrabold text-primary mt-1 tabular-nums">{stats.total}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectKpiFilter('enabled')}
                  aria-pressed={statusFilter === 'enabled' && activeSubtab === 'installed'}
                  data-tooltip={t('plugins.filterEnabled')}
                  aria-label={t('plugins.filterEnabled')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'enabled' && activeSubtab === 'installed'
                      ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-xs'
                      : 'border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                  }`}
                >
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    {t('plugins.statEnabled')}
                  </span>
                  <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {stats.enabled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectKpiFilter('disabled')}
                  aria-pressed={statusFilter === 'disabled' && activeSubtab === 'installed'}
                  data-tooltip={t('plugins.filterDisabled')}
                  aria-label={t('plugins.filterDisabled')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'disabled' && activeSubtab === 'installed'
                      ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30 shadow-xs'
                      : 'border-amber-500/15 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10'
                  }`}
                >
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                    {t('plugins.statDisabled')}
                  </span>
                  <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                    {stats.disabled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectKpiFilter('url')}
                  aria-pressed={statusFilter === 'url' && activeSubtab === 'installed'}
                  data-tooltip={t('plugins.filterUrlSynced')}
                  aria-label={t('plugins.filterUrlSynced')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'url' && activeSubtab === 'installed'
                      ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 shadow-xs'
                      : 'border-blue-500/15 bg-blue-500/5 hover:border-blue-500/40 hover:bg-blue-500/10'
                  }`}
                >
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                    {t('plugins.statUrlSynced')}
                  </span>
                  <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                    {reloadablePlugins.length}
                  </span>
                </button>
              </div>
            </div>

            {/* 4. Quick Gist Guide Links & Bottom Tip */}
            <div className="mt-auto space-y-3 pt-3 border-t border-outline-variant/15">
              <div className="space-y-1.5 text-xs">
                <SectionTitle as="span" className="flex items-center gap-1 px-0.5 mb-1.5">
                  <span className="material-symbols-outlined text-[15px] text-primary">menu_book</span>
                  <span>{t('plugins.quickGuides')}</span>
                </SectionTitle>
                <button
                  type="button"
                  onClick={() => openGistUrl(EXAMPLE_PLUGIN_GIST_URL)}
                  className="w-full text-left px-2.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer transition-colors"
                >
                  <span className="truncate font-medium">{t('plugins.exampleTemplateTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openGistUrl(CREATE_PLUGIN_GUIDE_GIST_URL)}
                  className="w-full text-left px-2.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer transition-colors"
                >
                  <span className="truncate font-medium">{t('plugins.createGuideTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openGistUrl(PLUGIN_DEVELOPER_GUIDE_GIST_URL)}
                  className="w-full text-left px-2.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/15 text-primary flex items-center justify-between group cursor-pointer transition-colors"
                >
                  <span className="truncate font-medium">{t('plugins.devGuideTitle')}</span>
                  <span className="material-symbols-outlined text-[15px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform">
                    open_in_new
                  </span>
                </button>
              </div>
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5 flex items-start gap-2 text-[10px] text-on-surface-variant/80 leading-relaxed">
                <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5" aria-hidden>
                  touch_app
                </span>
                <span className="min-w-0 leading-snug">{t('plugins.sidebarTip')}</span>
              </div>
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content Area */}
        <StudioLayout.Content className="flex flex-col min-h-0 overflow-hidden bg-surface">
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
            {/* Subtab: Installed Plugins */}
            {activeSubtab === 'installed' && (
              <section className="space-y-4">
                {initialLoading ? (
                  <PluginsLoadingSkeleton viewMode={viewMode} t={t} />
                ) : filteredPlugins.length === 0 ? (
                  <EmptyState
                    icon={plugins.length === 0 ? 'extension' : 'search_off'}
                    title={plugins.length === 0 ? t('plugins.emptyTitle') : t('plugins.emptyFilteredTitle')}
                    description={plugins.length === 0 ? t('plugins.emptyHint') : t('plugins.emptyFilteredHint')}
                    action={
                      plugins.length === 0 ? (
                        <div className="flex flex-wrap justify-center gap-2.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setActiveSubtab('add')}
                            className={`${BTN_PRIMARY} h-10`}
                          >
                            <span className="material-symbols-outlined text-[17px]">add</span>
                            <span>{t('plugins.subtabAdd')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleStartAutoGen}
                            className={`${BTN_SURFACE} h-10`}
                          >
                            <span className="material-symbols-outlined text-[17px] text-primary">auto_fix_high</span>
                            <span>{t('plugins.autoGen.button')}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center mt-2">
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className={`${BTN_SURFACE} h-10`}
                          >
                            <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                            <span>{t('plugins.resetFilters')}</span>
                          </button>
                        </div>
                      )
                    }
                  />
                ) : viewMode === 'list' ? (
                  <ul className="flex flex-col gap-2 list-none p-0 m-0">
                    {filteredPlugins.map((plugin) => (
                      <li key={plugin.metadata.id}>
                        <PluginCard
                          plugin={plugin}
                          viewMode="list"
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
                ) : (
                  <ul className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3.5 list-none p-0 m-0">
                    {filteredPlugins.map((plugin) => (
                      <li key={plugin.metadata.id} className="min-w-0 flex">
                        <PluginCard
                          plugin={plugin}
                          viewMode="grid"
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
              <section className="max-w-5xl mx-auto w-full space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* File Import Card */}
                  <div className={`${PANEL_CARD} p-5 flex flex-col justify-between space-y-4`}>
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                        <span className="material-symbols-outlined text-[22px]">folder_open</span>
                      </div>
                      <h3 className="text-sm font-bold text-on-surface">
                        {t('plugins.importFromFile')}
                      </h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('plugins.importFromFileDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleImportFromFile}
                      disabled={loading}
                      className={`${BTN_PRIMARY} w-full h-10`}
                    >
                      <span className="material-symbols-outlined text-[18px]">file_open</span>
                      <span>{t('plugins.importFromFile')}</span>
                    </button>
                  </div>

                  {/* URL Import Card */}
                  <div className={`${PANEL_CARD} p-5 flex flex-col justify-between space-y-4`}>
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                        <span className="material-symbols-outlined text-[22px]">link</span>
                      </div>
                      <h3 className="text-sm font-bold text-on-surface">
                        {t('plugins.importFromUrl')}
                      </h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('plugins.importFromUrlDesc')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImportFromUrl()}
                        placeholder={t('plugins.urlPlaceholder')}
                        className="w-full bg-surface-container-highest border border-outline-variant/25 rounded-xl text-xs sm:text-sm h-10 px-3.5 text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={handleImportFromUrl}
                        disabled={loading || !importUrl.trim()}
                        className={`${BTN_SURFACE} w-full h-10`}
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        <span>{t('plugins.importSubmit')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Jump Banner to Auto-Generator */}
                <div className={`${PANEL_CARD} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-primary/20 bg-primary/5`}>
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center border border-primary/25 shrink-0">
                      <span className="material-symbols-outlined text-[22px]">auto_fix_high</span>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-bold text-on-surface">
                        {t('plugins.addAutoGenTitle')}
                      </h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('plugins.addAutoGenDesc')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartAutoGen}
                    className={`${BTN_PRIMARY} h-10 shrink-0 px-4`}
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                    <span>{t('plugins.subtabGenerator')}</span>
                  </button>
                </div>
              </section>
            )}

            {/* Subtab: Auto-Generator Wizard */}
            {activeSubtab === 'generator' && (
              <div className="max-w-5xl mx-auto w-full">
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
                  selectors={autoGenSelectors}
                  onSelectorsChange={setAutoGenSelectors}
                  includeLatest={autoGenIncludeLatest}
                  onIncludeLatestChange={setAutoGenIncludeLatest}
                  autoGenSource={autoGenSource}
                  onAutoGenSourceChange={(val) => {
                    setAutoGenManualEdit(true);
                    setAutoGenSource(val);
                    setAutoGenTestResult(null);
                  }}
                  manualEdit={autoGenManualEdit}
                  onRegenerateSource={() => setAutoGenManualEdit(false)}
                  copiedAutoGenSource={copiedAutoGenSource}
                  onCopyAutoGenSource={handleCopyAutoGenSource}
                  testRunning={autoGenTestRunning}
                  testResult={autoGenTestResult}
                  onTest={handleTestGeneratedPlugin}
                  onAnalyze={handleAnalyzeMangaPage}
                  onAnalyzeChapter={handleAnalyzeChapterPage}
                  onGenerate={handleGeneratePlugin}
                  onCancel={() => {
                    handleCancelAutoGen();
                    setActiveSubtab('installed');
                  }}
                  onClearError={() => setAutoGenError(null)}
                  analysisMatrix={analysisMatrix}
                  analysisElapsedMs={analysisElapsedMs}
                  existingMatchedPlugin={existingMatchedPlugin}
                />
              </div>
            )}
          </div>

          {/* Unified Bottom Summary Footer Bar (matching Explore / Followed Manga / Bulk Scan standard) */}
          {activeSubtab === 'installed' && !initialLoading && plugins.length > 0 && (
            <footer className="border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
                  {t('plugins.footerCount', { shown: filteredPlugins.length, total: plugins.length })}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-outline-variant/25 bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
                    <span>{t('plugins.resetFilters')}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{t('plugins.statEnabled')}: {stats.enabled}</span>
                </span>
                {stats.disabled > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>{t('plugins.statDisabled')}: {stats.disabled}</span>
                  </span>
                )}
                {reloadablePlugins.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-blue-700 dark:text-blue-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>{t('plugins.statUrlSynced')}: {reloadablePlugins.length}</span>
                  </span>
                )}
              </div>
            </footer>
          )}
        </StudioLayout.Content>
      </StudioLayout.Body>

      {/* Auto-Dismiss Floating Toast Notification */}
      {message ? (
        <div
          role="status"
          aria-live="polite"
          onMouseEnter={() => setIsToastHovered(true)}
          onMouseLeave={() => setIsToastHovered(false)}
          className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border shadow-xl backdrop-blur-md text-xs sm:text-sm font-medium w-max max-w-[min(36rem,calc(100vw-2rem))] animate-in fade-in duration-150 pointer-events-auto ${
            message.type === 'error'
              ? 'bg-error-container/95 text-on-error-container border-error/30'
              : 'bg-surface-container-lowest/95 text-on-surface border-outline-variant/25'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[18px] leading-none shrink-0 ${
              message.type === 'error' ? 'text-error' : 'text-emerald-500'
            }`}
            aria-hidden
          >
            {message.type === 'error' ? 'error' : 'check_circle'}
          </span>
          <p className="flex-1 min-w-0 whitespace-pre-wrap leading-snug">{message.text}</p>
          <button
            type="button"
            onClick={() => {
              setIsToastHovered(false);
              setMessage(null);
            }}
            className="shrink-0 -m-1 p-1 rounded-lg text-current opacity-65 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-opacity"
            aria-label={t('plugins.msg.dismissAria')}
            data-tooltip={t('plugins.msg.dismissAria')}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">close</span>
          </button>
        </div>
      ) : null}

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
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmTarget(null);
          }}
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
                aria-label={t('plugins.closeModal')}
                data-tooltip={t('plugins.closeModal')}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setReplaceConfirmTarget(null);
          }}
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
                aria-label={t('plugins.closeModal')}
                data-tooltip={t('plugins.closeModal')}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
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
    let cancelled = false;
    setSource('');
    setLoading(true);
    setError(null);
    window.electronAPI
      .getPluginSource(plugin.metadata.id)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setSource(res.source || '');
        else setError(res.error || t('plugins.sourceLoadError'));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, plugin, t]);

  useEffect(() => {
    if (!isOpen || !plugin || saving) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, plugin, saving, onClose]);

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
        setError(res.errorMessage || t('plugins.sourceSaveFailed'));
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="max-w-3xl w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-outline-variant/15">
          <h3 className="font-semibold text-on-surface text-sm sm:text-base">
            {t('plugins.sourceModalTitle', { name: plugin.metadata.name })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t('plugins.closeModal')}
            data-tooltip={t('plugins.closeModal')}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer disabled:opacity-45 disabled:pointer-events-none"
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
              <span>{t('plugins.sourceLoading')}</span>
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
            <button type="button" onClick={onClose} disabled={saving} className={BTN_SURFACE}>
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

const PLUGIN_SKELETON_ITEMS = [0, 1, 2, 3, 4, 5];

function PluginsLoadingSkeleton({ viewMode, t }) {
  if (viewMode === 'list') {
    return (
      <div role="status" aria-busy="true" aria-label={t('plugins.sectionInstalled')} className="space-y-2">
        {PLUGIN_SKELETON_ITEMS.map((idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="size-10 shrink-0 rounded-xl bg-surface-container-highest" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-44 max-w-[55%] rounded bg-surface-container-highest" />
                <div className="h-3 w-64 max-w-[75%] rounded bg-surface-container-highest/70" />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-surface-container-highest" />
              <div className="h-[26px] w-[42px] rounded-full bg-surface-container-highest" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('plugins.sectionInstalled')}
      className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3.5"
    >
      {PLUGIN_SKELETON_ITEMS.map((idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-outline-variant/20 bg-surface-container-high/35 p-4 space-y-3 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="size-11 shrink-0 rounded-xl bg-surface-container-highest" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-36 rounded bg-surface-container-highest" />
              <div className="h-3 w-24 rounded bg-surface-container-highest/75" />
            </div>
            <div className="h-[26px] w-[42px] rounded-full bg-surface-container-highest shrink-0" />
          </div>
          <div className="h-3 w-5/6 rounded bg-surface-container-highest/70" />
          <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/10">
            <div className="h-8 w-28 rounded-lg bg-surface-container-highest" />
            <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PluginCard({ plugin, viewMode = 'grid', onToggle, onDelete, onReload, onEditSource, disabled, t }) {
  const [expanded, setExpanded] = useState(false);
  const [iconError, setIconError] = useState(false);
  const { metadata, isEnabled, autoDisabled, sourceUrl } = plugin;
  const effectiveSourceUrl = sourceUrl || metadata?.sourceUrl || '';
  const allowedDomains = Array.isArray(metadata.allowedDomains) ? metadata.allowedDomains : [];
  const accentBg = isEnabled ? 'bg-primary' : autoDisabled ? 'bg-error' : 'bg-surface-container-high';

  useEffect(() => {
    setIconError(false);
  }, [metadata?.icon]);

  const metaLine =
    metadata.author && metadata.baseUrl
      ? t('plugins.authorLine', { author: metadata.author, baseUrl: metadata.baseUrl })
      : metadata.author || metadata.baseUrl || metadata.id || '';

  const iconBox = metadata.icon && !iconError ? (
    <img
      src={metadata.icon}
      alt=""
      className={`${viewMode === 'list' ? 'size-10' : 'size-11'} rounded-xl object-cover shrink-0 bg-surface-container-high ring-1 ring-outline-variant/15`}
      onError={() => setIconError(true)}
    />
  ) : (
    <div
      className={`${viewMode === 'list' ? 'size-10' : 'size-11'} rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 text-on-surface-variant ring-1 ring-outline-variant/15`}
      aria-hidden
    >
      <span className={`material-symbols-outlined ${viewMode === 'list' ? 'text-[22px]' : 'text-[24px]'}`}>
        extension
      </span>
    </div>
  );

  const expandedDetails = expanded ? (
    <div className="border-t border-outline-variant/15 bg-surface-container-highest/55 dark:bg-surface-container-highest/25 px-4 py-3 space-y-2.5 text-xs">
      {metadata.tags && metadata.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {metadata.tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              className="text-[11px] px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {allowedDomains.length > 0 ? (
        <div>
          <SectionTitle as="p" className="mb-1">
            {t('plugins.allowedDomains')}
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {allowedDomains.map((domain, idx) => (
              <span
                key={`${domain}-${idx}`}
                className="text-[11px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/15 font-mono"
              >
                {domain}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {effectiveSourceUrl ? (
        <p className="text-[11px] text-on-surface-variant font-mono truncate" data-tooltip={effectiveSourceUrl}>
          {effectiveSourceUrl}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {effectiveSourceUrl ? (
          <button
            type="button"
            onClick={() => onReload(metadata.id, effectiveSourceUrl)}
            disabled={disabled}
            className={`${BTN_SURFACE} min-h-8 px-3 rounded-lg`}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
            <span>{t('plugins.reload')}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onDelete(metadata.id, metadata.name)}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-error/25 bg-error-container/80 text-on-error-container hover:opacity-95 cursor-pointer transition-opacity"
        >
          <span className="material-symbols-outlined text-[15px] leading-none">delete</span>
          <span>{t('plugins.delete')}</span>
        </button>
      </div>
    </div>
  ) : null;

  if (viewMode === 'list') {
    return (
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high/35 hover:border-outline-variant/45 hover:bg-surface-container-high/55 transition-all overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {iconBox}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className="font-bold text-on-surface text-xs sm:text-sm truncate min-w-0 max-w-full"
                  data-tooltip={metadata.name}
                >
                  {metadata.name}
                </h3>
                {metadata.version ? (
                  <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant border border-outline-variant/15">
                    {t('plugins.version', { version: metadata.version })}
                  </span>
                ) : null}
                {allowedDomains[0] && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 truncate max-w-[11rem]">
                    {allowedDomains[0]}
                  </span>
                )}
                {autoDisabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-error-container text-on-error-container">
                    {t('plugins.statusAutoDisabled')}
                  </span>
                ) : null}
              </div>
              {(metadata.description || metaLine) ? (
                <p className="text-[11px] text-on-surface-variant/80 truncate mt-0.5">
                  {metadata.description || metaLine}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onEditSource(plugin)}
              disabled={disabled}
              data-tooltip={t('plugins.editSourceBtn')}
              aria-label={t('plugins.editSourceBtn')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-primary hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">code</span>
            </button>
            {effectiveSourceUrl ? (
              <button
                type="button"
                onClick={() => onReload(metadata.id, effectiveSourceUrl)}
                disabled={disabled}
                data-tooltip={t('plugins.reloadFromSavedUrl')}
                aria-label={t('plugins.reloadFromSavedUrl')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-45"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDelete(metadata.id, metadata.name)}
              disabled={disabled}
              data-tooltip={t('plugins.delete')}
              aria-label={t('plugins.delete')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-error hover:bg-error/10 transition-colors cursor-pointer disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
            </button>
            <div className="px-1">
              <PluginEnableSwitch
                enabled={isEnabled}
                disabled={disabled}
                onToggle={() => onToggle(metadata.id, isEnabled)}
                ariaLabel={isEnabled ? t('plugins.toggleOff') : t('plugins.toggleOn')}
              />
            </div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              data-tooltip={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
              aria-label={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            >
              <span
                className="material-symbols-outlined text-[18px] leading-none transition-transform duration-200 ease-out"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
            </button>
          </div>
        </div>
        {expandedDetails}
      </div>
    );
  }

  const visibleDomains = allowedDomains.slice(0, 3);
  const extraDomainsCount = Math.max(0, allowedDomains.length - visibleDomains.length);

  return (
    <div className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-outline-variant/35 dark:bg-surface-container-low/25 flex min-w-0">
      <div className={`w-1 shrink-0 self-stretch ${accentBg}`} aria-hidden />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex-1 p-4 space-y-3">
          <div className="flex gap-3 min-w-0 items-start">
            {iconBox}
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <h3
                  className="font-bold text-on-surface text-sm leading-snug truncate min-w-0 max-w-full"
                  data-tooltip={metadata.name}
                >
                  {metadata.name}
                </h3>
                {metadata.version ? (
                  <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/15">
                    {t('plugins.version', { version: metadata.version })}
                  </span>
                ) : null}
                {isEnabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20">
                    {t('plugins.statusActive')}
                  </span>
                ) : null}
                {autoDisabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-error-container text-on-error-container">
                    {t('plugins.statusAutoDisabled')}
                  </span>
                ) : null}
              </div>
              {metaLine ? (
                <p className="text-[11px] text-on-surface-variant/80 truncate">{metaLine}</p>
              ) : null}
            </div>
            <PluginEnableSwitch
              enabled={isEnabled}
              disabled={disabled}
              onToggle={() => onToggle(metadata.id, isEnabled)}
              ariaLabel={isEnabled ? t('plugins.toggleOff') : t('plugins.toggleOn')}
            />
          </div>

          {metadata.description ? (
            <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">{metadata.description}</p>
          ) : null}

          {visibleDomains.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleDomains.map((domain, idx) => (
                <span
                  key={`${domain}-${idx}`}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/15 font-mono"
                >
                  {domain}
                </span>
              ))}
              {extraDomainsCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-outline-variant/15 font-medium">
                  {t('plugins.moreDomains', { count: extraDomainsCount })}
                </span>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-4 py-2.5 border-t border-outline-variant/15 bg-surface-container-high/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onEditSource(plugin)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-45 min-w-0 max-w-full"
            >
              <span className="material-symbols-outlined text-[15px] leading-none text-primary shrink-0">code</span>
              <span className="truncate">{t('plugins.editSourceBtn')}</span>
            </button>
            {effectiveSourceUrl ? (
              <button
                type="button"
                onClick={() => onReload(metadata.id, effectiveSourceUrl)}
                disabled={disabled}
                aria-label={t('plugins.reloadFromSavedUrl')}
                data-tooltip={t('plugins.reloadFromSavedUrl')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer disabled:opacity-45"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDelete(metadata.id, metadata.name)}
              disabled={disabled}
              data-tooltip={t('plugins.delete')}
              aria-label={t('plugins.delete')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-high text-error hover:bg-error/10 transition-colors cursor-pointer disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              data-tooltip={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
              aria-label={expanded ? t('plugins.detailsClose') : t('plugins.detailsOpen')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface transition-colors cursor-pointer"
            >
              <span
                className="material-symbols-outlined text-[18px] leading-none transition-transform duration-200 ease-out"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
            </button>
          </div>
        </div>
        {expandedDetails}
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
  selectors,
  onSelectorsChange,
  includeLatest,
  onIncludeLatestChange,
  autoGenSource,
  onAutoGenSourceChange,
  manualEdit,
  onRegenerateSource,
  copiedAutoGenSource,
  onCopyAutoGenSource,
  testRunning,
  testResult,
  onTest,
  onAnalyze,
  onAnalyzeChapter,
  onGenerate,
  onCancel,
  onClearError,
  analysisMatrix,
  analysisElapsedMs,
  existingMatchedPlugin,
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
          <SectionTitle as="h2">
            {t('plugins.autoGen.title')}
          </SectionTitle>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          data-tooltip={t('plugins.autoGen.cancel')}
          className="shrink-0 p-1.5 -m-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer disabled:opacity-45 disabled:pointer-events-none"
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
              aria-label={t('plugins.msg.dismissAria')}
              data-tooltip={t('plugins.msg.dismissAria')}
              className="shrink-0 p-1 rounded text-current opacity-70 hover:opacity-100 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ) : null}

        {/* Real-time Diagnostic Matrix or Generating Spinner */}
        {(phase === 'analyzing' || phase === 'analyzingChapter') && analysisMatrix ? (
          <AnalysisProgressMatrix matrix={analysisMatrix} elapsedMs={analysisElapsedMs} t={t} />
        ) : isLoading ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <span className="material-symbols-outlined text-[24px] text-primary animate-spin">
              progress_activity
            </span>
            <span className="text-xs sm:text-sm text-on-surface-variant font-medium">{statusLabel}</span>
          </div>
        ) : null}

        {!isLoading && error && analysisMatrix && (phase === 'input' || phase === 'needChapter') ? (
          <AnalysisProgressMatrix matrix={analysisMatrix} elapsedMs={analysisElapsedMs} t={t} />
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
                className="min-w-0 flex-1 bg-surface-container-highest border border-outline-variant/15 rounded-xl text-xs sm:text-sm h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none transition-shadow"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isLoading || !url.trim()}
                className={`${BTN_PRIMARY} sm:w-auto sm:min-w-[8rem] h-10 rounded-xl`}
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
                className="min-w-0 flex-1 bg-surface-container-highest border border-outline-variant/15 rounded-xl text-xs sm:text-sm h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none transition-shadow"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={onAnalyzeChapter}
                disabled={isLoading || !chapterUrl.trim()}
                className={`${BTN_PRIMARY} sm:w-auto sm:min-w-[8rem] h-10 rounded-xl`}
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
            {analysisMatrix ? (
              <AnalysisProgressMatrix matrix={analysisMatrix} elapsedMs={analysisElapsedMs} collapsible t={t} />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle as="h3">
                {t('plugins.autoGen.resultTitle')}
              </SectionTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.template?.label && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                    <span className="material-symbols-outlined text-[13px]">hub</span>
                    <span>{t('plugins.autoGen.template')}: {data.template.label}</span>
                  </span>
                )}
                {(data.usedChromiumFallback || chapterData?.usedChromiumFallback) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    {t('plugins.autoGen.chromiumUsed')}
                  </span>
                )}
                {(data.browserSnifferUsed || chapterData?.browserSnifferUsed) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
                    {t('plugins.autoGen.browserSnifferUsed')}
                  </span>
                )}
                {(data.detected?.chapterStrategy === 'api-json' || chapterData?.imageStrategy === 'api-json') && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                    {t('plugins.autoGen.strategyApiJson')}
                  </span>
                )}
                {(data.detected?.chapterStrategy === 'embedded-json' || chapterData?.imageStrategy === 'embedded-json') && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
                    {t('plugins.autoGen.strategyEmbeddedJson')}
                  </span>
                )}
                {data.detected?.chapterStrategy === 'html-paginated' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                    {t('plugins.autoGen.strategyHtmlPaginated', {
                      pages: data.detected?.chapterPagination?.maxPagesDetected || 2,
                    })}
                  </span>
                )}
                {data.detected?.madaraAjaxChapters && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
                    {t('plugins.autoGen.madaraAjax')}
                  </span>
                )}
                {chapterData?.usesTsReader && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                    {t('plugins.autoGen.tsReaderDetected')}
                  </span>
                )}
              </div>
            </div>

            {/* Editable site name and ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <SectionTitle as="label" className="block">
                  {t('plugins.autoGen.siteName')}
                </SectionTitle>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl text-xs sm:text-sm h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <SectionTitle as="label" className="block">
                  {t('plugins.autoGen.siteId')}
                </SectionTitle>
                <input
                  type="text"
                  value={editId}
                  onChange={(e) => onEditIdChange(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl text-xs sm:text-sm h-10 px-3.5 text-on-surface font-mono focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {existingMatchedPlugin ? (
              <div className="rounded-lg px-3.5 py-2.5 text-xs flex items-center gap-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden>
                  published_with_changes
                </span>
                <p className="flex-1 min-w-0 leading-snug">
                  {t('plugins.autoGen.existingPluginNotice', {
                    name: existingMatchedPlugin.metadata?.name || existingMatchedPlugin.id,
                    id: existingMatchedPlugin.metadata?.id || existingMatchedPlugin.id,
                    version: existingMatchedPlugin.metadata?.version || t('plugins.unknownVersion'),
                  })}
                </p>
              </div>
            ) : null}

            {/* Detection results table */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-highest/50 divide-y divide-outline-variant/10 overflow-hidden">
              {/* Base URL */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <SectionTitle as="span" className="w-28 shrink-0">
                  {t('plugins.autoGen.baseUrl')}
                </SectionTitle>
                <span className="text-xs sm:text-sm text-on-surface font-mono truncate">{data.siteInfo.baseUrl}</span>
              </div>

              {/* Detected title */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <SectionTitle as="span" className="w-28 shrink-0">
                  {t('plugins.autoGen.detectedTitle')}
                </SectionTitle>
                <span className="text-xs sm:text-sm text-on-surface truncate">{data.detected.title || '—'}</span>
              </div>

              {/* Detected author */}
              {data.detected.author ? (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <SectionTitle as="span" className="w-28 shrink-0">
                    {t('plugins.autoGen.author')}
                  </SectionTitle>
                  <span className="text-xs sm:text-sm text-on-surface truncate">{data.detected.author}</span>
                </div>
              ) : null}

              {/* Chapters */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
                <div className="flex items-center gap-3">
                  <SectionTitle as="span" className="w-28 shrink-0">
                    {t('plugins.autoGen.chaptersOk')}
                  </SectionTitle>
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
                {data.detected.chapterCount > 0 && (
                  <span className="text-[11px] font-medium text-on-surface-variant">
                    {t('plugins.autoGen.chapterOrder')}:{' '}
                    <strong className="text-on-surface">
                      {data.detected.chapterOrder === 'asc'
                        ? t('plugins.autoGen.orderAsc')
                        : t('plugins.autoGen.orderDesc')}
                    </strong>
                  </span>
                )}
              </div>

              {/* Images */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <SectionTitle as="span" className="w-28 shrink-0">
                  {t('plugins.autoGen.imagesOk')}
                </SectionTitle>
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

              {/* Latest Updates */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
                <div className="flex items-center gap-3">
                  <SectionTitle as="span" className="w-28 shrink-0">
                    {t('plugins.autoGen.latestUpdatesOk')}
                  </SectionTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        data.detected?.latestUpdates?.detected ? 'text-green-500' : 'text-on-surface-variant/50'
                      }`}
                    >
                      {data.detected?.latestUpdates?.detected ? 'check_circle' : 'remove_circle_outline'}
                    </span>
                    <span className="text-xs sm:text-sm text-on-surface">
                      {data.detected?.latestUpdates?.detected
                        ? t('plugins.autoGen.detectedLatestItems', { count: data.detected.latestUpdates.sampleCount })
                        : t('plugins.autoGen.notDetected')}
                    </span>
                  </div>
                </div>
                {data.detected?.latestUpdates?.detected && (
                  <label className="inline-flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(includeLatest)}
                      onChange={(e) => onIncludeLatestChange(e.target.checked)}
                      className="rounded border-outline-variant/40 text-primary focus:ring-primary"
                    />
                    <span>{t('plugins.autoGen.includeLatestUpdates')}</span>
                  </label>
                )}
              </div>

              {/* API Endpoint (if SPA api-json detected) */}
              {(data.detected?.chapterApi?.urlTemplate || chapterData?.imageApi?.urlTemplate) ? (
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <SectionTitle as="span" className="w-28 shrink-0 pt-0.5">
                    {t('plugins.autoGen.apiEndpointDetected')}
                  </SectionTitle>
                  <div className="min-w-0 flex-1 space-y-1 text-[11px] font-mono text-on-surface-variant">
                    {data.detected?.chapterApi?.urlTemplate ? (
                      <div className="truncate">{data.detected.chapterApi.urlTemplate}</div>
                    ) : null}
                    {chapterData?.imageApi?.urlTemplate ? (
                      <div className="truncate">{chapterData.imageApi.urlTemplate}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Domains */}
              <div className="flex items-start gap-3 px-4 py-2.5">
                <SectionTitle as="span" className="w-28 shrink-0 pt-0.5">
                  {t('plugins.autoGen.domains')}
                </SectionTitle>
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

            {/* Warning if SPA renders DOM only without replayable JSON API */}
            {(data.detected?.spaRenderWarning || chapterData?.spaRenderWarning) ? (
              <div className="rounded-lg px-3.5 py-2.5 text-xs sm:text-sm flex items-start gap-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden>
                  warning
                </span>
                <p className="flex-1 min-w-0 leading-snug">{t('plugins.autoGen.spaRenderWarning')}</p>
              </div>
            ) : null}

            {/* Warning if no images detected */}
            {!chapterData?.imageCount ? (
              <div className="rounded-lg px-3.5 py-2.5 text-xs sm:text-sm flex items-start gap-2.5 bg-surface-container-high/80 text-on-surface-variant border border-outline-variant/15">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden>
                  info
                </span>
                <p className="flex-1 min-w-0 leading-snug">{t('plugins.autoGen.noImages')}</p>
              </div>
            ) : null}

            {/* Advanced CSS Selector Overrides */}
            <details className="group rounded-xl border border-outline-variant/15 bg-surface-container-highest/50 p-3">
              <summary className="cursor-pointer hover:text-on-surface transition-colors flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">
                  chevron_right
                </span>
                <SectionTitle as="span">
                  {t('plugins.autoGen.advancedSelectors')}
                </SectionTitle>
              </summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['titleSelector', t('plugins.autoGen.titleSelector')],
                  ['coverSelector', t('plugins.autoGen.coverSelector')],
                  ['chapterSelector', t('plugins.autoGen.chapterSelector')],
                  ['imageSelector', t('plugins.autoGen.imageSelector')],
                ].map(([fieldKey, labelText]) => (
                  <label key={fieldKey} className="space-y-1 block">
                    <SectionTitle as="span" className="block">
                      {labelText}
                    </SectionTitle>
                    <input
                      type="text"
                      value={selectors?.[fieldKey] || ''}
                      onChange={(e) =>
                        onSelectorsChange((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                      }
                      className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl text-xs font-mono h-10 px-3.5 text-on-surface focus:ring-2 focus:ring-primary/40 focus:border-transparent outline-none"
                    />
                  </label>
                ))}
              </div>
            </details>

            {/* Live Dry-Run Result */}
            {testResult ? (
              <div
                data-testid="autogen-test-result"
                className={`rounded-xl border px-3.5 py-3 text-xs space-y-1.5 ${
                  testResult.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-on-surface'
                    : 'border-error/30 bg-error-container/50 text-on-error-container'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span className={`material-symbols-outlined text-[17px] ${testResult.ok ? 'text-emerald-500' : 'text-error'}`}>
                    {testResult.ok ? 'verified' : 'error'}
                  </span>
                  <span>
                    {testResult.ok
                      ? t('plugins.autoGen.testPassed', { ms: testResult.durationMs || 0 })
                      : t('plugins.autoGen.testFailed', { ms: testResult.durationMs || 0 })}
                  </span>
                </div>
                {testResult.error ? (
                  <p className="text-[11px] leading-snug">{testResult.error}</p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
                    <span>
                      fetchManga:{' '}
                      {testResult.manga?.ok
                        ? t('plugins.autoGen.detectedChapters', { count: testResult.manga.chapterCount })
                        : testResult.manga?.error || t('plugins.autoGen.testStepFail')}
                    </span>
                    <span>
                      fetchChapterImages:{' '}
                      {testResult.chapter?.ok
                        ? t('plugins.autoGen.detectedImages', { count: testResult.chapter.imageCount })
                        : testResult.chapter?.error || t('plugins.autoGen.testStepFail')}
                    </span>
                    {testResult.latest?.supported && (
                      <span>
                        fetchLatestUpdates:{' '}
                        {testResult.latest?.ok
                          ? t('plugins.autoGen.detectedLatestItems', { count: testResult.latest.itemCount })
                          : testResult.latest?.error || t('plugins.autoGen.testStepFail')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Source Code preview / copy */}
            {autoGenSource ? (
              <details className="group rounded-xl border border-outline-variant/15 bg-surface-container-highest/50 p-3">
                <summary className="cursor-pointer hover:text-on-surface transition-colors flex items-center justify-between">
                  <SectionTitle as="span" className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">
                      chevron_right
                    </span>
                    <span>{t('plugins.autoGen.viewSourceHint')}</span>
                  </SectionTitle>
                  <div className="flex items-center gap-1.5">
                    {manualEdit && onRegenerateSource && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRegenerateSource();
                        }}
                        className={BTN_SURFACE}
                      >
                        <span className="material-symbols-outlined text-[14px]">refresh</span>
                        <span>{t('plugins.autoGen.regenerateSource')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onCopyAutoGenSource();
                      }}
                      className={BTN_SURFACE}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copiedAutoGenSource ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedAutoGenSource ? t('plugins.codeCopied') : t('plugins.copyCode')}</span>
                    </button>
                  </div>
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
                onClick={onTest}
                disabled={isLoading || testRunning || !autoGenSource}
                className={`${BTN_SURFACE} h-10`}
              >
                <span className={`material-symbols-outlined text-[18px] leading-none ${testRunning ? 'animate-spin' : 'text-primary'}`}>
                  {testRunning ? 'progress_activity' : 'play_arrow'}
                </span>
                <span>{testRunning ? t('plugins.autoGen.testingPlugin') : t('plugins.autoGen.testPlugin')}</span>
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading || testRunning}
                className={`${BTN_PRIMARY} h-10`}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">auto_fix_high</span>
                <span>{t('plugins.autoGen.generate')}</span>
              </button>
              <button type="button" onClick={onCancel} disabled={isLoading || testRunning} className={`${BTN_SURFACE} h-10`}>
                {t('plugins.autoGen.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
