import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout, useStudioLayout } from '../../shared';
import { buildCookieExtractFeedback } from '../../utils/cookieExtractFeedback';

const BTN_ROW =
  'inline-flex items-center justify-center gap-1.5 min-h-9 px-3.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none';
const BTN_SURFACE = `${BTN_ROW} bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20`;
const BTN_PRIMARY = `${BTN_ROW} bg-primary text-on-primary border border-primary hover:opacity-95 shadow-2xs`;

function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SiteCheckerPanel({ connectors = [], onBusyChange }) {
  const { t } = useI18n();

  // StudioLayout integration
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'site_checker',
    defaultLeftWidth: 320,
    minLeftWidth: 240,
    maxLeftWidth: 500,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'working' | 'broken' | 'vpn' | 'cookie'
  const [showErrorDetailId, setShowErrorDetailId] = useState(null);
  const [extractBusy, setExtractBusy] = useState({});
  const [messageDialog, setMessageDialog] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  // Initialize testResults directly from localStorage so state is immediately available on mount
  const [testResults, setTestResults] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('crawler:site-test-results');
      if (raw) {
        const saved = JSON.parse(raw) || {};
        const cleaned = {};
        Object.entries(saved).forEach(([k, v]) => {
          if (v) {
            cleaned[k] = {
              ...v,
              checking: false,
              status: v.status === 'testing' ? 'not-tested' : v.status,
            };
          }
        });
        return cleaned;
      }
    } catch (e) {
      console.error('Failed to parse test results:', e);
    }
    return {};
  });
  const [testRunning, setTestRunning] = useState(false);
  const [testAbortRef, setTestAbortRef] = useState(null);
  const [testBatch, setTestBatch] = useState(null);

  // Compute busy state across batch tests, single tests, and domain extractions
  const isBusy = Boolean(
    testRunning ||
    Object.values(testResults).some((r) => r?.checking) ||
    Object.values(extractBusy).some(Boolean)
  );

  useEffect(() => {
    if (typeof onBusyChange === 'function') {
      onBusyChange(isBusy);
    }
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    return () => {
      if (typeof onBusyChange === 'function') {
        onBusyChange(false);
      }
    };
  }, [onBusyChange]);

  // Save results to localStorage whenever testResults updates with data
  useEffect(() => {
    if (Object.keys(testResults).length > 0) {
      try {
        localStorage.setItem('crawler:site-test-results', JSON.stringify(testResults));
      } catch (e) {
        console.error('Failed to save test results:', e);
      }
    }
  }, [testResults]);

  const startTestAll = async () => {
    if (testRunning) return;
    const targets = filteredConnectors;
    if (!targets || targets.length === 0) return;

    setTestRunning(true);
    const targetIds = targets.map((c) => c.id);
    const targetIdSet = new Set(targetIds);
    setTestBatch({ total: targets.length, targetIds });

    // Reset counters and clean up stale connector entries
    setTestResults((prev) => {
      const validIds = new Set(connectors.map((c) => c.id));
      const next = {};
      // Retain only valid non-target connectors
      Object.entries(prev).forEach(([id, val]) => {
        if (validIds.has(id) && !targetIdSet.has(id)) {
          next[id] = val;
        }
      });
      // Reset all targets being scanned in this batch so counters start fresh from 0
      targets.forEach((c) => {
        next[c.id] = {
          status: 'not-tested',
          checking: true,
          steps: {},
        };
      });
      return next;
    });

    const abortObj = { aborted: false };
    setTestAbortRef(abortObj);

    const queue = [...targets];
    const concurrency = 2; // Deep test is heavier (chapters + download), limit concurrency

    const runWorker = async () => {
      while (queue.length > 0 && !abortObj.aborted) {
        const c = queue.shift();
        if (!c) break;

        setTestResults((prev) => ({
          ...prev,
          [c.id]: { ...prev[c.id], checking: true, steps: {} },
        }));

        try {
          const activeDomain = localStorage.getItem(`crawler:active-domain:${c.id}`) || '';
          const res = await window.electronAPI.testConnector(c.id, activeDomain);
          if (abortObj.aborted) break;

          if (res?.ok) {
            setTestResults((prev) => ({
              ...prev,
              [c.id]: {
                status: 'success',
                rtt: res.durationMs,
                steps: res.steps,
                testDetails: res.testDetails,
                testedAt: Date.now(),
              },
            }));
          } else {
            setTestResults((prev) => ({
              ...prev,
              [c.id]: {
                status: 'failed',
                error: res?.error,
                rtt: res?.durationMs,
                steps: res?.steps,
                testDetails: res?.testDetails,
                testedAt: Date.now(),
              },
            }));
          }
        } catch (err) {
          if (abortObj.aborted) break;
          setTestResults((prev) => ({
            ...prev,
            [c.id]: { status: 'failed', error: err.message || String(err), testedAt: Date.now() },
          }));
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => runWorker());
    await Promise.all(workers);

    setTestRunning(false);
    setTestAbortRef(null);
    setTestBatch(null);
  };

  const cancelTestAll = () => {
    if (testAbortRef) {
      testAbortRef.aborted = true;
      setTestRunning(false);
      setTestAbortRef(null);
      setTestBatch(null);
      setTestResults((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          if (next[id]?.checking) {
            next[id] = { ...next[id], checking: false };
          }
        });
        return next;
      });
    }
  };

  const startSingleTest = async (siteId) => {
    if (testRunning) return;

    setTestResults((prev) => ({
      ...prev,
      [siteId]: { ...prev[siteId], checking: true, steps: {} },
    }));

    try {
      const activeDomain = localStorage.getItem(`crawler:active-domain:${siteId}`) || '';
      const res = await window.electronAPI.testConnector(siteId, activeDomain);
      if (res?.ok) {
        setTestResults((prev) => ({
          ...prev,
          [siteId]: {
            status: 'success',
            rtt: res.durationMs,
            steps: res.steps,
            testDetails: res.testDetails,
            testedAt: Date.now(),
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [siteId]: {
            status: 'failed',
            error: res?.error,
            rtt: res?.durationMs,
            steps: res?.steps,
            testDetails: res?.testDetails,
            testedAt: Date.now(),
          },
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [siteId]: { status: 'failed', error: err.message || String(err), testedAt: Date.now() },
      }));
    }
  };

  const results = testResults;
  const running = testRunning;
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const handleCopyUrl = useCallback(async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch (err) {
      console.error('Copy url failed:', err);
    }
  }, []);

  // Reset all test results manually
  const handleResetAllResults = useCallback(() => {
    if (testRunning) return;
    setTestResults({});
    try {
      localStorage.removeItem('crawler:site-test-results');
    } catch {
      /* ignore */
    }
  }, [testRunning]);

  // Statistics - strictly scoped to currently valid connectors
  const stats = useMemo(() => {
    const total = connectors.length;
    let working = 0;
    let broken = 0;
    let tested = 0;

    connectors.forEach((c) => {
      const r = results[c.id];
      if (!r) return;
      if (r.status === 'success') {
        working++;
        tested++;
      } else if (r.status === 'failed') {
        broken++;
        tested++;
      }
    });

    const vpn = connectors.filter((c) => c.requiresVpn || c.suggestsVpn).length;
    const cookie = connectors.filter((c) => c.requiresCookie).length;
    const progressPercent = total > 0 ? (tested / total) * 100 : 0;

    return { total, working, broken, vpn, cookie, tested, progressPercent };
  }, [results, connectors]);

  // Active test batch progress for scoped testing
  const batchTested = useMemo(() => {
    if (!testBatch) return 0;
    return testBatch.targetIds.filter((id) => {
      const r = results[id];
      return r && !r.checking && (r.status === 'success' || r.status === 'failed');
    }).length;
  }, [testBatch, results]);

  const batchPercent =
    testBatch && testBatch.total > 0
      ? Math.min(100, Math.round((batchTested / testBatch.total) * 100))
      : 0;

  // Extract Cloudflare/site cookie dynamically
  const handleAutoExtractCookie = async (siteId, domain) => {
    if (!api?.extractCloudflareCookie) return;
    const homepage = String(domain || '').trim();
    if (!homepage) return;

    setExtractBusy((prev) => ({ ...prev, [siteId]: true }));
    try {
      const targetUrl = /^https?:\/\//i.test(homepage) ? homepage : `https://${homepage}`;
      const result = await api.extractCloudflareCookie(targetUrl);
      if (result && result.ok && Array.isArray(result.cookies)) {
        if (result.cookies.length > 0) {
          const cookieStr = result.cookies.map((ck) => `${ck.name}=${ck.value}`).join('; ');
          await api.setCookie(siteId, cookieStr);
          if (result.loginDetected !== false) {
            startSingleTest(siteId);
          }
        }
        const fb = buildCookieExtractFeedback(
          {
            cookieCount: result.cookies.length,
            loginDetected: result.loginDetected,
          },
          t
        );
        if (fb) setMessageDialog(fb);
      } else if (result?.error) {
        const fb = buildCookieExtractFeedback({ error: result.error, cookieCount: 0 }, t);
        if (fb) setMessageDialog(fb);
      }
    } catch (err) {
      const fb = buildCookieExtractFeedback(
        { error: err.message || t('sidebar.cookie.extractErrorTitle'), cookieCount: 0 },
        t
      );
      if (fb) setMessageDialog(fb);
    } finally {
      setExtractBusy((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  // Open domain in external browser
  const handleOpenDomain = (e, domain) => {
    e.preventDefault();
    e.stopPropagation();
    api?.openExternal?.(domain);
  };

  // Filters logic
  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      const labelMatch = String(c.label || '').toLowerCase().includes(searchTerm.toLowerCase());
      const domainMatch = String(c.domain || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = labelMatch || domainMatch;
      if (!matchesSearch) return false;

      const res = results[c.id];
      if (statusFilter === 'working') return res?.status === 'success';
      if (statusFilter === 'broken') return res?.status === 'failed';
      if (statusFilter === 'vpn') return c.requiresVpn || c.suggestsVpn;
      if (statusFilter === 'cookie') return c.requiresCookie;
      return true;
    });
  }, [connectors, results, searchTerm, statusFilter]);

  const filterOptions = [
    { id: 'all', label: t('siteChecker.filter.all'), count: stats.total },
    { id: 'working', label: t('siteChecker.filter.working'), count: stats.working },
    { id: 'broken', label: t('siteChecker.filter.broken'), count: stats.broken },
    { id: 'vpn', label: t('siteChecker.filter.needVpn'), count: stats.vpn },
    { id: 'cookie', label: t('siteChecker.filter.needCookie'), count: stats.cookie },
  ];

  return (
    <StudioLayout>
      {/* Top Header Bar */}
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1 border border-outline-variant/20 overflow-x-auto no-scrollbar">
            {filterOptions.map((filter) => {
              const isActive = statusFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filter.id);
                    setShowErrorDetailId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                    isActive
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <span>{filter.label}</span>
                  {filter.count !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-on-primary/20 text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {filter.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      {/* Main Workspace Body */}
      <StudioLayout.Body>
        {/* Left Sidebar: Overview, Search, KPIs & Directory */}
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
                placeholder={t('siteChecker.searchPlaceholder')}
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

            {/* Live Progress Bar when testing */}
            {running && testBatch && (
              <div className="p-3 rounded-xl border border-primary/25 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    <span>{t('siteChecker.testing')}</span>
                  </span>
                  <span className="tabular-nums">
                    {batchTested} / {testBatch.total} ({batchPercent}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${batchPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* KPI Cards Grid */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                {t('siteChecker.stats') || t('dashboard.stats') || 'Chỉ số kiểm tra'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter((prev) => (prev === 'working' ? 'all' : 'working'));
                    setShowErrorDetailId(null);
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'working'
                      ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-xs'
                      : 'border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                  }`}
                  data-tooltip={t('siteChecker.filter.working')}
                  aria-label={t('siteChecker.filter.working')}
                >
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    {t('siteChecker.working')}
                  </span>
                  <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                    {stats.working}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter((prev) => (prev === 'broken' ? 'all' : 'broken'));
                    setShowErrorDetailId(null);
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'broken'
                      ? 'border-error bg-error/15 ring-2 ring-error/30 shadow-xs'
                      : 'border-error/15 bg-error/5 hover:border-error/40 hover:bg-error/10'
                  }`}
                  data-tooltip={t('siteChecker.filter.broken')}
                  aria-label={t('siteChecker.filter.broken')}
                >
                  <span className="text-[10px] font-bold text-error uppercase">
                    {t('siteChecker.broken')}
                  </span>
                  <span className="text-xl font-extrabold text-error mt-1">
                    {stats.broken}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter((prev) => (prev === 'vpn' ? 'all' : 'vpn'));
                    setShowErrorDetailId(null);
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'vpn'
                      ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30 shadow-xs'
                      : 'border-amber-500/15 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10'
                  }`}
                  data-tooltip={t('siteChecker.filter.needVpn')}
                  aria-label={t('siteChecker.filter.needVpn')}
                >
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                    {t('siteChecker.needVpn')}
                  </span>
                  <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                    {stats.vpn}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter((prev) => (prev === 'cookie' ? 'all' : 'cookie'));
                    setShowErrorDetailId(null);
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                    statusFilter === 'cookie'
                      ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 shadow-xs'
                      : 'border-blue-500/15 bg-blue-500/5 hover:border-blue-500/40 hover:bg-blue-500/10'
                  }`}
                  data-tooltip={t('siteChecker.filter.needCookie')}
                  aria-label={t('siteChecker.filter.needCookie')}
                >
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                    {t('siteChecker.needCookie')}
                  </span>
                  <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                    {stats.cookie}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Site Directory */}
            <div className="space-y-1.5 pt-2 border-t border-outline-variant/15">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 flex items-center justify-between">
                <span>{t('siteChecker.quickSiteList')}</span>
                <span className="text-[10px] tabular-nums font-normal">{filteredConnectors.length}</span>
              </span>
              <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {filteredConnectors.map((c) => {
                  const res = results[c.id];
                  const isSuccess = res?.status === 'success';
                  const isFailed = res?.status === 'failed';
                  const isChecking = res?.checking === true;

                  const statusDot = isChecking
                    ? 'bg-primary animate-ping'
                    : isSuccess
                    ? 'bg-emerald-500'
                    : isFailed
                    ? 'bg-error'
                    : 'bg-outline-variant/40';

                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-surface-container-high transition-colors select-none"
                    >
                      <span className="truncate text-on-surface font-medium pr-2">{c.label}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content: Connector Diagnostics Cards */}
        <StudioLayout.Content className="overflow-y-auto custom-scrollbar p-5 sm:p-7">
          <div className="max-w-4xl mx-auto w-full space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">network_check</span>
                  <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                    Danh sách Connectors ({filteredConnectors.length})
                  </h2>
                </div>

                {!running ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startTestAll}
                      disabled={filteredConnectors.length === 0}
                      className={BTN_PRIMARY}
                      data-tooltip={
                        filteredConnectors.length === 0
                          ? t('siteChecker.emptyList')
                          : filteredConnectors.length < connectors.length
                          ? t('siteChecker.testFilteredTooltip', { count: filteredConnectors.length })
                          : t('siteChecker.testAll')
                      }
                      aria-label={t('siteChecker.testAll')}
                    >
                      <span className="material-symbols-outlined text-[16px]">bolt</span>
                      <span>
                        {filteredConnectors.length < connectors.length
                          ? t('siteChecker.testFiltered', { count: filteredConnectors.length })
                          : t('siteChecker.testAll')}
                      </span>
                    </button>
                    {stats.tested > 0 && (
                      <button
                        type="button"
                        onClick={handleResetAllResults}
                        className={BTN_SURFACE}
                        data-tooltip={t('siteChecker.resetResults')}
                        aria-label={t('siteChecker.resetResults')}
                      >
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                        <span>{t('siteChecker.resetResults')}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={cancelTestAll}
                    className="inline-flex items-center justify-center gap-1.5 min-h-9 px-3.5 rounded-lg text-xs font-semibold bg-error text-on-error hover:opacity-95 shadow-sm transition-all cursor-pointer"
                    data-tooltip={t('siteChecker.cancel')}
                    aria-label={t('siteChecker.cancel')}
                  >
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>{t('siteChecker.cancel')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredConnectors.map((c) => {
                const res = results[c.id] || { status: 'not-tested' };
                const displayDomain = localStorage.getItem(`crawler:active-domain:${c.id}`) || c.domain;
                const isChecking = res.checking === true || res.status === 'testing';
                const isSuccess = res.status === 'success' && !isChecking;
                const isFailed = res.status === 'failed' && !isChecking;

                return (
                  <div
                    key={c.id}
                    className="flex flex-col rounded-xl border border-outline-variant/15 bg-surface-container-low/60 shadow-xs p-4 relative overflow-hidden transition-all hover:bg-surface-container-low/95"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Site Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        {c.icon ? (
                          <img
                            src={c.icon}
                            alt={c.label}
                            className="w-9 h-9 rounded-lg object-contain bg-white dark:bg-zinc-900 border border-outline-variant/20 p-0.5 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center border border-outline-variant/20 shrink-0">
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50">
                              public
                            </span>
                          </div>
                        )}

                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-on-surface truncate">{c.label}</span>
                          <a
                            href="#"
                            onClick={(e) => handleOpenDomain(e, displayDomain)}
                            className="text-xs text-primary/80 hover:text-primary transition-colors flex items-center gap-1 mt-0.5 font-medium truncate"
                          >
                            <span>{String(displayDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                            <span className="material-symbols-outlined text-[12px] leading-none">open_in_new</span>
                          </a>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.requiresCookie && (
                          <button
                            type="button"
                            onClick={() => handleAutoExtractCookie(c.id, displayDomain)}
                            disabled={running || isChecking || extractBusy[c.id]}
                            className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                            data-tooltip={t('sidebar.cookie.extractTooltip', 'Trích xuất Cookie tự động')}
                            aria-label={t('sidebar.cookie.extractTooltip', 'Trích xuất Cookie tự động')}
                          >
                            <span
                              className={`material-symbols-outlined text-[16px] ${
                                extractBusy[c.id] ? 'animate-spin' : ''
                              }`}
                            >
                              cookie
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => startSingleTest(c.id)}
                          disabled={running || isChecking}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                          data-tooltip={t('siteChecker.runSingleTest')}
                          aria-label={t('siteChecker.runSingleTest')}
                        >
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              isChecking ? 'animate-spin' : ''
                            }`}
                          >
                            refresh
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Badges & Step indicators */}
                    <div className="flex flex-wrap gap-1.5 mt-3 items-center">
                      {/* Status Badge */}
                      {isSuccess && (
                        <button
                          type="button"
                          onClick={() => setShowErrorDetailId(showErrorDetailId === c.id ? null : c.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 cursor-pointer transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>{t('siteChecker.status.success')}</span>
                          {res.rtt !== undefined && (
                            <span className="ml-0.5 text-[10px] opacity-75">({res.rtt}ms)</span>
                          )}
                          <span className="material-symbols-outlined text-[12px] leading-none">
                            {showErrorDetailId === c.id ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      )}

                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => setShowErrorDetailId(showErrorDetailId === c.id ? null : c.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error/10 text-error border border-error/20 hover:bg-error/15 cursor-pointer text-left transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                          <span>{t('siteChecker.status.failed')}</span>
                          <span className="material-symbols-outlined text-[12px] leading-none">
                            {showErrorDetailId === c.id ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      )}

                      {/* Deep test step dots */}
                      {(isSuccess || isFailed || isChecking) && res.steps && !res.steps.custom && (
                        <div className="inline-flex items-center gap-1 ml-0.5">
                          {['listing', 'chapters', 'download'].map((stepKey, index, arr) => {
                            const step = res.steps[stepKey];
                            const passed = step && step.ok;
                            const failed = step && step.ok === false;
                            const prevStepFinished = index === 0 || !!res.steps[arr[index - 1]];
                            const isRunningStep = isChecking && !step && prevStepFinished;

                            const tipKey = `siteChecker.step.${stepKey}.tip`;
                            const labelKey = `siteChecker.step.${stepKey}`;
                            return (
                              <span
                                key={stepKey}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowErrorDetailId(showErrorDetailId === c.id ? null : c.id);
                                }}
                                data-tooltip={`${t(labelKey)}: ${
                                  passed ? '✓' : failed ? '✗' : isRunningStep ? '...' : '—'
                                }${step?.durationMs ? ` (${step.durationMs}ms)` : ''}\n${t(tipKey)}`}
                                className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer ${
                                  passed
                                    ? 'bg-emerald-500 border-emerald-500/30'
                                    : failed
                                    ? 'bg-error border-error/30'
                                    : isRunningStep
                                    ? 'bg-primary animate-pulse border-primary/30'
                                    : 'bg-surface-container-highest border-outline-variant/30'
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}

                      {isChecking && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                          <span>{t('siteChecker.status.testing')}</span>
                        </span>
                      )}

                      {res.status === 'not-tested' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant/70 border border-outline-variant/15">
                          {t('siteChecker.status.notTested')}
                        </span>
                      )}

                      {/* Precondition tags */}
                      {c.requiresVpn && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/15 uppercase tracking-wider">
                          VPN
                        </span>
                      )}
                      {c.suggestsVpn && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border border-yellow-500/15 uppercase tracking-wider">
                          VPN
                        </span>
                      )}
                      {c.requiresCookie && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/15 uppercase tracking-wider">
                          Cookie
                        </span>
                      )}
                      {c.isJsPlugin && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/15 uppercase tracking-wider">
                          Plugin
                        </span>
                      )}
                    </div>

                    {/* Deep Test Step Detail Panel */}
                    {showErrorDetailId === c.id && (isSuccess || isFailed) && (res.steps || res.error) && (
                      <div className="mt-3 rounded-xl border border-outline-variant/15 bg-surface-container-lowest/80 overflow-hidden">
                        <div className="px-3 py-1.5 border-b border-outline-variant/15 bg-surface-container-high/60 flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-on-surface flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
                            <span>{t('siteChecker.deepTest.details', 'Chi tiết kiểm tra')}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowErrorDetailId(null);
                            }}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-on-surface/5 hover:bg-on-surface/15 text-on-surface-variant flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <span>{t('common.close', 'Thu nhỏ')}</span>
                            <span className="material-symbols-outlined text-[14px]">expand_less</span>
                          </button>
                        </div>

                        {/* Manga & Chapter Test Details header */}
                        {res.testDetails && (res.testDetails.mangaTitle || res.testDetails.mangaUrl) && (
                          <div className="px-3 py-2 border-b border-outline-variant/15 bg-surface-container-high/30 text-xs">
                            <div className="font-semibold text-on-surface mb-1 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px] text-primary">book_5</span>
                              <span>{t('siteChecker.testDetails.manga')}</span>
                              <span className="text-primary font-bold truncate">
                                {res.testDetails.mangaTitle || t('siteChecker.testDetails.unknown')}
                              </span>
                              {res.testDetails.chapterCount > 0 && (
                                <span className="text-[10px] text-on-surface-variant font-normal">
                                  ({t('siteChecker.deepTest.chapterCount', { count: res.testDetails.chapterCount })})
                                </span>
                              )}
                            </div>
                            {res.testDetails.mangaUrl && (
                              <div className="flex items-center gap-1.5 mb-1 text-[11px] bg-surface-container-lowest/70 p-1.5 rounded-lg border border-outline-variant/10">
                                <span className="text-on-surface-variant/90 font-mono select-all break-all flex-1" data-tooltip={res.testDetails.mangaUrl}>
                                  {res.testDetails.mangaUrl}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyUrl(res.testDetails.mangaUrl)}
                                    className="p-1 rounded hover:bg-on-surface/10 text-on-surface-variant/70 hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
                                    data-tooltip={t('common.copy', 'Sao chép URL')}
                                    aria-label={t('common.copy', 'Sao chép URL')}
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {copiedUrl === res.testDetails.mangaUrl ? 'check' : 'content_copy'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => api?.openExternal?.(res.testDetails.mangaUrl)}
                                    className="p-1 rounded hover:bg-on-surface/10 text-on-surface-variant/70 hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
                                    data-tooltip={t('common.openInBrowser', 'Mở trực tiếp')}
                                    aria-label={t('common.openInBrowser', 'Mở trực tiếp')}
                                  >
                                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                  </button>
                                </div>
                              </div>
                            )}
                            {(res.testDetails.chapterTitle || res.testDetails.chapterUrl) && (
                              <div className="text-on-surface-variant text-[11px] space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[13px] text-on-surface-variant/70">
                                    description
                                  </span>
                                  <span>{t('siteChecker.testDetails.chapter')}</span>
                                  <span className="font-medium truncate">{res.testDetails.chapterTitle || 'Chương cuối'}</span>
                                </div>
                                {res.testDetails.chapterUrl && (
                                  <div className="flex items-center gap-1.5 bg-surface-container-lowest/70 p-1.5 rounded-lg border border-outline-variant/10">
                                    <span className="opacity-85 font-mono select-all break-all flex-1" data-tooltip={res.testDetails.chapterUrl}>
                                      {res.testDetails.chapterUrl}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleCopyUrl(res.testDetails.chapterUrl)}
                                        className="p-1 rounded hover:bg-on-surface/10 text-on-surface-variant/70 hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
                                        data-tooltip={t('common.copy', 'Sao chép URL')}
                                        aria-label={t('common.copy', 'Sao chép URL')}
                                      >
                                        <span className="material-symbols-outlined text-[14px]">
                                          {copiedUrl === res.testDetails.chapterUrl ? 'check' : 'content_copy'}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => api?.openExternal?.(res.testDetails.chapterUrl)}
                                        className="p-1 rounded hover:bg-on-surface/10 text-on-surface-variant/70 hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
                                        data-tooltip={t('common.openInBrowser', 'Mở trực tiếp')}
                                        aria-label={t('common.openInBrowser', 'Mở trực tiếp')}
                                      >
                                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Step rows */}
                        {res.steps &&
                          (res.steps.custom
                            ? [['custom', res.steps.custom]]
                            : [
                                ['listing', res.steps.listing],
                                ['chapters', res.steps.chapters],
                                ['download', res.steps.download],
                              ]
                          )
                            .filter(([, step]) => step)
                            .map(([stepKey, step], idx, arr) => (
                              <div
                                key={stepKey}
                                className={`flex items-center gap-2.5 px-3 py-2 text-xs ${
                                  idx < arr.length - 1 ? 'border-b border-outline-variant/10' : ''
                                }`}
                              >
                                <span
                                  className={`w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 ${
                                    step.ok
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-error/15 text-error'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[12px] leading-none">
                                    {step.ok ? 'check' : 'close'}
                                  </span>
                                </span>

                                <span className="font-semibold text-on-surface min-w-[55px]">
                                  {t(`siteChecker.step.${stepKey}`)}
                                </span>

                                <span className="flex-1 text-on-surface-variant truncate">
                                  {step.ok ? (
                                    <>
                                      {stepKey === 'chapters' && step.chapterCount > 0 && (
                                        <span>
                                          {step.mangaTitle
                                            ? `${step.mangaTitle} (${t('siteChecker.deepTest.chapterCount', {
                                                count: step.chapterCount,
                                              })})`
                                            : t('siteChecker.deepTest.chapterCount', {
                                                count: step.chapterCount,
                                              })}
                                        </span>
                                      )}
                                      {stepKey === 'download' && step.fileSize > 0 && (
                                        <span>
                                          {step.chapterTitle
                                            ? `${step.chapterTitle} — ${t('siteChecker.deepTest.fileSize', {
                                                size: formatFileSize(step.fileSize),
                                              })}`
                                            : t('siteChecker.deepTest.fileSize', {
                                                size: formatFileSize(step.fileSize),
                                              })}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-error block">
                                      <span>{step.error || ''}</span>
                                    </span>
                                  )}
                                </span>

                                {step.durationMs !== undefined && (
                                  <span className="text-[10px] text-on-surface-variant/60 tabular-nums shrink-0">
                                    {step.durationMs}ms
                                  </span>
                                )}
                              </div>
                            ))}

                        {isFailed && res.error && (
                          <div className="px-3 py-2 border-t border-error/10 bg-error/5 text-xs text-error leading-relaxed whitespace-pre-wrap">
                            {res.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredConnectors.length === 0 && (
                <div className="col-span-full py-14 flex flex-col items-center justify-center text-center text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[48px] text-on-surface-variant/35 mb-2">
                    find_in_page
                  </span>
                  <span className="text-sm font-medium">{t('siteChecker.emptyList')}</span>
                </div>
              )}
            </div>
          </div>
        </StudioLayout.Content>
      </StudioLayout.Body>

      {/* Message Dialog */}
      {messageDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-on-surface tracking-tight">
                {messageDialog.title}
              </h2>
              <button
                type="button"
                onClick={() => setMessageDialog(null)}
                className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px] leading-none">close</span>
              </button>
            </div>
            <p
              className={`text-xs sm:text-sm leading-relaxed ${
                messageDialog.type === 'error'
                  ? 'text-error'
                  : messageDialog.type === 'warning'
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-on-surface-variant'
              }`}
            >
              {messageDialog.message}
            </p>
            <div className="flex justify-end pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setMessageDialog(null)}
                className={BTN_PRIMARY}
              >
                {t('guestCredit.modalClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioLayout>
  );
}
