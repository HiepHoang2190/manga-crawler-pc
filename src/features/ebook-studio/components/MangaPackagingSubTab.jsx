import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import DualSourcePicker from './DualSourcePicker';
import { ResizeSplitter, useToolsSidebarResize, SearchableSelect, EmptyState, SaveDirErrorModal, SectionTitle, OutputDestinationSelector } from '../../../shared';
import CbzConfigForm from './forms/CbzConfigForm';
import PdfConfigForm from './forms/PdfConfigForm';
import EpubConfigForm from './forms/EpubConfigForm';
import MobiConfigForm from './forms/MobiConfigForm';
import KindleGenCompilerCard from './KindleGenCompilerCard';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

const FORMATS = [
  { id: 'cbz', title: 'CBZ', icon: 'archive', iconColor: 'text-amber-500' },
  { id: 'pdf', title: 'PDF', icon: 'picture_as_pdf', iconColor: 'text-red-500' },
  { id: 'epub', title: 'EPUB', icon: 'menu_book', iconColor: 'text-emerald-500' },
  { id: 'mobi', title: 'MOBI', icon: 'tablet_android', iconColor: 'text-orange-500' },
];

function getParentDir(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const sep = filePath.includes('/') ? '/' : '\\';
  const idx = filePath.lastIndexOf(sep);
  if (idx < 0) return '';
  if (sep === '\\' && idx === 2 && filePath[1] === ':') return filePath.slice(0, 3);
  return filePath.slice(0, idx) || sep;
}

export default function MangaPackagingSubTab({
  isActive = true,
  savePath = '',
  initialMangaDir = '',
  showCol1 = true,
  showSidebar = true,
  sidebarWidth: propWidth,
  handleSplitPointerDown: propHandleSplit,
  onRunningChange,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const fallbackResize = useToolsSidebarResize();
  const sidebarWidth = propWidth ?? fallbackResize.sidebarWidth;
  const handleSplitPointerDown = propHandleSplit ?? fallbackResize.handleSplitPointerDown;
  const isSidebarVisible = showSidebar ?? showCol1;

  const [sourceDir, setSourceDir] = useState(initialMangaDir);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedTitles, setSelectedTitles] = useState(() => new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'selected' | 'unselected'
  const [sortBy, setSortBy] = useState('natural'); // 'natural' | 'name_asc' | 'name_desc'
  const [sidebarTab, setSidebarTab] = useState('config'); // 'config' | 'output'

  const [targetFormat, setTargetFormat] = useState('cbz');
  const [inPlace, setInPlace] = useState(true);
  const [outputDir, setOutputDir] = useState('');
  const [outputBaseName, setOutputBaseName] = useState('');
  const [openFolderAfter, setOpenFolderAfter] = useState(true);

  const [outputWarning, setOutputWarning] = useState(false);
  const [outputWarningMsg, setOutputWarningMsg] = useState('');
  const [saveDirErrorModal, setSaveDirErrorModal] = useState(null);

  const inPlaceTargetDir = (sourceDir || getParentDir(sourceFiles[0]) || savePath || '').trim();
  const effectiveOutputDir = inPlace ? inPlaceTargetDir : (outputDir || '').trim();

  // Validate output directory existence like Crawler tab (validateSaveDir)
  useEffect(() => {
    if (!effectiveOutputDir) {
      setOutputWarning(false);
      setOutputWarningMsg('');
      return undefined;
    }
    if (!api?.validateSaveDir) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .validateSaveDir(effectiveOutputDir)
        .then((res) => {
          if (cancelled) return;
          if (res && !res.ok && !res.canCreate) {
            setOutputWarning(true);
            setOutputWarningMsg(res.error || t('sidebar.warning.invalidSavePath') || 'Thư mục không tồn tại hoặc ổ đĩa chưa kết nối');
          } else {
            setOutputWarning(false);
            setOutputWarningMsg('');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOutputWarning(false);
            setOutputWarningMsg('');
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveOutputDir, api, t]);

  // Format options state
  const [cbzOptions, setCbzOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false });
  const [pdfOptions, setPdfOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false, pdfSeamless: false });
  const [epubOptions, setEpubOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, author: '', imageQuality: 95, rotateDoublePage: false });
  const [mobiOptions, setMobiOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false });

  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(null);
  const [resultMsg, setResultMsg] = useState('');
  const [resultOk, setResultOk] = useState(true);
  const [resultFiles, setResultFiles] = useState([]);
  const [copiedResultMsg, setCopiedResultMsg] = useState(false);

  useEffect(() => {
    onRunningChange?.(processing);
  }, [processing, onRunningChange]);

  const handleCopyResultMsg = useCallback(async () => {
    if (!resultMsg) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resultMsg);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = resultMsg;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedResultMsg(true);
      setTimeout(() => setCopiedResultMsg(false), 2000);
    } catch (err) {
      console.error('Failed to copy resultMsg:', err);
    }
  }, [resultMsg]);

  // Shift-click selection ref
  const lastClickedIndexRef = useRef(null);

  useEffect(() => {
    if (!api?.subscribeEbookPackProgress) return;
    const unsub = api.subscribeEbookPackProgress((p) => {
      if (p.message) setProgressMsg(p.message);
      if (p.percent != null) setProgressPercent(p.percent);
      else if (p.done && p.total) setProgressPercent(Math.round((p.done / p.total) * 100));
    });
    return () => unsub?.();
  }, [api]);

  const loadChaptersFromDirectory = useCallback(async (dir) => {
    if (!dir) return;
    setLoadingChapters(true);
    setLoadError('');
    try {
      let res = null;
      if (api?.ebookScanMangaDir) {
        res = await api.ebookScanMangaDir(dir);
      } else if (api?.loadMangaOfflineFromAbsolutePath) {
        res = await api.loadMangaOfflineFromAbsolutePath(dir);
      }
      if (res?.ok && Array.isArray(res.chapters) && res.chapters.length > 0) {
        setChapters(res.chapters);
        setSelectedTitles(new Set(res.chapters.map((c) => c.title)));
      } else {
        setChapters([]);
        setSelectedTitles(new Set());
        setLoadError(res?.error || t('ebookStudio.packaging.noChaptersFound'));
      }
    } catch (err) {
      setChapters([]);
      setSelectedTitles(new Set());
      setLoadError(err.message || t('ebookStudio.packaging.scanError'));
    } finally {
      setLoadingChapters(false);
    }
  }, [api, t]);

  useEffect(() => {
    if (sourceDir) {
      loadChaptersFromDirectory(sourceDir);
    } else if (sourceFiles && sourceFiles.length > 0) {
      const sortedFiles = sourceFiles.slice().sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      const manualChapters = sortedFiles.map((f, i) => {
        const title = f.split(/[\\/]/).pop() || `Chapter ${i + 1}`;
        return { title, path: f, isSingleFile: true };
      });
      setChapters(manualChapters);
      setSelectedTitles(new Set(manualChapters.map((c) => c.title)));
    } else {
      setChapters([]);
      setSelectedTitles(new Set());
    }
  }, [sourceDir, sourceFiles, loadChaptersFromDirectory]);

  const handleSelectFolder = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (!dir) return;
    setSourceFiles([]);
    setSourceDir(dir);
    loadChaptersFromDirectory(dir);
  };

  const handleSelectFiles = async () => {
    if (!api?.ebookSelectFiles) return;
    const files = await api.ebookSelectFiles();
    if (!files || !files.length) return;
    setSourceFiles(files);
    setSourceDir('');
  };

  const handleClearSource = () => {
    setSourceDir('');
    setSourceFiles([]);
    setChapters([]);
    setSelectedTitles(new Set());
  };

  const handleSelectOutputDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) {
      setOutputDir(dir);
      setInPlace(false);
    }
  };

  // Filter & sort chapters
  const filteredAndSortedChapters = useMemo(() => {
    let list = chapters.slice();

    // Text search
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter((ch) => ch.title.toLowerCase().includes(q));
    }

    // Status filter
    if (filterStatus === 'selected') {
      list = list.filter((ch) => selectedTitles.has(ch.title));
    } else if (filterStatus === 'unselected') {
      list = list.filter((ch) => !selectedTitles.has(ch.title));
    }

    // Sort
    if (sortBy === 'name_asc') {
      list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sortBy === 'name_desc') {
      list.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' }));
    }

    return list;
  }, [chapters, searchFilter, filterStatus, sortBy, selectedTitles]);

  const allDisplayedSelected =
    filteredAndSortedChapters.length > 0 &&
    filteredAndSortedChapters.every((ch) => selectedTitles.has(ch.title));
  const someDisplayedSelected =
    filteredAndSortedChapters.some((ch) => selectedTitles.has(ch.title));

  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      const next = new Set(selectedTitles);
      filteredAndSortedChapters.forEach((ch) => next.delete(ch.title));
      setSelectedTitles(next);
    } else {
      const next = new Set(selectedTitles);
      filteredAndSortedChapters.forEach((ch) => next.add(ch.title));
      setSelectedTitles(next);
    }
  };

  const handleRowClick = (e, chapter, idx) => {
    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, idx);
      const end = Math.max(lastClickedIndexRef.current, idx);
      const next = new Set(selectedTitles);
      for (let i = start; i <= end; i++) {
        if (filteredAndSortedChapters[i]) next.add(filteredAndSortedChapters[i].title);
      }
      setSelectedTitles(next);
      lastClickedIndexRef.current = idx;
      return;
    }

    const next = new Set(selectedTitles);
    if (next.has(chapter.title)) {
      next.delete(chapter.title);
    } else {
      next.add(chapter.title);
    }
    setSelectedTitles(next);
    lastClickedIndexRef.current = idx;
  };

  const handleExecuteExport = async () => {
    if (!selectedTitles.size) return;

    const targetOut = inPlace ? inPlaceTargetDir : (outputDir || '').trim();
    if (!targetOut) {
      const errMsg = t('app.log.needSavePathShort') || 'Vui lòng chọn thư mục lưu tệp.';
      setOutputWarning(true);
      setSidebarTab('output');
      setOutputWarningMsg(errMsg);
      setSaveDirErrorModal({
        path: '',
        message: errMsg,
      });
      return;
    }

    if (api?.validateSaveDir) {
      try {
        const valRes = await api.validateSaveDir(targetOut);
        if (valRes && !valRes.ok && !valRes.canCreate) {
          const errMsg =
            valRes.error ||
            t('sidebar.warning.invalidSavePath') ||
            'Thư mục không tồn tại hoặc ổ đĩa chưa kết nối';
          setOutputWarning(true);
          setSidebarTab('output');
          setOutputWarningMsg(errMsg);
          setSaveDirErrorModal({
            path: targetOut,
            message: errMsg,
          });
          return;
        }
      } catch {
        /* proceed if unexpected error */
      }
    }

    setOutputWarning(false);
    setOutputWarningMsg('');
    setCancelling(false);
    setCopiedResultMsg(false);
    setProcessing(true);
    setProgressMsg(t('ebookStudio.packaging.processing'));
    setProgressPercent(null);
    setResultMsg('');
    setResultFiles([]);

    // Đóng gói toàn bộ chương đã chọn (không phụ thuộc bộ lọc/tìm kiếm đang hiển thị), giữ thứ tự sắp xếp
    const orderedChapters =
      sortBy === 'name_asc'
        ? chapters.slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
        : sortBy === 'name_desc'
        ? chapters.slice().sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' }))
        : chapters;
    const selectedChapterObjs = orderedChapters.filter((c) => selectedTitles.has(c.title));
    const targetOutputDir = targetOut;
    const rawFormatOpts =
      targetFormat === 'cbz' ? cbzOptions :
      targetFormat === 'pdf' ? pdfOptions :
      targetFormat === 'epub' ? epubOptions :
      mobiOptions;
    const clampedMaxMb = Math.min(2048, Math.max(10, Math.round(Number(rawFormatOpts.maxMbPerFile) || 200)));
    const normalizedOpts = { ...rawFormatOpts, maxMbPerFile: clampedMaxMb };

    const payload = {
      sourceDir,
      chapters: selectedChapterObjs,
      targetFormat,
      outputDir: targetOutputDir,
      outputBaseName,
      options: normalizedOpts,
    };

    try {
      let res = null;
      if (api?.ebookPackManga) {
        res = await api.ebookPackManga(payload);
      } else if (targetFormat === 'cbz' && api?.exportCbz) {
        res = await api.exportCbz({
          absoluteMangaDir: sourceDir,
          chapters: selectedChapterObjs,
          mode: normalizedOpts.packMode || 'singleVolume',
          maxMbPerFile: clampedMaxMb,
          rotateDoublePage: Boolean(normalizedOpts.rotateDoublePage),
          outputDir: targetOutputDir,
          outputBaseName,
        });
      } else if (targetFormat === 'pdf' && api?.exportPdfFromDir) {
        res = await api.exportPdfFromDir({
          mangaDir: sourceDir,
          chapters: selectedChapterObjs,
          mode: normalizedOpts.packMode || 'singleVolume',
          maxMbPerFile: clampedMaxMb,
          rotateDoublePage: Boolean(normalizedOpts.rotateDoublePage),
          pdfSeamless: Boolean(normalizedOpts.pdfSeamless),
          outputDir: targetOutputDir,
          outputBaseName,
        });
      } else if (targetFormat === 'pdf' && api?.exportpdf) {
        res = await api.exportpdf(payload);
      }

      if (res?.ok) {
        setResultOk(true);
        setResultMsg(res.message || t('ebookStudio.packaging.successDefault'));
        setResultFiles(res.files || (res.filePath ? [res.filePath] : []));
        if (openFolderAfter && api?.showItemInFolder && res.files?.[0]) {
          api.showItemInFolder(res.files[0]);
        }
      } else {
        setResultOk(false);
        setResultMsg(res?.error || t('ebookStudio.packaging.failedDefault'));
      }
    } catch (err) {
      setResultOk(false);
      setResultMsg(err.message || t('ebookStudio.packaging.unknownError'));
    } finally {
      setProcessing(false);
      setCancelling(false);
      setProgressMsg('');
    }
  };

  const handleCancel = async () => {
    if (!api?.ebookCancel || cancelling) return;
    setCancelling(true);
    try {
      await api.ebookCancel();
    } catch {
      setCancelling(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* ─── ACTION SLOT (TOOLBAR ĐỈNH) ─── */}
      <EbookStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          {processing ? (
            <button
              type="button"
              data-testid="packaging-stop-btn"
              onClick={handleCancel}
              disabled={!api?.ebookCancel || cancelling}
              aria-label={t('ebookStudio.stop')}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-error/30 bg-error/15 px-3.5 text-xs font-semibold text-error transition-all hover:bg-error/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
              <span>{cancelling ? t('ebookStudio.stopping') : t('ebookStudio.stop')}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="packaging-start-btn"
              onClick={handleExecuteExport}
              disabled={selectedTitles.size === 0}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">archive</span>
              <span>{`${t('ebookStudio.packaging.startBtn')} (${selectedTitles.size})`}</span>
            </button>
          )}
        </div>
      </EbookStudioCenterSlot>
      <EbookStudioActionSlot active={isActive}></EbookStudioActionSlot>

      {/* ─── SIDEBAR / CONTROLS (PANEL TRÁI) ─── */}
      {isSidebarVisible && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          {/* Sub-tab Navigation: Cấu hình / Thiết lập đầu ra (đồng bộ Xử lý ảnh / Upscale) */}
          <div className="px-3.5 pt-3 pb-2.5 border-b border-outline-variant/15 shrink-0 bg-surface-container-low/40">
            <div
              role="tablist"
              className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'config'}
                onClick={() => setSidebarTab('config')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  sidebarTab === 'config'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">tune</span>
                <span className="truncate">{t('ebookStudio.sidebarTab.config')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'output'}
                onClick={() => setSidebarTab('output')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  sidebarTab === 'output'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">output</span>
                <span className="truncate">{t('ebookStudio.sidebarTab.output')}</span>
                {outputWarning && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" aria-hidden="true" data-tooltip={outputWarningMsg} />
                    <span className="sr-only">{outputWarningMsg}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {sidebarTab === 'config' && (
            <>
            {/* 1. Nguồn ảnh / manga */}
            <DualSourcePicker
              selectedPath={sourceDir}
              selectedFiles={sourceFiles}
              onSelectFolder={handleSelectFolder}
              onSelectFiles={handleSelectFiles}
              onClear={handleClearSource}
              disabled={processing}
              folderLabel={t('ebookStudio.packaging.folderLabel')}
              filesLabel={t('ebookStudio.packaging.filesLabel')}
              hint={t('ebookStudio.packaging.pickerHint')}
            />

            {/* 2. Định dạng đích */}
            <div className="space-y-2">
              <SectionTitle as="p">
                {t('ebookStudio.packaging.formatTitle', 'Định dạng')}
              </SectionTitle>
              <div className="grid grid-cols-4 gap-1.5">
                {FORMATS.map((fmt) => {
                  const isSelected = targetFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setTargetFormat(fmt.id)}
                      disabled={processing}
                      aria-pressed={isSelected}
                      className={`h-9 rounded-xl border px-2 flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 select-none ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'border-outline-variant/25 bg-surface-container-high/50 font-medium text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[16px] leading-none shrink-0 ${isSelected ? 'text-primary' : fmt.iconColor}`}>
                        {fmt.icon}
                      </span>
                      <span className="truncate">{fmt.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Cấu hình định dạng tương ứng */}
            <div className="space-y-2.5 pt-3 border-t border-outline-variant/15">
              <SectionTitle as="p">
                {t('ebookStudio.packaging.configTitle', 'Cấu hình')}
              </SectionTitle>
              {targetFormat === 'cbz' && (
                <CbzConfigForm options={cbzOptions} onChange={setCbzOptions} disabled={processing} />
              )}
              {targetFormat === 'pdf' && (
                <PdfConfigForm options={pdfOptions} onChange={setPdfOptions} disabled={processing} />
              )}
              {targetFormat === 'epub' && (
                <EpubConfigForm options={epubOptions} onChange={setEpubOptions} disabled={processing} />
              )}
              {targetFormat === 'mobi' && (
                <MobiConfigForm options={mobiOptions} onChange={setMobiOptions} disabled={processing} />
              )}
            </div>

            {/* 3.5. Công cụ biên dịch MOBI */}
            {targetFormat === 'mobi' && (
              <div className="space-y-2 pt-3 border-t border-outline-variant/15">
                <SectionTitle as="p">
                  {t('ebookStudio.converter.compilerSectionTitle', 'Công cụ biên dịch')}
                </SectionTitle>
                <KindleGenCompilerCard disabled={processing} />
              </div>
            )}

            </>

            )}


            {sidebarTab === 'output' && (
              <>
                {/* 4. Thư mục và tên file xuất (đồng bộ OutputDestinationSelector) */}
                <OutputDestinationSelector
                  inPlace={inPlace}
                  onInPlaceChange={(next) => {
                    setInPlace(next);
                    setOutputWarning(false);
                    setOutputWarningMsg('');
                  }}
                  inPlaceLabel={t('outputDestination.sameAsSource')}
                  outputDir={outputDir}
                  onOutputDirChange={setOutputDir}
                  onBrowse={handleSelectOutputDir}
                  placeholder={t('outputDestination.browse')}
                  disabled={processing}
                  radioName="packaging-output-destination"
                  showOpenFolderAfter={true}
                  openFolderAfter={openFolderAfter}
                  onOpenFolderAfterChange={setOpenFolderAfter}
                  warning={outputWarning}
                  warningMessage={outputWarningMsg}
                />

                <div className="space-y-2 pt-3 border-t border-outline-variant/15">
                  <SectionTitle as="label" htmlFor="packaging-output-basename" className="block">
                    {t('ebookStudio.packaging.outputNameLabel')}
                  </SectionTitle>
                  <input
                    id="packaging-output-basename"
                    type="text"
                    placeholder={t('ebookStudio.packaging.outputNamePlaceholder')}
                    value={outputBaseName}
                    onChange={(e) => setOutputBaseName(e.target.value)}
                    disabled={processing}
                    className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs sm:text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>
              </>
            )}


            {/* 5. Thông báo kết quả */}
            {resultMsg && !resultOk ? (
              <div
                data-testid="packaging-status-error"
                role="alert"
                className="flex items-start justify-between gap-2 text-xs text-error whitespace-pre-wrap"
              >
                <p className="select-text break-words flex-1">{resultMsg}</p>
                <button
                  type="button"
                  onClick={handleCopyResultMsg}
                  data-tooltip={copiedResultMsg ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi') : (t('ebookStudio.converter.copyError') || 'Sao chép lỗi')}
                  aria-label={t('ebookStudio.converter.copyError') || 'Sao chép lỗi'}
                  className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-error/15 text-error shrink-0 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copiedResultMsg ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            ) : resultMsg ? (
              <div
                data-testid="packaging-status-message"
                role="status"
                className="text-xs text-on-surface whitespace-pre-wrap border border-outline-variant/20 rounded-xl p-3 bg-surface-container-highest/50"
              >
                <p className="select-text break-words">{resultMsg}</p>
                {resultFiles.length > 0 && (
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {t('ebookStudio.packaging.filesCreated', { count: resultFiles.length })}
                  </p>
                )}
              </div>
            ) : null}

            {/* 6. Thẻ thống kê tổng quan (đồng bộ Tools Studio) */}
            <div className="mt-auto pt-2">
              <div
                data-testid="packaging-overview-card"
                className="rounded-xl border border-primary/15 bg-primary/5 p-3"
              >
                <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                  <span>{t('ebookStudio.overview.title')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.totalChapters')}</span>
                  <span className="font-bold text-on-surface text-right tabular-nums">
                    {chapters.length > 0 ? chapters.length : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.selected')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">
                    {chapters.length > 0 ? selectedTitles.size : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.format')}</span>
                  <span className="font-bold text-primary text-right uppercase">{targetFormat}</span>
                </div>
                <div className="mt-2.5 pt-2 border-t border-primary/10 text-[10px] text-on-surface-variant/75 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                      <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                    </span>
                    <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('ebookStudio.overview.packagingTip')}</span>
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

      {/* ─── MAIN PANEL / CHAPTER LIST (PANEL PHẢI) ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        {/* Thanh tiến trình khi đang thực thi */}
        {processing && (
          <div className="mb-3 space-y-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 shrink-0">
            <div className="flex justify-between text-xs text-on-surface">
              <span className="truncate font-medium">{progressMsg || t('ebookStudio.packaging.processing')}</span>
              <span className="font-mono text-primary font-semibold">{progressPercent != null ? `${progressPercent}%` : ''}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent || 25}%` }}
              />
            </div>
          </div>
        )}

        {/* Toolbar: Master checkbox, filter chips, search, sort */}
        {chapters.length > 0 && (
          <div className="mb-3 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-label={allDisplayedSelected ? t('ebookStudio.packaging.uncheckAll') : t('ebookStudio.packaging.checkAll')}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest/70 hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-outline-variant/20 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none text-primary">
                    {allDisplayedSelected
                      ? 'check_box'
                      : someDisplayedSelected
                      ? 'indeterminate_check_box'
                      : 'check_box_outline_blank'}
                  </span>
                </button>

                <SearchableSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  size="sm"
                  showPlaceholderOption={false}
                  className="min-w-[11.5rem]"
                  options={[
                    { value: 'all', label: `${t('ebookStudio.packaging.filterAll')} (${chapters.length})`, icon: 'filter_list' },
                    { value: 'selected', label: `${t('ebookStudio.packaging.filterSelected')} (${selectedTitles.size})`, icon: 'check_box' },
                    { value: 'unselected', label: `${t('ebookStudio.packaging.filterUnselected')} (${chapters.length - selectedTitles.size})`, icon: 'check_box_outline_blank' },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Search input */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/60 pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={t('ebookStudio.packaging.searchPlaceholder')}
                    aria-label={t('ebookStudio.packaging.searchPlaceholder')}
                    className="h-8 w-44 sm:w-52 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      aria-label={t('tools.remove')}
                      className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5"
                    >
                      close
                    </button>
                  )}
                </div>

                {/* Sort selector */}
                <SearchableSelect
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: 'natural', label: t('ebookStudio.packaging.sortNatural'), materialIcon: 'format_list_numbered' },
                    { value: 'name_asc', label: t('ebookStudio.packaging.sortNameAsc'), materialIcon: 'sort_by_alpha' },
                    { value: 'name_desc', label: t('ebookStudio.packaging.sortNameDesc'), materialIcon: 'sort_by_alpha' },
                  ]}
                  size="sm"
                  showPlaceholderOption={false}
                  className="min-w-[11.5rem]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Khung danh sách chương */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {loadingChapters ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px] text-primary animate-spin mb-2">progress_activity</span>
              <span>{t('ebookStudio.packaging.loadingChapters')}</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center max-w-md mx-auto my-auto space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 shrink-0">
                <span className="material-symbols-outlined text-[26px]">folder_off</span>
              </div>
              <div className="space-y-1.5 w-full">
                <p className="text-sm font-bold text-amber-500">
                  {t('ebookStudio.packaging.invalidStructureTitle')}
                </p>
                <p className="text-xs leading-relaxed text-on-surface-variant break-words">
                  {loadError}
                </p>
              </div>
              <div className="pt-3 border-t border-amber-500/15 w-full text-left">
                <SectionTitle as="p" className="mb-1.5">
                  {t('ebookStudio.packaging.supportedStructuresTitle')}
                </SectionTitle>
                <ul className="text-xs text-on-surface-variant/80 space-y-1 list-disc list-inside">
                  <li>{t('ebookStudio.packaging.structure1')}</li>
                  <li>{t('ebookStudio.packaging.structure2')}</li>
                  <li>{t('ebookStudio.packaging.structure3')}</li>
                </ul>
              </div>
            </div>
          ) : chapters.length === 0 ? (
            <EmptyState
              icon="folder_zip"
              title={
                sourceDir || sourceFiles.length
                  ? t('ebookStudio.packaging.noChaptersFound')
                  : t('ebookStudio.packaging.promptSelectFolder')
              }
              description={
                sourceDir || sourceFiles.length
                  ? t('ebookStudio.packaging.checkFolderHint', 'Vui lòng kiểm tra lại cấu trúc thư mục hoặc chọn thư mục manga khác.')
                  : t('ebookStudio.packaging.promptSelectFolderSub')
              }
            />
          ) : filteredAndSortedChapters.length === 0 ? (
            <EmptyState
              icon="filter_list_off"
              title={t('crop.filterNoMatch') || 'Không tìm thấy chương phù hợp bộ lọc'}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar space-y-0.5">
              {filteredAndSortedChapters.map((ch, idx) => {
                const isSelected = selectedTitles.has(ch.title);
                return (
                  <li
                    key={ch.title + idx}
                    onClick={(e) => handleRowClick(e, ch, idx)}
                    className={`mx-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-container-high cursor-pointer transition-colors group select-none ${
                      isSelected ? 'bg-primary/10 text-on-surface' : 'text-on-surface-variant'
                    }`}
                  >
                    {/* Checkbox */}
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-primary">
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>

                    {/* Icon */}
                    <span className="material-symbols-outlined text-[20px] shrink-0 text-on-surface-variant/70 group-hover:text-primary transition-colors">
                      {ch.isSingleFile ? 'description' : 'folder'}
                    </span>

                    {/* Title */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-on-surface">{ch.title}</p>
                      {ch.path && (
                        <p className="line-clamp-2 break-all font-mono text-[10px] text-on-surface-variant/60 leading-tight">
                          {ch.path}
                        </p>
                      )}
                    </div>

                    {/* Badge */}
                    {ch.isSingleFile && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
                        File
                      </span>
                    )}

                    {/* Open folder button */}
                    {ch.path && api?.showItemInFolder && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          api.showItemInFolder(ch.path);
                        }}
                        aria-label={t('ebookStudio.converter.openFolder') || 'Mở thư mục'}
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">folder_open</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Modal cảnh báo thư mục lưu không hợp lệ */}
      <SaveDirErrorModal
        open={Boolean(saveDirErrorModal)}
        error={saveDirErrorModal?.message}
        path={saveDirErrorModal?.path}
        onClose={() => setSaveDirErrorModal(null)}
        onSelectNewDir={async () => {
          setSaveDirErrorModal(null);
          await handleSelectOutputDir();
        }}
      />
    </div>
  );
}
