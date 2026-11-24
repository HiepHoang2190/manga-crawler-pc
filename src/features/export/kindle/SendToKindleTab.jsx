import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect, useToolsSidebarResize, EmptyState, SectionTitle } from '../../../shared';
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

async function writeClipboardText(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fallback to execCommand below */
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
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
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [copiedLocalError, setCopiedLocalError] = useState(false);
  const copyTimerRef = useRef(null);
  const localCopyTimerRef = useRef(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    if (localCopyTimerRef.current) clearTimeout(localCopyTimerRef.current);
  }, []);

  const copyItemError = useCallback(async (errorText, id) => {
    if (!errorText) return;
    try {
      await writeClipboardText(errorText);
      setCopiedId(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
    }
  }, []);

  const copyLocalError = useCallback(async () => {
    const resolved = localError === 'loginRequired' ? t('sendToKindle.loginRequired') : localError;
    if (!resolved) return;
    try {
      await writeClipboardText(resolved);
      setCopiedLocalError(true);
      if (localCopyTimerRef.current) clearTimeout(localCopyTimerRef.current);
      localCopyTimerRef.current = setTimeout(() => setCopiedLocalError(false), 2000);
    } catch (err) {
      console.error('Failed to copy local error:', err);
    }
  }, [localError, t]);

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
    let list = queue;
    if (filterStatus !== 'all') {
      list = list.filter((item) => item.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) =>
        [item.label, item.title, item.author]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }
    return list;
  }, [queue, filterStatus, searchQuery]);

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
    setCopiedLocalError(false);
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
    setCopiedLocalError(false);
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
    setCopiedLocalError(false);
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
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
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
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {/* 1. Tài khoản Amazon */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle as="p">
                  {t('sendToKindle.accountTitle', 'Tài khoản Amazon')}
                </SectionTitle>
                {loggedIn && !checking && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={running}
                    className="shrink-0 text-[11px] font-medium text-error hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {t('sendToKindle.logout')}
                  </button>
                )}
              </div>

              {checking ? (
                <div className="flex items-center gap-2 text-xs text-on-surface-variant py-1">
                  <span className="material-symbols-outlined text-[15px] animate-spin text-primary shrink-0">
                    progress_activity
                  </span>
                  <span>{t('sendToKindle.checking')}</span>
                </div>
              ) : loggedIn ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 min-w-0">
                  <span className="material-symbols-outlined text-[18px] text-emerald-500 shrink-0">
                    check_circle
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-on-surface truncate">
                      {account || t('sendToKindle.loggedIn')}
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {t('sendToKindle.connectedStatus', 'Đã kết nối Send to Kindle')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-on-surface-variant/75 leading-relaxed">
                    {t('sendToKindle.loginHint')}
                  </p>
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={loggingIn || running}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">login</span>
                    <span>{loggingIn ? t('sendToKindle.loggingIn') : t('sendToKindle.loginButton')}</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={openAmazonLibrary}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                <span>{t('sendToKindle.amazonLibrary')}</span>
              </button>
            </div>

            {/* 2. Nguồn sách */}
            <div className="space-y-2 pt-3 border-t border-outline-variant/15">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle as="p">
                  {t('ebookStudio.tools.sourceTitle')}
                </SectionTitle>
                {stats.total > 0 && (
                  <span className="text-[11px] font-medium text-on-surface-variant tabular-nums">
                    {t('sendToKindleTab.fileCount', { count: stats.total })}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleAddFiles}
                disabled={running}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px] text-cyan-400">attach_file</span>
                <span>{t('sendToKindleTab.addFiles')}</span>
              </button>

              <p className="text-[11px] text-on-surface-variant/75 leading-relaxed">
                {t('sendToKindleTab.emptyDesc')}
              </p>

              <p className="text-[11px] text-on-surface-variant/65 leading-relaxed">
                {t('sendToKindleTab.qualityNote')}
              </p>
            </div>

            {/* 3. Thông báo lỗi thống nhất */}
            {localError && (
              <div
                data-testid="kindle-status-error"
                role="alert"
                className="flex items-start justify-between gap-2 text-xs text-error whitespace-pre-wrap"
              >
                <p className="select-text break-words flex-1">
                  {localError === 'loginRequired' ? t('sendToKindle.loginRequired') : localError}
                </p>
                <button
                  type="button"
                  onClick={copyLocalError}
                  data-tooltip={copiedLocalError ? t('ebookStudio.converter.copiedError') : t('ebookStudio.converter.copyError')}
                  aria-label={t('ebookStudio.converter.copyError')}
                  className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-error/15 text-error shrink-0 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copiedLocalError ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            )}

            {/* 4. Thẻ thống kê tổng quan (đồng bộ Đóng gói, Chuyển đổi & Tiện ích CBZ) */}
            <div className="mt-auto pt-2">
              <div
                data-testid="kindle-overview-card"
                className="rounded-xl border border-primary/15 bg-primary/5 p-3"
              >
                <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                  <span>{t('ebookStudio.overview.title')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.totalFiles')}</span>
                  <span className="font-bold text-on-surface text-right tabular-nums">
                    {stats.total > 0 ? stats.total : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.pending')}</span>
                  <span className="font-bold text-primary text-right tabular-nums">
                    {stats.total > 0 ? stats.pending : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.completed')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">
                    {stats.total > 0 ? stats.done : '—'}
                  </span>
                  {stats.error > 0 && (
                    <>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.errors')}</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 text-right tabular-nums">
                        {stats.error}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2.5 pt-2 border-t border-primary/10 text-[10px] text-on-surface-variant/75 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                      <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                    </span>
                    <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('ebookStudio.overview.kindleTip')}</span>
                  </div>
                </div>
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
        {/* Toolbar: filter dropdown, search, clear buttons */}
        {queue.length > 0 && (
          <div className="mb-3 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchableSelect
                value={filterStatus}
                onChange={setFilterStatus}
                options={filterOptions}
                size="sm"
                showPlaceholderOption={false}
                className="min-w-[11.5rem]"
              />

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/60 pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('sendToKindleTab.searchPlaceholder')}
                    aria-label={t('sendToKindleTab.searchPlaceholder')}
                    className="h-8 w-44 sm:w-52 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      data-tooltip={t('tools.remove')}
                      aria-label={t('tools.remove')}
                      className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5"
                    >
                      close
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => clearFinishedKindleJobs()}
                  disabled={stats.done + stats.error === 0}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="material-symbols-outlined text-[16px]">clear_all</span>
                  <span>{t('sendToKindleTab.clearFinished')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!running) {
                      clearKindleJob();
                      setFilterStatus('all');
                      setSearchQuery('');
                    }
                  }}
                  disabled={running}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-error hover:bg-error/10 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                  <span>{t('sendToKindleTab.clearAll')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Khung danh sách hàng đợi */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {queue.length === 0 ? (
            <EmptyState
              icon="tablet_android"
              title={t('sendToKindleTab.emptyTitle')}
              description={t('sendToKindleTab.emptyHint')}
            />
          ) : displayedQueue.length === 0 ? (
            <EmptyState
              icon="filter_list_off"
              title={t('crop.filterNoMatch')}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar space-y-1">
              {displayedQueue.map((item) => {
                const sizeLabel =
                  item.sizeBytes > 0
                    ? t('sendToKindle.chapterSize', { mb: formatMb(item.sizeBytes) })
                    : '';
                const pct = item.progress?.pct;
                const itemErrorText =
                  item.error === 'loginRequired' ? t('sendToKindle.loginRequired') : item.error;
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
                        {item.status === 'error' && itemErrorText && (
                          <p
                            className="truncate text-[11px] text-error font-medium select-text mt-0.5"
                            data-tooltip={itemErrorText}
                          >
                            {itemErrorText}
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
                              onClick={() => copyItemError(itemErrorText, item.id)}
                              disabled={!itemErrorText}
                              className="rounded-full bg-error/15 hover:bg-error/25 px-2.5 py-0.5 text-[11px] font-semibold text-error transition-colors cursor-pointer disabled:cursor-default"
                              aria-label={itemErrorText ? t('ebookStudio.converter.copyError') : undefined}
                              data-tooltip={
                                copiedId === item.id
                                  ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi')
                                  : (itemErrorText || t('ebookStudio.converter.copyError') || 'Sao chép lỗi')
                              }
                            >
                              <span>{t('ebookStudio.converter.statusError', 'Lỗi')}</span>
                            </button>
                            {itemErrorText && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyItemError(itemErrorText, item.id);
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
                            data-tooltip={t('sendToKindleTab.remove')}
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
                          <SectionTitle as="span" className="block">
                            {t('sendToKindle.docTitle')}
                          </SectionTitle>
                          <input
                            type="text"
                            value={item.title || ''}
                            placeholder={t('sendToKindle.docTitlePlaceholder')}
                            onChange={(e) =>
                              updateKindleQueueItem(item.id, { title: e.target.value })
                            }
                            className="mt-1 w-full h-8 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-2.5 text-xs text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-on-surface-variant/45"
                          />
                        </label>
                        <label className="block min-w-0">
                          <SectionTitle as="span" className="block">
                            {t('sendToKindle.docAuthor')}
                          </SectionTitle>
                          <input
                            type="text"
                            value={item.author || ''}
                            placeholder={t('sendToKindle.docAuthorPlaceholder')}
                            onChange={(e) =>
                              updateKindleQueueItem(item.id, { author: e.target.value })
                            }
                            className="mt-1 w-full h-8 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-2.5 text-xs text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-on-surface-variant/45"
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
