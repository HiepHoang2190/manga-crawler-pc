import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DualSourcePicker from './DualSourcePicker';
import { ResizeSplitter, useToolsSidebarResize, SearchableSelect, EmptyState } from '../../../shared';
import { useI18n } from '../../../context/I18nContext';
import KindleGenCompilerCard from './KindleGenCompilerCard';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

const TARGET_FORMATS = [
  { id: 'cbz', title: 'CBZ', desc: 'Comic Archive', icon: 'archive', color: 'text-amber-500 border-amber-500' },
  { id: 'pdf', title: 'PDF', desc: 'Tài liệu di động', icon: 'picture_as_pdf', color: 'text-red-500 border-red-500' },
  { id: 'epub', title: 'EPUB', desc: 'Sách chuẩn mở', icon: 'menu_book', color: 'text-emerald-500 border-emerald-500' },
  { id: 'mobi', title: 'MOBI', desc: 'Kindle Ebook', icon: 'tablet_android', color: 'text-orange-500 border-orange-500' },
  { id: 'folder', title: 'Thư Mục Ảnh', desc: 'Trích xuất ảnh gốc', icon: 'photo_library', color: 'text-cyan-400 border-cyan-400' },
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
  const [outputDir, setOutputDir] = useState('');
  const openFolderAfter = true;
  const [options, setOptions] = useState({
    rotateDoublePage: false,
  });


  const [queue, setQueue] = useState([]);
  const [converting, setConverting] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(null);

  useEffect(() => {
    onRunningChange?.(converting);
  }, [converting, onRunningChange]);

  // Search, filter, and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'processing' | 'completed' | 'error'
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
    if (dir) setOutputDir(dir);
  };

  const handleRemoveFromQueue = (indexToRemove) => {
    if (converting) return;
    setQueue((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleStartConvert = async () => {
    if (!queue.length || !api?.ebookBatchConvert) return;
    setConverting(true);

    const effectiveOutputDir = outputDir || savePath;
    const filePaths = queue.map((q) => q.path);

    try {
      const res = await api.ebookBatchConvert({
        inputPaths: filePaths,
        targetFormat,
        outputDir: effectiveOutputDir,
        options,
      });

      if (res?.ok && Array.isArray(res.results)) {
        setQueue((prev) =>
          prev.map((item) => {
            const match = res.results.find((r) => r.input === item.path);
            if (match) {
              return {
                ...item,
                status: match.ok ? 'completed' : 'error',
                outputPath: match.outputPath,
                error: match.error,
              };
            }
            return item;
          })
        );

        if (openFolderAfter && api?.showItemInFolder && res.results[0]?.outputPath) {
          api.showItemInFolder(res.results[0].outputPath);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConverting(false);
    }
  };

  const handleCancel = async () => {
    if (api?.ebookCancel) {
      await api.ebookCancel();
      setConverting(false);
    }
  };

  // Queue stats
  const stats = useMemo(() => {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let error = 0;

    for (const it of queue) {
      if (it.status === 'processing') processing++;
      else if (it.status === 'completed') completed++;
      else if (it.status === 'error') error++;
      else pending++;
    }

    return { total: queue.length, pending, processing, completed, error };
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
          <button
            type="button"
            data-testid="converter-start-btn"
            onClick={handleStartConvert}
            disabled={converting || queue.length === 0}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {converting ? 'hourglass_top' : 'sync_alt'}
            </span>
            <span>
              {converting
                ? t('ebookStudio.packaging.processing')
                : `${t('ebookStudio.converter.startBtn')} (${queue.length})`}
            </span>
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!converting || !api?.ebookCancel}
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.converter.formatTitle', 'Định dạng')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TARGET_FORMATS.map((fmt) => {
                  const isSelected = targetFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setTargetFormat(fmt.id)}
                      disabled={converting}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-all text-left cursor-pointer active:scale-95 ${
                        fmt.id === 'folder' ? 'col-span-2' : ''
                      } ${
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

            {/* 3. Cấu hình */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.converter.configTitle', 'Cấu hình')}
              </p>
              <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                {targetFormat === 'cbz' && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                    <span className="material-symbols-outlined text-[18px]">archive</span>
                    <span>{t('ebookStudio.converter.cbzDesc', 'Đóng gói lưu trữ truyện tranh chuẩn CBZ (Comic Archive), tương thích mọi phần mềm đọc truyện.')}</span>
                  </div>
                )}
                {targetFormat === 'pdf' && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    <span>{t('ebookStudio.converter.pdfDesc', 'Xuất tệp tài liệu PDF chất lượng cao, tối ưu hiển thị trên mọi thiết bị và ứng dụng đọc.')}</span>
                  </div>
                )}
                {targetFormat === 'epub' && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>{t('ebookStudio.converter.epubDesc', 'Định dạng EPUB 3 chuẩn Reflowable, tối ưu 100% cho máy đọc sách Kindle (Send to Kindle), Kobo, Boox và Apple Books.')}</span>
                  </div>
                )}
                {targetFormat === 'mobi' && (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 p-2.5 text-xs text-orange-600 dark:text-orange-400">
                    <span className="material-symbols-outlined text-[18px]">tablet_android</span>
                    <span>{t('ebookStudio.converter.mobiDesc', 'Định dạng MOBI chuyên dụng cho máy đọc sách Kindle đời cũ và ứng dụng Kindle.')}</span>
                  </div>
                )}
                {targetFormat === 'folder' && (
                  <div className="flex items-center gap-2 rounded-lg bg-cyan-500/10 p-2.5 text-xs text-cyan-600 dark:text-cyan-400">
                    <span className="material-symbols-outlined text-[18px]">photo_library</span>
                    <span>{t('ebookStudio.converter.folderDesc', 'Giải nén và trích xuất toàn bộ hình ảnh gốc từ tệp sách vào thư mục tương ứng.')}</span>
                  </div>
                )}

                <div className="space-y-0.5 pt-2 border-t border-outline-variant/15">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface hover:text-primary transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(options.rotateDoublePage)}
                      onChange={(e) => setOptions((prev) => ({ ...prev, rotateDoublePage: e.target.checked }))}
                      disabled={converting}
                      className="rounded accent-primary"
                    />
                    <span className="font-medium">
                      {t('ebookStudio.packaging.rotateDoublePage', 'Tự động xoay trang đôi theo chiều ngang')}
                    </span>
                  </label>
                  <p className="text-[11px] text-on-surface-variant/60 pl-5 leading-normal">
                    {t(
                      'ebookStudio.packaging.rotateDoublePageDesc',
                      'Tự động nhận diện trang đôi (tỷ lệ rộng/cao ≥ 1.2) và xoay ngang 90° tối ưu khi đọc truyện.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 3.5. Công cụ biên dịch MOBI */}
            {targetFormat === 'mobi' && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                  {t('ebookStudio.converter.compilerSectionTitle', 'Công cụ biên dịch')}
                </p>
                <KindleGenCompilerCard disabled={converting} />
              </div>
            )}

            {/* 4. Thư mục đích */}
            <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3.5">
              <span className="text-xs font-semibold text-on-surface">
                {t('ebookStudio.converter.outputDest')}
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder={savePath || t('ebookStudio.packaging.defaultSaveDir')}
                  disabled={converting}
                  className="h-9 min-w-0 flex-1 rounded-md border-none bg-surface-container-highest px-3 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-mono truncate"
                />
                {outputDir && !converting && (
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
                  disabled={converting}
                  aria-label={t('sourcePicker.selectFolder') || 'Chọn thư mục'}
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-container-high text-on-surface transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
                </button>
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
                  width: `${Math.round(((globalProgress.index || 1) / (globalProgress.total || 1)) * 100)}%`,
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
                <div className="flex items-center gap-1 rounded-lg bg-surface-container-highest/60 p-1 text-xs">
                  {[
                    { key: 'all', label: t('ebookStudio.converter.filterAll'), count: stats.total },
                    { key: 'pending', label: t('ebookStudio.converter.filterPending'), count: stats.pending },
                    { key: 'processing', label: t('ebookStudio.converter.filterProcessing'), count: stats.processing },
                    { key: 'completed', label: t('ebookStudio.converter.filterCompleted'), count: stats.completed },
                    { key: 'error', label: t('ebookStudio.converter.filterError'), count: stats.error },
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('ebookStudio.packaging.searchPlaceholder')}
                    className="h-8 w-44 sm:w-52 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
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
                  className="min-w-[10.5rem]"
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
    </div>
  );
}
