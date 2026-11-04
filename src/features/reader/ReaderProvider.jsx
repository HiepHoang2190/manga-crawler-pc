import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { useAppLog } from '../../shared';
import { useAuth } from '../../auth';
import { useSettings } from '../settings';
import { useDownload } from '../download';
import { evaluateFreeUserChapterGate } from '../../utils/freeUserCreditGate.mjs';
import {
  getReaderProgressKey,
  getSavedChapterIndex,
  getReadingProgressEntry,
  patchReadingProgress,
} from '../../utils/readingProgress';
import MangaReader from './components/MangaReader.jsx';
import EbookReader from './components/EbookReader.jsx';

const ReaderContext = createContext(null);

const RECENT_EXTRACTED_CBZ_ENTRIES_KEY = 'recentExtractedCbzEntries';

function loadRecentExtractedCbzEntries() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_EXTRACTED_CBZ_ENTRIES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({
        title: String(x?.title || '').trim(),
        chapterCount: Number(x?.chapterCount || 0),
        extractPath: String(x?.extractPath || '').trim(),
        openPath: String(x?.openPath || x?.extractPath || '').trim(),
        sourceKind: String(x?.sourceKind || 'extracted').trim() === 'file' ? 'file' : 'extracted',
        sourceFile: String(x?.sourceFile || '').trim(),
        ebookPath: String(x?.ebookPath || '').trim(),
        localCoverPath: String(x?.localCoverPath || '').trim(),
      }))
      .filter((x) => x.openPath);
  } catch {
    return [];
  }
}

export function ReaderProvider({ children }) {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const {
    authBootstrapped,
    authSession,
    isSignedIn,
    shouldConsumeFreeUserToken,
    setFreeUserRemainingTokens,
    setFreeUserTokenExhaustedOpen,
  } = useAuth();
  const { savePath, threads } = useSettings();
  const {
    manga,
    chapters,
    site,
    sourceUrl,
    mangadexLanguage,
    comickLanguage,
    mangaballLanguage,
    hydrateSession,
    clearSession,
  } = useDownload();

  const [offlineReaderSession, setOfflineReaderSession] = useState(null);

  const activeManga = offlineReaderSession?.manga || manga;
  const activeChapters = offlineReaderSession?.chapters || chapters;

  const chaptersRef = useRef(activeChapters);
  chaptersRef.current = activeChapters;
  const mangaRef = useRef(activeManga);
  mangaRef.current = activeManga;
  const siteRef = useRef(site);
  siteRef.current = site;

  const [readerOpen, setReaderOpen] = useState(false);
  const [ebookOpen, setEbookOpen] = useState(false);
  const [ebookPath, setEbookPath] = useState(null);
  const [readerChapterIndex, setReaderChapterIndex] = useState(0);
  const readerChapterIndexRef = useRef(readerChapterIndex);
  readerChapterIndexRef.current = readerChapterIndex;
  /** Reader — stream đọc/tải đồng thời (IPC streamRequestId) hoặc null. */
  const [readerStreamingRead, setReaderStreamingRead] = useState(null);
  /** Tiến độ giải nén CBZ: { pct, extracted, total } | null */
  const [cbzLoadProgress, setCbzLoadProgress] = useState(null);
  /** Lỗi mở file CBZ/archive gần nhất */
  const [cbzError, setCbzError] = useState('');
  /** Danh sách thư mục CBZ đã giải nén gần đây (persist localStorage). */
  const [recentExtractedCbzEntries, setRecentExtractedCbzEntries] = useState(() => loadRecentExtractedCbzEntries());
  const removeRecentExtractedCbzEntry = useCallback((extractPath, sourceFile) => {
    const open_path = String(extractPath || '').trim();
    const source_file = String(sourceFile || '').trim();
    if (!open_path && !source_file) return;
    setRecentExtractedCbzEntries((prev) =>
      prev.filter((x) => {
        const item_open_path = String(x.openPath || x.extractPath || '').trim();
        const item_source_file = String(x.sourceFile || '').trim();
        if (open_path && item_open_path === open_path) return false;
        if (source_file && item_source_file && item_source_file === source_file) return false;
        return true;
      })
    );
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        RECENT_EXTRACTED_CBZ_ENTRIES_KEY,
        JSON.stringify(recentExtractedCbzEntries.slice(0, 20))
      );
    } catch {
      /* ignore */
    }
  }, [recentExtractedCbzEntries]);

  // Fill missing cover for extracted folders by scanning first image recursively.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.findFirstImageInDirectory) return undefined;
    const missingEntries = recentExtractedCbzEntries.filter(
      (x) => String(x?.extractPath || '').trim() && !String(x?.localCoverPath || '').trim()
    );
    if (!missingEntries.length) return undefined;
    let cancelled = false;
    (async () => {
      const coverByPath = new Map();
      for (const entry of missingEntries) {
        const extractPath = String(entry?.extractPath || '').trim();
        if (!extractPath) continue;
        try {
          const r = await api.findFirstImageInDirectory(extractPath);
          if (r?.ok && r.path) {
            coverByPath.set(extractPath, String(r.path).trim());
          }
        } catch {
          /* ignore per entry */
        }
      }
      if (cancelled || coverByPath.size === 0) return;
      setRecentExtractedCbzEntries((prev) =>
        prev.map((entry) => {
          const extractPath = String(entry?.extractPath || '').trim();
          const nextCover = coverByPath.get(extractPath);
          if (!nextCover) return entry;
          return { ...entry, localCoverPath: nextCover };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [recentExtractedCbzEntries]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribeCbzLoadProgress) return undefined;
    const unsub = api.subscribeCbzLoadProgress((data) => {
      if (data?.phase === 'done' || data?.phase === 'error') {
        setCbzLoadProgress(null);
      } else {
        setCbzLoadProgress((prev) => ({
          ...prev,
          ...data,
          filePath: data?.filePath || prev?.filePath || null,
        }));
      }
    });
    return () => unsub?.();
  }, []);

  const readerProgressKey = useMemo(
    () => getReaderProgressKey(activeManga, activeManga?.siteId || site, activeManga?.mangaUrl || sourceUrl, savePath),
    [activeManga, site, sourceUrl, savePath]
  );

  const lastAppliedReadingProgressKeyRef = useRef(null);
  const readingProgressFlushRef = useRef(null);

  useEffect(() => {
    lastAppliedReadingProgressKeyRef.current = null;
  }, [readerProgressKey]);

  useEffect(() => {
    if (!activeChapters.length || !readerProgressKey) return;
    if (lastAppliedReadingProgressKeyRef.current === readerProgressKey) return;
    const idx = getSavedChapterIndex(activeChapters, readerProgressKey);
    if (idx !== null) setReaderChapterIndex(idx);
    else setReaderChapterIndex(0);
    lastAppliedReadingProgressKeyRef.current = readerProgressKey;
  }, [readerProgressKey, activeChapters]);

  const handleStreamingReadEnd = useCallback(() => setReaderStreamingRead(null), []);
  const handleStreamingDownloadSettled = useCallback(
    async (detail) => {
      if (!shouldConsumeFreeUserToken) return;
      if (!detail?.ok || detail.skipped || detail.aborted) return;
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      const email = String(authSession?.email || '').trim();
      if (!api?.consumeFreeUserDownloadCredit || !email) return;
      try {
        const consume_result = await api.consumeFreeUserDownloadCredit({
          email,
          userType: authSession?.userType,
          impliedSupabaseFree: authSession?.impliedSupabaseFree,
          entitlements: authSession?.entitlements,
          isAdmin: authSession?.isAdmin,
          mangaUrl: detail.mangaUrl,
          chapterUrl: detail.chapterUrl,
        });
        if (consume_result?.ok && Number.isFinite(Number(consume_result.remainingTokens))) {
          setFreeUserRemainingTokens(Math.max(0, Math.floor(Number(consume_result.remainingTokens))));
        }
        if (consume_result?.needLogin) {
          setFreeUserTokenExhaustedOpen(true);
        }
      } catch (e) {
        appendLog(
          t('app.log.tokenVerifyFailed', {
            error: String(e?.message || e || t('app.log.fetchErrorUnknown')),
          }),
          'warn'
        );
      }
    },
    [appendLog, authSession, shouldConsumeFreeUserToken, t, setFreeUserRemainingTokens, setFreeUserTokenExhaustedOpen]
  );

  const openReaderAtChapter = useCallback((index) => {
    const list = chaptersRef.current;
    if (!list.length) return;
    const n = Number(index);
    const i = Math.max(0, Math.min(Number.isFinite(n) ? Math.floor(n) : 0, list.length - 1));
    setReaderStreamingRead(null);
    setReaderChapterIndex(i);
    setReaderOpen(true);
  }, []);

  const openReaderAtSavedOrFallback = useCallback(
    (fallbackIndex) => {
      const list = chaptersRef.current;
      if (!list.length) return;
      const m = mangaRef.current;
      const key = getReaderProgressKey(m, site, sourceUrl, savePath);
      const saved = key ? getSavedChapterIndex(list, key) : null;
      const n = saved !== null ? saved : fallbackIndex;
      openReaderAtChapter(n);
    },
    [site, sourceUrl, savePath, openReaderAtChapter]
  );

  const flushReadingProgressNow = useCallback(() => {
    if (readingProgressFlushRef.current) {
      clearTimeout(readingProgressFlushRef.current);
      readingProgressFlushRef.current = null;
    }
    const key = readerProgressKey;
    if (!key) return;
    const list = chaptersRef.current;
    const ch = list[readerChapterIndexRef.current];
    if (!ch?.url) return;
    patchReadingProgress(key, { chapterUrl: ch.url });
  }, [readerProgressKey]);

  useEffect(() => {
    if (!readerOpen || !readerProgressKey) return undefined;
    const list = chaptersRef.current;
    const ch = list[readerChapterIndex];
    if (!ch?.url) return undefined;
    if (readingProgressFlushRef.current) clearTimeout(readingProgressFlushRef.current);
    readingProgressFlushRef.current = window.setTimeout(() => {
      readingProgressFlushRef.current = null;
      const list = chaptersRef.current;
      const c = list[readerChapterIndexRef.current];
      if (!c?.url) return;
      patchReadingProgress(readerProgressKey, { chapterUrl: c.url });
    }, 400);
    return () => {
      if (readingProgressFlushRef.current) clearTimeout(readingProgressFlushRef.current);
    };
  }, [readerOpen, readerProgressKey, readerChapterIndex]);

  const handleReadChapterOnline = useCallback(
    async (ch) => {
      if (!savePath.trim()) {
        appendLog(t('app.log.needSavePathShort'), 'warn');
        return;
      }
      const list = chaptersRef.current;
      const m = mangaRef.current;
      const i = list.findIndex((c) => c.url === ch.url);
      if (i < 0) return;
      if (shouldConsumeFreeUserToken) {
        const api = typeof window !== 'undefined' ? window.electronAPI : null;
        const email = String(authSession?.email || '').trim();
        if (!email || !api?.ensureFreeUserCreditsByEmail) {
          appendLog(t('app.log.noEmailForToken'), 'warn');
          return;
        }
        const ensureRes = await api.ensureFreeUserCreditsByEmail({
          email,
          userType: authSession?.userType,
          impliedSupabaseFree: authSession?.impliedSupabaseFree,
          entitlements: authSession?.entitlements,
          isAdmin: authSession?.isAdmin,
        });
        const credit_gate = evaluateFreeUserChapterGate({
          shouldConsume: true,
          ensureResult: ensureRes,
        });
        if (credit_gate.remaining != null) {
          setFreeUserRemainingTokens(credit_gate.remaining);
        }
        if (credit_gate.showExhaustedModal) {
          appendLog(t('freeUserToken.modalBody'), 'warn');
          setFreeUserTokenExhaustedOpen(true);
          return;
        }
        if (credit_gate.block) {
          appendLog(
            t('app.log.tokenCheckBeforeDownload', {
              error: credit_gate.error || t('app.log.fetchErrorUnknown'),
            }),
            'warn'
          );
          return;
        }
      }
      const request_id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      setReaderStreamingRead({
        requestId: request_id,
        chapterUrl: String(ch.url),
        site: siteRef.current,
        mangaUrl: String(m?.mangaUrl || '').trim(),
        coverUrl: m?.coverUrl || '',
        numberOfThreads: Math.max(1, Math.min(Number(threads) || 5, 5)),
        mangadexLanguage,
        comickLanguage,
        mangaballLanguage,
      });
      setReaderChapterIndex(i);
      setReaderOpen(true);
    },
    [
      appendLog,
      t,
      savePath,
      threads,
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
      shouldConsumeFreeUserToken,
      authSession,
      setFreeUserRemainingTokens,
      setFreeUserTokenExhaustedOpen,
    ]
  );

  /**
   * Reader (pick chapter / any index change): offline if images exist on disk; otherwise stream like mobile.
   * Avoids staying on streaming state for a different URL then loading wrong chapter offline.
   */
  const handleReaderChapterIndexChange = useCallback(
    async (rawIndex) => {
      const list = chaptersRef.current;
      const m = mangaRef.current;
      const n = Number(rawIndex);
      const i = Math.max(0, Math.min(Number.isFinite(n) ? Math.floor(n) : 0, list.length - 1));
      const ch = list[i];
      if (!ch?.url) return;

      if (m?.offlineOnly) {
        setReaderStreamingRead(null);
        setReaderChapterIndex(i);
        return;
      }

      const url_string = String(ch.url);
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      const base = String(savePath || '').trim();
      const mt = String(m?.title || '').trim();
      if (api?.filterChaptersWithLocalImages && base && mt) {
        try {
          const r = await api.filterChaptersWithLocalImages(savePath, mt, [ch]);
          if (
            r?.ok &&
            Array.isArray(r.chapters) &&
            r.chapters.some((c) => String(c.url || '') === url_string)
          ) {
            setReaderStreamingRead(null);
            setReaderChapterIndex(i);
            return;
          }
        } catch {
          /* fall through to stream */
        }
      }

      if (base) {
        await handleReadChapterOnline(ch);
        return;
      }

      setReaderStreamingRead(null);
      setReaderChapterIndex(i);
    },
    [savePath, handleReadChapterOnline]
  );

  const openReaderPreparedAtChapterUrl = useCallback(
    (ch) => {
      const list = chaptersRef.current;
      const i = list.findIndex((c) => c.url === ch.url);
      openReaderAtChapter(i >= 0 ? i : 0);
    },
    [openReaderAtChapter]
  );

  const openReader = useCallback(
    (target, options = {}) => {
      if (options.stream && target && typeof target === 'object') {
        return handleReadChapterOnline(target);
      }
      if (typeof target === 'number') {
        openReaderAtChapter(target);
        return;
      }
      if (target && typeof target === 'object' && target.url) {
        openReaderPreparedAtChapterUrl(target);
        return;
      }
      openReaderAtSavedOrFallback(0);
    },
    [handleReadChapterOnline, openReaderAtChapter, openReaderPreparedAtChapterUrl, openReaderAtSavedOrFallback]
  );

  const openOfflineReader = useCallback(({ manga: om, chapters: och, initialChapterIndex = 0 }) => {
    if (!om || !Array.isArray(och) || och.length === 0) return;
    setOfflineReaderSession({ manga: om, chapters: och });
    const idx = Math.max(0, Math.min(Number(initialChapterIndex) || 0, och.length - 1));
    setReaderStreamingRead(null);
    setReaderChapterIndex(idx);
    setReaderOpen(true);
  }, []);

  const closeReader = useCallback(() => {
    flushReadingProgressNow();
    if (readerStreamingRead) {
      window.electronAPI?.abortDownload?.();
    }
    setReaderStreamingRead(null);
    const hadCbz = Boolean(mangaRef.current?.cbzTempExtractDir);
    // Keep extracted CBZ dir after closing reader.
    // Cleanup should be explicit (e.g. user-initiated remove action), not auto on close.
    setReaderOpen(false);
    setOfflineReaderSession(null);
    if (hadCbz) {
      clearSession();
    }
  }, [flushReadingProgressNow, readerStreamingRead, clearSession]);

  const openEbook = useCallback((path) => {
    setEbookPath(path);
    setEbookOpen(true);
  }, []);

  const handleEbookResolved = useCallback((resolved_ebook_path, resolved_extract_dir) => {
    const ebook_path = String(resolved_ebook_path || '').trim();
    const extract_dir = String(resolved_extract_dir || '').trim();
    if (!ebook_path || !extract_dir) return;
    setRecentExtractedCbzEntries((prev) =>
      prev.map((entry) => {
        const entry_ebook_path = String(entry?.ebookPath || '').trim();
        const entry_source_file = String(entry?.sourceFile || '').trim();
        if (entry_ebook_path !== ebook_path && entry_source_file !== ebook_path) return entry;
        const existing_extract_path = String(entry?.extractPath || '').trim();
        if (existing_extract_path) return entry;
        return { ...entry, extractPath: extract_dir };
      })
    );
  }, []);

  const closeEbook = useCallback(() => {
    setEbookOpen(false);
    setEbookPath(null);
  }, []);

  const applyCbzLoadResult = useCallback(
    (res) => {
      setCbzLoadProgress(null);
      // MOBI/AZW text ebook — mở EbookReader thay vì MangaReader
      if (res?.ok && res.textEbookPath) {
        setCbzError('');
        const source_file_path = String(res.sourceFile || res.textEbookPath || '').trim();
        const extract_dir_path = String(res.cbzTempExtractDir || '').trim();
        if (source_file_path) {
          setRecentExtractedCbzEntries((prev) => {
            const next_entry = {
              title: source_file_path.split(/[/\\]/).filter(Boolean).pop() || source_file_path,
              chapterCount: 0,
              extractPath: extract_dir_path,
              openPath: source_file_path,
              sourceKind: 'file',
              sourceFile: source_file_path,
              ebookPath: String(res.textEbookPath || '').trim(),
              localCoverPath: '',
            };
            const filtered_entries = prev.filter(
              (x) => String(x.openPath || x.extractPath || '').trim() !== source_file_path
            );
            return [next_entry, ...filtered_entries].slice(0, 20);
          });
        }
        openEbook(res.textEbookPath);
        return;
      }
      if (!res?.ok || !res.chapters?.length) {
        const msg = res?.error || t('offlineLibrary.cbzOpenFailed');
        appendLog(msg, 'warn');
        setCbzError(msg);
        return;
      }
      setCbzError('');
      setRecentExtractedCbzEntries((prev) => {
        const extractPath = String(res.manga?.cbzTempExtractDir || '').trim();
        if (!extractPath) return prev;
        const sourceFilePath = String(res.sourceFile || '').trim();
        // Session-based opens (cbz-session:// / pdf-session://) don't have a
        // real extracted directory — the source file IS the manga. Track them
        // as "file" entries so the recent list labels and re-opens correctly.
        const isSessionUri =
          extractPath.startsWith('cbz-session://') ||
          extractPath.startsWith('pdf-session://');
        const nextEntry = isSessionUri
          ? {
              title: String(res.manga?.title || '').trim(),
              chapterCount: Number(res.chapters?.length || 0),
              extractPath: '',
              openPath: sourceFilePath,
              sourceKind: 'file',
              sourceFile: sourceFilePath,
              ebookPath: '',
              localCoverPath: String(res.manga?.localCoverPath || '').trim(),
            }
          : {
              title: String(res.manga?.title || '').trim(),
              chapterCount: Number(res.chapters?.length || 0),
              extractPath,
              openPath: extractPath,
              sourceKind: 'extracted',
              sourceFile: sourceFilePath,
              ebookPath: '',
              localCoverPath: String(res.manga?.localCoverPath || '').trim(),
            };
        if (!nextEntry.openPath) return prev;
        const filtered = prev.filter(
          (x) => String(x.openPath || x.extractPath || '').trim() !== nextEntry.openPath,
        );
        return [nextEntry, ...filtered].slice(0, 20);
      });
      flushSync(() => {
        hydrateSession({
          sourceUrl: '',
          manga: res.manga,
          chapters: res.chapters,
          selectedUrls: new Set(),
          fetchError: '',
          coverFetchDurationMs: 0,
          coverFetchSuccessTick: (n) => (Number(n) || 0) + 1,
        });
      });
      openReaderAtSavedOrFallback(0);
      appendLog(
        t('offlineLibrary.cbzOpenedLog', {
          title: res.manga?.title || '',
          count: res.chapters.length,
          extractPath: String(res.manga?.cbzTempExtractDir || '').trim() || '-',
        }),
        'success'
      );
    },
    [appendLog, t, openReaderAtSavedOrFallback, openEbook, hydrateSession]
  );

  const openArchiveFromPath = useCallback(
    async (absolutePath) => {
      const api = window.electronAPI;
      const p = String(absolutePath || '').trim();
      if (!p) return;
      const ext = p.split('.').pop()?.toLowerCase();
      const isEbook = ext === 'epub' || ext === 'pdf';
      if (isEbook && api?.detectEbookContentType) {
        setCbzLoadProgress({ pct: 0, extracted: 0, total: 0 });
        setCbzError('');
        try {
          const detected = await api.detectEbookContentType(p);
          if (detected?.ok && detected.contentType === 'text') {
            setCbzLoadProgress(null);
            setRecentExtractedCbzEntries((prev) => {
              const next_entry = {
                title: p.split(/[/\\]/).filter(Boolean).pop() || p,
                chapterCount: 0,
                extractPath: '',
                openPath: p,
                sourceKind: 'file',
                sourceFile: p,
                ebookPath: p,
                localCoverPath: '',
              };
              const filtered_entries = prev.filter(
                (x) => String(x.openPath || x.extractPath || '').trim() !== p
              );
              return [next_entry, ...filtered_entries].slice(0, 20);
            });
            openEbook(p);
            return;
          }
        } catch {
          /* fall through to image-based loader */
        }
      }
      const reusable_entry = recentExtractedCbzEntries.find((entry) => {
        const source_file_path = String(entry?.sourceFile || '').trim();
        const extracted_path = String(entry?.extractPath || '').trim();
        const source_kind = String(entry?.sourceKind || 'extracted').trim();
        return source_kind === 'extracted' && source_file_path === p && extracted_path;
      });
      if (reusable_entry?.extractPath && api?.loadMangaOfflineFromAbsolutePath) {
        setCbzLoadProgress({ pct: 100, extracted: 1, total: 1, filePath: p });
        setCbzError('');
        try {
          const reused = await api.loadMangaOfflineFromAbsolutePath(reusable_entry.extractPath);
          if (reused?.ok && reused?.chapters?.length) {
            setCbzLoadProgress(null);
            applyCbzLoadResult({
              ok: true,
              manga: {
                ...reused.manga,
                cbzTempExtractDir: reusable_entry.extractPath,
              },
              chapters: reused.chapters,
              sourceFile: p,
            });
            return;
          }
        } catch {
          /* fall through to fresh extraction if cached folder is invalid */
        }
      }
      setCbzLoadProgress({ pct: 0, extracted: 0, total: 0, filePath: p });
      setCbzError('');
      const res = await api.loadArchiveFromAbsolutePath(p);
      applyCbzLoadResult(res);
    },
    [applyCbzLoadResult, openEbook, recentExtractedCbzEntries]
  );

  const readFromCbzFile = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.pickAndLoadArchive) return;
    setCbzLoadProgress({ pct: 0, extracted: 0, total: 0, filePath: null, source: 'pickFile' });
    setCbzError('');
    const res = await api.pickAndLoadArchive();
    if (res?.cancelled) {
      setCbzLoadProgress(null);
      return;
    }
    // If image-based loader failed for epub/pdf, try text reader
    if (!res?.ok && res?.sourceFile) {
      const ext = String(res.sourceFile).split('.').pop()?.toLowerCase();
      if ((ext === 'epub' || ext === 'pdf') && api?.detectEbookContentType) {
        try {
          const detected = await api.detectEbookContentType(res.sourceFile);
          if (detected?.ok && detected.contentType === 'text') {
            setCbzLoadProgress(null);
              const source_file_path = String(res.sourceFile || '').trim();
              if (source_file_path) {
                setRecentExtractedCbzEntries((prev) => {
                  const next_entry = {
                    title: source_file_path.split(/[/\\]/).filter(Boolean).pop() || source_file_path,
                    chapterCount: 0,
                    extractPath: '',
                    openPath: source_file_path,
                    sourceKind: 'file',
                    sourceFile: source_file_path,
                    ebookPath: source_file_path,
                    localCoverPath: '',
                  };
                  const filtered_entries = prev.filter(
                    (x) => String(x.openPath || x.extractPath || '').trim() !== source_file_path
                  );
                  return [next_entry, ...filtered_entries].slice(0, 20);
                });
              }
            openEbook(res.sourceFile);
            return;
          }
        } catch {
          /* fall through to show original error */
        }
      }
    }
    applyCbzLoadResult(res);
  }, [applyCbzLoadResult, openEbook]);

  const openArchivePath = useCallback(
    async (absolutePath) => {
      const p = String(absolutePath || '').trim();
      if (!p) {
        await readFromCbzFile();
        return;
      }
      await openArchiveFromPath(p);
    },
    [readFromCbzFile, openArchiveFromPath]
  );

  const SUPPORTED_DROP_ARCHIVE_EXT = useMemo(
    () =>
      new Set(['cbz', 'zip', 'cbr', 'rar', 'pdf', 'epub', 'mobi', 'azw', 'azw3']),
    []
  );

  const handleAppDragOver = useCallback(
    (e) => {
      if (!authBootstrapped || !isSignedIn) return;
      const types = e.dataTransfer?.types;
      if (!types?.includes?.('Files')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    [authBootstrapped, isSignedIn]
  );

  const handleAppDrop = useCallback(
    async (e) => {
      if (!authBootstrapped || !isSignedIn) return;
      e.preventDefault();
      const list = e.dataTransfer?.files;
      if (!list?.length) return;
      const file0 = list[0];
      const rawPath = file0 && 'path' in file0 ? file0.path : '';
      const p = String(rawPath || '').trim();
      if (!p) {
        appendLog(t('app.dropNeedPath'), 'warn');
        return;
      }
      const ext = p.split('.').pop()?.toLowerCase() || '';
      if (!SUPPORTED_DROP_ARCHIVE_EXT.has(ext)) {
        appendLog(t('app.dropFileUnsupported'), 'warn');
        return;
      }
      await openArchivePath(p);
    },
    [authBootstrapped, isSignedIn, openArchivePath, appendLog, t, SUPPORTED_DROP_ARCHIVE_EXT]
  );

  useEffect(() => {
    window.addEventListener('dragover', handleAppDragOver);
    window.addEventListener('drop', handleAppDrop);
    return () => {
      window.removeEventListener('dragover', handleAppDragOver);
      window.removeEventListener('drop', handleAppDrop);
    };
  }, [handleAppDragOver, handleAppDrop]);

  const value = useMemo(
    () => ({
      readerOpen,
      ebookOpen,
      ebookPath,
      readerChapterIndex,
      setReaderChapterIndex,
      readerStreamingRead,
      cbzLoadProgress,
      cbzError,
      recentExtractedCbzEntries,
      removeRecentExtractedCbzEntry,
      openReader,
      openOfflineReader,
      closeReader,
      openEbook,
      closeEbook,
      openArchivePath,
    }),
    [
      readerOpen,
      ebookOpen,
      ebookPath,
      readerChapterIndex,
      readerStreamingRead,
      cbzLoadProgress,
      cbzError,
      recentExtractedCbzEntries,
      removeRecentExtractedCbzEntry,
      openReader,
      openOfflineReader,
      closeReader,
      openEbook,
      closeEbook,
      openArchivePath,
    ]
  );

  return (
    <ReaderContext.Provider value={value}>
      {children}
      {authBootstrapped && isSignedIn && readerOpen && activeManga ? (
        <MangaReader
          open={readerOpen}
          onClose={closeReader}
          mangaTitle={activeManga.title}
          heading={activeManga.title}
          chapters={activeChapters}
          chapterIndex={readerChapterIndex}
          onChapterIndexChange={handleReaderChapterIndexChange}
          savePath={savePath}
          offlineOnly={Boolean(activeManga.offlineOnly)}
          offlineMangaDirAbsolute={String(activeManga?.offlineMangaDirAbsolute || '').trim()}
          initialAnchorIndex={(() => {
            const e = getReadingProgressEntry(readerProgressKey);
            return typeof e?.anchorFileIndex === 'number' ? e.anchorFileIndex : -1;
          })()}
          savedChapterUrl={(() => {
            const e = getReadingProgressEntry(readerProgressKey);
            return e?.chapterUrl || '';
          })()}
          onAnchorIndex={(idx) => {
            if (!readerProgressKey) return;
            const list = chaptersRef.current;
            const ch = list[readerChapterIndexRef.current];
            if (!ch?.url) return;
            patchReadingProgress(readerProgressKey, { chapterUrl: ch.url, anchorFileIndex: idx });
          }}
          streamingRead={readerStreamingRead}
          onStreamingReadEnd={handleStreamingReadEnd}
          onStreamingDownloadSettled={handleStreamingDownloadSettled}
          onStreamingReadChapter={activeManga?.offlineOnly ? undefined : handleReadChapterOnline}
        />
      ) : null}
      {authBootstrapped && isSignedIn && ebookOpen && ebookPath ? (
        <EbookReader
          ebookPath={ebookPath}
          onClose={closeEbook}
          onEbookResolved={handleEbookResolved}
          guestBookmarkLocked={!isSignedIn}
        />
      ) : null}
    </ReaderContext.Provider>
  );
}

export function useReader() {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error('useReader must be used within ReaderProvider');
  return ctx;
}
