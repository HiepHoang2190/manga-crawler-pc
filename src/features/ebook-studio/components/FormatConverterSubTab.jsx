import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DualSourcePicker from './DualSourcePicker';
import { ResizeSplitter, useToolsSidebarResize, SearchableSelect, EmptyState, SaveDirErrorModal, SectionTitle, OutputDestinationSelector } from '../../../shared';
import { useI18n } from '../../../context/I18nContext';
import KindleGenCompilerCard from './KindleGenCompilerCard';
import { RotateDoublePageOption } from './forms/ConfigFormFields';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

const TARGET_FORMATS = [
  { id: 'cbz', title: 'CBZ', icon: 'archive', iconColor: 'text-amber-500' },
  { id: 'pdf', title: 'PDF', icon: 'picture_as_pdf', iconColor: 'text-red-500' },
  { id: 'epub', title: 'EPUB', icon: 'menu_book', iconColor: 'text-emerald-500' },
  { id: 'mobi', title: 'MOBI', icon: 'tablet_android', iconColor: 'text-orange-500' },
  { id: 'folder', labelKey: 'ebookStudio.converter.folderTitle', icon: 'photo_library', iconColor: 'text-cyan-500' },
];

export default function FormatConverterSubTab({
  isActive = true,
  savePath = '',
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

  const [inputFiles, setInputFiles] = useState([]);
  const [sourceDir, setSourceDir] = useState('');
  const [targetFormat, setTargetFormat] = useState('epub');
  const [sidebarTab, setSidebarTab] = useState('config'); // 'config' | 'output'
  const [inPlace, setInPlace] = useState(true);
  const [outputDir, setOutputDir] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [options, setOptions] = useState({
    rotateDoublePage: false,
  });


  const [queue, setQueue] = useState([]);
  const [converting, setConverting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(null);

  const [outputWarning, setOutputWarning] = useState(false);
  const [outputWarningMsg, setOutputWarningMsg] = useState('');
  const [saveDirErrorModal, setSaveDirErrorModal] = useState(null);

  const effectiveOutputDir = inPlace ? '' : (outputDir || '').trim();

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

  useEffect(() => {
    onRunningChange?.(converting);
  }, [converting, onRunningChange]);

  // Search, filter, and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'processing' | 'completed' | 'skipped' | 'error'
  const [sortBy, setSortBy] = useState('name_asc'); // 'name_asc' | 'name_desc'

  // Error copy feedback
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopyError = useCallback(async (errorText, key) => {
    if (!errorText) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(errorText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = errorText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
    }
  }, []);


  useEffect(() => {
    if (!api?.subscribeEbookBatchProgress) return;
    const unsub = api.subscribeEbookBatchProgress((prog) => {
      setGlobalProgress(prog);
      if (prog.item) {
        setQueue((prev) =>
          prev.map((item) =>
            item.path === prog.item
              ? { ...item, status: 'processing', progressMsg: prog.message }
              : item
          )
        );
      }
    });
    return () => unsub?.();
  }, [api]);

  const handleSelectFolder = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (!dir) return;
    setSourceDir(dir);
    setInputFiles([]);
    setQueue([{ path: dir, name: dir.split(/[\\/]/).pop(), status: 'pending', isDir: true }]);
  };

  const handleSelectFiles = async () => {
    if (!api?.ebookSelectFiles) return;
    const files = await api.ebookSelectFiles();
    if (!files || !files.length) return;
    setInputFiles(files);
    setSourceDir('');
    setQueue(
      files.map((f) => ({
        path: f,
        name: f.split(/[\\/]/).pop(),
        status: 'pending',
        isDir: false,
      }))
    );
  };

  const handleClear = () => {
    setInputFiles([]);
    setSourceDir('');
    setQueue([]);
    setGlobalProgress(null);
  };

  const handleSelectOutputDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) {
      setOutputDir(dir);
      setInPlace(false);
    }
  };

  const handleRemoveFromQueue = (indexToRemove) => {
    if (converting) return;
    setQueue((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleStartConvert = async () => {
    if (!queue.length || !api?.ebookBatchConvert) return;

    const targetOut = inPlace ? '' : (outputDir || '').trim();
    if (!inPlace && !targetOut) {
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

    if (!inPlace && api?.validateSaveDir) {
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
        /* proceed if unexpected error in validate */
      }
    }

    setOutputWarning(false);
    setOutputWarningMsg('');
    setCancelling(false);
    setConverting(true);

    const filePaths = queue.map((q) => q.path);

    try {
      const res = await api.ebookBatchConvert({
        inputPaths: filePaths,
        targetFormat,
        outputDir: targetOut,
        inPlace,
        options: { ...options, skipExisting },
      });

      if (res?.ok && Array.isArray(res.results)) {
        setQueue((prev) =>
          prev.map((item) => {
            const match = res.results.find((r) => r.input === item.path);
            if (match) {
              return {
                ...item,
                status: match.ok ? (match.skipped ? 'skipped' : 'completed') : 'error',
                outputPath: match.outputPath,
                error: match.error,
              };
            }
            return item;
          })
        );

        if (openFolderAfter && api?.showItemInFolder) {
          const firstOut =
            res.results.find((r) => r.ok && !r.skipped && r.outputPath)?.outputPath ||
            res.results.find((r) => r.outputPath)?.outputPath;
          if (firstOut) {
            api.showItemInFolder(firstOut);
          }
        }
      } else if (res?.error) {
        setSaveDirErrorModal({
          path: inPlace ? '' : targetOut,
          message: res.error,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      // Trả các mục còn kẹt "đang xử lý" (do huỷ / lỗi) về trạng thái chờ
      setQueue((prev) =>
        prev.map((item) => (item.status === 'processing' ? { ...item, status: 'pending', progressMsg: undefined } : item))
      );
      setConverting(false);
      setCancelling(false);
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

  // Queue stats
  const stats = useMemo(() => {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let skipped = 0;
    let error = 0;

    for (const it of queue) {
      if (it.status === 'processing') processing++;
      else if (it.status === 'completed') completed++;
      else if (it.status === 'skipped') skipped++;
      else if (it.status === 'error') error++;
      else pending++;
    }

    return { total: queue.length, pending, processing, completed, skipped, error };
  }, [queue]);

  // Filtered & sorted queue
  const displayedQueue = useMemo(() => {
    let list = queue.map((item, originalIndex) => ({ ...item, originalIndex }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q));
    }

    if (filterStatus !== 'all') {
      list = list.filter((it) => {
        if (filterStatus === 'pending') return it.status === 'pending' || !it.status;
        return it.status === filterStatus;
      });
    }

    if (sortBy === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sortBy === 'name_desc') {
      list.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
    }

    return list;
  }, [queue, searchQuery, filterStatus, sortBy]);

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* ─── ACTION SLOT (TOOLBAR ĐỈNH) ─── */}
      <EbookStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          {converting ? (
            <button
              type="button"
              data-testid="converter-stop-btn"
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
              data-testid="converter-start-btn"
              onClick={handleStartConvert}
              disabled={queue.length === 0}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">sync_alt</span>
              <span>{`${t('ebookStudio.converter.startBtn')} (${queue.length})`}</span>
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
            {/* 1. Nguồn file / folder */}
            <DualSourcePicker
              selectedPath={sourceDir}
              selectedFiles={inputFiles}
              onSelectFolder={handleSelectFolder}
              onSelectFiles={handleSelectFiles}
              onClear={handleClear}
              disabled={converting}
              folderLabel={t('ebookStudio.converter.folderLabel')}
              filesLabel={t('ebookStudio.converter.filesLabel')}
              hint={t('ebookStudio.converter.pickerHint')}
            />

            {/* 2. Định dạng đích chuyển sang */}
            <div className="space-y-2">
              <SectionTitle as="p">
                {t('ebookStudio.converter.formatTitle', 'Định dạng')}
              </SectionTitle>
              <div className="grid grid-cols-4 gap-1.5">
                {TARGET_FORMATS.map((fmt) => {
                  const isSelected = targetFormat === fmt.id;
                  const label = fmt.labelKey ? t(fmt.labelKey) : fmt.title;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setTargetFormat(fmt.id)}
                      disabled={converting}
                      aria-pressed={isSelected}
                      className={`h-9 rounded-xl border px-2 flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 select-none ${
                        fmt.id === 'folder' ? 'col-span-4' : ''
                      } ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'border-outline-variant/25 bg-surface-container-high/50 font-medium text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[16px] leading-none shrink-0 ${isSelected ? 'text-primary' : fmt.iconColor}`}>
                        {fmt.icon}
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Cấu hình */}
            <div className="space-y-2.5 pt-3 border-t border-outline-variant/15">
              <SectionTitle as="p">
                {t('ebookStudio.converter.configTitle', 'Cấu hình')}
              </SectionTitle>

              <RotateDoublePageOption
                checked={Boolean(options.rotateDoublePage)}
                onChange={(rotateDoublePage) => setOptions((prev) => ({ ...prev, rotateDoublePage }))}
                disabled={converting}
                bordered={false}
              />
            </div>

            {/* 3.5. Công cụ biên dịch MOBI */}
            {targetFormat === 'mobi' && (
              <div className="space-y-2 pt-3 border-t border-outline-variant/15">
                <SectionTitle as="p">
                  {t('ebookStudio.converter.compilerSectionTitle', 'Công cụ biên dịch')}
                </SectionTitle>
                <KindleGenCompilerCard disabled={converting} />
              </div>
            )}

            </>

            )}


            {sidebarTab === 'output' && (
              <>
                {/* 4. Thư mục xuất & tùy chọn đầu ra (đồng bộ OutputDestinationSelector) */}
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
                  disabled={converting}
                  radioName="converter-output-destination"
                  showOpenFolderAfter={true}
                  openFolderAfter={openFolderAfter}
                  onOpenFolderAfterChange={setOpenFolderAfter}
                  warning={outputWarning}
                  warningMessage={outputWarningMsg}
                  extraOptions={
                    <div className="pt-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface select-none">
                        <input
                          type="checkbox"
                          checked={skipExisting}
                          onChange={(e) => setSkipExisting(e.target.checked)}
                          disabled={converting}
                          className="rounded accent-primary"
                        />
                        <span>{t('ebookStudio.converter.skipExisting')}</span>
                      </label>
                      <p className="ml-5 text-[10px] text-on-surface-variant/70">
                        {t('ebookStudio.converter.skipExistingDesc')}
                      </p>
                    </div>
                  }
                />
              </>
            )}


            {/* 5. Thẻ thống kê tổng quan (đồng bộ Tools Studio) */}
            <div className="mt-auto pt-2">
              <div
                data-testid="converter-overview-card"
                className="rounded-xl border border-primary/15 bg-primary/5 p-3"
              >
                <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                  <span>{t('ebookStudio.overview.title')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.totalFiles')}</span>
                  <span className="font-bold text-on-surface text-right tabular-nums">
                    {stats.total > 0 ? stats.total : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.pending')}</span>
                  <span className="font-bold text-primary text-right tabular-nums">
                    {stats.total > 0 ? stats.pending : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.completed')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">
                    {stats.total > 0 ? stats.completed : '—'}
                  </span>
                  {stats.skipped > 0 && (
                    <>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.skipped')}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400 text-right tabular-nums">
                        {stats.skipped}
                      </span>
                    </>
                  )}
                  {stats.error > 0 && (
                    <>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.errors')}</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 text-right tabular-nums">
                        {stats.error}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2.5 pt-2 border-t border-primary/10 text-[10px] text-on-surface-variant/75 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                      <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                    </span>
                    <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('ebookStudio.overview.converterTip')}</span>
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

      {/* ─── MAIN PANEL / BATCH QUEUE (PANEL PHẢI) ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        {/* Progress Bar khi đang chuyển đổi */}
        {converting && globalProgress && (
          <div className="mb-3 space-y-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 shrink-0">
            <div className="flex justify-between text-xs text-on-surface">
              <span className="truncate font-medium">{globalProgress.message || t('ebookStudio.packaging.processing')}</span>
              <span className="font-mono text-primary font-semibold">
                {globalProgress.index}/{globalProgress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    globalProgress.percent != null
                      ? Math.min(100, Math.max(0, globalProgress.percent))
                      : Math.round(((globalProgress.index || 1) / (globalProgress.total || 1)) * 100)
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Toolbar: filter chips, search, sort */}
        {queue.length > 0 && (
          <div className="mb-3 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SearchableSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  size="sm"
                  showPlaceholderOption={false}
                  className="min-w-[11.5rem]"
                  options={[
                    { value: 'all', label: `${t('ebookStudio.converter.filterAll')} (${stats.total})`, icon: 'filter_list' },
                    { value: 'pending', label: `${t('ebookStudio.converter.filterPending')} (${stats.pending})`, icon: 'hourglass_empty' },
                    { value: 'processing', label: `${t('ebookStudio.converter.filterProcessing')} (${stats.processing})`, icon: 'progress_activity' },
                    { value: 'completed', label: `${t('ebookStudio.converter.filterCompleted')} (${stats.completed})`, icon: 'check_circle' },
                    { value: 'skipped', label: `${t('ebookStudio.converter.filterSkipped')} (${stats.skipped})`, icon: 'skip_next' },
                    { value: 'error', label: `${t('ebookStudio.converter.filterError')} (${stats.error})`, icon: 'error' },
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('ebookStudio.packaging.searchPlaceholder')}
                    aria-label={t('ebookStudio.packaging.searchPlaceholder')}
                    className="h-8 w-44 sm:w-52 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
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
                    { value: 'name_asc', label: t('ebookStudio.converter.sortNameAsc'), materialIcon: 'sort_by_alpha' },
                    { value: 'name_desc', label: t('ebookStudio.converter.sortNameDesc'), materialIcon: 'sort_by_alpha' },
                  ]}
                  size="sm"
                  showPlaceholderOption={false}
                  className="min-w-[11.5rem]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Khung danh sách hàng đợi */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {queue.length === 0 ? (
            <EmptyState
              icon="sync_alt"
              title={t('ebookStudio.converter.queueEmpty')}
              description={t('ebookStudio.converter.queueEmptySub')}
            />
          ) : displayedQueue.length === 0 ? (
            <EmptyState
              icon="filter_list_off"
              title={t('crop.filterNoMatch') || 'Không tìm thấy tệp phù hợp bộ lọc'}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar space-y-0.5">
              {displayedQueue.map((item) => (
                <li
                  key={item.path + item.originalIndex}
                  className="mx-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-container-high transition-colors group select-none"
                >
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant/70 group-hover:text-primary transition-colors shrink-0">
                    {item.isDir ? 'folder' : 'description'}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-on-surface">{item.name}</p>
                    <p className="line-clamp-2 break-all font-mono text-[10px] text-on-surface-variant/60 leading-tight">{item.path}</p>
                    {item.status === 'error' && item.error && (
                      <p
                        className="truncate text-[11px] text-error font-medium select-text mt-0.5"
                        data-tooltip={item.error}
                      >
                        {item.error}
                      </p>
                    )}
                  </div>

                  {/* Badges trạng thái */}
                  <div className="flex items-center gap-2 shrink-0">
                    {(!item.status || item.status === 'pending') && (
                      <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[11px] text-on-surface-variant font-medium">
                        {t('ebookStudio.converter.statusWaiting')}
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary animate-pulse">
                        {t('ebookStudio.converter.statusConverting')}
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        ✓ {t('ebookStudio.converter.statusCompleted')}
                      </span>
                    )}
                    {item.status === 'skipped' && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        {t('ebookStudio.converter.statusSkipped')}
                      </span>
                    )}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopyError(item.error, `${item.path}_${item.originalIndex}`)}
                          className="rounded-full bg-error/15 hover:bg-error/25 px-2.5 py-0.5 text-[11px] font-semibold text-error transition-colors cursor-pointer flex items-center gap-1"
                          data-tooltip={
                            copiedKey === `${item.path}_${item.originalIndex}`
                              ? t('ebookStudio.converter.copiedError')
                              : (item.error ? t('ebookStudio.converter.copyError') : t('ebookStudio.converter.statusError'))
                          }
                          aria-label={t('ebookStudio.converter.copyError')}
                        >
                          <span>{t('ebookStudio.converter.statusError')}</span>
                        </button>

                        {item.error && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyError(item.error, `${item.path}_${item.originalIndex}`);
                            }}
                            data-tooltip={
                              copiedKey === `${item.path}_${item.originalIndex}`
                                ? t('ebookStudio.converter.copiedError')
                                : t('ebookStudio.converter.copyError')
                            }
                            aria-label={t('ebookStudio.converter.copyError')}
                            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-error/15 text-error transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {copiedKey === `${item.path}_${item.originalIndex}` ? 'check' : 'content_copy'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {item.outputPath && api?.showItemInFolder && (
                      <button
                        type="button"
                        onClick={() => api.showItemInFolder(item.outputPath)}
                        data-tooltip={t('ebookStudio.converter.openFile')}
                        aria-label={t('ebookStudio.converter.openFile')}
                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">folder_open</span>
                      </button>
                    )}

                    {!converting && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(item.originalIndex)}
                        aria-label={t('tools.remove') || 'Xóa'}
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
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
