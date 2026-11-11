import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ChapterList } from '../../download';
import { ResizeSplitter } from '../../../shared';
import TranslateOverlay from '../../translate/TranslateOverlay.jsx';
import {
  ReaderPageLightbox,
  ReaderPageImage,
  ReaderPageBottomNav,
  ReaderVerticalToolbar,
  loadReaderChapterWidth,
  clampReaderChapterWidth,
  persistReaderChapterWidth,
  loadWebtoonSeamless,
  persistWebtoonSeamless,
  loadReaderZoom,
  persistReaderZoom,
  clampZoom,
  loadNavInvert,
  persistNavInvert,
  READER_ZOOM_STEP,
  READER_ZOOM_MAX,
  READER_ZOOM_MIN,
} from './reader';

const EMPTY_SET = new Set();

export default function MangaReader({
  open,
  onClose,
  mangaTitle,
  heading,
  chapters = [],
  chapterIndex = 0,
  onChapterIndexChange,
  savePath = '',
  /** true: danh sách chương đã dựng từ đĩa (offline), không lọc lại qua IPC — tránh lệch/khớp trùng với download_db */
  offlineOnly = false,
  /** Gốc thư mục truyện tuyệt đối (khi mở offline không khớp Save To + tên). */
  offlineMangaDirAbsolute = '',
  /** Index ảnh đã lưu (0-based) — chỉ áp dụng khi mở chapter đúng với savedChapterUrl. */
  initialAnchorIndex = -1,
  /** URL chapter đã lưu — để biết có nên khôi phục scroll không. */
  savedChapterUrl = '',
  /** Callback khi ảnh visible đầu thay đổi — truyền index (0-based). */
  onAnchorIndex,
  /**
   * Đọc online: tải chương trong nền, hiển thị placeholder đến khi từng trang ghi đĩa.
   * null = chỉ đọc từ đĩa như cũ.
   */
  streamingRead = null,
  onStreamingReadEnd,
  /** Gọi khi downloadChapter (streaming) kết thúc — để UI cha làm mới danh sách chương có trên đĩa và trừ token. */
  onStreamingDownloadSettled,
  /** Callback (ch) → stream chương chưa tải (giống handleReadChapterOnline). */
  onStreamingReadChapter,
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelId = useId();
  const panelRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [readerChapterWidthPx, setReaderChapterWidthPx] = useState(loadReaderChapterWidth);
  const [readerChapterCollapsed, setReaderChapterCollapsed] = useState(false);
  const [readerChapters, setReaderChapters] = useState([]);
  const [webtoonSeamless, setWebtoonSeamless] = useState(loadWebtoonSeamless);
  const [readerZoom, setReaderZoom] = useState(loadReaderZoom);
  const [previewState, setPreviewState] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const readerScrollRef = useRef(null);
  const readerChapterWidthRef = useRef(readerChapterWidthPx);
  const anchorDebounceRef = useRef(null);
  const scrollRecomputeRafRef = useRef(null);
  const onAnchorIndexRef = useRef(onAnchorIndex);
  onAnchorIndexRef.current = onAnchorIndex;
  const onStreamingReadEndRef = useRef(onStreamingReadEnd);
  onStreamingReadEndRef.current = onStreamingReadEnd;
  const onStreamingDownloadSettledRef = useRef(onStreamingDownloadSettled);
  onStreamingDownloadSettledRef.current = onStreamingDownloadSettled;
  const streamingAbortRef = useRef(null);
  const autoStreamGuardRef = useRef('');
  const [navInvert, setNavInvert] = useState(loadNavInvert);
  const [translateOverlayOpen, setTranslateOverlayOpen] = useState(false);
  const [translatedPages, setTranslatedPages] = useState({});

  useEffect(() => {
    setTranslatedPages({});
  }, [chapterIndex]);

  const [visiblePageIndex, setVisiblePageIndex] = useState(0);
  const [jumpPageDraft, setJumpPageDraft] = useState('');

  const recomputeTopVisiblePage = useCallback(() => {
    const scrollEl = readerScrollRef.current;
    if (!scrollEl) return;
    const nodes = scrollEl.querySelectorAll('[data-file-index]');
    if (!nodes.length) {
      setVisiblePageIndex(0);
      return;
    }
    let minIdx = Infinity;
    const rootRect = scrollEl.getBoundingClientRect();
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      const idx = Number(node.getAttribute('data-file-index'));
      if (!Number.isFinite(idx)) return;
      if (r.bottom > rootRect.top && r.top < rootRect.bottom) {
        minIdx = Math.min(minIdx, idx);
      }
    });
    const idx = Number.isFinite(minIdx) && minIdx !== Infinity ? minIdx : 0;
    setVisiblePageIndex(idx);
    if (anchorDebounceRef.current) clearTimeout(anchorDebounceRef.current);
    anchorDebounceRef.current = setTimeout(() => {
      anchorDebounceRef.current = null;
      onAnchorIndexRef.current?.(idx);
    }, 600);
  }, []);

  const scheduleRecomputeVisiblePage = useCallback(() => {
    if (scrollRecomputeRafRef.current != null) return;
    scrollRecomputeRafRef.current = requestAnimationFrame(() => {
      scrollRecomputeRafRef.current = null;
      recomputeTopVisiblePage();
    });
  }, [recomputeTopVisiblePage]);

  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const zoomIn = useCallback(() => {
    setReaderZoom((z) => clampZoom(z + READER_ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setReaderZoom((z) => clampZoom(z - READER_ZOOM_STEP));
  }, []);

  const zoomReset = useCallback(() => {
    setReaderZoom(1);
  }, []);

  const toggleWebtoonSeamless = useCallback(() => {
    setWebtoonSeamless((v) => {
      const next = !v;
      persistWebtoonSeamless(next);
      return next;
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewState(null);
    setPreviewBusy(false);
  }, []);

  const openPreview = useCallback((idx, dataUrl) => {
    setPreviewState({ fileIndex: idx, dataUrl });
    setPreviewBusy(false);
  }, []);

  useEffect(() => {
    if (!open) closePreview();
  }, [open, closePreview]);

  const ch = chapters[chapterIndex] || null;
  const chapterTitle = ch?.title || '';
  const activeChapterUrl = ch?.url || '';

  const handlePickChapter = useCallback(
    (picked) => {
      const i = chapters.findIndex((c) => c.url === picked.url);
      if (i >= 0) onChapterIndexChange?.(i);
    },
    [chapters, onChapterIndexChange]
  );

  const loadChapter = useCallback(async () => {
    if (!open || !ch) {
      setFiles([]);
      setError('');
      return;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.listChapterImageFiles) {
      setFiles([]);
      setError(t('reader.noPages'));
      return;
    }
    setLoading(true);
    setFiles([]);
    setError('');

    const fallbackToStreaming = () => {
      const save_ok = String(savePath || '').trim() !== '';
      if (offlineOnly || !save_ok) return false;
      if (typeof onStreamingReadChapter !== 'function' || !ch?.url) return false;
      if (autoStreamGuardRef.current === String(ch.url)) return false;
      autoStreamGuardRef.current = String(ch.url);
      setLoading(false);
      onStreamingReadChapter(ch);
      return true;
    };

    try {
      const base = String(savePath || '').trim();
      const hasOfflineRoot = String(offlineMangaDirAbsolute || '').trim() !== '';
      const mt = String(mangaTitle || '').trim();
      const ct = String(chapterTitle || '').trim();
      if (!base && !hasOfflineRoot) {
        setError(t('reader.noSavePath'));
        setLoading(false);
        return;
      }
      if (!mt || !ct) {
        if (!fallbackToStreaming()) {
          setError(t('reader.noPages'));
          setLoading(false);
        }
        return;
      }
      const list = await api.listChapterImageFiles(
        base,
        mt,
        ct,
        ch.folderBasename,
        offlineMangaDirAbsolute || undefined,
        ch.volume
      );
      if (list?.ok && Array.isArray(list.files) && list.files.length > 0) {
        setFiles(list.files);
      } else if (!fallbackToStreaming()) {
        setError(t('reader.noPages'));
      }
    } catch {
      if (!fallbackToStreaming()) {
        setError(t('reader.noPages'));
      }
    }
    setLoading(false);
  }, [
    open,
    ch,
    chapterTitle,
    mangaTitle,
    savePath,
    t,
    ch?.folderBasename,
    offlineMangaDirAbsolute,
    offlineOnly,
    onStreamingReadChapter,
  ]);

  useEffect(() => {
    if (!open || !ch) return;
    if (streamingRead && String(streamingRead.chapterUrl || '') === String(ch.url)) return;
    loadChapter();
  }, [open, loadChapter, ch, streamingRead]);

  useEffect(() => {
    autoStreamGuardRef.current = '';
  }, [open, chapterIndex]);

  const chRef = useRef(ch);
  chRef.current = ch;
  const mangaTitleRef = useRef(mangaTitle);
  mangaTitleRef.current = mangaTitle;
  const savePathRef = useRef(savePath);
  savePathRef.current = savePath;
  const offlineMangaDirAbsoluteRef = useRef(offlineMangaDirAbsolute);
  offlineMangaDirAbsoluteRef.current = offlineMangaDirAbsolute;

  useEffect(() => {
    const sr = streamingRead;
    const chapter = chRef.current;
    if (!open || !chapter || !sr) return undefined;
    if (String(sr.chapterUrl || '') !== String(chapter.url)) return undefined;

    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.downloadChapter || !api.subscribeStreamingChapterEvent) return undefined;

    const request_id = sr.requestId;
    let cancelled = false;
    streamingAbortRef.current = () => { cancelled = true; api.abortDownload?.(); };
    setLoading(true);
    setError('');
    setFiles([]);

    const unsub = api.subscribeStreamingChapterEvent((ev) => {
      if (!ev || ev.streamRequestId !== request_id) return;
      if (ev.type === 'total' && Number.isFinite(ev.total) && ev.total > 0) {
        setFiles(Array.from({ length: ev.total }, () => null));
        setLoading(false);
      }
      if (ev.type === 'page' && ev.fileName && Number.isFinite(ev.pageIndex)) {
        const slot = Math.max(0, Math.floor(ev.pageIndex) - 1);
        setFiles((prev) => {
          if (!prev.length) return prev;
          if (slot < 0 || slot >= prev.length) return prev;
          const next = [...prev];
          next[slot] = ev.fileName;
          return next;
        });
      }
    });

    (async () => {
      let download_result = null;
      try {
        const mt = String(mangaTitleRef.current || '').trim();
        const sp = String(savePathRef.current || '').trim();
        download_result = await api.downloadChapter({
          site: sr.site,
          mangaTitle: mt,
          mangaUrl: sr.mangaUrl,
          chapterUrl: chapter.url,
          chapterTitle: chapter.title,
          volume: chapter.volume,
          baseSaveDir: sp,
          numberOfThreads: sr.numberOfThreads,
          coverUrl: sr.coverUrl,
          streamRequestId: request_id,
          mangadexLanguage: sr.mangadexLanguage,
          comickLanguage: sr.comickLanguage,
          mangaballLanguage: sr.mangaballLanguage,
        });
        if (cancelled) return;
        if (download_result?.skipped || download_result?.ok) {
          const list = await api.listChapterImageFiles(
            sp, mt,
            String(chapter.title || '').trim(),
            chapter.folderBasename,
            offlineMangaDirAbsoluteRef.current || undefined,
            chapter.volume
          );
          if (!cancelled && list?.ok && Array.isArray(list.files) && list.files.length > 0) {
            setFiles(list.files);
          }
        }
        if (!cancelled && !download_result?.ok && !download_result?.skipped && !download_result?.aborted) {
          setError(download_result?.error || t('reader.noPages'));
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e || t('reader.noPages')));
      } finally {
        if (!cancelled) {
          setLoading(false);
          streamingAbortRef.current = null;
          onStreamingDownloadSettledRef.current?.({
            ok: Boolean(download_result?.ok),
            skipped: Boolean(download_result?.skipped),
            aborted: Boolean(download_result?.aborted),
            mangaUrl: sr.mangaUrl,
            chapterUrl: chapter.url,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
      streamingAbortRef.current = null;
    };
  }, [open, streamingRead?.requestId, t]);

  useEffect(() => {
    closePreview();
  }, [chapterIndex, closePreview]);

  useEffect(() => {
    setVisiblePageIndex(0);
    setJumpPageDraft('');
  }, [chapterIndex, open]);

  useEffect(() => {
    if (!files.length) setVisiblePageIndex(0);
  }, [files.length]);

  const handleJumpToPage = useCallback(() => {
    const raw = String(jumpPageDraft).trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || files.length === 0) return;
    const pageOneBased = Math.max(1, Math.min(files.length, n));
    const scrollEl = readerScrollRef.current;
    const target = scrollEl?.querySelector(`[data-file-index="${pageOneBased - 1}"]`);
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setJumpPageDraft('');
    window.setTimeout(() => scheduleRecomputeVisiblePage(), 400);
  }, [jumpPageDraft, files.length, scheduleRecomputeVisiblePage]);

  const goPreviewDir = useCallback(
    async (dir) => {
      if (!previewState || previewBusy) return;
      const target = previewState.fileIndex + dir;
      if (target < 0 || target >= files.length) return;
      const fn = files[target];
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      if (!fn || !api?.readLocalChapterImage || !ch) return;
      setPreviewBusy(true);
      try {
        const r = await api.readLocalChapterImage(
          savePath,
          mangaTitle,
          chapterTitle,
          fn,
          ch.folderBasename,
          offlineMangaDirAbsolute,
          ch.volume
        );
        if (r?.ok && r.dataUrl) setPreviewState({ fileIndex: target, dataUrl: r.dataUrl });
      } catch {
        /* keep current */
      } finally {
        setPreviewBusy(false);
      }
    },
    [previewState, previewBusy, files, ch, savePath, mangaTitle, chapterTitle, offlineMangaDirAbsolute]
  );

  const goPreviewPrev = useCallback(() => goPreviewDir(-1), [goPreviewDir]);
  const goPreviewNext = useCallback(() => goPreviewDir(1), [goPreviewDir]);

  const fetchCurrentImage = useCallback(async () => {
    const fn = files[visiblePageIndex];
    if (!fn) return null;
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.readLocalChapterImage || !ch) return null;
    try {
      const r = await api.readLocalChapterImage(
        savePath,
        mangaTitle,
        chapterTitle,
        fn,
        ch.folderBasename,
        offlineMangaDirAbsolute,
        ch.volume
      );
      return r?.ok ? { dataUrl: r.dataUrl, absPath: r.absPath } : null;
    } catch {
      return null;
    }
  }, [files, visiblePageIndex, savePath, mangaTitle, chapterTitle, ch, offlineMangaDirAbsolute]);

  // Scroll to top on chapter switch
  useEffect(() => {
    if (!open) return;
    const el = readerScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [open, chapterIndex]);

  // Restore saved anchor position
  useEffect(() => {
    if (!open || loading || !files.length) return;
    const currentCh = chapters[chapterIndex];
    if (!currentCh?.url || currentCh.url !== savedChapterUrl) return;
    if (initialAnchorIndex <= 0) return;
    const el = readerScrollRef.current;
    if (!el) return;
    let attempts = 0;
    const tryScroll = () => {
      const target = el.querySelector(`[data-file-index="${initialAnchorIndex}"]`);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 5) setTimeout(tryScroll, 80);
    };
    const id = setTimeout(tryScroll, 50);
    return () => clearTimeout(id);
  }, [open, loading, files.length, chapterIndex, savedChapterUrl, initialAnchorIndex, chapters]);

  // Track top visible page with IntersectionObserver
  useEffect(() => {
    if (!open) return undefined;
    const scrollEl = readerScrollRef.current;
    if (!scrollEl) return undefined;

    const obs = new IntersectionObserver(
      () => {
        scheduleRecomputeVisiblePage();
      },
      { root: scrollEl, rootMargin: '0px', threshold: [0, 0.05, 0.1, 0.25, 0.5, 1] }
    );

    const observeAll = () => {
      scrollEl.querySelectorAll('[data-file-index]').forEach((el) => obs.observe(el));
    };
    observeAll();
    const mutObs = new MutationObserver(() => {
      observeAll();
      scheduleRecomputeVisiblePage();
    });
    mutObs.observe(scrollEl, { childList: true, subtree: true });

    const onScroll = () => scheduleRecomputeVisiblePage();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    const zoomRoot = scrollEl.firstElementChild;
    const ro = zoomRoot ? new ResizeObserver(() => scheduleRecomputeVisiblePage()) : null;
    if (zoomRoot && ro) ro.observe(zoomRoot);

    scheduleRecomputeVisiblePage();

    return () => {
      obs.disconnect();
      mutObs.disconnect();
      scrollEl.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      if (anchorDebounceRef.current) clearTimeout(anchorDebounceRef.current);
      if (scrollRecomputeRafRef.current != null) {
        cancelAnimationFrame(scrollRecomputeRafRef.current);
        scrollRecomputeRafRef.current = null;
      }
    };
  }, [open, chapterIndex, scheduleRecomputeVisiblePage]);

  // Load local chapters for sidebar
  useEffect(() => {
    if (!open) return undefined;
    if (offlineOnly) {
      setReaderChapters(chapters);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      if (!api?.filterChaptersWithLocalImages) {
        if (!cancelled) setReaderChapters(chapters);
        return;
      }
      const base = String(savePath || '').trim();
      const mt = String(mangaTitle || '').trim();
      if (!base || !mt) {
        if (!cancelled) setReaderChapters([]);
        return;
      }
      const r = await api.filterChaptersWithLocalImages(savePath, mangaTitle, chapters);
      if (cancelled) return;
      if (r?.ok && Array.isArray(r.chapters)) {
        setReaderChapters(r.chapters);
      } else {
        setReaderChapters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chapters, savePath, mangaTitle, offlineOnly]);

  const downloadedIndices = useMemo(() => {
    const urls = new Set(readerChapters.map((c) => c.url));
    return chapters.map((c, i) => (urls.has(c.url) ? i : -1)).filter((i) => i >= 0);
  }, [chapters, readerChapters]);

  const catalog_step_next = navInvert ? -1 : 1;
  const catalog_step_prev = navInvert ? 1 : -1;
  const canStreamNav = typeof onStreamingReadChapter === 'function';

  const catalogNeighborIndex = useCallback(
    (step) => {
      const target = chapterIndex + step;
      if (target < 0 || target >= chapters.length) return -1;
      return target;
    },
    [chapterIndex, chapters.length]
  );

  const downloadedNavPos = downloadedIndices.indexOf(chapterIndex);

  const hasPrevChapterNav = useMemo(() => {
    const downloaded_target = downloadedNavPos >= 0
      ? downloadedIndices[downloadedNavPos + (navInvert ? 1 : -1)]
      : undefined;
    if (downloaded_target !== undefined && downloaded_target >= 0) return true;
    if (canStreamNav) {
      const catalog_target = catalogNeighborIndex(catalog_step_prev);
      return catalog_target >= 0;
    }
    return false;
  }, [downloadedNavPos, downloadedIndices, navInvert, canStreamNav, catalogNeighborIndex, catalog_step_prev]);

  const hasNextChapterNav = useMemo(() => {
    const downloaded_target = downloadedNavPos >= 0
      ? downloadedIndices[downloadedNavPos + (navInvert ? -1 : 1)]
      : undefined;
    if (downloaded_target !== undefined && downloaded_target >= 0) return true;
    if (canStreamNav) {
      const catalog_target = catalogNeighborIndex(catalog_step_next);
      return catalog_target >= 0;
    }
    return false;
  }, [downloadedNavPos, downloadedIndices, navInvert, canStreamNav, catalogNeighborIndex, catalog_step_next]);

  const prevChapterDisabled = !hasPrevChapterNav;
  const nextChapterDisabled = !hasNextChapterNav;

  useEffect(() => {
    persistReaderZoom(readerZoom);
  }, [readerZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (previewState) {
          closePreview();
          return;
        }
        requestClose();
        return;
      }
      if (previewState) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const isPlus =
        e.key === '+' ||
        e.key === '=' ||
        e.code === 'Equal' ||
        e.code === 'NumpadAdd';
      const isMinus =
        e.key === '-' ||
        e.code === 'Minus' ||
        e.code === 'NumpadSubtract';
      const isZero =
        e.key === '0' ||
        e.code === 'Digit0' ||
        e.code === 'Numpad0';
      if (isPlus || isMinus || isZero) {
        e.preventDefault();
        e.stopPropagation();
        if (isPlus) {
          setReaderZoom((z) => clampZoom(z + READER_ZOOM_STEP));
        } else if (isMinus) {
          setReaderZoom((z) => clampZoom(z - READER_ZOOM_STEP));
        } else {
          setReaderZoom(1);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, requestClose, previewState, closePreview]);

  // Zoom on Ctrl/Cmd + wheel
  useEffect(() => {
    const el = readerScrollRef.current;
    if (!el || !open) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? READER_ZOOM_STEP : -READER_ZOOM_STEP;
      setReaderZoom((z) => clampZoom(z + delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  // Body overflow isolation
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => panelRef.current?.focus?.(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    readerChapterWidthRef.current = readerChapterWidthPx;
  }, [readerChapterWidthPx]);

  useEffect(() => {
    const onResize = () => {
      setReaderChapterWidthPx((w) => clampReaderChapterWidth(w, window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleChapterPanel = useCallback(() => {
    setReaderChapterCollapsed((c) => !c);
  }, []);

  const expandChapterPanel = useCallback(() => {
    setReaderChapterCollapsed(false);
  }, []);

  const handleChapterPanelToggleActivate = useCallback(
    (e) => {
      e.stopPropagation();
      toggleChapterPanel();
    },
    [toggleChapterPanel]
  );

  const handleExpandChapterPanelActivate = useCallback(
    (e) => {
      e.stopPropagation();
      expandChapterPanel();
    },
    [expandChapterPanel]
  );

  const handleReaderSplitPointerDown = useCallback((e) => {
    if (e.button !== 0 || readerChapterCollapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = readerChapterWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const next = clampReaderChapterWidth(startW + delta, window.innerWidth);
      lastW = next;
      setReaderChapterWidthPx(next);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      persistReaderChapterWidth(lastW);
    };
    function onUp() {
      cleanup();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [readerChapterCollapsed]);

  const navigateChapter = useCallback(
    (step) => {
      const pos = downloadedIndices.indexOf(chapterIndex);
      if (pos >= 0) {
        const dl_step = navInvert ? -step : step;
        const target_pos = pos + dl_step;
        if (target_pos >= 0 && target_pos < downloadedIndices.length) {
          onChapterIndexChange?.(downloadedIndices[target_pos]);
          return;
        }
      }
      if (canStreamNav) {
        const catalog_target = chapterIndex + (step > 0 ? catalog_step_next : catalog_step_prev);
        if (catalog_target >= 0 && catalog_target < chapters.length) {
          onStreamingReadChapter(chapters[catalog_target]);
        }
      }
    },
    [downloadedIndices, chapterIndex, navInvert, canStreamNav, catalog_step_next, catalog_step_prev, chapters, onChapterIndexChange, onStreamingReadChapter]
  );

  const goPrev = useCallback(() => navigateChapter(-1), [navigateChapter]);
  const goNext = useCallback(() => navigateChapter(1), [navigateChapter]);

  const toggleNavInvert = useCallback(() => {
    setNavInvert((v) => {
      const next = !v;
      persistNavInvert(next);
      return next;
    });
  }, []);

  if (!open) return null;

  const scrollAreaBody = (
    <>
      {loading ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 p-8 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-pulse text-3xl text-primary/70">
            hourglass_top
          </span>
          {t('reader.loading')}
        </div>
      ) : error ? (
        <div className="mx-auto max-w-lg p-6 text-center">
          <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-6 text-sm leading-relaxed text-on-surface-variant shadow-sm">
            {error}
          </div>
        </div>
      ) : (
        <div
          className={
            webtoonSeamless
              ? 'mx-auto max-w-3xl space-y-0 px-4 py-4 pb-8 sm:px-6 leading-none'
              : 'mx-auto max-w-3xl space-y-3 px-4 py-4 pb-8 sm:px-6'
          }
        >
          {files.map((fn, idx) => (
            <ReaderPageImage
              key={`page-${idx}`}
              mangaTitle={mangaTitle}
              chapterTitle={chapterTitle}
              savePath={savePath}
              fileName={fn}
              seamless={webtoonSeamless}
              folderBasename={ch?.folderBasename}
              offlineMangaDirAbsolute={offlineMangaDirAbsolute}
              volume={ch?.volume}
              fileIndex={idx}
              translatedSrc={translatedPages[idx]}
              onPreviewRequest={openPreview}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[200] flex justify-center"
        role="presentation"
      >
        {previewState ? (
          <ReaderPageLightbox
            imageUrl={previewState.dataUrl}
            busy={previewBusy}
            fileIndex={previewState.fileIndex}
            pageCount={files.length}
            onClose={closePreview}
            onPrev={goPreviewPrev}
            onNext={goPreviewNext}
          />
        ) : null}

        <button
          type="button"
          className="pointer-events-auto absolute inset-0 z-0 cursor-default bg-black/50"
          aria-label={t('chapterList.closeDrawer')}
          onClick={() => requestClose()}
        />

        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="pointer-events-auto relative z-10 flex h-full w-full min-h-0 flex-col bg-surface shadow-2xl outline-none border-x border-outline-variant/20"
        >
          {/* Header */}
          <header className="relative z-50 flex shrink-0 flex-col border-b border-outline-variant/15 bg-surface-container-low shadow-sm">
            <div className="flex min-w-0 items-start gap-2 px-3 pb-2 pt-2.5 sm:px-4">
              <span
                className="material-symbols-outlined mt-0.5 shrink-0 text-[22px] leading-none text-primary"
                aria-hidden
              >
                auto_stories
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 id={titleId} className="truncate text-sm font-bold text-on-surface">
                  {heading || mangaTitle || t('reader.title')}
                </h2>
                {ch ? (
                  <p className="mt-0.5 truncate text-[11px] leading-snug text-on-surface-variant">
                    {chapterTitle}
                  </p>
                ) : null}
              </div>
            </div>
          </header>

          {/* Reader Body with Chapters Sidebar & Main Page Viewer */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            {readerChapterCollapsed ? (
              <div className="flex h-11 w-full shrink-0 flex-row items-center justify-center border-b border-outline-variant/20 bg-surface-container-low md:h-full md:w-11 md:flex-col md:border-b-0 md:border-r md:border-outline-variant/20">
                <button
                  type="button"
                  onClick={handleExpandChapterPanelActivate}
                  data-tooltip={t('reader.showChapters')}
                  aria-label={t('reader.showChapters')}
                  className="flex h-full min-h-0 w-full flex-1 items-center justify-center px-1.5 py-2 text-primary transition-colors hover:bg-surface-container-high md:items-start md:py-4"
                >
                  <span className="pointer-events-none material-symbols-outlined text-[26px] leading-none">
                    menu_book
                  </span>
                </button>
              </div>
            ) : null}

            {!readerChapterCollapsed ? (
              <>
                <aside
                  style={{ '--reader-chapter-w': `${readerChapterWidthPx}px` }}
                  className="flex min-h-0 w-full max-h-[min(40vh,260px)] shrink-0 flex-col overflow-hidden border-b border-outline-variant/15 bg-surface md:h-full md:max-h-none md:min-w-0 md:w-[var(--reader-chapter-w)] md:border-b-0 md:border-r md:border-outline-variant/20"
                  aria-label={t('reader.chapters')}
                >
                  <ChapterList
                    key="manga-reader-chapter-pick"
                    mode="pick"
                    chapters={readerChapters}
                    queue={[]}
                    currentMangaUrl=""
                    selectedUrls={EMPTY_SET}
                    setSelectedUrls={() => {}}
                    onToggleChapter={() => {}}
                    onSelectAll={() => {}}
                    onUnselectAll={() => {}}
                    onAddSelectedToQueue={() => {}}
                    activeChapterUrl={activeChapterUrl}
                    onPickChapter={handlePickChapter}
                    onToggleReaderChapterPanel={handleChapterPanelToggleActivate}
                    titleOverride={t('reader.chaptersOnDiskTitle')}
                    emptyListMessage={t('reader.noChaptersDownloaded')}
                  />
                </aside>
                <ResizeSplitter
                  variant="edge"
                  onPointerDown={handleReaderSplitPointerDown}
                  data-tooltip={t('reader.resizeChaptersSplit')}
                  className="hidden md:flex"
                />
              </>
            ) : null}

            {/* Main Page Viewer */}
            <div className="relative min-h-0 min-w-0 flex-1">
              <div
                ref={readerScrollRef}
                className="min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-surface-container-lowest pr-12 sm:pr-14 [scrollbar-gutter:stable]"
              >
                <div style={{ zoom: readerZoom }} className="min-w-0">
                  {scrollAreaBody}
                </div>
              </div>

              {/* Bottom Page Navigation Bar */}
              {!loading && !error && files.length > 0 ? (
                <ReaderPageBottomNav
                  chaptersCount={chapters.length}
                  goPrev={goPrev}
                  prevChapterDisabled={prevChapterDisabled}
                  goNext={goNext}
                  nextChapterDisabled={nextChapterDisabled}
                  visiblePageIndex={visiblePageIndex}
                  totalPages={files.length}
                  jumpPageDraft={jumpPageDraft}
                  setJumpPageDraft={setJumpPageDraft}
                  handleJumpToPage={handleJumpToPage}
                />
              ) : null}

              {/* Floating Vertical Toolbar */}
              <ReaderVerticalToolbar
                onRequestClose={() => requestClose()}
                goPrev={goPrev}
                prevChapterDisabled={prevChapterDisabled}
                goNext={goNext}
                nextChapterDisabled={nextChapterDisabled}
                navInvert={navInvert}
                toggleNavInvert={toggleNavInvert}
                webtoonSeamless={webtoonSeamless}
                toggleWebtoonSeamless={toggleWebtoonSeamless}
                translateOverlayOpen={translateOverlayOpen}
                onOpenTranslateOverlay={() => setTranslateOverlayOpen(true)}
                readerZoom={readerZoom}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                zoomReset={zoomReset}
              />
            </div>
          </div>
        </div>
      </div>

      <TranslateOverlay
        open={translateOverlayOpen}
        onClose={() => setTranslateOverlayOpen(false)}
        fetchCurrentImage={fetchCurrentImage}
        chapterTitle={chapterTitle}
        mangaTitle={mangaTitle}
        pageCount={files.length}
        currentPageIndex={visiblePageIndex}
        chapterParams={{
          baseSaveDir: savePath,
          mangaTitle,
          chapterTitle,
          folderBasename: ch?.folderBasename,
          offlineMangaDirAbsolute,
        }}
        onTranslatedImage={(dataUrl) => {
          setTranslatedPages((prev) => {
            if (!dataUrl) {
              const copy = { ...prev };
              delete copy[visiblePageIndex];
              return copy;
            }
            return { ...prev, [visiblePageIndex]: dataUrl };
          });
        }}
      />
    </>
  );
}
