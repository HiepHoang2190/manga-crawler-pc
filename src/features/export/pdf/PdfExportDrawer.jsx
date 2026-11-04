import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ChapterList } from '../../download';

export default function PdfExportDrawer({
  open,
  onClose,
  savePath = '',
  mangaTitle = '',
  mangaUrl = '',
  chapters = [],
  offlineMangaDirAbsolute = '',
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelId = useId();
  const panelRef = useRef(null);
  const [localChapters, setLocalChapters] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState(() => new Set());
  const [packMode, setPackMode] = useState('singleVolume');
  const [maxMbPerFile, setMaxMbPerFile] = useState(200);
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [pdfSeamless, setPdfSeamless] = useState(false);
  const [outputDir, setOutputDir] = useState('');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [lastOutputFiles, setLastOutputFiles] = useState([]);

  const loadLocalList = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.filterChaptersWithLocalImages) {
      setLocalChapters([]);
      return;
    }
    const base = String(savePath || '').trim();
    const mt = String(mangaTitle || '').trim();
    const absDir = String(offlineMangaDirAbsolute || '').trim();
    if (!open || (!absDir && (!base || !mt))) {
      setLocalChapters([]);
      return;
    }
    setLoadingList(true);
    setError('');
    try {
      const r = await api.filterChaptersWithLocalImages(savePath, mangaTitle, chapters, absDir || undefined);
      if (r?.ok && Array.isArray(r.chapters)) {
        setLocalChapters(r.chapters);
      } else {
        setLocalChapters([]);
      }
    } catch {
      setLocalChapters([]);
    }
    setLoadingList(false);
  }, [open, savePath, mangaTitle, chapters, offlineMangaDirAbsolute]);

  useEffect(() => {
    if (!open) return undefined;
    loadLocalList();
    return undefined;
  }, [open, loadLocalList]);

  useEffect(() => {
    if (!open) {
      setSelectedUrls(new Set());
      setError('');
      setProgress(null);
      setLastOutputFiles([]);
      setExporting(false);
      setPdfSeamless(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => panelRef.current?.focus?.(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const queue = useMemo(() => {
    const mu = String(mangaUrl || '').trim();
    if (!mu) return [];
    return [{ mangaUrl: mu, chapters: [] }];
  }, [mangaUrl]);

  const onToggleChapter = useCallback((url) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }, []);

  const onSelectAll = useCallback(() => {
    setSelectedUrls(new Set(localChapters.map((c) => c.url)));
  }, [localChapters]);

  const onUnselectAll = useCallback(() => setSelectedUrls(new Set()), []);
  const noopAddQueue = useCallback(() => {}, []);

  const handleBrowseOutput = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const api = window.electronAPI;
    if (!api?.subscribeExportpdfProgress) return undefined;
    const unsub = api.subscribeExportpdfProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [open]);

  const handleExport = async () => {
    const api = window.electronAPI;
    if (!api?.exportpdf) return;
    const selected = localChapters.filter((c) => selectedUrls.has(c.url));
    if (!selected.length) {
      setError(t('pdfExport.needSelection'));
      return;
    }
    setError('');
    setProgress(null);
    setLastOutputFiles([]);
    setExporting(true);
    try {
      const payload = {
        baseSaveDir: outputDir.trim() || savePath,
        mangaTitle,
        mode: packMode,
        chapters: selected.map((c) => ({
          title: c.title,
          ...(c.folderBasename ? { folderBasename: c.folderBasename } : {}),
        })),
        skipDialog: true,
        pdfSeamless,
        ...(outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(offlineMangaDirAbsolute ? { absoluteMangaDir: offlineMangaDirAbsolute } : {}),
      };
      if (packMode === 'sizeSplit') {
        payload.maxMbPerFile = maxMbPerFile;
      }
      const r = await api.exportpdf(payload);
      if (r?.cancelled) { setError(''); return; }
      if (!r?.ok) {
        setError(r?.error || t('pdfExport.errorGeneric'));
        return;
      }
      const files = Array.isArray(r.outputFiles) ? r.outputFiles : [];
      setLastOutputFiles(files);
      if (openFolderAfter && files.length && api.openPath) {
        const first = files[0];
        const lastSlash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
        const dir = outputDir.trim() || (lastSlash >= 0 ? first.slice(0, lastSlash) : first);
        await api.openPath(dir);
      }
    } catch (e) {
      setError(String(e?.message || e) || t('pdfExport.errorGeneric'));
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const progressPct =
    progress && progress.total > 0 ? Math.min(100, Math.round((100 * progress.done) / progress.total)) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-start" role="presentation">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default bg-black/50"
        aria-label={t('pdfExport.close')}
        onClick={onClose}
      />
      <div
        id={panelId}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-[min(100%,28rem)] flex-col border-r border-outline-variant/20 bg-surface shadow-2xl outline-none min-h-0"
      >
        <div className="flex shrink-0 items-center border-b border-outline-variant/15 px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
            {t('pdfExport.title')}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-2 border-b border-outline-variant/10 px-4 py-3 text-xs text-on-surface-variant">

            {/* Packaging mode */}
            <div className="font-semibold text-on-surface">{t('pdfExport.modeLabel')}</div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="pdf-pack-mode"
                checked={packMode === 'singleVolume'}
                onChange={() => setPackMode('singleVolume')}
                disabled={exporting}
                className="border-none bg-surface-container-highest"
              />
              <span>{t('pdfExport.modeSingleVolume')}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="pdf-pack-mode"
                checked={packMode === 'sizeSplit'}
                onChange={() => setPackMode('sizeSplit')}
                disabled={exporting}
                className="mt-0.5 border-none bg-surface-container-highest"
              />
              <span className="min-w-0 flex-1">
                {t('pdfExport.modeSizeSplit')}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-on-surface-variant">{t('pdfExport.maxMbLabel')}</span>
                  <input
                    type="number"
                    min={1}
                    max={4096}
                    step={1}
                    value={maxMbPerFile}
                    onChange={(e) => setMaxMbPerFile(Number(e.target.value))}
                    disabled={exporting || packMode !== 'sizeSplit'}
                    className="w-20 rounded border border-outline-variant/30 bg-surface-container-high px-2 py-0.5 text-on-surface tabular-nums disabled:opacity-50"
                  />
                  <span className="text-on-surface-variant">{t('pdfExport.maxMbSuffix')}</span>
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="pdf-pack-mode"
                checked={packMode === 'chapterSplit'}
                onChange={() => setPackMode('chapterSplit')}
                disabled={exporting}
                className="border-none bg-surface-container-highest"
              />
              <span>{t('pdfExport.modeChapterSplit')}</span>
            </label>

            {/* Options */}
            <label className="mt-1 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={openFolderAfter}
                onChange={(e) => setOpenFolderAfter(e.target.checked)}
                disabled={exporting}
                className="rounded border-none bg-surface-container-highest"
              />
              <span>{t('pdfExport.openFolderAfter')}</span>
            </label>
            <label className="mt-1 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={pdfSeamless}
                onChange={(e) => setPdfSeamless(e.target.checked)}
                disabled={exporting}
                className="mt-0.5 rounded border-none bg-surface-container-highest"
              />
              <span className="min-w-0 flex-1">
                {t('pdfExport.pdfSeamless')}
                <span className="mt-0.5 block text-[10px] text-on-surface-variant/70">
                  {t('pdfExport.pdfSeamlessHint')}
                </span>
              </span>
            </label>

            {/* Output directory */}
            <div className="space-y-1.5 pt-1">
              <div className="font-semibold text-on-surface">{t('sidebar.saveTo')}</div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder={savePath || t('sidebar.placeholder.savePath')}
                  disabled={exporting}
                  className="min-w-0 bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleBrowseOutput}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md bg-surface-container-high text-on-surface text-sm font-medium hover:bg-surface-bright transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
                  {t('sidebar.browse')}
                </button>
              </div>
            </div>
          </div>

          {loadingList ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-on-surface-variant">
              {t('pdfExport.loadingList')}
            </div>
          ) : (
            <ChapterList
              chapters={localChapters}
              queue={queue}
              currentMangaUrl={mangaUrl}
              selectedUrls={selectedUrls}
              setSelectedUrls={setSelectedUrls}
              onToggleChapter={onToggleChapter}
              onSelectAll={onSelectAll}
              onUnselectAll={onUnselectAll}
              onAddSelectedToQueue={noopAddQueue}
              chapterStatusKeyOverride="completed"
              hideQueueFooter
              emptyListMessage={t('pdfExport.emptyDownloaded')}
            />
          )}

          <div className="shrink-0 space-y-3 border-t border-outline-variant/10 p-4">
            {error ? (
              <p className="text-xs text-red-400" role="alert">{error}</p>
            ) : null}
            {exporting ? (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className="h-full bg-primary transition-[width] duration-150"
                    style={{ width: `${progressPct != null ? progressPct : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant">
                  {progress?.total
                    ? `${progress.label ? `${progress.label} — ` : ''}${progress.done}/${progress.total}`
                    : t('pdfExport.packaging')}
                </p>
              </div>
            ) : null}
            {lastOutputFiles.length > 0 && !exporting ? (
              <p className="text-[10px] text-green-400/90">{t('pdfExport.success')}</p>
            ) : null}

            <button
              type="button"
              disabled={
                exporting ||
                loadingList ||
                !localChapters.length ||
                selectedUrls.size === 0 ||
                (packMode === 'sizeSplit' &&
                  (!Number.isFinite(maxMbPerFile) || maxMbPerFile < 1 || maxMbPerFile > 4096))
              }
              onClick={handleExport}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-tertiary-container py-3 text-sm font-bold text-on-tertiary-container transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              <span className="material-symbols-outlined">picture_as_pdf</span>
              {exporting ? t('pdfExport.exporting') : t('pdfExport.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
