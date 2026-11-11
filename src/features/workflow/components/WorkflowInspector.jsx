import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect, OutputFormatSelector } from '../../../shared';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import { loadThreads } from '../../../utils/appSettings';
import { useShellNav } from '../../shell';
import PdfConfigForm from '../../ebook-studio/components/forms/PdfConfigForm';
import CbzConfigForm from '../../ebook-studio/components/forms/CbzConfigForm';
import EpubConfigForm from '../../ebook-studio/components/forms/EpubConfigForm';
import MobiConfigForm from '../../ebook-studio/components/forms/MobiConfigForm';

function FolderPickerInput({
  value = '',
  onChange,
  placeholder = '',
  buttonTooltip,
  ariaLabel,
  browseLabel,
  allowClear = true,
  disabled = false,
  defaultPath = '',
}) {
  const handleBrowse = async () => {
    if (disabled) return;
    const api = window.electronAPI || window.electron;
    if (api?.selectDirectory) {
      const dir = await api.selectDirectory(value || defaultPath);
      if (dir) onChange(dir);
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text')?.trim();
    if (text) {
      e.preventDefault();
      onChange(text);
    }
  };

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="relative flex-1 min-w-0">
        <input
          type="text"
          value={value || ''}
          readOnly
          onPaste={handlePaste}
          placeholder={placeholder}
          className={`w-full h-9 ${value && allowClear ? 'pr-7' : 'pr-3'} pl-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40 font-mono text-[11px] cursor-default select-all`}
        />
        {value && allowClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            data-tooltip={t('workflow.inspector.clearSelection', 'Xóa lựa chọn')}
            aria-label={t('workflow.inspector.clearSelection', 'Xóa lựa chọn')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-surface-container-highest hover:bg-error/20 hover:text-error text-on-surface-variant flex items-center justify-center text-[10px] transition-colors cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleBrowse}
        disabled={disabled}
        aria-label={ariaLabel || buttonTooltip || 'Browse'}
        className="cursor-pointer w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-high text-on-surface hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all active:scale-95 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
      </button>
    </div>
  );
}

export default function WorkflowInspector({
  selectedNode,
  nodes = [],
  edges = [],
  workflowName = 'Workflow',
  onChangeWorkflowName,
  nodeCount = 0,
  edgeCount = 0,
  onClose,
  onUpdateData,
  onRemoveNode,
  width = 340,
  onResizeStart,
  defaultDownloadsDir = '',
  onKindleAuthChange,
  onGoogleDriveChange,
}) {
  const { t } = useI18n();
  let setMenuView = null;
  try {
    const nav = useShellNav();
    setMenuView = nav?.setMenuView || null;
  } catch {
    setMenuView = null;
  }

  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [defaultSaveDir, setDefaultSaveDir] = useState('');
  const [showAllChaptersPreview, setShowAllChaptersPreview] = useState(false);
  const [isFetchingUpstream, setIsFetchingUpstream] = useState(false);

  // Amazon Send to Kindle authentication state
  const [kindleAuth, setKindleAuth] = useState({ checking: true, loggedIn: false, account: '' });
  const [isLoggingInKindle, setIsLoggingInKindle] = useState(false);

  // Google Drive connection status
  const [gdriveStatus, setGdriveStatus] = useState({
    checking: false,
    detectedPath: null,
    testingApi: false,
    testedApi: null,
  });

  const checkGoogleDriveLocal = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (!api?.workflowDetectGoogleDrive) {
      setGdriveStatus((prev) => ({ ...prev, checking: false, detectedPath: null }));
      return;
    }
    setGdriveStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await api.workflowDetectGoogleDrive();
      const detected = res?.ok && res.detectedPath ? res.detectedPath : null;
      setGdriveStatus((prev) => ({
        ...prev,
        checking: false,
        detectedPath: detected,
      }));
      onGoogleDriveChange && onGoogleDriveChange();
    } catch {
      setGdriveStatus((prev) => ({ ...prev, checking: false, detectedPath: null }));
    }
  }, [onGoogleDriveChange]);

  const handleTestGoogleDriveToken = useCallback(async (token) => {
    const cleanToken = (token || '').trim().replace(/^Bearer\s+/i, '');
    if (!cleanToken) return;

    setGdriveStatus((prev) => ({ ...prev, testingApi: true, testedApi: null }));
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;

    let handled = false;
    if (api?.workflowTestGoogleDriveToken) {
      try {
        const res = await api.workflowTestGoogleDriveToken({ accessToken: cleanToken });
        if (res) {
          setGdriveStatus((prev) => ({
            ...prev,
            testingApi: false,
            testedApi: res,
          }));
          handled = true;
        }
      } catch (ipcErr) {
        // Main process may not have been restarted yet; fallback to direct fetch
        console.warn('[Workflow] IPC testGoogleDriveToken failed, falling back to direct fetch:', ipcErr);
      }
    }

    if (!handled) {
      try {
        const resp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
          },
        });
        const parsed = await resp.json();
        if (resp.ok && parsed.user) {
          setGdriveStatus((prev) => ({
            ...prev,
            testingApi: false,
            testedApi: {
              ok: true,
              displayName: parsed.user.displayName,
              emailAddress: parsed.user.emailAddress,
              photoLink: parsed.user.photoLink,
            },
          }));
        } else {
          setGdriveStatus((prev) => ({
            ...prev,
            testingApi: false,
            testedApi: {
              ok: false,
              error: parsed.error?.message || `HTTP ${resp.status}: Token không hợp lệ hoặc đã hết hạn`,
            },
          }));
        }
      } catch (fetchErr) {
        setGdriveStatus((prev) => ({
          ...prev,
          testingApi: false,
          testedApi: {
            ok: false,
            error: fetchErr.message || 'Lỗi mạng khi kiểm tra Google API',
          },
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (selectedNode?.type === 'upload_google_drive') {
      checkGoogleDriveLocal();
    }
  }, [selectedNode?.type, checkGoogleDriveLocal]);

  const refreshKindleAuth = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (!api?.sendToKindleIsLoggedIn) {
      setKindleAuth({ checking: false, loggedIn: false, account: '' });
      return;
    }
    setKindleAuth((prev) => ({ ...prev, checking: true }));
    try {
      const r = await api.sendToKindleIsLoggedIn();
      const loggedIn = Boolean(r?.ok && r?.loggedIn);
      const account = String(r?.account || '').trim();
      setKindleAuth({ checking: false, loggedIn, account });
      onKindleAuthChange && onKindleAuthChange(loggedIn);
    } catch {
      setKindleAuth({ checking: false, loggedIn: false, account: '' });
    }
  }, [onKindleAuthChange]);

  useEffect(() => {
    if (selectedNode?.type === 'send_to_kindle') {
      refreshKindleAuth();
    }
  }, [selectedNode?.type, refreshKindleAuth]);

  const handleGoToKindleTab = useCallback(() => {
    try {
      localStorage.setItem('ebook_studio_active_subtab', 'kindle');
      window.dispatchEvent(new CustomEvent('ebook_studio:switch_subtab', { detail: { subtab: 'kindle' } }));
    } catch {}
    if (setMenuView) setMenuView('ebookStudio');
  }, [setMenuView]);

  const handleLoginAmazon = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (!api?.sendToKindleLogin) return;
    setIsLoggingInKindle(true);
    try {
      const r = await api.sendToKindleLogin();
      const loggedIn = Boolean(r?.loggedIn);
      const account = String(r?.account || '').trim();
      setKindleAuth({ checking: false, loggedIn, account });
      onKindleAuthChange && onKindleAuthChange(loggedIn);
    } catch {
      setKindleAuth({ checking: false, loggedIn: false, account: '' });
    } finally {
      setIsLoggingInKindle(false);
    }
  }, [onKindleAuthChange]);

  useEffect(() => {
    const api = window.electronAPI || window.electron;
    if (api?.getSavedDownloadPath) {
      api.getSavedDownloadPath().then((dir) => {
        if (dir) setDefaultSaveDir(dir);
      }).catch(() => {});
    }
  }, []);

  const data = selectedNode?.data || {};

  const handleChange = (field, value) => {
    if (!selectedNode) return;
    onUpdateData(selectedNode.id, { [field]: value });
  };

  const handleUpdateOptions = (patch) => {
    if (!selectedNode) return;
    onUpdateData(selectedNode.id, patch);
  };

  // Upstream node & chapter detection
  const upstreamEdge = edges?.find(
    (e) => e.target === selectedNode?.id && (e.targetHandle === 'url' || !e.targetHandle)
  );
  const upstreamNode = upstreamEdge ? nodes?.find((n) => n.id === upstreamEdge.source) : null;
  const availableChapters = (selectedNode?.data?.cachedChapters?.length ? selectedNode.data.cachedChapters : null)
    || (upstreamNode?.data?.cachedChapters?.length ? upstreamNode.data.cachedChapters : null)
    || [];
  const detectedMangaTitle = selectedNode?.data?.mangaTitle || upstreamNode?.data?.mangaTitle || '';

  const appThreads = useMemo(() => {
    try {
      return loadThreads();
    } catch {
      return 5;
    }
  }, []);

  const handleFetchUpstreamChapters = async () => {
    const targetUrl = upstreamNode?.data?.defaultUrl || data.defaultUrl;
    if (!targetUrl) return;
    setIsFetchingUpstream(true);
    try {
      const api = window.electronAPI || window.electron;
      if (api?.loadManga) {
        const res = await api.loadManga(null, targetUrl.trim());
        if (res && res.ok && res.chapters?.length) {
          const title = res.manga?.title || res.title || 'Truyện tranh';
          if (upstreamNode) {
            onUpdateData(upstreamNode.id, {
              mangaTitle: title,
              coverUrl: res.manga?.coverUrl || res.coverUrl || '',
              cachedChapters: res.chapters,
            });
          }
          if (selectedNode) {
            onUpdateData(selectedNode.id, {
              mangaTitle: title,
              coverUrl: res.manga?.coverUrl || res.coverUrl || '',
              cachedChapters: res.chapters,
            });
          }
        }
      }
    } catch (e) {
      console.error('Fetch upstream error', e);
    } finally {
      setIsFetchingUpstream(false);
    }
  };

  const handleCheckUrl = async () => {
    const url = data.defaultUrl?.trim();
    if (!url) return;
    setIsCheckingUrl(true);
    setCheckResult(null);
    try {
      const api = window.electronAPI || window.electron;
      if (api?.loadManga) {
        const res = await api.loadManga(null, url);
        if (res && res.ok && res.chapters?.length) {
          const title = res.manga?.title || res.title || 'Truyện tranh';
          setCheckResult({
            ok: true,
            title,
            totalChapters: res.chapters.length,
          });
          if (selectedNode) {
            onUpdateData(selectedNode.id, {
              mangaTitle: title,
              coverUrl: res.manga?.coverUrl || res.coverUrl || '',
              cachedChapters: res.chapters,
            });
          }
        } else {
          setCheckResult({ ok: false, error: res?.error || 'Không tìm thấy chapter nào từ link này' });
        }
      } else {
        setCheckResult({ ok: true, title: 'Truyện Mẫu Test', totalChapters: 25 });
      }
    } catch (e) {
      setCheckResult({ ok: false, error: e.message || String(e) });
    } finally {
      setIsCheckingUrl(false);
    }
  };

  if (!selectedNode) {
    return (
      <aside
        style={{ width: `${width}px` }}
        className="bg-surface-container-lowest border-l border-outline-variant/20 flex flex-col h-full shrink-0 select-none z-20 text-on-surface relative min-h-0 overflow-visible"
      >
        {/* Draggable Resize Handle on the left border (Manga Studio style) */}
        {onResizeStart && (
          <ResizeSplitter
            variant="overlay"
            side="left"
            onPointerDown={onResizeStart}
            ariaLabel={t('workflow.inspector.resizeTooltip')}
            data-tooltip={t('workflow.inspector.resizeTooltip')}
          />
        )}

        {/* Header */}
        <div className="p-3.5 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-base">tune</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-on-surface truncate">{t('workflow.inspector.title')}</div>
              <div className="text-[10px] text-on-surface-variant font-mono">{t('workflow.inspector.subtitle')}</div>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              data-tooltip={t('workflow.inspector.collapse')}
              aria-label={t('workflow.inspector.collapse')}
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>

        {/* Empty State / Overview Body with smooth scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar ml-1.5 p-4 space-y-4 text-on-surface">
          <div className="p-3.5 rounded-2xl bg-surface-container/50 border border-outline-variant/25 flex flex-col gap-2">
            {onChangeWorkflowName ? (
              <input
                type="text"
                value={workflowName}
                onChange={(e) => onChangeWorkflowName(e.target.value)}
                placeholder={t('workflow.toolbar.namePlaceholder')}
                className="bg-transparent text-xs font-bold text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1.5 py-0.5 -ml-1.5 hover:bg-surface-container border border-transparent hover:border-outline-variant/20 transition-colors truncate"
              />
            ) : (
              <div className="text-xs font-bold text-on-surface truncate">{workflowName || 'Workflow'}</div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span className="px-2 py-0.5 rounded-md bg-surface-container-high border border-outline-variant/20 font-medium">
                {t('workflow.inspector.nodesCount', { count: nodeCount })}
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-md bg-surface-container-high border border-outline-variant/20 font-medium">
                {t('workflow.inspector.edgesCount', { count: edgeCount })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
              {t('workflow.inspector.shortcutsTitle')}
            </span>
            <div className="space-y-1.5 text-xs text-on-surface-variant">
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.moveNode')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.moveNodeKey')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.panCanvas')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.panCanvasKey')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.zoom')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.zoomKey')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.connectWire')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.connectWireKey')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.disconnectWire')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.disconnectWireKey')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 flex items-center justify-between gap-2">
                <span>{t('workflow.inspector.deselectNode')}</span>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t('workflow.inspector.deselectNodeKey')}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const def = NODE_DEFINITIONS[selectedNode.type] || {
    title: selectedNode.type,
    icon: 'settings',
    description: '',
  };

  const nodeTitle = t(`workflow.nodeDef.${selectedNode.type}.title`, def.title);
  const nodeDesc = t(`workflow.nodeDef.${selectedNode.type}.desc`, def.description);

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-surface-container-lowest border-l border-outline-variant/20 flex flex-col h-full shrink-0 select-none z-20 text-on-surface relative min-h-0 overflow-visible"
    >
      {/* Draggable Resize Handle on the left border (Manga Studio style) */}
      {onResizeStart && (
        <ResizeSplitter
          variant="overlay"
          side="left"
          onPointerDown={onResizeStart}
          ariaLabel={t('workflow.inspector.resizeTooltip')}
          data-tooltip={t('workflow.inspector.resizeTooltip')}
        />
      )}

      {/* Header */}
      <div className="p-3.5 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-base">{def.icon}</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-on-surface truncate">{nodeTitle}</div>
            <div className="text-[10px] text-on-surface-variant font-mono truncate">ID: {selectedNode.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onRemoveNode(selectedNode.id)}
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            data-tooltip={t('workflow.inspector.deleteNodeBtn')}
            aria-label={t('workflow.inspector.deleteNodeBtn')}
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </div>

      {/* Settings Form Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar ml-1.5 p-4 space-y-4 text-on-surface">
        <p className="text-xs text-on-surface-variant leading-relaxed">{nodeDesc}</p>

        {/* ── Type Specific Fields ── */}
        {selectedNode.type === 'manga_crawler' && (
          <div className="space-y-3.5">
            {/* ── Section 1: URL & Manga Info ── */}
            <div className="p-3 rounded-2xl bg-surface-container/40 border border-outline-variant/20 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider">
                <span className="material-symbols-outlined text-sm">link</span>
                <span>{t('workflow.inspector.mangaCrawler.urlSection', 'Nguồn & URL Truyện')}</span>
              </div>

              <div className="space-y-1.5">
                <input
                  type="text"
                  value={data.defaultUrl || ''}
                  onChange={(e) => handleChange('defaultUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40 font-mono text-[11px]"
                />
              </div>

              <button
                type="button"
                disabled={isCheckingUrl || !data.defaultUrl}
                onClick={handleCheckUrl}
                className="w-full py-1.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-xs text-primary font-medium flex items-center justify-center gap-1.5 border border-outline-variant/30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-outlined text-sm ${isCheckingUrl ? 'animate-spin' : ''}`}>
                  {isCheckingUrl ? 'sync' : 'search'}
                </span>
                <span>{isCheckingUrl ? 'Đang kiểm tra link...' : 'Kiểm tra link & Nạp chapter'}</span>
              </button>

              {(checkResult || detectedMangaTitle) && (
                <div className={`p-2.5 rounded-xl text-xs space-y-1 border ${
                  checkResult && !checkResult.ok
                    ? 'bg-error/10 border-error/30 text-error'
                    : 'bg-primary/10 border-primary/30 text-on-surface'
                }`}>
                  {checkResult && !checkResult.ok ? (
                    <div>⚠️ {checkResult.error}</div>
                  ) : (
                    <>
                      <div className="font-bold text-primary truncate">📖 {detectedMangaTitle || checkResult?.title}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        Tìm thấy <strong>{availableChapters.length || checkResult?.totalChapters || 0}</strong> chapter sẵn sàng tải
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Section 2: Chapter Filter Strategy ── */}
            <div className="p-3 rounded-2xl bg-surface-container/40 border border-outline-variant/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  <span>{t('workflow.inspector.mangaCrawler.filterSection', 'Bộ Lọc Chapter')}</span>
                </div>
                {availableChapters.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-bold">
                    {availableChapters.length} chap
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'all')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (data.strategy || 'all') !== 'latest'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">select_all</span>
                  <span>Tất Cả Chapter</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'latest')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    data.strategy === 'latest'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">update</span>
                  <span>N Mới Nhất</span>
                </button>
              </div>

              {/* Sub-strategy: ALL */}
              {(data.strategy || 'all') !== 'latest' && (
                <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-on-surface">
                    <span className="material-symbols-outlined text-primary text-base shrink-0">check_circle</span>
                    <span className="leading-snug">
                      Tải <strong>toàn bộ {availableChapters.length ? `${availableChapters.length} chapter` : 'tất cả chapter'}</strong> của truyện.
                    </span>
                  </div>
                  {availableChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllChaptersPreview(!showAllChaptersPreview)}
                      className="cursor-pointer text-[11px] text-primary hover:opacity-80 transition-opacity flex items-center gap-1 font-medium"
                    >
                      <span className="material-symbols-outlined text-xs">
                        {showAllChaptersPreview ? 'expand_less' : 'expand_more'}
                      </span>
                      <span>{showAllChaptersPreview ? 'Thu gọn danh sách' : `Xem trước ${availableChapters.length} chapter`}</span>
                    </button>
                  )}
                  {showAllChaptersPreview && availableChapters.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 p-1 rounded-lg bg-surface-container border border-outline-variant/15 text-[11px] text-on-surface-variant font-mono custom-scrollbar">
                      {availableChapters.map((c, i) => (
                        <div key={c.id || c.url || i} className="px-2 py-1 truncate hover:bg-surface-container-high rounded flex items-center justify-between">
                          <span className="truncate">{i + 1}. {c.title || c.chapterName || `Chapter ${c.chapterNumber || i + 1}`}</span>
                          {c.chapterNumber != null && <span className="text-[10px] text-on-surface-variant/60 shrink-0">#{c.chapterNumber}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-strategy: LATEST */}
              {data.strategy === 'latest' && (
                <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface font-medium">Số chapter mới nhất cần tải:</span>
                    <input
                      type="number"
                      min="1"
                      max={availableChapters.length || 9999}
                      value={data.latestCount || 1}
                      onChange={(e) => handleChange('latestCount', Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-right text-primary font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Section 3: Storage & Download Settings ── */}
            <div className="p-3 rounded-2xl bg-surface-container/40 border border-outline-variant/20 space-y-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider">
                <span className="material-symbols-outlined text-sm">download</span>
                <span>{t('workflow.inspector.mangaCrawler.downloadSection', 'Lưu Trữ & Luồng Tải')}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant">Thư Mục Lưu Truyện</label>
                <FolderPickerInput
                  value={data.outputBaseDir || ''}
                  onChange={(dir) => handleChange('outputBaseDir', dir)}
                  placeholder={defaultSaveDir ? `Mặc định: ${defaultSaveDir}` : 'Mặc định: thư mục downloads của app'}
                  buttonTooltip={t('workflow.inspector.selectFolder')}
                  browseLabel={t('workflow.inspector.browse')}
                  allowClear={true}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                  <span>
                    Luồng tải đồng thời: <strong className="text-primary">{Math.min(5, Math.max(1, data.concurrency !== undefined ? data.concurrency : appThreads))}</strong>
                  </span>
                  <span className="text-[10px] text-on-surface-variant/70 font-normal">
                    Cài đặt app: {appThreads} luồng (Tối đa 5)
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={Math.min(5, Math.max(1, data.concurrency !== undefined ? data.concurrency : appThreads))}
                  onChange={(e) => handleChange('concurrency', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'manual_trigger' && (
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">URL Truyện</label>
              <input
                type="text"
                value={data.defaultUrl || ''}
                onChange={(e) => handleChange('defaultUrl', e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40"
              />
            </div>
            <button
              type="button"
              disabled={isCheckingUrl || !data.defaultUrl}
              onClick={handleCheckUrl}
              className="w-full py-1.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-xs text-primary font-medium flex items-center justify-center gap-1.5 border border-outline-variant/30 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined text-sm ${isCheckingUrl ? 'animate-spin' : ''}`}>
                {isCheckingUrl ? 'sync' : 'search'}
              </span>
              <span>{isCheckingUrl ? 'Đang kiểm tra link...' : 'Kiểm tra link & Nạp chapter'}</span>
            </button>
            {checkResult && (
              <div className={`p-2.5 rounded-xl text-xs space-y-1 border ${
                checkResult.ok ? 'bg-primary/10 border-primary/30 text-on-surface' : 'bg-error/10 border-error/30 text-error'
              }`}>
                {checkResult.ok ? (
                  <>
                    <div className="font-bold text-primary truncate">📖 {checkResult.title}</div>
                    <div className="text-[11px] text-on-surface-variant">Tìm thấy <strong>{checkResult.totalChapters}</strong> chapter sẵn sàng tải</div>
                  </>
                ) : (
                  <div>⚠️ {checkResult.error}</div>
                )}
              </div>
            )}
          </div>
        )}

        {selectedNode.type === 'folder_trigger' && (
          <div className="space-y-3">
            <FolderPickerInput
              value={data.folderPath || ''}
              onChange={(dir) => handleChange('folderPath', dir)}
              placeholder={defaultDownloadsDir || t('workflow.inspector.folderTriggerSourceDirPlaceholder')}
              buttonTooltip={t('workflow.inspector.selectFolderTrigger')}
              browseLabel={t('workflow.inspector.browse')}
              allowClear={true}
              defaultPath={defaultDownloadsDir}
            />
            {defaultDownloadsDir && data.folderPath !== defaultDownloadsDir && (
              <button
                type="button"
                onClick={() => handleChange('folderPath', defaultDownloadsDir)}
                className="text-[11px] text-primary hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer font-medium"
              >
                <span className="material-symbols-outlined text-[14px]">history</span>
                <span>Đặt về thư mục Download ({defaultDownloadsDir})</span>
              </button>
            )}
          </div>
        )}

        {selectedNode.type === 'chapter_selector' && (
          <div className="space-y-3">
            {detectedMangaTitle && (
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-primary font-bold uppercase tracking-wider">Truyện Đã Liên Kết</div>
                  <div className="text-xs font-bold text-on-surface truncate">📖 {detectedMangaTitle}</div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-bold shrink-0">
                  {availableChapters.length} chap
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">Quy Tắc Lọc</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'all')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (data.strategy || 'all') !== 'latest'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">select_all</span>
                  <span>Tất Cả</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'latest')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    data.strategy === 'latest'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">update</span>
                  <span>N Mới Nhất</span>
                </button>
              </div>
            </div>

            {/* Strategy: ALL */}
            {(data.strategy || 'all') !== 'latest' && (
              <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                <div className="flex items-center gap-2 text-xs text-on-surface">
                  <span className="material-symbols-outlined text-primary text-base shrink-0">check_circle</span>
                  <span className="leading-snug">
                    Tải <strong>toàn bộ {availableChapters.length ? `${availableChapters.length} chapter` : 'tất cả chapter'}</strong> của truyện.
                  </span>
                </div>
                {availableChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllChaptersPreview(!showAllChaptersPreview)}
                    className="cursor-pointer text-[11px] text-primary hover:opacity-80 transition-opacity flex items-center gap-1 font-medium"
                  >
                    <span className="material-symbols-outlined text-xs">
                      {showAllChaptersPreview ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{showAllChaptersPreview ? 'Thu gọn danh sách' : `Xem trước ${availableChapters.length} chapter`}</span>
                  </button>
                )}
                {showAllChaptersPreview && availableChapters.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1 p-1 rounded-lg bg-surface-container border border-outline-variant/15 text-[11px] text-on-surface-variant font-mono">
                    {availableChapters.map((c, i) => (
                      <div key={c.id || c.url || i} className="px-2 py-1 truncate hover:bg-surface-container-high rounded flex items-center justify-between">
                        <span className="truncate">{i + 1}. {c.title || c.chapterName || `Chapter ${c.chapterNumber || i + 1}`}</span>
                        {c.chapterNumber != null && <span className="text-[10px] text-on-surface-variant/60 shrink-0">#{c.chapterNumber}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Strategy: LATEST */}
            {data.strategy === 'latest' && (
              <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface font-medium">Số chapter mới nhất cần tải:</span>
                  <input
                    type="number"
                    min="1"
                    max={availableChapters.length || 9999}
                    value={data.latestCount || 1}
                    onChange={(e) => handleChange('latestCount', Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-2 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-right text-primary font-bold focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Empty chapters notice / Fetch helper */}
            {availableChapters.length === 0 && (
              <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/25 text-xs text-on-surface-variant space-y-2">
                <div className="flex items-center gap-2 text-on-surface font-semibold">
                  <span className="material-symbols-outlined text-primary text-sm">info</span>
                  <span>Chưa có danh sách Chapter</span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {upstreamNode?.data?.defaultUrl
                    ? `Đã nối với liên kết: ${upstreamNode.data.defaultUrl}`
                    : 'Hãy nối dây từ khối "Nhập URL Truyện" và bấm "Kiểm tra link" để nạp chapter.'}
                </p>
                {upstreamNode?.data?.defaultUrl && (
                  <button
                    type="button"
                    disabled={isFetchingUpstream}
                    onClick={handleFetchUpstreamChapters}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-xs ${isFetchingUpstream ? 'animate-spin' : ''}`}>
                      {isFetchingUpstream ? 'sync' : 'download'}
                    </span>
                    <span>{isFetchingUpstream ? 'Đang nạp chapter...' : 'Nạp danh sách chapter từ URL'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {selectedNode.type === 'downloader' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                Thư Mục Lưu Truyện
              </label>
              <FolderPickerInput
                value={data.outputBaseDir || ''}
                onChange={(dir) => handleChange('outputBaseDir', dir)}
                placeholder={defaultSaveDir ? `Mặc định: ${defaultSaveDir}` : 'Mặc định: thư mục downloads của app'}
                buttonTooltip={t('workflow.inspector.selectFolder')}
                browseLabel={t('workflow.inspector.browse')}
                allowClear={true}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                <span>
                  Luồng tải đồng thời: <strong className="text-primary">{Math.min(5, Math.max(1, data.concurrency !== undefined ? data.concurrency : appThreads))}</strong>
                </span>
                <span className="text-[10px] text-on-surface-variant/70 font-normal">
                  Cài đặt app: {appThreads} luồng (Tối đa 5)
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={Math.min(5, Math.max(1, data.concurrency !== undefined ? data.concurrency : appThreads))}
                onChange={(e) => handleChange('concurrency', Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                Đồng bộ theo cấu hình giới hạn tải đa luồng của ứng dụng (1 - 5 luồng song song).
              </p>
            </div>
          </div>
        )}

        {['export_cbz', 'export_pdf', 'export_epub', 'export_mobi'].includes(selectedNode.type) && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                Thư Mục Xuất File {selectedNode.type.replace('export_', '').toUpperCase()}
              </label>
              <FolderPickerInput
                value={data.outputDir || ''}
                onChange={(dir) => handleChange('outputDir', dir)}
                placeholder="Mặc định: lưu cùng thư mục ảnh truyện"
                buttonTooltip={t('workflow.inspector.selectSaveDir')}
                browseLabel={t('workflow.inspector.browse')}
                allowClear={true}
              />
            </div>

            {/* Config Form according to node type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                Tùy Chọn Đóng Gói {selectedNode.type.replace('export_', '').toUpperCase()}
              </label>
              {selectedNode.type === 'export_pdf' && (
                <PdfConfigForm options={data} onChange={handleUpdateOptions} />
              )}
              {selectedNode.type === 'export_cbz' && (
                <CbzConfigForm options={data} onChange={handleUpdateOptions} />
              )}
              {selectedNode.type === 'export_epub' && (
                <EpubConfigForm options={data} onChange={handleUpdateOptions} />
              )}
              {selectedNode.type === 'export_mobi' && (
                <MobiConfigForm options={data} onChange={handleUpdateOptions} />
              )}
            </div>

            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(data.trashSourceAfterExport)}
                onChange={(e) => handleChange('trashSourceAfterExport', e.target.checked)}
                className="mt-0.5 rounded accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-on-surface-variant leading-tight">
                Tự động đưa thư mục ảnh tải về vào Thùng rác (Recycle Bin) sau khi xuất xong
              </span>
            </label>
          </div>
        )}

        {selectedNode.type === 'convert_book' && (
          <div className="space-y-4">
            {/* Target format selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.targetFormat', 'Định dạng đầu ra mong muốn')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'epub', label: 'EPUB', desc: 'Kindle / E-Reader', icon: 'menu_book' },
                  { id: 'mobi', label: 'MOBI', desc: 'Kindle đời cũ', icon: 'tablet_android' },
                  { id: 'pdf', label: 'PDF', desc: 'Tài liệu cố định', icon: 'picture_as_pdf' },
                  { id: 'cbz', label: 'CBZ', desc: 'Comic Book Zip', icon: 'archive' },
                  { id: 'folder', label: 'Thư mục ảnh', desc: 'Rã tách ảnh gốc', icon: 'photo_library' },
                ].map((fmt) => {
                  const isSelected = (data.targetFormat || 'epub') === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => handleChange('targetFormat', fmt.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-xs'
                          : 'border-outline-variant/30 hover:bg-surface-container'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                          isSelected ? 'text-primary' : 'text-on-surface-variant'
                        }`}
                      >
                        {fmt.icon}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                          {fmt.label}
                        </div>
                        <div className="text-[10px] text-on-surface-variant/70 truncate">
                          {fmt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hint message explaining active output port */}
            <div className="p-2.5 rounded-xl bg-surface-container/50 border border-outline-variant/15 text-[11px] text-on-surface-variant flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 shrink-0">info</span>
              <span>
                {(data.targetFormat || 'epub') === 'folder'
                  ? 'Toàn bộ trang ảnh trong sách sẽ được giải nén ra Thư mục ảnh (kết nối cổng ra "Folder Ảnh").'
                  : `Chuyển đổi sách sang tệp ${(data.targetFormat || 'epub').toUpperCase()} mới (kết nối cổng ra "File Sách Mới").`}
              </span>
            </div>

            {/* Output Directory Picker */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.convertOutputDir', 'Thư mục lưu kết quả')}
              </label>
              <FolderPickerInput
                value={data.outputDir || ''}
                onChange={(dir) => handleChange('outputDir', dir)}
                placeholder="Mặc định: lưu cùng thư mục file sách nguồn"
                buttonTooltip={t('workflow.inspector.selectSaveDir')}
                browseLabel={t('workflow.inspector.browse')}
                allowClear={true}
              />
            </div>

            {/* Format specific config options */}
            {(data.targetFormat || 'epub') === 'pdf' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Tùy Chọn File PDF Đầu Ra
                </label>
                <PdfConfigForm options={data} onChange={handleUpdateOptions} />
              </div>
            )}
            {(data.targetFormat || 'epub') === 'cbz' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Tùy Chọn File CBZ Đầu Ra
                </label>
                <CbzConfigForm options={data} onChange={handleUpdateOptions} />
              </div>
            )}
            {(data.targetFormat || 'epub') === 'epub' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Tùy Chọn File EPUB Đầu Ra
                </label>
                <EpubConfigForm options={data} onChange={handleUpdateOptions} />
              </div>
            )}
            {(data.targetFormat || 'epub') === 'mobi' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Tùy Chọn File MOBI Đầu Ra
                </label>
                <MobiConfigForm options={data} onChange={handleUpdateOptions} />
              </div>
            )}
            {(data.targetFormat || 'epub') === 'folder' && (
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(data.rotateDoublePage)}
                  onChange={(e) => handleChange('rotateDoublePage', e.target.checked)}
                  className="mt-0.5 rounded accent-primary cursor-pointer"
                />
                <span className="text-[11px] text-on-surface-variant leading-tight">
                  Tự động phát hiện và xoay trang đôi (nếu có)
                </span>
              </label>
            )}
          </div>
        )}

        {selectedNode.type === 'trash_cleanup' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 text-base shrink-0 mt-0.5">
                delete_sweep
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">Dọn dẹp an toàn qua Thùng rác</p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Toàn bộ file ảnh/thư mục chapter đã tải về sẽ được chuyển vào <strong>Thùng rác (Recycle Bin)</strong> của hệ điều hành để bạn có thể khôi phục lại khi cần.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={data.preserveBookFiles !== false}
                onChange={(e) => handleChange('preserveBookFiles', e.target.checked)}
                className="mt-0.5 rounded accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-on-surface-variant leading-tight">
                Bảo vệ file sách (.cbz, .pdf) không bao giờ bị xóa
              </span>
            </label>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                Thư Mục Tải Về Cần Dọn Dẹp
              </label>
              <FolderPickerInput
                value={data.targetDir || ''}
                onChange={(dir) => handleChange('targetDir', dir)}
                placeholder="Mặc định: tự nhận từ node tải truyện trước"
                buttonTooltip={t('workflow.inspector.selectCleanDir')}
                browseLabel={t('workflow.inspector.browse')}
                allowClear={true}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'split_double_page' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">Chiều Đọc Sách</label>
              <SearchableSelect
                value={data.readingDirection || 'rtl'}
                onChange={(v) => handleChange('readingDirection', v)}
                options={[
                  { value: 'rtl', label: 'Phải sang Trái (RTL - Manga Nhật)', materialIcon: 'format_textdirection_r_to_l' },
                  { value: 'ltr', label: 'Trái sang Phải (LTR - Manhwa / Comic)', materialIcon: 'format_textdirection_l_to_r' },
                ]}
                className="w-full"
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'duplicate_cleaner' && (
          <div className="space-y-3">
            {/* Điều kiện nhóm trùng lặp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                <label>Điều kiện nhóm trùng:</label>
                <span className="text-primary font-bold text-xs">≥ {data.minDuplicateCount || 3} ảnh</span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                value={data.minDuplicateCount || 3}
                onChange={(e) => handleChange('minDuplicateCount', Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-[10px] text-on-surface-variant/80 leading-relaxed">
                Chỉ khi phát hiện từ <strong>{data.minDuplicateCount || 3} ảnh</strong> giống hệt/tương đồng trở lên mới giữ 1 ảnh gốc và chuyển các ảnh dư thừa vào Thùng rác. Nhóm ít hơn sẽ giữ nguyên an toàn.
              </p>
            </div>

            {/* Độ nhạy */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                Độ nhạy tương đồng: {data.similarityThreshold || 92}%
              </label>
              <input
                type="range"
                min="80"
                max="99"
                value={data.similarityThreshold || 92}
                onChange={(e) => handleChange('similarityThreshold', Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            {/* Quét đệ quy */}
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={data.recursive !== false}
                onChange={(e) => handleChange('recursive', e.target.checked)}
                className="mt-0.5 rounded accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-on-surface-variant leading-tight">
                Quét đệ quy tất cả các thư mục chapter con
              </span>
            </label>
          </div>
        )}

        {selectedNode.type === 'rename_folder' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base shrink-0 mt-0.5">
                drive_file_rename_outline
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">Tự Động Chuẩn Hoá Thư Mục</p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Đồng bộ chuẩn Tab Đổi Tên: Tự động nhận diện số chapter (1, 10, 100 hoặc 01, 01.5), padding số 001, 010 đồng nhất và xử lý chapter thập phân.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">Chế Độ Đổi Tên</label>
              <SearchableSelect
                value={data.mode || 'autoNormalize'}
                onChange={(v) => handleChange('mode', v)}
                options={[
                  { value: 'autoNormalize', label: 'Tự Chuẩn Hoá Thư Mục (Chuẩn Tab Đổi Tên)', materialIcon: 'auto_fix_high' },
                  { value: 'pattern', label: 'Đổi tên theo Mẫu tuỳ chỉnh (Pattern)', materialIcon: 'pattern' },
                ]}
                className="w-full"
              />
            </div>

            {(!data.mode || data.mode === 'autoNormalize') && (
              <div className="space-y-2.5 p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <div className="text-[11px] font-semibold text-on-surface">Tuỳ chọn thay thế tiền tố (Tuỳ chọn)</div>
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant">Tìm chuỗi (VD: "Ch." hoặc "Chapter"):</label>
                  <input
                    type="text"
                    value={data.find || ''}
                    onChange={(e) => handleChange('find', e.target.value)}
                    placeholder="Để trống nếu chỉ cần padding số"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant">Thay bằng (VD: "Chap "):</label>
                  <input
                    type="text"
                    value={data.replace || ''}
                    onChange={(e) => handleChange('replace', e.target.value)}
                    placeholder="Chap "
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/40"
                  />
                </div>
              </div>
            )}

            {data.mode === 'pattern' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-on-surface-variant">Mẫu Đặt Tên (Pattern)</label>
                  <input
                    type="text"
                    value={data.pattern || '{manga} - Chap {chap_padded}'}
                    onChange={(e) => handleChange('pattern', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-on-surface-variant">Số lượng số 0 padding: {data.paddingLength || 3}</label>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    value={data.paddingLength || 3}
                    onChange={(e) => handleChange('paddingLength', Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {selectedNode.type === 'image_upscale' && (
          <div className="space-y-4">
            {/* Engine Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.upscaleEngine', 'Bộ máy Upscale')}
              </label>
              <SearchableSelect
                value={data.engine || 'mangajanai'}
                onChange={(v) => {
                  handleChange('engine', v);
                  if (v === 'mangajanai') {
                    handleChange('model', (data.scale || 2) === 4 ? 'mangajanai-4x-1600p' : 'mangajanai-2x-1600p');
                  } else if (v === 'waifu2x-caffe') {
                    handleChange('model', 'cunet');
                  } else if (v === 'realesrgan-ncnn-vulkan') {
                    handleChange('model', 'realesrgan-x4plus-anime');
                  } else if (v === 'realcugan-ncnn-vulkan') {
                    handleChange('model', 'realcugan-se');
                  }
                }}
                options={[
                  { value: 'mangajanai', label: 'MangaJaNai (Chuyên Manga Đen Trắng & Bìa)', materialIcon: 'auto_stories' },
                  { value: 'waifu2x-caffe', label: 'waifu2x-caffe (Manga/Anime 2D)', materialIcon: 'auto_fix_high' },
                  { value: 'realesrgan-ncnn-vulkan', label: 'Real-ESRGAN (Vulkan GPU)', materialIcon: 'speed' },
                  { value: 'realcugan-ncnn-vulkan', label: 'Real-CUGAN (Anime Super-Res)', materialIcon: 'palette' },
                  { value: 'mangaclean', label: 'MangaClean (Khử hạt & tạp âm)', materialIcon: 'cleaning_services' },
                ]}
                className="w-full"
              />
              {(!data.engine || data.engine === 'mangajanai') && (
                <p className="text-[10.5px] text-primary dark:text-primary/90 flex items-center gap-1 mt-1 font-medium">
                  <span className="material-symbols-outlined text-[13px]">stars</span>
                  <span>Mô hình tối ưu cho manga đen trắng, phục hồi trame & khử moiré</span>
                </p>
              )}
            </div>

            {/* Scale Factor */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.upscaleScale', 'Hệ số phóng to')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[2, 4].map((scaleVal) => (
                  <button
                    key={scaleVal}
                    type="button"
                    onClick={() => {
                      handleChange('scale', scaleVal);
                      if ((data.engine || 'mangajanai') === 'mangajanai') {
                        handleChange('model', scaleVal === 4 ? 'mangajanai-4x-1600p' : 'mangajanai-2x-1600p');
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      (data.scale || 2) === scaleVal
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <span>{scaleVal}x</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Denoise Level */}
            {(!data.engine || data.engine === 'mangajanai' || data.engine.includes('realesrgan')) ? (
              <div className="p-2.5 rounded-xl bg-surface-container/40 border border-outline-variant/15 text-[11px] text-on-surface-variant flex items-start gap-2">
                <span className="material-symbols-outlined text-[15px] text-primary mt-0.5 shrink-0">info</span>
                <span>
                  {data.engine === 'realesrgan-ncnn-vulkan'
                    ? 'Real-ESRGAN đã tích hợp sẵn thuật toán khử nhiễu tự động.'
                    : 'MangaJaNai đã tích hợp sẵn mô hình deep learning khử nhiễu moiré & làm sạch nét vẽ.'}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-on-surface-variant">
                    {t('workflow.inspector.upscaleDenoise', 'Mức khử nhiễu')}
                  </label>
                  <span className="text-xs font-mono font-bold text-primary">
                    {data.denoise ?? 3}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="1"
                  value={data.denoise ?? 3}
                  onChange={(e) => handleChange('denoise', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant/50">
                  <span>0 (Tắt)</span>
                  <span>1 (Nhẹ)</span>
                  <span>2 (Vừa)</span>
                  <span>3 (Mạnh)</span>
                </div>
              </div>
            )}

            {/* Output Destination: In-place vs custom folder */}
            <div className="space-y-2 pt-1 border-t border-outline-variant/15">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.outputDestination', 'Cơ chế lưu kết quả')}
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                  <input
                    type="radio"
                    name={`upscale-dest-${selectedNode.id}`}
                    checked={data.inPlace !== false}
                    onChange={() => handleChange('inPlace', true)}
                    className="accent-primary"
                  />
                  <span>{t('workflow.inspector.outputInPlace', 'Ghi đè trực tiếp (In-place)')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                  <input
                    type="radio"
                    name={`upscale-dest-${selectedNode.id}`}
                    checked={data.inPlace === false}
                    onChange={() => handleChange('inPlace', false)}
                    className="accent-primary"
                  />
                  <span>{t('workflow.inspector.outputCustomDir', 'Xuất ra thư mục riêng')}</span>
                </label>
              </div>

              {data.inPlace === false && (
                <div className="pt-1">
                  <FolderPickerInput
                    value={data.outputDir || ''}
                    onChange={(dir) => handleChange('outputDir', dir)}
                    placeholder="Chọn thư mục xuất..."
                    buttonTooltip={t('workflow.inspector.browse')}
                    browseLabel={t('workflow.inspector.browse')}
                    allowClear={true}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {selectedNode.type === 'image_compress' && (
          <div className="space-y-4">
            {/* Output Format Selector: Giữ gốc, JPG, PNG, WebP */}
            <OutputFormatSelector
              value={data.format || 'original'}
              onChange={(v) => {
                handleChange('format', v);
                if (v !== 'png' && (!data.quality || data.quality === 100)) {
                  handleChange('quality', 90);
                }
              }}
            />

            {/* Quality Slider or PNG Lossless Note */}
            {(data.format || 'original') === 'png' ? (
              <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0 select-none mt-0.5">info</span>
                <span>PNG là định dạng nén không suy hao (Lossless), tối ưu nén kích thước tối đa.</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-on-surface-variant">
                    {t('workflow.inspector.compressQuality', 'Chất lượng nén (1 - 100)')}
                  </label>
                  <span className="text-xs font-mono font-bold text-primary">
                    {data.quality ?? 90}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={data.quality ?? 90}
                  onChange={(e) => handleChange('quality', Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <p className="text-[10px] text-on-surface-variant/60 leading-relaxed">
                  {(data.format || 'original') === 'webp'
                    ? 'Nén WebP chất lượng cao, giữ chi tiết sắc nét và dung lượng siêu nhẹ.'
                    : 'Thuật toán MozJPEG tối ưu tỷ lệ nén cao mà mắt thường không thấy suy giảm chất lượng.'}
                </p>
              </div>
            )}

            {/* Resize Option */}
            <div className="space-y-2 pt-1 border-t border-outline-variant/15">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(data.resizeEnabled)}
                  onChange={(e) => handleChange('resizeEnabled', e.target.checked)}
                  className="rounded accent-primary"
                />
                <span className="text-xs font-semibold text-on-surface">
                  {t('workflow.inspector.compressResizeEnable', 'Thu nhỏ kích thước ảnh theo %')}
                </span>
              </label>

              {data.resizeEnabled && (
                <div className="space-y-1 pl-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant">{t('workflow.inspector.compressResizePercent', 'Tỉ lệ kích thước')}:</span>
                    <span className="font-mono font-bold text-primary">{data.resizePercent ?? 80}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="99"
                    step="5"
                    value={data.resizePercent ?? 80}
                    onChange={(e) => handleChange('resizePercent', Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-on-surface-variant/50">
                    <span>10% (Rất nhỏ)</span>
                    <span>50% (Một nửa)</span>
                    <span>99% (Gần gốc)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Output Destination: In-place vs custom folder */}
            <div className="space-y-2 pt-1 border-t border-outline-variant/15">
              <label className="text-[11px] font-semibold text-on-surface-variant">
                {t('workflow.inspector.outputDestination', 'Cơ chế lưu kết quả')}
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                  <input
                    type="radio"
                    name={`compress-dest-${selectedNode.id}`}
                    checked={data.inPlace !== false}
                    onChange={() => handleChange('inPlace', true)}
                    className="accent-primary"
                  />
                  <span>{t('workflow.inspector.outputInPlace', 'Ghi đè trực tiếp (In-place)')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                  <input
                    type="radio"
                    name={`compress-dest-${selectedNode.id}`}
                    checked={data.inPlace === false}
                    onChange={() => handleChange('inPlace', false)}
                    className="accent-primary"
                  />
                  <span>{t('workflow.inspector.outputCustomDir', 'Xuất ra thư mục riêng')}</span>
                </label>
              </div>

              {data.inPlace === false && (
                <div className="pt-1">
                  <FolderPickerInput
                    value={data.outputDir || ''}
                    onChange={(dir) => handleChange('outputDir', dir)}
                    placeholder="Chọn thư mục lưu ảnh nén..."
                    buttonTooltip={t('workflow.inspector.browse')}
                    browseLabel={t('workflow.inspector.browse')}
                    allowClear={true}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {selectedNode.type === 'send_to_kindle' && (
          <div className="space-y-3.5">
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-lg shrink-0 mt-0.5">
                tablet_android
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">Amazon Send to Kindle</p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Tự động tải tệp sách (.epub, .pdf) trực tiếp lên đám mây Amazon và đồng bộ không dây đến máy đọc sách Kindle của bạn (hỗ trợ tệp lên đến 200MB).
                </p>
              </div>
            </div>

            {/* Trạng thái tài khoản Amazon */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-on-surface-variant">Tài Khoản Amazon</label>
              {kindleAuth.checking ? (
                <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>
                  <span>Đang kiểm tra kết nối Amazon...</span>
                </div>
              ) : kindleAuth.loggedIn ? (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-emerald-500 text-lg shrink-0">check_circle</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Đã kết nối</div>
                      <div className="text-xs font-semibold text-on-surface truncate">{kindleAuth.account || 'Tài khoản Amazon'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoToKindleTab}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                    data-tooltip="Mở tab Gửi Kindle để quản lý tài khoản hoặc hàng đợi"
                  >
                    <span>Quản lý</span>
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-lg shrink-0 mt-0.5">warning</span>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-on-surface">Chưa kết nối Amazon</p>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        Bạn cần đăng nhập tài khoản Amazon Send to Kindle để có thể gửi tệp sách đến thiết bị.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isLoggingInKindle}
                      onClick={handleLoginAmazon}
                      className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span className="material-symbols-outlined text-sm">login</span>
                      <span>{isLoggingInKindle ? 'Đang đăng nhập...' : 'Đăng nhập Amazon'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGoToKindleTab}
                      className="px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                      data-tooltip="Chuyển đến tab Gửi Kindle để cấu hình"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      <span>Đến tab Gửi Kindle</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tuỳ chọn */}
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(data.deleteAfterSend)}
                onChange={(e) => handleChange('deleteAfterSend', e.target.checked)}
                className="mt-0.5 rounded accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-on-surface-variant leading-tight">
                Xoá tệp sách trên máy tính sau khi gửi thành công
              </span>
            </label>
          </div>
        )}

        {selectedNode.type === 'upload_google_drive' && (
          <div className="space-y-3.5">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-base shrink-0 mt-0.5">
                cloud_upload
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-on-surface">Đồng bộ & Tải lên Google Drive</p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Tự động chuyển tệp truyện (.cbz, .pdf, .epub) hoặc ảnh lên đám mây Google Drive qua ứng dụng Desktop Sync hoặc trực tiếp qua REST API.
                </p>
              </div>
            </div>

            {/* Upload Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant">Phương Thức Tải Lên</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => handleChange('uploadMode', 'desktop_sync')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    (data.uploadMode || 'desktop_sync') === 'desktop_sync'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">folder_shared</span>
                  <span>Drive Trên Máy</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('uploadMode', 'api_token')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    data.uploadMode === 'api_token'
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">api</span>
                  <span>Google Drive API</span>
                </button>
              </div>
            </div>

            {/* Mode 1: Desktop Sync Folder */}
            {(data.uploadMode || 'desktop_sync') === 'desktop_sync' && (() => {
              const currentLocalPath = data.syncFolderPath?.trim() || gdriveStatus.detectedPath;
              const isLocalConnected = Boolean(currentLocalPath);

              return (
                <div className="space-y-3">
                  {/* Trạng thái kết nối Google Drive Desktop */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-on-surface-variant">Trạng Thái Kết Nối</label>
                    {gdriveStatus.checking ? (
                      <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center gap-2 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>
                        <span>Đang kiểm tra kết nối Google Drive trên máy...</span>
                      </div>
                    ) : isLocalConnected ? (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-emerald-500 text-lg shrink-0">check_circle</span>
                          <div className="min-w-0">
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                              Đã kết nối Google Drive
                            </div>
                            <div className="text-xs font-semibold text-on-surface truncate" data-tooltip={currentLocalPath}>
                              {currentLocalPath}
                            </div>
                          </div>
                        </div>
                        {typeof window !== 'undefined' && window.electronAPI?.showItemInFolder && (
                          <button
                            type="button"
                            onClick={() => window.electronAPI.showItemInFolder(currentLocalPath)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                            data-tooltip="Mở thư mục Google Drive trên máy"
                          >
                            <span>Mở</span>
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-amber-500 text-lg shrink-0 mt-0.5">warning</span>
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-on-surface">Chưa kết nối Google Drive</p>
                            <p className="text-[11px] text-on-surface-variant leading-relaxed">
                              Chưa tìm thấy ứng dụng Google Drive for Desktop trên máy tính. Bạn cần cài đặt ứng dụng hoặc chọn thủ công thư mục lưu trữ bên dưới để quy trình có thể đồng bộ.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const api = window.electronAPI;
                              if (api?.openExternal) api.openExternal('https://www.google.com/drive/download/');
                              else window.open('https://www.google.com/drive/download/', '_blank');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <span className="material-symbols-outlined text-sm">download</span>
                            <span>Tải Google Drive Desktop</span>
                          </button>
                          <button
                            type="button"
                            disabled={gdriveStatus.checking}
                            onClick={checkGoogleDriveLocal}
                            className="px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                            data-tooltip="Quét lại tìm thư mục Google Drive"
                          >
                            <span className={`material-symbols-outlined text-sm ${gdriveStatus.checking ? 'animate-spin' : ''}`}>
                              refresh
                            </span>
                            <span>Thử lại</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chọn thư mục lưu trữ */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-on-surface-variant">
                        Thư Mục Lưu Trên Máy
                      </label>
                      {data.syncFolderPath && (
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('syncFolderPath', '');
                            onGoogleDriveChange && onGoogleDriveChange();
                          }}
                          className="text-[10px] font-medium text-primary hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          Dùng mặc định
                        </button>
                      )}
                    </div>
                    <FolderPickerInput
                      value={data.syncFolderPath || ''}
                      onChange={(dir) => {
                        handleChange('syncFolderPath', dir);
                        onGoogleDriveChange && onGoogleDriveChange();
                      }}
                      placeholder={gdriveStatus.detectedPath ? `Mặc định: ${gdriveStatus.detectedPath}` : 'Mặc định: Tự nhận diện Google Drive'}
                      buttonTooltip={t('workflow.inspector.selectGDriveDir')}
                      browseLabel={t('workflow.inspector.browse')}
                      allowClear={true}
                    />
                  </div>

                  {/* Hướng dẫn 3 bước cho người mới */}
                  <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                      <span className="material-symbols-outlined text-sm text-primary">help</span>
                      <span>Hướng dẫn đồng bộ Google Drive</span>
                    </div>
                    <ol className="text-[11px] text-on-surface-variant space-y-1.5 list-decimal pl-4 leading-relaxed">
                      <li>
                        Tải và cài đặt ứng dụng <strong className="text-on-surface">Google Drive for Desktop</strong> miễn phí từ Google.
                      </li>
                      <li>
                        Đăng nhập tài khoản Google trên app máy tính để tạo ổ đĩa <code className="text-primary font-mono text-[10px]">Google Drive</code> (My Drive / Drives của tôi).
                      </li>
                      <li>
                        Khi chạy workflow, tệp truyện sẽ được tự động sao chép vào thư mục này và tự đồng bộ lên đám mây trong nền (không giới hạn token).
                      </li>
                    </ol>
                  </div>
                </div>
              );
            })()}

            {/* Mode 2: Google Drive REST API */}
            {data.uploadMode === 'api_token' && (
              <div className="space-y-3">
                {/* Trạng thái kiểm tra Token */}
                {gdriveStatus.testingApi ? (
                  <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>
                    <span>Đang xác thực Access Token với Google API...</span>
                  </div>
                ) : gdriveStatus.testedApi?.ok ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500 text-lg shrink-0">check_circle</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                        Đã kết nối Google API
                      </div>
                      <div className="text-xs font-semibold text-on-surface truncate">
                        {gdriveStatus.testedApi.displayName || 'Google User'} {gdriveStatus.testedApi.emailAddress ? `(${gdriveStatus.testedApi.emailAddress})` : ''}
                      </div>
                    </div>
                  </div>
                ) : gdriveStatus.testedApi && !gdriveStatus.testedApi.ok ? (
                  <div className="p-2.5 rounded-xl bg-error/10 border border-error/30 text-xs text-error flex items-start gap-2">
                    <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
                    <div className="min-w-0 leading-tight">
                      <p className="font-semibold">Xác thực thất bại</p>
                      <p className="text-[10px] text-error/90 mt-0.5">{gdriveStatus.testedApi.error}</p>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-on-surface-variant">
                      Access Token (OAuth 2.0) <span className="text-error">*</span>
                    </label>
                    {data.accessToken && (
                      <button
                        type="button"
                        disabled={gdriveStatus.testingApi}
                        onClick={() => handleTestGoogleDriveToken(data.accessToken)}
                        className="text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">network_check</span>
                        <span>Kiểm tra kết nối</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="password"
                      value={data.accessToken || ''}
                      onChange={(e) => {
                        handleChange('accessToken', e.target.value);
                        setGdriveStatus((prev) => ({ ...prev, testedApi: null }));
                      }}
                      placeholder="ya29.a0AfH6SM..."
                      className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      disabled={!data.accessToken || gdriveStatus.testingApi}
                      onClick={() => handleTestGoogleDriveToken(data.accessToken)}
                      className="px-2.5 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
                      data-tooltip="Kiểm tra tính hợp lệ của Token"
                    >
                      <span className={`material-symbols-outlined text-xs ${gdriveStatus.testingApi ? 'animate-spin' : ''}`}>
                        {gdriveStatus.testingApi ? 'progress_activity' : 'check'}
                      </span>
                      <span>Test</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-on-surface-variant">
                    Token OAuth 2.0 có quyền <code>https://www.googleapis.com/auth/drive.file</code>.
                  </p>
                </div>

                {/* Hướng dẫn lấy token */}
                <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                      <span className="material-symbols-outlined text-sm text-primary">key</span>
                      <span>Cách lấy Access Token nhanh</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const api = window.electronAPI;
                        if (api?.openExternal) api.openExternal('https://developers.google.com/oauthplayground');
                        else window.open('https://developers.google.com/oauthplayground', '_blank');
                      }}
                      className="text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>Mở Playground</span>
                      <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </button>
                  </div>
                  <ol className="text-[11px] text-on-surface-variant space-y-1 list-decimal pl-4 leading-relaxed">
                    <li>Mở Google OAuth Playground (link góc trên).</li>
                    <li>Ở cột trái, tìm mục <strong>Drive API v3</strong> và tick chọn scope <code>https://www.googleapis.com/auth/drive.file</code>.</li>
                    <li>Bấm <strong>Authorize APIs</strong> và đăng nhập tài khoản Google.</li>
                    <li>Bấm <strong>Exchange authorization code for tokens</strong> và copy chuỗi <strong>Access token</strong> dán vào đây.</li>
                  </ol>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-on-surface-variant">
                    Mã Thư Mục Đích (Folder ID)
                  </label>
                  <input
                    type="text"
                    value={data.targetFolderId || ''}
                    onChange={(e) => handleChange('targetFolderId', e.target.value)}
                    placeholder="Để trống để lưu vào My Drive gốc"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40 font-mono text-[11px]"
                  />
                  <p className="text-[10px] text-on-surface-variant">
                    Chuỗi ID phía sau <code>/folders/</code> trên thanh địa chỉ trình duyệt khi mở thư mục Drive (nếu muốn lưu vào thư mục con).
                  </p>
                </div>
              </div>
            )}

            {/* Clean up option */}
            <div className="pt-2 border-t border-outline-variant/20">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!data.deleteAfterUpload}
                  onChange={(e) => handleChange('deleteAfterUpload', e.target.checked)}
                  className="mt-0.5 rounded accent-primary cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-on-surface">
                    Đưa tệp gốc vào Thùng rác sau khi tải lên
                  </span>
                  <p className="text-[10px] text-on-surface-variant leading-tight">
                    Giải phóng dung lượng máy tính bằng cách chuyển tệp nguồn vào Recycle Bin sau khi đã đồng bộ an toàn.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* ── Common Settings: Continue on Error ── */}
        <div className="pt-3 border-t border-outline-variant/20 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!data.continueOnError}
              onChange={(e) => handleChange('continueOnError', e.target.checked)}
              className="w-4 h-4 rounded bg-surface-container-low border-outline-variant/40 text-primary focus:ring-0 cursor-pointer"
            />
            <span className="text-xs text-on-surface font-medium">Bỏ qua khi gặp lỗi</span>
          </label>
          <p className="text-[10px] text-on-surface-variant leading-relaxed">
            Nếu kích hoạt, quy trình vẫn tiếp tục chạy các bước sau ngay cả khi bước này gặp sự cố.
          </p>
        </div>
      </div>
    </aside>
  );
}
