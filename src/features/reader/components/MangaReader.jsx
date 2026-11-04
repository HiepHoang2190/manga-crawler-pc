import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ChapterList } from '../../download';
import { ResizeSplitter } from '../../../shared';
import TranslateOverlay from '../../translate/TranslateOverlay.jsx';

const EMPTY_SET = new Set();

const READER_CHAPTER_WIDTH_KEY = 'mangaReaderChapterSidebarWidthPx';
const READER_CHAPTER_WIDTH_DEFAULT = 360;
const READER_CHAPTER_WIDTH_MIN = 220;
const READER_CHAPTER_WIDTH_MAX = 640;
const READER_WEBTOON_SEAMLESS_KEY = 'mangaReaderWebtoonSeamless';
const READER_ZOOM_KEY = 'mangaReaderZoom';
const READER_ZOOM_MIN = 0.5;
const READER_ZOOM_MAX = 3;
const READER_ZOOM_STEP = 0.1;

function clampReaderChapterWidth(px, innerWidth) {
  const w = typeof innerWidth === 'number' ? innerWidth : 1200;
  const max = Math.min(
    READER_CHAPTER_WIDTH_MAX,
    Math.max(READER_CHAPTER_WIDTH_MIN + 120, Math.floor(w * 0.58))
  );
  return Math.max(READER_CHAPTER_WIDTH_MIN, Math.min(max, Math.round(px)));
}

function loadReaderChapterWidth() {
  if (typeof window === 'undefined') return READER_CHAPTER_WIDTH_DEFAULT;
  try {
    const n = Number(localStorage.getItem(READER_CHAPTER_WIDTH_KEY));
    if (Number.isFinite(n)) return clampReaderChapterWidth(n, window.innerWidth);
  } catch {
    /* */
  }
  return clampReaderChapterWidth(READER_CHAPTER_WIDTH_DEFAULT, window.innerWidth);
}

function persistReaderChapterWidth(px) {
  try {
    localStorage.setItem(READER_CHAPTER_WIDTH_KEY, String(px));
  } catch {
    /* */
  }
}

function loadWebtoonSeamless() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(READER_WEBTOON_SEAMLESS_KEY) === '1';
  } catch {
    return false;
  }
}

function persistWebtoonSeamless(on) {
  try {
    localStorage.setItem(READER_WEBTOON_SEAMLESS_KEY, on ? '1' : '0');
  } catch {
    /* */
  }
}

function loadReaderZoom() {
  if (typeof window === 'undefined') return 1;
  try {
    const raw_zoom = localStorage.getItem(READER_ZOOM_KEY);
    // Missing key must default to 100% — Number(null) is 0, which would clamp to READER_ZOOM_MIN (50%).
    if (raw_zoom == null || raw_zoom === '') return 1;
    const n = Number(raw_zoom);
    if (!Number.isFinite(n)) return 1;
    return Math.min(
      READER_ZOOM_MAX,
      Math.max(READER_ZOOM_MIN, Math.round(n * 100) / 100)
    );
  } catch {
    /* */
  }
  return 1;
}

function persistReaderZoom(z) {
  try {
    localStorage.setItem(READER_ZOOM_KEY, String(z));
  } catch {
    /* */
  }
}



function clampZoom(z) {
  return Math.min(
    READER_ZOOM_MAX,
    Math.max(READER_ZOOM_MIN, Math.round(z * 100) / 100)
  );
}

const READER_NAV_INVERT_KEY = 'mangaReaderChapterNavInvert';
function loadNavInvert() {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(READER_NAV_INVERT_KEY) === '1'; } catch { return false; }
}
function persistNavInvert(on) {
  try { localStorage.setItem(READER_NAV_INVERT_KEY, on ? '1' : '0'); } catch { /* */ }
}

const LIGHTBOX_SCALE_MIN = 0.25;
const LIGHTBOX_SCALE_MAX = 4;
const LIGHTBOX_SCALE_STEP = 0.25;
function clampLbScale(s) {
  return Math.min(LIGHTBOX_SCALE_MAX, Math.max(LIGHTBOX_SCALE_MIN, Math.round(s * 100) / 100));
}

function ReaderPageLightbox({ imageUrl, busy, fileIndex, pageCount, onClose, onPrev, onNext }) {
  const { t } = useI18n();
  const [scale, setScale] = useState(1);
  const [zoomCursor, setZoomCursor] = useState('zoom-in');
  useEffect(() => { setScale(1); setZoomCursor('zoom-in'); }, [fileIndex]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft' && !busy) { onPrev(); return; }
      if (e.key === 'ArrowRight' && !busy) { onNext(); return; }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose, onPrev, onNext, busy]);

  const handleImgClick = useCallback((e) => {
    e.stopPropagation();
    setScale((s) => clampLbScale(s + LIGHTBOX_SCALE_STEP));
    setZoomCursor('zoom-in');
  }, []);

  const handleImgContext = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => clampLbScale(s - LIGHTBOX_SCALE_STEP));
    setZoomCursor('zoom-out');
  }, []);

  const hasPrev = fileIndex > 0 && !busy;
  const hasNext = fileIndex < pageCount - 1 && !busy;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="presentation"
    >
      {/* page indicator */}
      <span className="fixed top-3 left-1/2 z-[10002] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium tabular-nums text-white/80 backdrop-blur-md select-none">
        {t('reader.pageOf', { current: fileIndex + 1, total: pageCount })}
        {Math.abs(scale - 1) > 0.01 ? ` · ${Math.round(scale * 100)}%` : ''}
      </span>

      {/* prev */}
      {hasPrev ? (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label={t('reader.previewPrev')}
          className="fixed left-2 top-1/2 z-[10001] -translate-y-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-colors duration-150 hover:bg-white/25 hover:text-white sm:left-3 sm:h-11 sm:w-11">
          <span className="material-symbols-outlined text-[26px] leading-none">chevron_left</span>
        </button>
      ) : null}

      {/* next */}
      {hasNext ? (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label={t('reader.previewNext')}
          className="fixed right-2 top-1/2 z-[10001] -translate-y-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-colors duration-150 hover:bg-white/25 hover:text-white sm:right-3 sm:h-11 sm:w-11">
          <span className="material-symbols-outlined text-[26px] leading-none">chevron_right</span>
        </button>
      ) : null}

      {/* image */}
      <div
        className={`relative max-h-[96vh] max-w-[96vw] ${scale > 1.001 ? 'overflow-auto' : 'overflow-hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative inline-block select-none"
          style={{ zoom: scale }}>
          <img
            src={imageUrl} alt=""
            className="max-h-[95.5vh] max-w-[95.5vw] object-contain"
            style={{ cursor: zoomCursor }}
            draggable={false}
            onClick={handleImgClick}
            onContextMenu={handleImgContext}
          />
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <span className="material-symbols-outlined animate-spin text-4xl text-white">progress_activity</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReaderPageImage({
  mangaTitle,
  chapterTitle,
  savePath,
  fileName,
  seamless,
  folderBasename,
  offlineMangaDirAbsolute,
  fileIndex,
  translatedSrc,
  onPreviewRequest,
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setSrc(null);
    setErr(false);
    if (fileName == null || fileName === '') {
      return undefined;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.readLocalChapterImage) { setErr(true); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.readLocalChapterImage(
          savePath, mangaTitle, chapterTitle, fileName, folderBasename, offlineMangaDirAbsolute,
        );
        if (cancelled) return;
        if (r?.ok && r.dataUrl) setSrc(r.dataUrl);
        else setErr(true);
      } catch { if (!cancelled) setErr(true); }
    })();
    return () => { cancelled = true; };
  }, [mangaTitle, chapterTitle, savePath, fileName, folderBasename, offlineMangaDirAbsolute]);

  const imgClass = seamless
    ? 'block h-auto w-full max-w-full align-top object-contain object-top'
    : 'block h-auto w-full max-w-full bg-surface-container/40 object-contain object-top';

  const frameClass = seamless
    ? 'm-0 block overflow-hidden border-0 bg-transparent p-0 shadow-none'
    : 'overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-low shadow-sm';

  const displaySrc = translatedSrc || src;

  return (
    <figure data-file-index={fileIndex} className={frameClass}>
      {err ? (
        <figcaption className="flex min-h-[120px] items-center justify-center px-3 py-4 text-center text-xs text-red-400">
          {t('reader.loadError')}
        </figcaption>
      ) : null}
      {displaySrc ? (
        <button
          type="button"
          className="relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
          data-tooltip={t('help.imageZoomHint')}
          aria-label={t('help.imageZoomHint')}
          onClick={() => onPreviewRequest?.(fileIndex, displaySrc)}
        >
          <img src={displaySrc} alt="" className={`pointer-events-none ${imgClass}`} decoding="async" />
          {translatedSrc ? (
            <span className="absolute top-2 right-2 rounded-md bg-primary/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-primary shadow-sm pointer-events-none">
              AI DỊCH
            </span>
          ) : null}
        </button>
      ) : !err ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 bg-surface-container-highest/50">
          <div
            className={
              seamless
                ? 'h-32 w-full animate-pulse bg-surface-container-highest/80'
                : 'h-32 w-full max-w-md animate-pulse rounded-lg bg-surface-container-highest/80'
            }
          />
          {fileName == null ? (
            <span className="text-[11px] tabular-nums text-on-surface-variant/50 select-none">
              {fileIndex + 1}
            </span>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}

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
  // Remembers the chapter URL we already auto-switched to streaming for, so a
  // failed offline read does not retrigger streaming in a loop.
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

  const closePreview = useCallback(() => { setPreviewState(null); setPreviewBusy(false); }, []);
  const openPreview = useCallback((idx, dataUrl) => { setPreviewState({ fileIndex: idx, dataUrl }); setPreviewBusy(false); }, []);

  useEffect(() => { if (!open) closePreview(); }, [open, closePreview]);

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

    // Old/undownloaded chapters whose folder has no images on disk: fall back to
    // streaming (download-and-read) instead of dead-ending on a "no pages" error.
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
        offlineMangaDirAbsolute || undefined
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

  // Allow the streaming fallback to fire again when the user opens the reader or
  // switches to a different chapter.
  useEffect(() => {
    autoStreamGuardRef.current = '';
  }, [open, chapterIndex]);

  const streamingReadRef = useRef(streamingRead);
  streamingReadRef.current = streamingRead;
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
            offlineMangaDirAbsoluteRef.current || undefined
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
    // Only re-run when requestId changes (new streaming session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, streamingRead?.requestId, t]);

  useEffect(() => { closePreview(); }, [chapterIndex, closePreview]);

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

  const goPreviewDir = useCallback(async (dir) => {
    if (!previewState || previewBusy) return;
    const target = previewState.fileIndex + dir;
    if (target < 0 || target >= files.length) return;
    const fn = files[target];
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!fn || !api?.readLocalChapterImage || !ch) return;
    setPreviewBusy(true);
    try {
      const r = await api.readLocalChapterImage(savePath, mangaTitle, chapterTitle, fn, ch.folderBasename, offlineMangaDirAbsolute);
      if (r?.ok && r.dataUrl) setPreviewState({ fileIndex: target, dataUrl: r.dataUrl });
    } catch { /* keep current */ } finally { setPreviewBusy(false); }
  }, [previewState, previewBusy, files, ch, savePath, mangaTitle, chapterTitle, offlineMangaDirAbsolute]);

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
        offlineMangaDirAbsolute
      );
      return r?.ok ? { dataUrl: r.dataUrl, absPath: r.absPath } : null;
    } catch {
      return null;
    }
  }, [files, visiblePageIndex, savePath, mangaTitle, chapterTitle, ch, offlineMangaDirAbsolute]);

  // Scroll về top khi chuyển chapter
  useEffect(() => {
    if (!open) return;
    const el = readerScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [open, chapterIndex]);

  // Khôi phục vị trí ảnh sau khi files load — dùng scrollIntoView thay scrollRatio
  // vì ảnh lazy-load nên scrollHeight chưa đúng khi mới render
  useEffect(() => {
    if (!open || loading || !files.length) return;
    const ch = chapters[chapterIndex];
    if (!ch?.url || ch.url !== savedChapterUrl) return;
    if (initialAnchorIndex <= 0) return;
    const el = readerScrollRef.current;
    if (!el) return;
    // Thử tìm element, retry vài lần vì React có thể chưa commit DOM
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, files.length > 0, chapterIndex, savedChapterUrl, initialAnchorIndex]);

  // Track top visible page (full DOM scan) → debounce 600ms → onAnchorIndex; also on scroll / DOM changes
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

  /**
   * Legacy: if sidebar only lists local chapters, snap index to first local when current is missing.
   * Do NOT do this while streaming or when user can open the current chapter online — that caused
   * "read new chapter online → UI jumps to first downloaded chapter" (mobile b22fb83 has full catalog, no snap).
   */
  useEffect(() => {
    if (!open || readerChapters.length === 0) return;
    const cur = chapters[chapterIndex];
    if (cur && readerChapters.some((c) => c.url === cur.url)) return;
    if (
      streamingRead &&
      cur &&
      String(streamingRead.chapterUrl || '') === String(cur.url)
    ) {
      return;
    }
    const save_ok = String(savePath || '').trim() !== '';
    const can_open_undownloaded =
      typeof onStreamingReadChapter === 'function' && !offlineOnly && save_ok;
    if (can_open_undownloaded && cur) return;
    const first = readerChapters[0];
    const i = chapters.findIndex((c) => c.url === first.url);
    if (i >= 0) onChapterIndexChange?.(i);
  }, [
    open,
    readerChapters,
    chapters,
    chapterIndex,
    onChapterIndexChange,
    streamingRead,
    savePath,
    offlineOnly,
    onStreamingReadChapter,
  ]);

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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (previewState) { closePreview(); return; }
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
                title={t('reader.resizeChaptersSplit')}
                className="hidden md:flex"
              />
            </>
          ) : null}

          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={readerScrollRef}
              className="min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-surface-container-lowest pr-12 sm:pr-14 [scrollbar-gutter:stable]"
            >
              <div style={{ zoom: readerZoom }} className="min-w-0">
                {scrollAreaBody}
              </div>
            </div>
            {!loading && !error && files.length > 0 ? (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-35 flex max-w-[calc(100%-2rem)] items-center justify-center">
                <div
                  role="region"
                  aria-label={t('reader.pageBarToggleAria')}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-high/85 px-2.5 py-1.5 shadow-2xl backdrop-blur-xl opacity-80 transition-all duration-200 hover:border-primary/40 hover:bg-surface-container-high/95 hover:opacity-100 hover:shadow-primary/10 focus-within:border-primary/40 focus-within:bg-surface-container-high/95 focus-within:opacity-100 sm:gap-2 sm:px-3"
                >
                  {chapters.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={prevChapterDisabled}
                        data-tooltip={t('reader.prevChapter')}
                        aria-label={t('reader.prevChapter')}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-surface-variant transition-all hover:scale-105 hover:bg-primary/15 hover:text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-25"
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none">
                          arrow_back_ios_new
                        </span>
                      </button>
                      <span className="h-4 w-px shrink-0 bg-outline-variant/25" aria-hidden />
                    </>
                  ) : null}

                  <div className="flex items-center gap-1.5 px-1 sm:gap-2">
                    <span className="select-none text-xs font-semibold tabular-nums text-on-surface whitespace-nowrap">
                      {t('reader.pageOf', {
                        current: visiblePageIndex + 1,
                        total: files.length,
                      })}
                    </span>
                    <span className="hidden h-3.5 w-px shrink-0 bg-outline-variant/20 sm:inline-block" aria-hidden />
                    <label className="flex items-center gap-1">
                      <span className="sr-only">{t('reader.jumpPageAria')}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={files.length}
                        value={jumpPageDraft}
                        onChange={(e) => setJumpPageDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleJumpToPage();
                          }
                        }}
                        placeholder={t('reader.jumpPagePlaceholder')}
                        aria-label={t('reader.jumpPageAria')}
                        className="h-7 w-12 rounded-lg border border-outline-variant/25 bg-surface-container-highest/60 px-1 text-center text-xs tabular-nums text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40 [appearance:textfield] sm:w-14 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={handleJumpToPage}
                        data-tooltip={t('reader.jumpPage')}
                        aria-label={t('reader.jumpPage')}
                        className="h-7 cursor-pointer rounded-lg bg-primary/20 px-2.5 text-xs font-semibold text-primary whitespace-nowrap transition-all hover:bg-primary hover:text-on-primary active:scale-95"
                      >
                        {t('reader.jumpPage')}
                      </button>
                    </label>
                  </div>

                  {chapters.length > 1 ? (
                    <>
                      <span className="h-4 w-px shrink-0 bg-outline-variant/25" aria-hidden />
                      <button
                        type="button"
                        onClick={goNext}
                        disabled={nextChapterDisabled}
                        data-tooltip={t('reader.nextChapter')}
                        aria-label={t('reader.nextChapter')}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-surface-variant transition-all hover:scale-105 hover:bg-primary/15 hover:text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-25"
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none">
                          arrow_forward_ios
                        </span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex w-11 items-center justify-end pr-1 sm:w-12 sm:pr-2">
              <div
                role="toolbar"
                aria-label={t('reader.toolbarAria')}
                className="pointer-events-auto flex max-h-[min(100%,calc(100vh-8rem))] flex-col gap-0.5 overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-high/95 px-1 py-1.5 shadow-lg [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  onClick={() => requestClose()}
                  data-tooltip={t('reader.close')}
                  aria-label={t('reader.close')}
                  className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">close</span>
                </button>
                <span
                  className="my-0.5 h-px w-full shrink-0 bg-outline-variant/35"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={prevChapterDisabled}
                  data-tooltip={t('reader.prevChapter')}
                  aria-label={t('reader.prevChapter')}
                  className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={nextChapterDisabled}
                  data-tooltip={t('reader.nextChapter')}
                  aria-label={t('reader.nextChapter')}
                  className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">chevron_right</span>
                </button>
                <button
                  type="button"
                  onClick={toggleNavInvert}
                  data-tooltip={t('reader.navInvertHint')}
                  aria-label={t('reader.navInvert')}
                  aria-pressed={navInvert}
                  className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
                    navInvert
                      ? 'bg-primary/15 text-primary'
                      : 'text-on-surface/70 hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">swap_horiz</span>
                </button>
                <button
                  type="button"
                  onClick={toggleWebtoonSeamless}
                  data-tooltip={t('reader.webtoonSeamlessHint')}
                  aria-label={t('reader.webtoonSeamless')}
                  aria-pressed={webtoonSeamless}
                  className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
                    webtoonSeamless
                      ? 'bg-primary/15 text-primary'
                      : 'text-on-surface/70 hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">view_week</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTranslateOverlayOpen(true)}
                  data-tooltip="Dịch trang"
                  aria-label="Dịch trang"
                  className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
                    translateOverlayOpen
                      ? 'bg-primary/15 text-primary'
                      : 'text-on-surface/70 hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">translate</span>
                </button>
                <span
                  className="my-0.5 h-px w-full shrink-0 bg-outline-variant/35"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={readerZoom >= READER_ZOOM_MAX}
                  data-tooltip={t('reader.zoomIn')}
                  aria-label={t('reader.zoomIn')}
                  className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[20px] leading-none">zoom_in</span>
                </button>
                <span
                  className="min-h-[1.25rem] shrink-0 px-0.5 text-center text-[10px] font-semibold tabular-nums leading-none text-on-surface-variant"
                  aria-live="polite"
                >
                  {Math.round(readerZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={readerZoom <= READER_ZOOM_MIN}
                  data-tooltip={t('reader.zoomOut')}
                  aria-label={t('reader.zoomOut')}
                  className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[20px] leading-none">zoom_out</span>
                </button>
                {Math.abs(readerZoom - 1) > 0.001 ? (
                  <button
                    type="button"
                    onClick={zoomReset}
                    data-tooltip={t('reader.zoomReset')}
                    aria-label={t('reader.zoomReset')}
                    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[20px] leading-none">restart_alt</span>
                  </button>
                ) : null}
              </div>
            </div>
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
