import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function PdfExportTab({ savePath = '', onRunningChange }) {
  const { t } = useI18n();

  const [mangaDir, setMangaDir] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [outputBaseName, setOutputBaseName] = useState('');
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedTitles, setSelectedTitles] = useState(() => new Set());
  const [packMode, setPackMode] = useState('singleVolume');
  const [maxMbPerFile, setMaxMbPerFile] = useState(200);
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [exportError, setExportError] = useState('');
  const [outputFiles, setOutputFiles] = useState([]);

  // -- notify parent of running state ---------------------------------------
  useEffect(() => {
    onRunningChange?.(exporting);
  }, [exporting, onRunningChange]);

  const [pdfSeamless, setPdfSeamless] = useState(false);

  const lastClickedIndexRef = useRef(null);
  const dragAnchorRef = useRef(null);
  const dragActiveRef = useRef(false);
  const lastDragIndexRef = useRef(null);
  const suppressNextRowClickRef = useRef(false);
  const dragJustEndedRef = useRef(false);

  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const hasElectron = Boolean(api?.selectDirectory);

  useEffect(() => {
    const onUp = () => {
      if (dragActiveRef.current) {
        suppressNextRowClickRef.current = true;
        dragJustEndedRef.current = true;
        if (lastDragIndexRef.current !== null) lastClickedIndexRef.current = lastDragIndexRef.current;
        setTimeout(() => { suppressNextRowClickRef.current = false; dragJustEndedRef.current = false; }, 0);
      }
      dragAnchorRef.current = null;
      dragActiveRef.current = false;
      lastDragIndexRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  useEffect(() => { lastClickedIndexRef.current = null; }, [chapters]);

  const handleRowMouseDown = (e, i) => {
    if (e.button !== 0) return;
    dragAnchorRef.current = i;
    dragActiveRef.current = false;
    lastDragIndexRef.current = i;
  };

  const handleRowMouseEnter = (e, i) => {
    if (e.buttons !== 1 || dragAnchorRef.current === null) return;
    if (i !== dragAnchorRef.current) dragActiveRef.current = true;
    lastDragIndexRef.current = i;
    const from = Math.min(dragAnchorRef.current, i);
    const to = Math.max(dragAnchorRef.current, i);
    setSelectedTitles(new Set(chapters.slice(from, to + 1).map((c) => c.title)));
  };

  const handleRowClick = (e, ch, i) => {
    if (suppressNextRowClickRef.current) { suppressNextRowClickRef.current = false; dragJustEndedRef.current = false; return; }
    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const from = Math.min(lastClickedIndexRef.current, i);
      const to = Math.max(lastClickedIndexRef.current, i);
      setSelectedTitles(new Set(chapters.slice(from, to + 1).map((c) => c.title)));
    } else {
      setSelectedTitles((prev) => { const next = new Set(prev); if (next.has(ch.title)) next.delete(ch.title); else next.add(ch.title); return next; });
    }
    lastClickedIndexRef.current = i;
  };

  const handleSelectDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (!dir) return;
    setMangaDir(dir);
    setChapters([]);
    setSelectedTitles(new Set());
    setProgress(null);
    setExportError('');
    setOutputFiles([]);
    setLoadError('');
  };

  const handleClearDir = () => {
    setMangaDir('');
    setChapters([]);
    setSelectedTitles(new Set());
    setProgress(null);
    setExportError('');
    setOutputFiles([]);
    setLoadError('');
    setOutputBaseName('');
  };

  const handleBrowseOutput = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  const loadChapters = async (dir) => {
    if (!dir || !api?.loadMangaOfflineFromAbsolutePath) return;
    setLoadingChapters(true);
    setLoadError('');
    setChapters([]);
    setSelectedTitles(new Set());
    try {
      const r = await api.loadMangaOfflineFromAbsolutePath(dir);
      if (r?.ok && Array.isArray(r.chapters)) {
        setChapters(r.chapters);
      } else {
        setLoadError(r?.error || t('pdfExportTab.loadChaptersFailed'));
      }
    } catch (e) {
      setLoadError(String(e?.message || e) || t('app.log.fetchErrorUnknown'));
    } finally {
      setLoadingChapters(false);
    }
  };

  useEffect(() => {
    if (mangaDir) loadChapters(mangaDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaDir]);

  useEffect(() => {
    if (!exporting || !api?.subscribeExportPdfFromDirProgress) return undefined;
    const unsub = api.subscribeExportPdfFromDirProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [exporting, api]);

  const selectAll = () => setSelectedTitles(new Set(chapters.map((c) => c.title)));
  const unselectAll = () => setSelectedTitles(new Set());

  const handleExport = async () => {
    if (!api?.exportPdfFromDir) return;
    const selectedChapters = chapters.filter((c) => selectedTitles.has(c.title));
    if (!selectedChapters.length) return;

    const payload = {
      mangaDir,
      mode: packMode,
      chapters: selectedChapters.map((c) => ({ title: c.title })),
      outputDir: outputDir.trim() || undefined,
      outputBaseName: outputBaseName.trim() || undefined,
      pdfSeamless,
      openFolderAfter,
    };
    if (packMode === 'sizeSplit' || packMode === 'chapterSplit') payload.maxMbPerFile = maxMbPerFile;

    setExportError('');
    setProgress(null);
    setOutputFiles([]);
    setExporting(true);

    try {
      const r = await api.exportPdfFromDir(payload);
      if (r?.cancelled) { setProgress(null); return; }
      if (!r?.ok) { setExportError(r?.error || t('pdfExportTab.exportFailed')); return; }
      const files = Array.isArray(r.outputFiles) ? r.outputFiles : [];
      setOutputFiles(files);
    } catch (e) {
      setExportError(String(e?.message || e) || t('app.log.fetchErrorUnknown'));
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const progressPct = progress && progress.total > 0
    ? Math.min(100, Math.round((100 * progress.done) / progress.total))
    : null;

  const exportDisabled =
    exporting || loadingChapters || !mangaDir || !chapters.length ||
    selectedTitles.size === 0 ||
    ((packMode === 'sizeSplit' || packMode === 'chapterSplit') && (!Number.isFinite(maxMbPerFile) || maxMbPerFile < 1 || maxMbPerFile > 4096));

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">

      <div
        className="flex-1 flex overflow-hidden min-h-0 min-w-0"
      >

        {/* Left panel: settings */}
        <div
          className="w-[380px] shrink-0 flex flex-col gap-5 border-r border-outline-variant/15 px-4 py-5 overflow-y-auto custom-scrollbar min-w-0"
        >

          {!hasElectron && (
            <p className="text-xs text-amber-400">{t('pdfExportTab.desktopOnly')}</p>
          )}

          {/* Thư mục truyện */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('pdfExportTab.selectDir')}
            </p>
            {mangaDir ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-highest/50 px-2.5 py-2">
                <span className="material-symbols-outlined text-[14px] leading-none shrink-0 text-on-surface-variant/50">folder</span>
                <span className="min-w-0 flex-1 break-all font-mono text-[10px] leading-snug text-on-surface-variant">{mangaDir}</span>
                <button
                  type="button"
                  onClick={handleClearDir}
                  disabled={exporting}
                  className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-on-surface-variant/40 hover:text-error cursor-pointer disabled:opacity-40"
                  aria-label={t('pdfExportTab.clearFolder')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">close</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!hasElectron || exporting}
                onClick={handleSelectDir}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-outline-variant/30 px-3 py-2.5 text-sm text-on-surface-variant hover:border-primary/50 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                {t('pdfExportTab.selectDir')}
              </button>
            )}
          </div>

          {/* Tên file */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('pdfExportTab.outputBaseName')}
            </label>
            <input
              type="text"
              value={outputBaseName}
              onChange={(e) => setOutputBaseName(e.target.value)}
              placeholder={mangaDir ? (() => { const sep = mangaDir.includes('/') ? '/' : '\\'; const p = mangaDir.replace(/[/\\]+$/, '').split(sep); return p[p.length - 1]; })() : t('pdfExportTab.outputBaseNamePlaceholder')}
              disabled={exporting}
              className="w-full bg-surface-container-highest border-none rounded-md text-sm h-9 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
            />
          </div>

          {/* Lưu tại */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('sidebar.saveTo')}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder={savePath || t('sidebar.placeholder.savePath')}
                disabled={exporting}
                className="min-w-0 flex-1 bg-surface-container-highest border-none rounded-md text-sm h-9 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleBrowseOutput}
                disabled={exporting || !hasElectron}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-surface-container-high text-on-surface hover:bg-surface-bright transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('sidebar.browse')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
              </button>
            </div>
          </div>

          {/* Chế độ đóng gói */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('pdfExportTab.modeLabel')}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input type="radio" name="pdf-tab-pack-mode" checked={packMode === 'singleVolume'} onChange={() => setPackMode('singleVolume')} disabled={exporting} className="accent-primary" />
              {t('pdfExportTab.modeSingleVolume')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input type="radio" name="pdf-tab-pack-mode" checked={packMode === 'sizeSplit'} onChange={() => setPackMode('sizeSplit')} disabled={exporting} className="accent-primary" />
              {t('pdfExportTab.modeSizeSplit')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input type="radio" name="pdf-tab-pack-mode" checked={packMode === 'chapterSplit'} onChange={() => setPackMode('chapterSplit')} disabled={exporting} className="accent-primary" />
              {t('pdfExportTab.modeChapterSplit')}
            </label>
            {(packMode === 'sizeSplit' || packMode === 'chapterSplit') && (
              <div className="ml-5 flex items-center gap-2 text-sm text-on-surface-variant">
                <input
                  type="number" min={1} max={4096} step={1} value={maxMbPerFile}
                  onChange={(e) => setMaxMbPerFile(Math.max(1, Math.min(4096, Number(e.target.value))))}
                  disabled={exporting}
                  className="w-16 rounded-lg border border-outline-variant/30 bg-surface-container-high px-2 py-1 text-on-surface tabular-nums text-sm disabled:opacity-50"
                />
                <span>{t('pdfExportTab.maxMbSuffix')}</span>
              </div>
            )}
          </div>

          {/* Tùy chọn */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('pdfExportTab.optionsHeading')}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input type="checkbox" checked={openFolderAfter} onChange={(e) => setOpenFolderAfter(e.target.checked)} disabled={exporting} className="rounded accent-primary" />
              {t('pdfExportTab.openFolderAfter')}
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input type="checkbox" checked={pdfSeamless} onChange={(e) => setPdfSeamless(e.target.checked)} disabled={exporting} className="mt-0.5 rounded accent-primary" />
              <span>
                {t('pdfExport.pdfSeamless')}
                <span className="block text-[10px] text-on-surface-variant/50 mt-0.5 leading-relaxed">
                  {t('pdfExport.pdfSeamlessHint')}
                </span>
              </span>
            </label>
          </div>


          {/* Messages */}
          {loadError && <p className="text-xs text-error" role="alert">{loadError}</p>}
          {exportError && !exporting && <p className="text-xs text-error" role="alert">{exportError}</p>}
          {outputFiles.length > 0 && !exporting && (
            <p className="text-xs text-green-400/90">{t('pdfExportTab.successMsg', { count: outputFiles.length })}</p>
          )}

        </div>

        {/* Right panel: chapter list + export button */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Progress */}
          {exporting && (
            <div className="shrink-0 px-5 pt-4 pb-2 space-y-1">
              <div className="h-1 overflow-hidden rounded-full bg-surface-container-highest">
                <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progressPct ?? 0}%` }} />
              </div>
              <p className="text-[11px] text-on-surface-variant">
                {progress?.total
                  ? `${progress.label ? `${progress.label} — ` : ''}${progress.done} / ${progress.total}`
                  : t('pdfExportTab.exporting')}
              </p>
            </div>
          )}

          {/* Chapter list */}
          <div className="flex-1 flex flex-col min-h-0 px-5 pt-4 pb-3">
            {loadingChapters ? (
              <p className="text-sm text-on-surface-variant text-center py-8">{t('pdfExportTab.loadingChapters')}</p>
            ) : !mangaDir ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/40">
                <span className="material-symbols-outlined text-[48px]">folder_open</span>
                <p className="text-sm">{t('pdfExportTab.selectDir')}</p>
              </div>
            ) : mangaDir && chapters.length === 0 && !loadError ? (
              <p className="text-sm text-on-surface-variant text-center py-8">{t('pdfExportTab.emptyChapters')}</p>
            ) : chapters.length > 0 ? (
              <div className="rounded-xl border border-outline-variant/15 overflow-hidden bg-surface-container-lowest/50 shadow-sm flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container-highest/60 border-b border-outline-variant/10 sticky top-0 z-10 backdrop-blur-sm shrink-0">
                  <span className="text-xs text-on-surface-variant">
                    {t('pdfExportTab.selectedCount', { count: selectedTitles.size })}
                    {' / '}
                    {t('pdfExportTab.chapterCount', { count: chapters.length })}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={selectAll} disabled={exporting} data-tooltip={t('pdfExportTab.selectAll')} aria-label={t('pdfExportTab.selectAll')} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high cursor-pointer transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined text-[20px] leading-none">select_all</span>
                    </button>
                    <button type="button" onClick={unselectAll} disabled={exporting} data-tooltip={t('pdfExportTab.unselectAll')} aria-label={t('pdfExportTab.unselectAll')} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high cursor-pointer transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined text-[20px] leading-none">clear_all</span>
                    </button>
                  </div>
                </div>
                <ul className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 py-1">
                  {chapters.map((ch, i) => {
                    const checked = selectedTitles.has(ch.title);
                    return (
                      <li key={ch.title}>
                        <button
                          type="button"
                          onMouseDown={(e) => handleRowMouseDown(e, i)}
                          onMouseEnter={(e) => handleRowMouseEnter(e, i)}
                          onClick={(e) => handleRowClick(e, ch, i)}
                          disabled={exporting}
                          className={[
                            'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors rounded-lg mx-1 select-none',
                            'hover:bg-surface-container-high disabled:cursor-default',
                            checked ? 'bg-primary/5' : '',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox" readOnly checked={checked} tabIndex={-1}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dragJustEndedRef.current) { dragJustEndedRef.current = false; e.preventDefault(); return; }
                              handleRowClick(e, ch, i);
                            }}
                            className="pointer-events-none shrink-0 rounded accent-primary"
                          />
                          <span className="min-w-0 flex-1 truncate text-on-surface">{ch.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Export button */}
          {mangaDir && (
            <div className="shrink-0 px-5 pb-5">
              <button
                type="button"
                disabled={!hasElectron || exportDisabled}
                onClick={handleExport}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-tertiary-container py-3 text-sm font-bold text-on-tertiary-container hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                {exporting ? t('pdfExportTab.exporting') : t('pdfExportTab.export')}
              </button>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}