import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { useAppLog } from '../../shared';
import { useConnectorList } from '../../platform/connectors';
import { useSettings } from '../settings';
import { emptySession, applyHydrateSession, applyClearSession } from './sessionReducers.js';

const MANGADEX_LANGUAGE_KEY = 'mangaMangadexLanguage';
const COMICK_LANGUAGE_KEY = 'mangaComickLanguage';
const MANGABALL_LANGUAGE_KEY = 'mangaMangaballLanguage';

function loadMangadexLanguage() {
  if (typeof window === 'undefined') return 'vi';
  try {
    const v = String(localStorage.getItem(MANGADEX_LANGUAGE_KEY) || '').toLowerCase();
    if (v === 'en') return 'en';
    if (v === 'ja') return 'ja';
  } catch {
    /* ignore */
  }
  return 'vi';
}

function loadComickLanguage() {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = String(localStorage.getItem(COMICK_LANGUAGE_KEY) || '').toLowerCase();
    if (v) return v;
  } catch { /* ignore */ }
  return 'en';
}

function loadMangaballLanguage() {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = String(localStorage.getItem(MANGABALL_LANGUAGE_KEY) || '').toLowerCase();
    if (v === 'vi') return 'vi';
    if (v === 'ja' || v === 'jp') return 'ja';
  } catch { /* ignore */ }
  return 'en';
}

function withOfflineCover(mangaObj, localCoverPath) {
  if (!mangaObj || typeof mangaObj !== 'object') return mangaObj;
  const cover_url = String(mangaObj.coverUrl || '').trim();
  if (cover_url) return mangaObj;
  const local_cover = String(localCoverPath || '').trim();
  if (!local_cover) return mangaObj;
  return { ...mangaObj, coverUrl: local_cover, localCoverPath: local_cover };
}

export function useCurrentMangaSession() {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const { savePath } = useSettings();
  const { connectorList } = useConnectorList();

  const initial_session = emptySession();
  const [sourceUrl, setSourceUrl] = useState(initial_session.sourceUrl);
  /** Empty = no connector selected yet (Site dropdown shows its own placeholder). */
  const [site, setSite] = useState(initial_session.site);
  const [mangadexLanguage, setMangadexLanguage] = useState(() => loadMangadexLanguage());
  const [comickLanguage, setComickLanguage] = useState(() => loadComickLanguage());
  const [mangaballLanguage, setMangaballLanguage] = useState(() => loadMangaballLanguage());
  const [manga, setManga] = useState(initial_session.manga);
  const [chapters, setChapters] = useState(initial_session.chapters);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initial_session.fetchError);
  /** i18n key — fetch OK nhưng 0 chương (hiện cảnh báo Sidebar + drawer). */
  const [chapterListNoticeKey, setChapterListNoticeKey] = useState(initial_session.chapterListNoticeKey);
  /** Tăng mỗi khi loadManga thành công — MangaInfo dùng để chạy viền quanh ảnh bìa. */
  const [coverFetchSuccessTick, setCoverFetchSuccessTick] = useState(0);
  /** Thời gian fetch vừa xong (ms), để viền tắt đồng bộ với load thay vì cố định ~2.8s. */
  const [coverFetchDurationMs, setCoverFetchDurationMs] = useState(0);
  const [selectedUrls, setSelectedUrls] = useState(() => new Set());

  const session_snapshot_ref = useRef({});
  session_snapshot_ref.current = {
    manga,
    chapters,
    sourceUrl,
    site,
    fetchError,
    chapterListNoticeKey,
    selectedUrls,
    coverFetchDurationMs,
    coverFetchSuccessTick,
  };

  useEffect(() => {
    try {
      localStorage.setItem(MANGADEX_LANGUAGE_KEY, mangadexLanguage);
    } catch {
      /* ignore */
    }
  }, [mangadexLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem(COMICK_LANGUAGE_KEY, comickLanguage);
    } catch { /* ignore */ }
  }, [comickLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem(MANGABALL_LANGUAGE_KEY, mangaballLanguage);
    } catch { /* ignore */ }
  }, [mangaballLanguage]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.detectSiteFromUrl) return undefined;
    const trimmed = sourceUrl.trim();
    if (trimmed.length < 8 || !trimmed.includes('.')) return undefined;
    const timer = window.setTimeout(() => {
      api.detectSiteFromUrl(trimmed).then((id) => {
        if (id) setSite(id);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [sourceUrl]);

  useEffect(() => {
    if (!connectorList.length) return undefined;
    if (site && !connectorList.some((c) => c.id === site)) {
      setSite('');
    }
    return undefined;
  }, [connectorList, site]);

  const hydrateSession = useCallback((payload = {}) => {
    const next_session = applyHydrateSession(session_snapshot_ref.current, payload);
    setManga(next_session.manga);
    setChapters(next_session.chapters);
    setSourceUrl(next_session.sourceUrl);
    setSite(next_session.site);
    setFetchError(next_session.fetchError);
    setChapterListNoticeKey(next_session.chapterListNoticeKey);
    if (next_session.selectedUrls instanceof Set) {
      setSelectedUrls(next_session.selectedUrls);
    }
    if (typeof next_session.coverFetchDurationMs === 'number') {
      setCoverFetchDurationMs(next_session.coverFetchDurationMs);
    }
    if (typeof next_session.coverFetchSuccessTick === 'number') {
      setCoverFetchSuccessTick(next_session.coverFetchSuccessTick);
    }
  }, []);

  const clearSession = useCallback(() => {
    const next_session = applyClearSession(session_snapshot_ref.current);
    setManga(next_session.manga);
    setChapters(next_session.chapters);
    setSourceUrl(next_session.sourceUrl);
    setSelectedUrls(next_session.selectedUrls instanceof Set ? next_session.selectedUrls : new Set());
    setFetchError(next_session.fetchError);
    setChapterListNoticeKey(next_session.chapterListNoticeKey);
  }, []);

  const loadManga = useCallback(
    async (siteForRequest, urlRaw, options = {}) => {
      const force = options.force === true;
      const mangaTitleHint = String(options.mangaTitleHint || '').trim();
      const api = window.electronAPI;
      if (!api?.loadManga) {
        appendLog(t('app.log.electronLoadManga'), 'warn');
        return { ok: false, chapters: [] };
      }
      const trimmedUrl = String(urlRaw || '').trim();
      if (!trimmedUrl) return { ok: false, chapters: [] };
      const currentUrl = String(manga?.mangaUrl || '').trim();
      if (!force && manga && chapters.length > 0 && trimmedUrl === currentUrl) {
        setSourceUrl(trimmedUrl);
        if (siteForRequest) setSite(siteForRequest);
        return { ok: true, skipped: true, chapters };
      }

      const baseSavePath = String(savePath || '').trim();
      const tryOfflineFromDisk = async () => {
        if (!mangaTitleHint || !baseSavePath || !api.loadMangaOfflineFromDisk) return null;
        try {
          return await api.loadMangaOfflineFromDisk(baseSavePath, mangaTitleHint);
        } catch {
          return null;
        }
      };

      if (!force && mangaTitleHint && baseSavePath) {
        const off = await tryOfflineFromDisk();
        if (off?.ok && off.chapters?.length > 0) {
          const offline_manga = withOfflineCover(off.manga, off.localCoverPath);
          setSourceUrl(trimmedUrl);
          if (siteForRequest) setSite(siteForRequest);
          setFetchError('');
          setChapterListNoticeKey('');
          flushSync(() => {
            setManga(offline_manga);
            setChapters(off.chapters);
            setSelectedUrls(new Set());
            setCoverFetchDurationMs(0);
            setCoverFetchSuccessTick((n) => n + 1);
            if (offline_manga?.siteId) {
              setSite(offline_manga.siteId);
            }
          });
          appendLog(
            t('app.logOpenedOffline', {
              title: offline_manga?.title || '',
              count: off.chapters.length,
            }),
            'success'
          );
          return { ok: true, skipped: true, offline: true, chapters: off.chapters };
        }
      }

      setSourceUrl(trimmedUrl);
      if (siteForRequest) setSite(siteForRequest);
      setFetchError('');
      setChapterListNoticeKey('');
      if (force || trimmedUrl !== currentUrl) {
        flushSync(() => {
          setChapters([]);
          setSelectedUrls(new Set());
        });
      }
      setLoading(true);
      appendLog(t('app.log.fetching', { url: trimmedUrl }), 'info');
      const fetchStartedAt = performance.now();
      try {
        const res = await api.loadManga(siteForRequest || '', trimmedUrl, {
          ...options,
          mangadexLanguage,
          comickLanguage,
          mangaballLanguage,
        });
        if (!res?.ok) {
          const offRetry = await tryOfflineFromDisk();
          if (offRetry?.ok && offRetry.chapters?.length > 0) {
            const offline_manga = withOfflineCover(offRetry.manga, offRetry.localCoverPath);
            flushSync(() => {
              setManga(offline_manga);
              setChapters(offRetry.chapters);
              setSelectedUrls(new Set());
              setFetchError('');
              setChapterListNoticeKey('');
              setCoverFetchDurationMs(0);
              setCoverFetchSuccessTick((n) => n + 1);
              if (offline_manga?.siteId) {
                setSite(offline_manga.siteId);
              }
            });
            appendLog(
              t('app.logOpenedOffline', {
                title: offline_manga?.title || '',
                count: offRetry.chapters.length,
              }),
              'success'
            );
            return { ok: true, offline: true, chapters: offRetry.chapters };
          }
          setManga(null);
          setChapters([]);
          setSelectedUrls(new Set());
          setChapterListNoticeKey('');
          setFetchError(res?.error || t('app.log.fetchErrorUnknown'));
          return { ok: false, chapters: [] };
        }
        const nextChapters = res.chapters || [];
        if (res.manga) {
          try {
            const urlObj = new URL(trimmedUrl);
            const domainKey = `crawler:active-domain:${res.manga.siteId || siteForRequest}`;
            localStorage.setItem(domainKey, urlObj.origin);
          } catch (e) {
            console.error('Failed to save active domain:', e);
          }
        }
        flushSync(() => {
          setManga(res.manga);
          setChapters(nextChapters);
          setSelectedUrls(new Set());
          setChapterListNoticeKey('');
          setCoverFetchDurationMs(Math.max(0, Math.round(performance.now() - fetchStartedAt)));
          setCoverFetchSuccessTick((n) => n + 1);
          if (res.manga?.siteId) {
            setSite(res.manga.siteId);
          }
        });
        if (nextChapters.length === 0) {
          appendLog(
            t('app.log.fetchNoChapters', { title: res.manga?.title || '' }),
            'warn'
          );
        } else {
          appendLog(
            t('app.log.fetchSuccess', {
              title: res.manga?.title || '',
              count: nextChapters.length,
            }),
            'success'
          );
        }
        return { ok: true, skipped: false, chapters: nextChapters };
      } catch (e) {
        const offRetry = await tryOfflineFromDisk();
        if (offRetry?.ok && offRetry.chapters?.length > 0) {
          const offline_manga = withOfflineCover(offRetry.manga, offRetry.localCoverPath);
          flushSync(() => {
            setManga(offline_manga);
            setChapters(offRetry.chapters);
            setSelectedUrls(new Set());
            setFetchError('');
            setChapterListNoticeKey('');
            setCoverFetchDurationMs(0);
            setCoverFetchSuccessTick((n) => n + 1);
            if (offline_manga?.siteId) {
              setSite(offline_manga.siteId);
            }
          });
          appendLog(
            t('app.logOpenedOffline', {
              title: offline_manga?.title || '',
              count: offRetry.chapters.length,
            }),
            'success'
          );
          return { ok: true, offline: true, chapters: offRetry.chapters };
        }
        setFetchError(String(e?.message || e));
        setChapterListNoticeKey('');
        setManga(null);
        setChapters([]);
        return { ok: false, chapters: [] };
      } finally {
        setLoading(false);
      }
    },
    [
      appendLog,
      manga,
      chapters,
      savePath,
      t,
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
    ]
  );

  return useMemo(
    () => ({
      manga,
      chapters,
      site,
      setSite,
      sourceUrl,
      setSourceUrl,
      selectedUrls,
      setSelectedChapterUrls: setSelectedUrls,
      fetchError,
      chapterListNoticeKey,
      loading,
      coverFetchSuccessTick,
      coverFetchDurationMs,
      mangadexLanguage,
      setMangadexLanguage,
      comickLanguage,
      setComickLanguage,
      mangaballLanguage,
      setMangaballLanguage,
      hydrateSession,
      clearSession,
      loadManga,
    }),
    [
      manga,
      chapters,
      site,
      sourceUrl,
      selectedUrls,
      fetchError,
      chapterListNoticeKey,
      loading,
      coverFetchSuccessTick,
      coverFetchDurationMs,
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
      hydrateSession,
      clearSession,
      loadManga,
      setSite,
      setSourceUrl,
      setSelectedUrls,
      setMangadexLanguage,
      setComickLanguage,
      setMangaballLanguage,
    ]
  );
}
