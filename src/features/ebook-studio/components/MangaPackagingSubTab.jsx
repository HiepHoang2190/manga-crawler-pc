import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import DualSourcePicker from './DualSourcePicker';
import { ResizeSplitter, useToolsSidebarResize, SearchableSelect, EmptyState } from '../../../shared';
import CbzConfigForm from './forms/CbzConfigForm';
import PdfConfigForm from './forms/PdfConfigForm';
import EpubConfigForm from './forms/EpubConfigForm';
import MobiConfigForm from './forms/MobiConfigForm';
import KindleGenCompilerCard from './KindleGenCompilerCard';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

const FORMATS = [
  { id: 'cbz', title: 'CBZ', desc: 'Comic Archive', icon: 'archive', color: 'text-amber-500 border-amber-500' },
  { id: 'pdf', title: 'PDF', desc: 'Tài liệu di động', icon: 'picture_as_pdf', color: 'text-red-500 border-red-500' },
  { id: 'epub', title: 'EPUB', desc: 'Sách chuẩn mở', icon: 'menu_book', color: 'text-emerald-500 border-emerald-500' },
  { id: 'mobi', title: 'MOBI', desc: 'Kindle Ebook', icon: 'tablet_android', color: 'text-orange-500 border-orange-500' },
];

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

  const [targetFormat, setTargetFormat] = useState('cbz');
  const [outputDir, setOutputDir] = useState('');
  const [outputBaseName, setOutputBaseName] = useState('');
  const openFolderAfter = true;

  // Format options state
  const [cbzOptions, setCbzOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false });
  const [pdfOptions, setPdfOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false, pdfSeamless: false });
  const [epubOptions, setEpubOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, author: '', imageQuality: 95, rotateDoublePage: false });
  const [mobiOptions, setMobiOptions] = useState({ packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false });

  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(null);
  const [resultMsg, setResultMsg] = useState('');
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

  // Shift-click & drag selection refs
  const lastClickedIndexRef = useRef(null);
  const suppressNextClickRef = useRef(false);

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
      setLoadError(err.message || 'Lỗi quét thư mục');
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
    if (dir) setOutputDir(dir);
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
    if (suppressNextClickRef.current) return;

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
    setProcessing(true);
    setProgressMsg(t('ebookStudio.packaging.processing'));
    setProgressPercent(null);
    setResultMsg('');
    setResultFiles([]);

    const selectedChapterObjs = filteredAndSortedChapters.filter((c) => selectedTitles.has(c.title));
    const effectiveOutputDir = outputDir || (sourceDir ? sourceDir : savePath);

    const payload = {
      sourceDir,
      chapters: selectedChapterObjs,
      targetFormat,
      outputDir: effectiveOutputDir,
      outputBaseName,
      options:
        targetFormat === 'cbz' ? cbzOptions :
        targetFormat === 'pdf' ? pdfOptions :
        targetFormat === 'epub' ? epubOptions :
        mobiOptions,
    };

    try {
      let res = null;
      if (api?.ebookPackManga) {
        res = await api.ebookPackManga(payload);
      } else if (targetFormat === 'cbz' && api?.exportCbz) {
        res = await api.exportCbz({
          absoluteMangaDir: sourceDir,
          chapters: selectedChapterObjs,
          mode: cbzOptions.packMode || 'singleVolume',
          maxMbPerFile: cbzOptions.maxMbPerFile || 200,
          rotateDoublePage: Boolean(cbzOptions.rotateDoublePage),
          outputDir: effectiveOutputDir,
          outputBaseName,
        });
      } else if (targetFormat === 'pdf' && api?.exportPdfFromDir) {
        res = await api.exportPdfFromDir({
          mangaDir: sourceDir,
          chapters: selectedChapterObjs,
          mode: pdfOptions.packMode || 'singleVolume',
          maxMbPerFile: pdfOptions.maxMbPerFile || 200,
          rotateDoublePage: Boolean(pdfOptions.rotateDoublePage),
          pdfSeamless: Boolean(pdfOptions.pdfSeamless),
          outputDir: effectiveOutputDir,
          outputBaseName,
        });
      } else if (targetFormat === 'pdf' && api?.exportpdf) {
        res = await api.exportpdf(payload);
      }

      if (res?.ok) {
        setResultMsg(res.message || 'Đóng gói thành công!');
        setResultFiles(res.files || (res.filePath ? [res.filePath] : []));
        if (openFolderAfter && api?.showItemInFolder && res.files?.[0]) {
          api.showItemInFolder(res.files[0]);
        }
      } else {
        setResultMsg(res?.error || 'Đóng gói thất bại');
      }
    } catch (err) {
      setResultMsg(err.message || 'Lỗi không xác định khi xuất bản');
    } finally {
      setProcessing(false);
      setProgressMsg('');
    }
  };

  const handleCancel = async () => {
    if (api?.ebookCancel) {
      await api.ebookCancel();
    }
    setProcessing(false);
    setProgressMsg('');
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* ─── ACTION SLOT (TOOLBAR ĐỈNH) ─── */}
      <EbookStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="packaging-start-btn"
            onClick={handleExecuteExport}
            disabled={processing || selectedTitles.size === 0}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {processing ? 'hourglass_top' : 'archive'}
            </span>
            <span>
              {processing
                ? t('ebookStudio.packaging.processing')
                : `${t('ebookStudio.packaging.startBtn')} (${selectedTitles.size})`}
            </span>
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!processing}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-error/40 px-2.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">stop_circle</span>
            <span>{t('ebookStudio.converter.cancelBtn') || 'Dừng'}</span>
          </button>
        </div>
      </EbookStudioCenterSlot>
      <EbookStudioActionSlot active={isActive}></EbookStudioActionSlot>

      {/* ─── SIDEBAR / CONTROLS (PANEL TRÁI) ─── */}
      {isSidebarVisible && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.packaging.formatTitle', 'Định dạng')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((fmt) => {
                  const isSelected = targetFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setTargetFormat(fmt.id)}
                      disabled={processing}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-all text-left cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                          : 'border-outline-variant/25 bg-surface-container-lowest hover:bg-surface-container-high'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high ${fmt.color}`}>
                        <span className="material-symbols-outlined text-[20px]">{fmt.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-on-surface">{fmt.title}</p>
                        <p className="text-[10px] text-on-surface-variant/70 truncate">{fmt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Cấu hình định dạng tương ứng */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.packaging.configTitle', 'Cấu hình')}
              </p>
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
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                  {t('ebookStudio.converter.compilerSectionTitle', 'Công cụ biên dịch')}
                </p>
                <KindleGenCompilerCard disabled={processing} />
              </div>
            )}

            {/* 4. Thư mục và tên file xuất */}
            <div className="space-y-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3.5">
              <span className="text-xs font-semibold text-on-surface">
                {t('ebookStudio.packaging.outputDest')}
              </span>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder={sourceDir || savePath || t('ebookStudio.packaging.defaultSaveDir')}
                  disabled={processing}
                  className="h-9 min-w-0 flex-1 rounded-md border-none bg-surface-container-highest px-3 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-mono truncate"
                />
                {outputDir && !processing && (
                  <button
                    type="button"
                    onClick={() => setOutputDir('')}
                    aria-label={t('outputDestination.clear') || 'Xóa thư mục đã chọn'}
                    className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-container-high text-on-surface-variant/70 hover:text-on-surface transition-colors hover:bg-surface-bright"
                  >
                    <span className="material-symbols-outlined text-[18px] leading-none">close</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSelectOutputDir}
                  disabled={processing}
                  aria-label={t('sourcePicker.selectFolder') || 'Chọn thư mục'}
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-container-high text-on-surface transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
                </button>
              </div>

              <input
                type="text"
                placeholder={t('ebookStudio.packaging.outputNamePlaceholder')}
                value={outputBaseName}
                onChange={(e) => setOutputBaseName(e.target.value)}
                disabled={processing}
                className="h-9 w-full rounded-md border-none bg-surface-container-highest px-3 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {/* 5. Thông báo kết quả */}
            {resultMsg && (
              <div className="space-y-2 pt-2">
                <div
                  className={`rounded-lg p-2.5 text-xs border ${
                    resultMsg.includes('Lỗi') || resultMsg.includes('thất bại')
                      ? 'bg-error/10 text-error border-error/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium select-text break-words flex-1">{resultMsg}</p>
                    {(resultMsg.includes('Lỗi') || resultMsg.includes('thất bại')) && (
                      <button
                        type="button"
                        onClick={handleCopyResultMsg}
                        data-tooltip={copiedResultMsg ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi') : (t('ebookStudio.converter.copyError') || 'Sao chép lỗi')}
                        aria-label={t('ebookStudio.converter.copyError') || 'Sao chép lỗi'}
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-error/20 text-error shrink-0 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {copiedResultMsg ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    )}
                  </div>
                  {resultFiles.length > 0 && (
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {resultFiles.length} file đã được tạo tại thư mục đích.
                    </p>
                  )}
                </div>
              </div>
            )}
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

                <div className="flex items-center gap-1 rounded-lg bg-surface-container-highest/60 p-1 text-xs">
                  {[
                    { key: 'all', label: t('ebookStudio.packaging.filterAll'), count: chapters.length },
                    { key: 'selected', label: t('ebookStudio.packaging.filterSelected'), count: selectedTitles.size },
                    { key: 'unselected', label: t('ebookStudio.packaging.filterUnselected'), count: chapters.length - selectedTitles.size },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilterStatus(f.key)}
                      className={[
                        'rounded-md px-2 py-1 font-medium transition-colors cursor-pointer',
                        filterStatus === f.key
                          ? 'bg-primary/15 text-primary font-semibold shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface',
                      ].join(' ')}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
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
                    className="h-8 w-44 sm:w-52 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
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
                <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  {t('ebookStudio.packaging.supportedStructuresTitle')}
                </p>
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
    </div>
  );
}
