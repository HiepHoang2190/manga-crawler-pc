import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect, useToolsSidebarResize, EmptyState } from '../../../shared';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../../ebook-studio/EbookStudioActionSlot';
import {
  AMAZON_PDOCS_URL,
  getKindleJob,
  subscribeKindleJob,
  addKindleFileItems,
  startPendingKindleFiles,
  removeKindleQueueItem,
  updateKindleQueueItem,
  clearFinishedKindleJobs,
  clearKindleJob,
} from './kindleJobStore.mjs';

function formatMb(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0';
  const mb = n / (1024 * 1024);
  if (mb < 0.1) return mb.toFixed(2);
  if (mb < 10) return mb.toFixed(1);
  return String(Math.round(mb));
}

function statusIcon(status) {
  if (status === 'running') return 'progress_activity';
  if (status === 'done') return 'check_circle';
  if (status === 'error') return 'error';
  return 'schedule';
}

export default function SendToKindleTab({
  isActive = true,
  onRunningChange,
  showCol1 = true,
  showSidebar = true,
  sidebarWidth: propWidth,
  handleSplitPointerDown: propHandleSplit,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const fallbackResize = useToolsSidebarResize();
  const sidebarWidth = propWidth ?? fallbackResize.sidebarWidth;
  const handleSplitPointerDown = propHandleSplit ?? fallbackResize.handleSplitPointerDown;
  const isSidebarVisible = showSidebar ?? showCol1;

  const [job, setJob] = useState(() => getKindleJob());
  const [loggedIn, setLoggedIn] = useState(false);
  const [account, setAccount] = useState('');
  const [checking, setChecking] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [localError, setLocalError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'running' | 'done' | 'error'
  const [copiedId, setCopiedId] = useState(null);

  const copyItemError = useCallback(async (errorText, id) => {
    if (!errorText) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(errorText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = errorText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
    }
  }, []);

  useEffect(() => subscribeKindleJob(setJob), []);

  useEffect(() => {
    onRunningChange?.(job?.status === 'running');
  }, [job?.status, onRunningChange]);

  const refreshAuth = useCallback(async () => {
    if (!api?.sendToKindleIsLoggedIn) {
      setChecking(false);
      setLoggedIn(false);
      return;
    }
    setChecking(true);
    try {
      const r = await api.sendToKindleIsLoggedIn();
      setLoggedIn(Boolean(r?.ok && r?.loggedIn));
      setAccount(String(r?.account || r?.label || '').trim());
    } catch {
      setLoggedIn(false);
      setAccount('');
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const queue = job.queue || [];
  const pendingCount = useMemo(
    () => queue.filter((q) => q.status === 'pending').length,
    [queue]
  );
  const running = job.status === 'running';

  const stats = useMemo(() => {
    let pending = 0;
    let runningItems = 0;
    let done = 0;
    let error = 0;
    for (const it of queue) {
      if (it.status === 'pending') pending++;
      else if (it.status === 'running') runningItems++;
      else if (it.status === 'done') done++;
      else if (it.status === 'error') error++;
    }
    return { total: queue.length, pending, runningItems, done, error };
  }, [queue]);

  const displayedQueue = useMemo(() => {
    if (filterStatus === 'all') return queue;
    return queue.filter((item) => item.status === filterStatus);
  }, [queue, filterStatus]);

  const filterOptions = useMemo(
    () => [
      {
        value: 'all',
        label: `${t('ebookStudio.converter.filterAll', 'Tất cả')} (${stats.total})`,
        materialIcon: 'filter_alt',
      },
      {
        value: 'pending',
        label: `${t('ebookStudio.converter.filterPending', 'Chờ')} (${stats.pending})`,
        materialIcon: 'hourglass_empty',
      },
      {
        value: 'running',
        label: `${t('ebookStudio.converter.filterProcessing', 'Đang chuyển')} (${stats.runningItems})`,
        materialIcon: 'sync',
      },
      {
        value: 'done',
        label: `${t('ebookStudio.converter.filterCompleted', 'Xong')} (${stats.done})`,
        materialIcon: 'check_circle',
      },
      {
        value: 'error',
        label: `${t('ebookStudio.converter.filterError', 'Lỗi')} (${stats.error})`,
        materialIcon: 'error',
      },
    ],
    [t, stats.total, stats.pending, stats.runningItems, stats.done, stats.error]
  );

  const handleLogin = useCallback(async () => {
    if (!api?.sendToKindleLogin) return;
    setLoggingIn(true);
    setLocalError('');
    try {
      const r = await api.sendToKindleLogin();
      setLoggedIn(Boolean(r?.loggedIn));
      setAccount(String(r?.account || '').trim());
      if (!r?.loggedIn) setLocalError(t('sendToKindle.loginRequired'));
    } catch (e) {
      setLocalError(String(e?.message || e));
    } finally {
      setLoggingIn(false);
    }
  }, [api, t]);

  const handleLogout = useCallback(async () => {
    if (!api?.sendToKindleLogout) return;
    try {
      await api.sendToKindleLogout();
    } catch {
      /* ignore */
    }
    setLoggedIn(false);
    setAccount('');
  }, [api]);

  const handleAddFiles = useCallback(async () => {
    if (!api?.sendToKindlePickFiles) return;
    setLocalError('');
    try {
      const picked = await api.sendToKindlePickFiles();
      if (!picked?.ok || picked.canceled) return;
      const paths = Array.isArray(picked.files) ? picked.files : [];
      if (!paths.length) return;
      let files = paths.map((filePath) => ({
        filePath,
        name: String(filePath).split(/[/\\]/).pop(),
      }));
      if (api.sendToKindleStatFiles) {
        const st = await api.sendToKindleStatFiles({ paths });
        if (st?.ok && Array.isArray(st.files)) {
          files = st.files.filter((f) => !f.missing);
        }
      }
      const tooBig = files.filter((f) => (Number(f.sizeBytes) || 0) > 200 * 1024 * 1024);
      if (tooBig.length) {
        setLocalError(t('sendToKindleTab.tooLarge', { count: tooBig.length }));
      }
      const okFiles = files.filter((f) => (Number(f.sizeBytes) || 0) <= 200 * 1024 * 1024);
      addKindleFileItems(okFiles);
    } catch (e) {
      setLocalError(String(e?.message || e));
    }
  }, [api, t]);

  const handleSendPending = useCallback(async () => {
    if (!api) return;
    setLocalError('');
    if (!loggedIn) {
      setLocalError(t('sendToKindle.loginRequired'));
      return;
    }
    if (!pendingCount) {
      setLocalError(t('sendToKindleTab.emptyQueue'));
      return;
    }
    const r = await startPendingKindleFiles(api);
    if (r?.error === 'empty') setLocalError(t('sendToKindleTab.emptyQueue'));
  }, [api, loggedIn, pendingCount, t]);

  const openAmazonLibrary = useCallback(() => {
    const url = job.amazonLibraryUrl || AMAZON_PDOCS_URL;
    if (api?.openExternal) api.openExternal(url);
  }, [api, job.amazonLibraryUrl]);

  if (!api?.sendToKindlePickFiles) {
    return (
      <div className="p-4 text-sm text-on-surface-variant">{t('sendToKindle.electronOnly')}</div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* ─── ACTION SLOT (TOOLBAR ĐỈNH) ─── */}
      <EbookStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="kindle-send-btn"
            onClick={handleSendPending}
            disabled={!pendingCount || !loggedIn || running}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {running ? 'hourglass_top' : 'send'}
            </span>
            <span>
              {running
                ? t('sendToKindle.sending', 'Đang gửi...')
                : t('sendToKindleTab.sendPending', { count: pendingCount })}
            </span>
          </button>
        </div>
      </EbookStudioCenterSlot>
      <EbookStudioActionSlot active={isActive}></EbookStudioActionSlot>

      {/* ─── SIDEBAR / CONTROLS (PANEL TRÁI) ─── */}
      {isSidebarVisible && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {/* 1. Tài khoản Amazon */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('sendToKindle.accountTitle', 'Tài khoản Amazon')}
              </p>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-3">
                {checking ? (
                  <p className="text-xs text-on-surface-variant">{t('sendToKindle.checking')}</p>
                ) : loggedIn ? (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[20px] text-emerald-500 shrink-0">
                        check_circle
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate">
                          {account || t('sendToKindle.loggedIn')}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {t('sendToKindle.connectedStatus', 'Đã kết nối Send to Kindle')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={running}
                      className="shrink-0 text-xs font-semibold text-error hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {t('sendToKindle.logout')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {t('sendToKindle.loginHint')}
                    </p>
                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={loggingIn || running}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-on-primary shadow-sm hover:opacity-90 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">login</span>
                      <span>{loggingIn ? t('sendToKindle.loggingIn') : t('sendToKindle.loginButton')}</span>
                    </button>
                  </div>
                )}

                <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={openAmazonLibrary}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    <span>{t('sendToKindle.amazonLibrary')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Nguồn sách */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.converter.col1Title', 'Nguồn tệp')}
              </p>
              <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3.5">
                <button
                  type="button"
                  onClick={handleAddFiles}
                  disabled={running}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-high/60 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px] text-cyan-400">attach_file</span>
                  <span>{t('sendToKindleTab.addFiles')}</span>
                </button>
                <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                  {t('sendToKindleTab.qualityNote')}
                </p>
                {localError && (
                  <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                    {localError === 'loginRequired' ? t('sendToKindle.loginRequired') : localError}
                  </div>
                )}
              </div>
            </div>

          </div>

          <ResizeSplitter
            variant="overlay"
            side="right"
            onPointerDown={handleSplitPointerDown}
            ariaLabel={t('sidebar.resizeSplit')}
          />
        </div>
      )}

      {/* ─── MAIN PANEL (PANEL PHẢI - HÀNG ĐỢI SÁCH) ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        {/* Toolbar: filter dropdown, clear buttons */}
        <div className="mb-3 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SearchableSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={filterOptions}
              className="min-w-[12rem] sm:min-w-[13.5rem]"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => clearFinishedKindleJobs()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer px-2 py-1 rounded-lg hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">clear_all</span>
                <span>{t('sendToKindleTab.clearFinished')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!running) clearKindleJob();
                }}
                disabled={running}
                className="inline-flex items-center gap-1 text-xs font-semibold text-error hover:bg-error/10 cursor-pointer px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                <span>{t('sendToKindleTab.clearAll')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Khung danh sách hàng đợi */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {queue.length === 0 ? (
            <EmptyState
              icon="tablet_android"
              title={t('sendToKindleTab.emptyHint')}
              description={t('ebookStudio.converter.pickerHint')}
            />
          ) : displayedQueue.length === 0 ? (
            <EmptyState
              icon="filter_list_off"
              title={t('crop.filterNoMatch', 'Không tìm thấy tệp phù hợp bộ lọc')}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar space-y-1">
              {displayedQueue.map((item) => {
                const sizeLabel =
                  item.sizeBytes > 0
                    ? t('sendToKindle.chapterSize', { mb: formatMb(item.sizeBytes) })
                    : '';
                const pct = item.progress?.pct;
                return (
                  <li
                    key={item.id}
                    className="mx-1 rounded-xl border border-outline-variant/15 bg-surface-container-lowest/80 p-3 space-y-2.5 transition-colors hover:bg-surface-container-high/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`material-symbols-outlined text-[20px] shrink-0 ${
                          item.status === 'running' ? 'animate-spin text-primary' : ''
                        } ${item.status === 'done' ? 'text-emerald-500' : ''} ${
                          item.status === 'error' ? 'text-error' : 'text-on-surface-variant/70'
                        }`}
                      >
                        {statusIcon(item.status)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-on-surface truncate" data-tooltip={item.label}>
                          {item.label}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/60 truncate mt-0.5">
                          {item.kind === 'manga'
                            ? t('sendToKindleTab.kindManga')
                            : t('sendToKindleTab.kindFile')}
                          {sizeLabel ? ` · ${sizeLabel}` : ''}
                          {item.status === 'running' && pct != null ? ` · ${pct}%` : ''}
                        </p>
                        {item.status === 'error' && item.error && (
                          <p
                            className="truncate text-[11px] text-error font-medium select-text mt-0.5"
                            data-tooltip={item.error}
                          >
                            {item.error}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'pending' && (
                          <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                            {t('ebookStudio.converter.statusWaiting', 'Chờ gửi')}
                          </span>
                        )}
                        {item.status === 'running' && (
                          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary animate-pulse">
                            {t('sendToKindle.sending', 'Đang gửi...')}
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            ✓ {t('ebookStudio.converter.statusCompleted', 'Đã gửi')}
                          </span>
                        )}
                        {item.status === 'error' && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => copyItemError(item.error, item.id)}
                              className="rounded-full bg-error/15 hover:bg-error/25 px-2.5 py-0.5 text-[11px] font-semibold text-error transition-colors cursor-pointer"
                              data-tooltip={
                                copiedId === item.id
                                  ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi')
                                  : (item.error || t('ebookStudio.converter.copyError') || 'Sao chép lỗi')
                              }
                            >
                              <span>{t('ebookStudio.converter.statusError', 'Lỗi')}</span>
                            </button>
                            {item.error && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyItemError(item.error, item.id);
                                }}
                                data-tooltip={
                                  copiedId === item.id
                                    ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi')
                                    : (t('ebookStudio.converter.copyError') || 'Sao chép lỗi')
                                }
                                aria-label={t('ebookStudio.converter.copyError') || 'Sao chép lỗi'}
                                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-error/15 text-error transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  {copiedId === item.id ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            )}
                          </div>
                        )}

                        {item.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => removeKindleQueueItem(item.id)}
                            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-all cursor-pointer"
                            aria-label={t('sendToKindleTab.remove')}
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {item.status === 'pending' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-outline-variant/10">
                        <label className="block min-w-0">
                          <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/60 font-semibold">
                            {t('sendToKindle.docTitle')}
                          </span>
                          <input
                            type="text"
                            value={item.title || ''}
                            onChange={(e) =>
                              updateKindleQueueItem(item.id, { title: e.target.value })
                            }
                            className="mt-0.5 w-full h-7 rounded-lg bg-surface border border-outline-variant/30 px-2 text-xs text-on-surface outline-none focus:border-primary"
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/60 font-semibold">
                            {t('sendToKindle.docAuthor')}
                          </span>
                          <input
                            type="text"
                            value={item.author || ''}
                            onChange={(e) =>
                              updateKindleQueueItem(item.id, { author: e.target.value })
                            }
                            className="mt-0.5 w-full h-7 rounded-lg bg-surface border border-outline-variant/30 px-2 text-xs text-on-surface outline-none focus:border-primary"
                          />
                        </label>
                      </div>
                    )}

                    {item.status === 'running' && item.progress && (
                      <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-200"
                          style={{ width: `${item.progress.pct ?? 0}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
