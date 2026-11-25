import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  StudioLayout,
  useStudioLayout,
  SearchableSelect,
  SectionTitle,
  EmptyState,
  ViewModeToggle,
} from '../../shared';
import { buildCookieExtractFeedback } from '../../utils/cookieExtractFeedback';
import ConnectorCard from './ConnectorCard';
import {
  sortConnectorsForChecker,
  buildConnectorErrorReport,
  getUntestedConnectors,
  loadSiteCheckerViewMode,
  saveSiteCheckerViewMode,
  loadSiteCheckerSortPref,
  saveSiteCheckerSortPref,
} from './siteCheckerUtils';

const BTN_ROW =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none shrink-0';
const BTN_SURFACE = `${BTN_ROW} bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20`;
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 min-h-9 px-3.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer select-none bg-primary text-on-primary border border-primary hover:opacity-95 shadow-2xs';

export default function SiteCheckerPanel({ connectors = [], onBusyChange }) {
  const { t } = useI18n();

  // StudioLayout integration (non-canvas tab: keep LeftSidebar permanently open with resize)
  const {
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'site_checker',
    defaultLeftWidth: 320,
    minLeftWidth: 260,
    maxLeftWidth: 560,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'working' | 'broken' | 'untested' | 'vpn' | 'cookie'
  const [sortMode, setSortMode] = useState(() => loadSiteCheckerSortPref());
  const [viewMode, setViewMode] = useState(() => loadSiteCheckerViewMode());
  const [copiedErrorSiteId, setCopiedErrorSiteId] = useState(null);
  const [showErrorDetailId, setShowErrorDetailId] = useState(null);
  const [extractBusy, setExtractBusy] = useState({});
  const [messageDialog, setMessageDialog] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [highlightedSiteId, setHighlightedSiteId] = useState(null);
  const cardRefsMap = useRef(new Map());
  const cardRefCallbacksRef = useRef(new Map());
  const highlightTimerRef = useRef(null);
  const copiedUrlTimerRef = useRef(null);
  const copiedErrorTimerRef = useRef(null);
  const batchRunTokenRef = useRef(0);
  const batchAbortObjRef = useRef(null);
  const singleRunTokenMapRef = useRef(new Map());
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const readActiveDomain = useCallback((siteId, fallback = '') => {
    if (typeof window === 'undefined') return fallback;
    try {
      return window.localStorage?.getItem(`crawler:active-domain:${siteId}`) || fallback;
    } catch {
      return fallback;
    }
  }, []);

  const getCardRef = useCallback((siteId) => {
    let cb = cardRefCallbacksRef.current.get(siteId);
    if (!cb) {
      cb = (el) => {
        if (el) cardRefsMap.current.set(siteId, el);
        else cardRefsMap.current.delete(siteId);
      };
      cardRefCallbacksRef.current.set(siteId, cb);
    }
    return cb;
  }, []);

  const handleSortModeChange = useCallback((nextSort) => {
    setSortMode(nextSort);
    saveSiteCheckerSortPref(nextSort);
  }, []);

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode);
    saveSiteCheckerViewMode(nextMode);
  }, []);

  const handleToggleExpand = useCallback((siteId) => {
    setShowErrorDetailId((prev) => (prev === siteId ? null : siteId));
  }, []);

  const handleResetFilters = useCallback(() => {
    setStatusFilter('all');
    setSearchTerm('');
    setShowErrorDetailId(null);
  }, []);

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
              queued: false,
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
  const [testBatch, setTestBatch] = useState(null);

  // Subscribe to real-time step progress during connector tests
  useEffect(() => {
    if (!api?.onTestConnectorProgress) return;
    const unsub = api.onTestConnectorProgress((data) => {
      if (!data || !data.siteId || !data.step) return;
      setTestResults((prev) => {
        const current = prev[data.siteId];
        // Ignore stale progress events if item is no longer checking or queued
        if (!current || (!current.checking && !current.queued)) return prev;
        return {
          ...prev,
          [data.siteId]: {
            ...current,
            checking: true,
            queued: false,
            steps: {
              ...(current.steps || {}),
              [data.step]: {
                ok: data.status === 'success',
                durationMs: data.durationMs,
              },
            },
          },
        };
      });
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [api]);

  // Abort running connector tests & clear active timers on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      if (copiedUrlTimerRef.current) {
        clearTimeout(copiedUrlTimerRef.current);
      }
      if (copiedErrorTimerRef.current) {
        clearTimeout(copiedErrorTimerRef.current);
      }
      if (batchAbortObjRef.current) {
        batchAbortObjRef.current.aborted = true;
      }
      if (api?.cancelTestConnector) {
        api.cancelTestConnector().catch(() => {});
      }
    };
  }, [api]);

  const handleJumpToConnector = useCallback((siteId) => {
    const el = cardRefsMap.current.get(siteId);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setHighlightedSiteId(siteId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedSiteId((prev) => (prev === siteId ? null : prev));
    }, 1800);
  }, []);

  // Compute busy state across batch tests, single tests, and domain extractions
  const isBusy = Boolean(
    testRunning ||
    Object.values(testResults).some((r) => r?.checking || r?.queued) ||
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

  const runConnectorBatch = async (targets, { isFullRun = false } = {}) => {
    if (testRunning) return;
    if (!targets || targets.length === 0) return;

    const runToken = ++batchRunTokenRef.current;
    setTestRunning(true);
    const targetIds = targets.map((c) => c.id);
    const targetIdSet = new Set(targetIds);
    setTestBatch({ total: targets.length, targetIds });

    // Mark targets as queued and clean up stale connector entries
    setTestResults((prev) => {
      const validIds = new Set(connectors.map((c) => c.id));
      const next = {};
      // Retain only valid non-target connectors
      Object.entries(prev).forEach(([id, val]) => {
        if (validIds.has(id) && !targetIdSet.has(id)) {
          next[id] = val;
        }
      });
      // Mark targets in this batch as queued so user sees them immediately in the list
      targets.forEach((c) => {
        const prevStatus = prev[c.id]?.status;
        next[c.id] = {
          status: isFullRun ? 'not-tested' : (prevStatus || 'not-tested'),
          checking: false,
          queued: true,
          testedAt: null,
          steps: {},
        };
      });
      return next;
    });

    const abortObj = { aborted: false };
    batchAbortObjRef.current = abortObj;

    const queue = [...targets];
    const concurrency = 2; // Deep test is heavier (chapters + download), limit concurrency

    const runWorker = async () => {
      while (queue.length > 0 && !abortObj.aborted && batchRunTokenRef.current === runToken) {
        const c = queue.shift();
        if (!c) break;

        setTestResults((prev) => ({
          ...prev,
          [c.id]: { ...prev[c.id], checking: true, queued: false, steps: {} },
        }));

        try {
          const activeDomain = readActiveDomain(c.id, '');
          const testFn = api?.testConnector;
          if (!testFn) {
            throw new Error('testConnector API unavailable');
          }
          const res = await testFn(c.id, activeDomain);
          if (abortObj.aborted || batchRunTokenRef.current !== runToken) break;
          if (res?.aborted) continue;

          if (res?.ok) {
            setTestResults((prev) => ({
              ...prev,
              [c.id]: {
                status: 'success',
                checking: false,
                queued: false,
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
                checking: false,
                queued: false,
                error: res?.error,
                rtt: res?.durationMs,
                steps: res?.steps,
                testDetails: res?.testDetails,
                testedAt: Date.now(),
              },
            }));
          }
        } catch (err) {
          if (abortObj.aborted || batchRunTokenRef.current !== runToken) break;
          setTestResults((prev) => ({
            ...prev,
            [c.id]: {
              status: 'failed',
              checking: false,
              queued: false,
              error: err.message || String(err),
              testedAt: Date.now(),
            },
          }));
        }
      }
    };

    try {
      const workers = Array.from({ length: concurrency }, () => runWorker());
      await Promise.all(workers);
    } finally {
      if (batchRunTokenRef.current === runToken) {
        if (batchAbortObjRef.current === abortObj) {
          batchAbortObjRef.current = null;
        }
        setTestRunning(false);
        setTestBatch(null);
      }
    }
  };

  const startTestAll = () =>
    runConnectorBatch(filteredConnectors, {
      isFullRun: filteredConnectors.length === connectors.length,
    });

  const untestedConnectors = useMemo(
    () => getUntestedConnectors(connectors, testResults),
    [connectors, testResults]
  );

  const startTestBrokenOnly = () => {
    const brokenTargets = connectors.filter((c) => results[c.id]?.status === 'failed');
    return runConnectorBatch(brokenTargets, { isFullRun: false });
  };

  const startTestUntestedOnly = () => {
    return runConnectorBatch(untestedConnectors, { isFullRun: false });
  };

  const cancelTestAll = async () => {
    batchRunTokenRef.current += 1;
    if (batchAbortObjRef.current) {
      batchAbortObjRef.current.aborted = true;
      batchAbortObjRef.current = null;
    }
    setTestRunning(false);
    setTestBatch(null);

    if (api?.cancelTestConnector) {
      try {
        await api.cancelTestConnector();
      } catch (e) {
        console.warn('cancelTestConnector failed:', e);
      }
    }

    setTestResults((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (next[id]?.checking || next[id]?.queued) {
          next[id] = { ...next[id], checking: false, queued: false };
        }
      });
      return next;
    });
  };

  const cancelSingleTest = async (siteId) => {
    const nextToken = (singleRunTokenMapRef.current.get(siteId) || 0) + 1;
    singleRunTokenMapRef.current.set(siteId, nextToken);

    if (api?.cancelTestConnector) {
      try {
        await api.cancelTestConnector(siteId);
      } catch (e) {
        console.warn('cancelTestConnector failed:', e);
      }
    }
    setTestResults((prev) => {
      if (!prev[siteId]) return prev;
      if (singleRunTokenMapRef.current.get(siteId) !== nextToken) return prev;
      return {
        ...prev,
        [siteId]: {
          ...prev[siteId],
          checking: false,
          queued: false,
        },
      };
    });
  };

  const startSingleTest = async (siteId) => {
    if (testRunning) return;

    const token = (singleRunTokenMapRef.current.get(siteId) || 0) + 1;
    singleRunTokenMapRef.current.set(siteId, token);

    setTestResults((prev) => ({
      ...prev,
      [siteId]: { ...prev[siteId], checking: true, queued: false, steps: {} },
    }));

    try {
      const activeDomain = readActiveDomain(siteId, '');
      const testFn = api?.testConnector;
      if (!testFn) {
        throw new Error('testConnector API unavailable');
      }
      const res = await testFn(siteId, activeDomain);
      if (singleRunTokenMapRef.current.get(siteId) !== token) return;

      if (res?.aborted) {
        setTestResults((prev) => {
          if (!prev[siteId]) return prev;
          return {
            ...prev,
            [siteId]: {
              ...prev[siteId],
              checking: false,
              queued: false,
            },
          };
        });
        return;
      }
      if (res?.ok) {
        setTestResults((prev) => ({
          ...prev,
          [siteId]: {
            status: 'success',
            checking: false,
            queued: false,
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
            checking: false,
            queued: false,
            error: res?.error,
            rtt: res?.durationMs,
            steps: res?.steps,
            testDetails: res?.testDetails,
            testedAt: Date.now(),
          },
        }));
      }
    } catch (err) {
      if (singleRunTokenMapRef.current.get(siteId) !== token) return;
      setTestResults((prev) => {
        if (!prev[siteId]?.checking) return prev;
        return {
          ...prev,
          [siteId]: {
            status: 'failed',
            checking: false,
            queued: false,
            error: err.message || String(err),
            testedAt: Date.now(),
          },
        };
      });
    }
  };

  const results = testResults;
  const running = testRunning;

  const handleCopyUrl = useCallback(async (url) => {
    if (!url || typeof navigator?.clipboard?.writeText !== 'function') return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      if (copiedUrlTimerRef.current) clearTimeout(copiedUrlTimerRef.current);
      copiedUrlTimerRef.current = setTimeout(() => setCopiedUrl(null), 1500);
    } catch (err) {
      console.error('Copy url failed:', err);
    }
  }, []);

  // Reset all test results manually
  const handleResetAllResults = useCallback(() => {
    if (isBusy) return;
    setTestResults({});
    try {
      localStorage.removeItem('crawler:site-test-results');
    } catch {
      /* ignore */
    }
  }, [isBusy]);

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
    const untested = untestedConnectors.length;
    const progressPercent = total > 0 ? (tested / total) * 100 : 0;

    return { total, working, broken, untested, vpn, cookie, tested, progressPercent };
  }, [results, connectors, untestedConnectors.length]);

  // Active test batch progress for scoped testing
  const batchTested = useMemo(() => {
    if (!testBatch) return 0;
    return testBatch.targetIds.filter((id) => {
      const r = results[id];
      return r && !r.checking && !r.queued && r.testedAt && (r.status === 'success' || r.status === 'failed');
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
          await api?.setCookie?.(siteId, cookieStr);
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
  // Set of connector IDs currently being re-tested in the active batch
  const batchTargetIdSet = useMemo(
    () => (testBatch ? new Set(testBatch.targetIds) : new Set()),
    [testBatch]
  );

  const filteredConnectors = useMemo(() => {
    const filtered = connectors.filter((c) => {
      const labelMatch = String(c.label || '').toLowerCase().includes(searchTerm.toLowerCase());
      const domainMatch = String(c.domain || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = labelMatch || domainMatch;
      if (!matchesSearch) return false;

      const res = results[c.id];
      // If this connector is actively being re-tested in the current batch, always keep it
      // visible regardless of its current status so progress can be monitored in real time
      const isInActiveBatch = batchTargetIdSet.has(c.id);
      if (statusFilter === 'working') return res?.status === 'success' || isInActiveBatch;
      if (statusFilter === 'broken') return res?.status === 'failed' || isInActiveBatch;
      if (statusFilter === 'untested') return (res?.status !== 'success' && res?.status !== 'failed') || isInActiveBatch;
      if (statusFilter === 'vpn') return c.requiresVpn || c.suggestsVpn;
      if (statusFilter === 'cookie') return c.requiresCookie;
      return true;
    });
    return sortConnectorsForChecker(filtered, results, sortMode);
  }, [connectors, results, searchTerm, statusFilter, batchTargetIdSet, sortMode]);

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('siteChecker.sortDefault'), materialIcon: 'sort' },
      { value: 'rttAsc', label: t('siteChecker.sortRttAsc'), materialIcon: 'speed' },
      { value: 'rttDesc', label: t('siteChecker.sortRttDesc'), materialIcon: 'hourglass_bottom' },
      { value: 'brokenFirst', label: t('siteChecker.sortBrokenFirst'), materialIcon: 'error_outline' },
    ],
    [t]
  );

  const handleCopyConnectorError = useCallback(async (connector, result, displayDomain) => {
    if (!connector?.id || typeof navigator?.clipboard?.writeText !== 'function') return;
    try {
      const text = buildConnectorErrorReport(connector, result, displayDomain);
      await navigator.clipboard.writeText(text);
      setCopiedErrorSiteId(connector.id);
      if (copiedErrorTimerRef.current) clearTimeout(copiedErrorTimerRef.current);
      copiedErrorTimerRef.current = setTimeout(() => {
        setCopiedErrorSiteId((prev) => (prev === connector.id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Copy connector error failed:', err);
    }
  }, []);

  const hasActiveFilters = statusFilter !== 'all' || Boolean(searchTerm.trim());

  const handleOpenExternal = useCallback(
    (url) => {
      if (url) api?.openExternal?.(url);
    },
    [api]
  );

  useEffect(() => {
    if (!messageDialog) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMessageDialog(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [messageDialog]);

  const filterOptions = [
    { id: 'all', label: t('siteChecker.filter.all'), count: stats.total },
    { id: 'working', label: t('siteChecker.filter.working'), count: stats.working },
    { id: 'broken', label: t('siteChecker.filter.broken'), count: stats.broken },
    { id: 'untested', label: t('siteChecker.filter.untested'), count: stats.untested },
    { id: 'vpn', label: t('siteChecker.filter.needVpn'), count: stats.vpn },
    { id: 'cookie', label: t('siteChecker.filter.needCookie'), count: stats.cookie },
  ];

  return (
    <StudioLayout>
      {/* Top Header Bar */}
      <StudioLayout.Toolbar
        leftSlot={
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            <div
              role="tablist"
              aria-label={t('menu.siteChecker')}
              className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25 overflow-x-auto no-scrollbar shrink-0"
            >
              {filterOptions.map((filter) => {
                const isActive = statusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setStatusFilter(filter.id);
                      setShowErrorDetailId(null);
                    }}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-primary text-on-primary font-semibold shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
                    }`}
                  >
                    <span>{filter.label}</span>
                    {filter.count !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          isActive
                            ? 'bg-on-primary/20 text-on-primary'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {filter.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              data-testid="site-checker-primary-action-slot"
              className="flex items-center gap-2 shrink-0 empty:hidden pl-2.5 border-l border-outline-variant/25 ml-1"
            >
              {!running ? (
                <button
                  type="button"
                  onClick={startTestAll}
                  disabled={isBusy || filteredConnectors.length === 0}
                  className="h-8 px-3.5 shrink-0 rounded-lg bg-primary text-xs font-semibold text-on-primary transition-all hover:opacity-95 active:scale-95 disabled:pointer-events-none disabled:opacity-45 inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
                  data-tooltip={
                    filteredConnectors.length === 0
                      ? t('siteChecker.emptyList')
                      : filteredConnectors.length < connectors.length
                      ? t('siteChecker.testFilteredTooltip', { count: filteredConnectors.length })
                      : undefined
                  }
                  aria-label={
                    filteredConnectors.length < connectors.length
                      ? t('siteChecker.testFiltered', { count: filteredConnectors.length })
                      : t('siteChecker.testAll')
                  }
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">bolt</span>
                  <span>
                    {filteredConnectors.length < connectors.length
                      ? t('siteChecker.testFiltered', { count: filteredConnectors.length })
                      : t('siteChecker.testAll')}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelTestAll}
                  className="h-8 px-3.5 shrink-0 rounded-lg bg-error/15 text-error hover:bg-error/25 border border-error/30 text-xs font-semibold transition-all active:scale-95 inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  aria-label={t('siteChecker.cancel')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">stop_circle</span>
                  <span>{t('siteChecker.cancel')}</span>
                </button>
              )}
            </div>
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2 shrink-0">
            <SearchableSelect
              size="sm"
              value={sortMode}
              onChange={handleSortModeChange}
              options={sortOptions}
              ariaLabel={t('siteChecker.sortLabel')}
              className="w-44 shrink-0"
            />
            <ViewModeToggle viewMode={viewMode} onChange={handleViewModeChange} size="md" />
          </div>
        }
      />

      {/* Main Workspace Body */}
      <StudioLayout.Body>
        {/* Left Sidebar: Search, Progress & Quick Site Directory */}
        <StudioLayout.LeftSidebar
          open={true}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 flex flex-col gap-4 h-full min-h-[420px]">
            {/* Search Box */}
            <div className="space-y-1.5">
              <SectionTitle as="label" htmlFor="site-checker-search" className="block">
                {t('siteChecker.searchLabel')}
              </SectionTitle>
              <div className="relative">
                <input
                  id="site-checker-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('siteChecker.searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest pl-9 pr-8 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary/30"
                />
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60 absolute left-2.5 top-2.5 pointer-events-none">
                  search
                </span>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    data-tooltip={t('siteChecker.clearSearch')}
                    aria-label={t('siteChecker.clearSearch')}
                    className="absolute right-2 top-2 rounded-lg p-1 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">close</span>
                  </button>
                )}
              </div>
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

            {/* Quick Site Directory */}
            <div className="flex-1 flex flex-col min-h-0 space-y-1.5 pt-3 border-t border-outline-variant/15">
              <SectionTitle as="span" className="flex items-center justify-between shrink-0">
                <span>{t('siteChecker.quickSiteList')}</span>
                <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                  {filteredConnectors.length}
                </span>
              </SectionTitle>
              <div className="flex-1 min-h-[160px] space-y-1 overflow-y-auto custom-scrollbar pr-1">
                {filteredConnectors.map((c) => {
                  const res = results[c.id];
                  const isChecking = res?.checking === true || res?.status === 'testing';
                  const isQueued = res?.queued === true && !isChecking;
                  const isSuccess = res?.status === 'success' && !isChecking && !isQueued;
                  const isFailed = res?.status === 'failed' && !isChecking && !isQueued;

                  const statusDot = isChecking
                    ? 'bg-primary animate-ping'
                    : isQueued
                    ? 'bg-outline-variant animate-pulse'
                    : isSuccess
                    ? 'bg-emerald-500'
                    : isFailed
                    ? 'bg-error'
                    : 'bg-outline-variant/40';

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleJumpToConnector(c.id)}
                      data-tooltip={t('siteChecker.jumpToSiteTooltip', { site: c.label })}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors select-none cursor-pointer text-left ${
                        highlightedSiteId === c.id
                          ? 'bg-primary/15 text-primary font-semibold'
                          : 'hover:bg-surface-container-high text-on-surface'
                      }`}
                    >
                      <span className="truncate font-medium min-w-0 flex-1">{c.label}</span>
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        {isSuccess && res?.rtt !== undefined && (
                          <span className="text-[10px] text-on-surface-variant/70 tabular-nums">
                            {res.rtt}ms
                          </span>
                        )}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                      </span>
                    </button>
                  );
                })}
                {filteredConnectors.length === 0 && (
                  <p className="px-2 py-4 text-center text-[11px] text-on-surface-variant/60">
                    {t('siteChecker.emptyList')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content: Connector Diagnostics Grid/List & Bottom Summary Footer */}
        <StudioLayout.Content className="flex flex-col min-h-0 overflow-hidden bg-surface">
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
            <div className="w-full space-y-4">
              {/* Header info & secondary batch controls */}
              <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">network_check</span>
                  <SectionTitle as="h2">
                    {t('siteChecker.connectorsListTitle', { count: filteredConnectors.length })}
                  </SectionTitle>
                </div>

                {!running && (stats.broken > 0 || (untestedConnectors.length > 0 && stats.tested > 0) || stats.tested > 0) ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {stats.broken > 0 && (
                      <button
                        type="button"
                        onClick={startTestBrokenOnly}
                        disabled={isBusy}
                        className={BTN_SURFACE}
                        data-tooltip={t('siteChecker.retestBrokenTooltip')}
                        aria-label={t('siteChecker.retestBroken', { count: stats.broken })}
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none text-error">refresh</span>
                        <span>{t('siteChecker.retestBroken', { count: stats.broken })}</span>
                      </button>
                    )}
                    {untestedConnectors.length > 0 && stats.tested > 0 && (
                      <button
                        type="button"
                        onClick={startTestUntestedOnly}
                        disabled={isBusy}
                        className={BTN_SURFACE}
                        data-tooltip={t('siteChecker.testUntestedTooltip')}
                        aria-label={t('siteChecker.testUntestedTooltip')}
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none text-amber-500">pending_actions</span>
                        <span>{t('siteChecker.testUntested', { count: untestedConnectors.length })}</span>
                      </button>
                    )}
                    {stats.tested > 0 && (
                      <button
                        type="button"
                        onClick={handleResetAllResults}
                        disabled={isBusy}
                        className={BTN_SURFACE}
                        aria-label={t('siteChecker.resetResults')}
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none">restart_alt</span>
                        <span>{t('siteChecker.resetResults')}</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Cards Grid / Compact List / EmptyState */}
              {filteredConnectors.length === 0 ? (
                <EmptyState
                  icon="find_in_page"
                  {...{ title: t('siteChecker.emptyList') }}
                  description={hasActiveFilters ? t('siteChecker.emptyFilteredDesc') : undefined}
                  action={
                    hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className={BTN_PRIMARY}
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none">
                          filter_alt_off
                        </span>
                        <span>{t('siteChecker.resetFilters')}</span>
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div
                  className={
                    viewMode === 'list'
                      ? 'flex flex-col gap-2'
                      : 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start'
                  }
                >
                  {filteredConnectors.map((c) => {
                    const displayDomain = readActiveDomain(c.id, c.domain);

                    return (
                      <ConnectorCard
                        key={c.id}
                        connector={c}
                        result={results[c.id]}
                        displayDomain={displayDomain}
                        viewMode={viewMode}
                        isHighlighted={highlightedSiteId === c.id}
                        isExpanded={showErrorDetailId === c.id}
                        onToggleExpand={handleToggleExpand}
                        isRunningBatch={running}
                        isExtractBusy={Boolean(extractBusy[c.id])}
                        copiedUrl={copiedUrl}
                        isErrorCopied={copiedErrorSiteId === c.id}
                        onOpenDomain={handleOpenDomain}
                        onExtractCookie={handleAutoExtractCookie}
                        onStartSingleTest={startSingleTest}
                        onCancelSingleTest={cancelSingleTest}
                        onCopyUrl={handleCopyUrl}
                        onCopyError={handleCopyConnectorError}
                        onOpenExternal={handleOpenExternal}
                        cardRef={getCardRef(c.id)}
                        t={t}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Standardized Bottom Summary Footer Bar */}
          {connectors.length > 0 && (
            <div className="border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
                  {t('siteChecker.footerSummary', {
                    shown: filteredConnectors.length,
                    total: stats.total,
                  })}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{t('siteChecker.working')}: {stats.working}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-error/20 bg-error/10 px-2.5 py-0.5 font-semibold text-error tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-error" />
                  <span>{t('siteChecker.broken')}: {stats.broken}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-high px-2.5 py-0.5 font-semibold text-on-surface-variant tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
                  <span>{t('siteChecker.filter.untested')}: {stats.untested}</span>
                </span>
              </div>
            </div>
          )}
        </StudioLayout.Content>
      </StudioLayout.Body>

      {/* Message Dialog */}
      {messageDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-checker-dialog-title"
          onClick={() => setMessageDialog(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="site-checker-dialog-title"
                className="text-base font-bold text-on-surface tracking-tight"
              >
                {messageDialog.title}
              </h2>
              <button
                type="button"
                onClick={() => setMessageDialog(null)}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer shrink-0"
                data-tooltip={t('siteChecker.closeDialog')}
                aria-label={t('siteChecker.closeDialog')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">close</span>
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
                {t('siteChecker.closeDialog')}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioLayout>
  );
}
