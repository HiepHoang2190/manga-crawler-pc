import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { loadBookmarks, addBookmark, deleteBookmark } from '../utils/ebookBookmarks';
import { loadEbookProgress, saveEbookProgress } from '../utils/ebookProgress';
import { loadEbookPrefs, saveEbookPrefs } from '../utils/ebookPrefs';
import EbookToolbar from './EbookToolbar';
import EbookContent from './EbookContent';
import EbookChapterPanel from './EbookChapterPanel';
import EbookBookmarkPanel from './EbookBookmarkPanel';
import EbookSettingsPanel from './EbookSettingsPanel';

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class EbookErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <EbookErrorFallback onClose={this.props.onClose} />
      );
    }
    return this.props.children;
  }
}

function EbookErrorFallback({ onClose }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-surface gap-4 px-6 text-center">
      <span className="material-symbols-outlined text-5xl text-error">error</span>
      <p className="text-sm text-on-surface-variant max-w-sm">{t('ebook.unexpectedError')}</p>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        {t('ebook.closeReader')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EbookReader component
// ---------------------------------------------------------------------------

function EbookReaderInner({ ebookPath, onClose, guestBookmarkLocked = false, onEbookResolved }) {
  const { t } = useI18n();

  // Book metadata
  const [bookType, setBookType] = useState(null);
  const [title, setTitle] = useState('');
  const [chapters, setChapters] = useState([]);
  const [pageCount, setPageCount] = useState(0);
  const [coverDataUrl, setCoverDataUrl] = useState(null);

  // Navigation
  const [currentIndex, setCurrentIndex] = useState(0);
  const [contentHtml, setContentHtml] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState(null);

  // UI panels
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // Load state
  const [loadState, setLoadState] = useState('idle');
  const [loadError, setLoadError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(null); // { current, total } | null

  // Bookmark warning
  const [bookmarkWarning, setBookmarkWarning] = useState(null);

  // Prefs
  const [prefs, setPrefs] = useState(() => loadEbookPrefs());

  // Refs to avoid stale closures in effects
  const bookTypeRef = useRef(null);
  const currentIndexRef = useRef(0);
  const progressTimerRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Keep refs in sync
  bookTypeRef.current = bookType;
  currentIndexRef.current = currentIndex;

  // ---------------------------------------------------------------------------
  // Load content for a given index
  // ---------------------------------------------------------------------------
  const loadContent = useCallback(async (index, bType) => {
    setContentLoading(true);
    setContentError(null);
    try {
      let result;
      if (bType === 'epub') {
        result = await window.electronAPI.readSpineItem(ebookPath, chapters[index]?.href ?? '');
      } else {
        result = await window.electronAPI.readPdfPage(ebookPath, index);
      }
      if (result.ok) {
        setContentHtml(result.html);
      } else {
        setContentError(result.error ?? t('ebook.contentError'));
      }
    } catch (err) {
      setContentError(err?.message ?? t('ebook.contentError'));
    } finally {
      setContentLoading(false);
    }
  }, [ebookPath, chapters, t]);

  // ---------------------------------------------------------------------------
  // On mount: load book metadata
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadState('loading');
      const ext = ebookPath.split('.').pop()?.toLowerCase();

      try {
        let result;
        if (ext === 'epub') {
          result = await window.electronAPI.loadTextEpub(ebookPath);
        } else if (ext === 'pdf') {
          result = await window.electronAPI.loadTextPdf(ebookPath);
        } else {
          setLoadState('error');
          setLoadError(`Unsupported file type: .${ext}`);
          return;
        }

        if (cancelled) return;

        if (!result.ok) {
          setLoadState('error');
          setLoadError(result.error ?? t('ebook.loadError'));
          return;
        }
        if (ext === 'epub' && result.extractDir && typeof onEbookResolved === 'function') {
          onEbookResolved(ebookPath, String(result.extractDir).trim());
        }

        const bType = ext;
        setBookType(bType);
        setTitle(result.title ?? '');
        setCoverDataUrl(result.coverDataUrl ?? null);

        let total = 0;
        if (bType === 'epub') {
          setChapters(result.chapters ?? []);
          total = (result.chapters ?? []).length;
        } else {
          setPageCount(result.pageCount ?? 0);
          total = result.pageCount ?? 0;
        }

        // Restore progress
        const saved = loadEbookProgress(ebookPath);
        let startIndex = 0;
        if (saved && typeof saved.index === 'number' && saved.index >= 0 && saved.index < total) {
          startIndex = saved.index;
        }

        setCurrentIndex(startIndex);
        currentIndexRef.current = startIndex;
        bookTypeRef.current = bType;

        // Load first content — pass chapters directly since state may not be set yet
        setContentLoading(true);
        setContentError(null);
        setLoadProgress({ current: 1, total });
        try {
          let contentResult;
          if (bType === 'epub') {
            contentResult = await window.electronAPI.readSpineItem(ebookPath, (result.chapters ?? [])[startIndex]?.href ?? '');
          } else {
            contentResult = await window.electronAPI.readPdfPage(ebookPath, startIndex);
          }
          if (cancelled) return;
          if (contentResult.ok) {
            setContentHtml(contentResult.html);
          } else {
            setContentError(contentResult.error ?? t('ebook.contentError'));
          }
        } catch (err) {
          if (!cancelled) setContentError(err?.message ?? t('ebook.contentError'));
        } finally {
          if (!cancelled) {
            setContentLoading(false);
            setLoadProgress(null);
          }
        }

        setLoadState('ready');
        isInitialLoad.current = false;
      } catch (err) {
        if (!cancelled) {
          setLoadState('error');
          setLoadError(err?.message ?? t('ebook.loadError'));
        }
      }
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebookPath]);

  // ---------------------------------------------------------------------------
  // On currentIndex change (after initial load): load content + persist progress
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!bookType) return;

    loadContent(currentIndex, bookType);

    // Persist progress with 500ms debounce
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      saveEbookProgress(ebookPath, currentIndex);
    }, 500);

    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [currentIndex, bookType, ebookPath, loadContent]);

  // ---------------------------------------------------------------------------
  // On unmount: save progress
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      saveEbookProgress(ebookPath, currentIndexRef.current);
    };
  }, [ebookPath]);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  const total = bookType === 'epub' ? chapters.length : pageCount;

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const handleSelectIndex = useCallback((idx) => {
    setCurrentIndex(idx);
    setChapterPanelOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Bookmark logic
  // ---------------------------------------------------------------------------
  const bookmarks = loadBookmarks(ebookPath);
  const isBookmarked = bookmarks.some((bm) => bm.index === currentIndex);

  const handleToggleBookmark = useCallback(() => {
    if (guestBookmarkLocked) {
      setBookmarkWarning(t('guestCredit.ebookBookmarkLocked'));
      setTimeout(() => setBookmarkWarning(null), 4000);
      return;
    }
    const bms = loadBookmarks(ebookPath);
    const existing = bms.find((bm) => bm.index === currentIndex);
    if (existing) {
      deleteBookmark(ebookPath, existing.id);
      setBookmarkWarning(null);
    } else {
      const result = addBookmark(ebookPath, currentIndex);
      if (!result.ok && result.warning) {
        setBookmarkWarning(result.warning);
        setTimeout(() => setBookmarkWarning(null), 4000);
      } else {
        setBookmarkWarning(null);
      }
    }
    // Force re-render by toggling a dummy state — bookmarks are read from localStorage
    setCurrentIndex((i) => i);
  }, [ebookPath, currentIndex, guestBookmarkLocked, t]);

  const handleDeleteBookmark = useCallback((bookmarkId) => {
    deleteBookmark(ebookPath, bookmarkId);
    setCurrentIndex((i) => i); // force re-render
  }, [ebookPath]);

  const handleNavigateBookmark = useCallback((index) => {
    setCurrentIndex(index);
    setBookmarkPanelOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Prefs
  // ---------------------------------------------------------------------------
  const handlePrefsChange = useCallback((partial) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      saveEbookPrefs(partial);
      return next;
    });
  }, []);

  const handleToggleLayout = useCallback(() => {
    handlePrefsChange({ layoutMode: prefs.layoutMode === 'paginated' ? 'scroll' : 'paginated' });
  }, [prefs.layoutMode, handlePrefsChange]);

  // ---------------------------------------------------------------------------
  // Close
  // ---------------------------------------------------------------------------
  const handleClose = useCallback(() => {
    saveEbookProgress(ebookPath, currentIndexRef.current);
    onClose();
  }, [ebookPath, onClose]);

  // ---------------------------------------------------------------------------
  // Retry content load
  // ---------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    if (bookType) loadContent(currentIndex, bookType);
  }, [bookType, currentIndex, loadContent]);

  // ---------------------------------------------------------------------------
  // Chapter panel items
  // ---------------------------------------------------------------------------
  const chapterItems = bookType === 'epub'
    ? chapters
    : Array.from({ length: pageCount }, (_, i) => i);

  // ---------------------------------------------------------------------------
  // Render: loading state
  // ---------------------------------------------------------------------------
  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-surface gap-3">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="text-sm text-on-surface-variant">{t('ebook.loading')}</p>
        {loadProgress && loadProgress.total > 0 && (
          <div className="w-56 space-y-1.5">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>{t('ebook.loadingPage', { current: loadProgress.current, total: loadProgress.total })}</span>
              <span className="font-semibold text-primary">
                {Math.round((loadProgress.current / loadProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${Math.round((loadProgress.current / loadProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: error state
  // ---------------------------------------------------------------------------
  if (loadState === 'error') {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-surface gap-4 px-6 text-center">
        <span className="material-symbols-outlined text-5xl text-error">error</span>
        <p className="text-sm text-on-surface-variant max-w-sm">{loadError}</p>
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t('ebook.closeReader')}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: ready
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-surface">
      <EbookToolbar
        title={title}
        bookType={bookType}
        currentIndex={currentIndex}
        total={total}
        prefs={prefs}
        isBookmarked={isBookmarked}
        onPrev={handlePrev}
        onNext={handleNext}
        onSelectIndex={handleSelectIndex}
        onToggleLayout={handleToggleLayout}
        onToggleBookmark={handleToggleBookmark}
        onOpenChapterPanel={() => setChapterPanelOpen(true)}
        onOpenBookmarkPanel={() => {
          if (guestBookmarkLocked) {
            setBookmarkWarning(t('guestCredit.ebookBookmarkLocked'));
            setTimeout(() => setBookmarkWarning(null), 4000);
            return;
          }
          setBookmarkPanelOpen(true);
        }}
        onOpenSettings={() => setSettingsPanelOpen(true)}
        onClose={handleClose}
      />

      <EbookContent
        html={contentHtml}
        prefs={prefs}
        loading={contentLoading}
        error={contentError}
        onRetry={handleRetry}
      />

      {/* Bookmark limit warning toast */}
      {bookmarkWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[310] bg-surface-variant text-on-surface-variant text-sm px-4 py-2 rounded-lg shadow-lg">
          {t('ebook.bookmarkLimitWarning')}
        </div>
      )}

      {chapterPanelOpen && (
        <EbookChapterPanel
          items={chapterItems}
          currentIndex={currentIndex}
          bookType={bookType}
          onNavigate={handleSelectIndex}
          onClose={() => setChapterPanelOpen(false)}
        />
      )}

      {bookmarkPanelOpen && (
        <EbookBookmarkPanel
          bookmarks={loadBookmarks(ebookPath)}
          currentIndex={currentIndex}
          onNavigate={handleNavigateBookmark}
          onDelete={handleDeleteBookmark}
          onClose={() => setBookmarkPanelOpen(false)}
        />
      )}

      {settingsPanelOpen && (
        <EbookSettingsPanel
          prefs={prefs}
          onPrefsChange={handlePrefsChange}
          onClose={() => setSettingsPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component — wrapped in error boundary
// ---------------------------------------------------------------------------

export default function EbookReader({ ebookPath, onClose, guestBookmarkLocked = false, onEbookResolved }) {
  return (
    <EbookErrorBoundary onClose={onClose}>
      <EbookReaderInner
        ebookPath={ebookPath}
        onClose={onClose}
        guestBookmarkLocked={guestBookmarkLocked}
        onEbookResolved={onEbookResolved}
      />
    </EbookErrorBoundary>
  );
}
