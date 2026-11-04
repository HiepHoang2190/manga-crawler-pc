import { useState, useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, useToolsSidebarResize, EmptyState } from '../../../shared';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

export default function EbookToolsSubTab({
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

  const [activeTool, setActiveTool] = useState('combine'); // 'combine' | 'split'

  // Combine mode states
  const [combineFiles, setCombineFiles] = useState([]);
  const [combineOutputName, setCombineOutputName] = useState('');

  // Split mode states
  const [splitSourceFile, setSplitSourceFile] = useState(null);
  const [splitBaseName, setSplitBaseName] = useState('');
  const [splitMaxMb, setSplitMaxMb] = useState(200);

  // Common states
  const [outputDir, setOutputDir] = useState(savePath);
  const openFolderAfter = true;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const dragIndexRef = useRef(null);

  useEffect(() => {
    setOutputDir((prev) => (!prev || prev === savePath ? savePath : prev));
  }, [savePath]);

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  // Combine progress subscription
  useEffect(() => {
    if (!running || activeTool !== 'combine' || !api?.subscribeCombineCbzProgress) return undefined;
    const unsub = api.subscribeCombineCbzProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [running, activeTool, api]);

  // Split progress subscription
  useEffect(() => {
    if (!running || activeTool !== 'split' || !api?.subscribeSplitCbzProgress) return undefined;
    const unsub = api.subscribeSplitCbzProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [running, activeTool, api]);

  // --- Handlers for Combine ---
  const handleAddCombineFiles = async () => {
    if (!api?.selectCbzFiles) return;
    const paths = await api.selectCbzFiles();
    if (!Array.isArray(paths) || !paths.length) return;
    const newEntries = paths
      .filter((p) => typeof p === 'string' && p.toLowerCase().endsWith('.cbz'))
      .map((p) => {
        const sep = p.includes('/') ? '/' : '\\';
        const parts = p.split(sep);
        return { path: p, name: parts[parts.length - 1] };
      });
    if (!newEntries.length) return;
    setCombineFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...newEntries.filter((e) => !existing.has(e.path))];
    });
    setResult(null);
  };

  const handleRemoveCombineFile = (index) => {
    if (running) return;
    setCombineFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const handleClearCombineFiles = () => {
    if (running) return;
    setCombineFiles([]);
    setResult(null);
  };

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setCombineFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      dragIndexRef.current = index;
      return next;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragIndexRef.current = null;
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
  };

  // --- Handlers for Split ---
  const handleSelectSplitFile = async () => {
    if (!api?.selectCbzFiles) return;
    const paths = await api.selectCbzFiles();
    if (!Array.isArray(paths) || !paths.length) return;
    const filePath = paths[0];
    if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.cbz')) return;
    const sep = filePath.includes('/') ? '/' : '\\';
    const parts = filePath.split(sep);
    const name = parts[parts.length - 1];
    let sizeMb = null;
    if (api?.getFileSize) {
      try {
        const r = await api.getFileSize(filePath);
        if (r?.ok && typeof r.size === 'number') {
          sizeMb = Math.round((r.size / (1024 * 1024)) * 10) / 10;
        }
      } catch {
        /* ignore */
      }
    }
    setSplitSourceFile({ path: filePath, name, sizeMb });
    setSplitBaseName('');
    setResult(null);
  };

  const handleClearSplitFile = () => {
    if (running) return;
    setSplitSourceFile(null);
    setResult(null);
  };

  // --- Common Handlers ---
  const handleSelectOutputDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  const handleStartCombine = async () => {
    if (!api?.combineCbz || combineFiles.length < 2) return;
    setResult(null);
    setProgress(null);
    setRunning(true);
    try {
      const payload = {
        inputFiles: combineFiles.map((f) => f.path),
        ...(outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(combineOutputName.trim() ? { outputFileName: combineOutputName.trim() } : {}),
      };
      const r = await api.combineCbz(payload);
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir =
          outputDir.trim() ||
          (r.outputFile
            ? (() => {
                const sep = r.outputFile.includes('/') ? '/' : '\\';
                const parts = r.outputFile.split(sep);
                parts.pop();
                return parts.join(sep) || sep;
              })()
            : null);
        if (targetDir) await api.openPath(targetDir);
      }
    } catch (e) {
      setResult({ ok: false, error: String(e?.message || e) || t('app.log.fetchErrorUnknown') });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleStartSplit = async () => {
    if (!api?.splitCbz || !splitSourceFile) return;
    setResult(null);
    setProgress(null);
    setRunning(true);
    try {
      const r = await api.splitCbz({
        inputFile: splitSourceFile.path,
        maxMbPerFile: Math.min(4096, Math.max(1, splitMaxMb)),
        ...(outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(splitBaseName.trim() ? { outputBaseName: splitBaseName.trim() } : {}),
      });
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir =
          outputDir.trim() ||
          (() => {
            const p = splitSourceFile.path;
            const sep = p.includes('/') ? '/' : '\\';
            const parts = p.split(sep);
            parts.pop();
            return parts.join(sep) || sep;
          })();
        if (targetDir) await api.openPath(targetDir);
      }
    } catch (e) {
      setResult({ ok: false, error: String(e?.message || e) || t('app.log.fetchErrorUnknown') });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const estimatedSplitParts = useMemo(() => {
    if (!splitSourceFile?.sizeMb || !splitMaxMb) return 1;
    return Math.max(1, Math.ceil(splitSourceFile.sizeMb / splitMaxMb));
  }, [splitSourceFile?.sizeMb, splitMaxMb]);

  const defaultBaseName = useMemo(() => {
    if (!splitSourceFile?.name) return 'One Piece Tap 01';
    return splitSourceFile.name.replace(/\.[^/.]+$/, '');
  }, [splitSourceFile?.name]);

  const resolvedPrefix = splitBaseName.trim() || defaultBaseName;

  const previewSplitParts = useMemo(() => {
    const totalParts = Math.max(2, estimatedSplitParts || 2);
    const width = Math.max(2, String(totalParts).length);
    const p1 = `${resolvedPrefix} - Part ${String(1).padStart(width, '0')}.cbz`;
    const p2 = `${resolvedPrefix} - Part ${String(2).padStart(width, '0')}.cbz`;
    return { p1, p2, width };
  }, [resolvedPrefix, estimatedSplitParts]);

  const splitPartList = useMemo(() => {
    if (!splitSourceFile) return [];
    const count = Math.max(1, estimatedSplitParts);
    const width = Math.max(2, String(count).length);
    const avgMb = splitSourceFile.sizeMb
      ? Math.min(splitMaxMb, Math.round((splitSourceFile.sizeMb / count) * 10) / 10)
      : splitMaxMb;

    const list = [];
    for (let i = 1; i <= count; i++) {
      const num = String(i).padStart(width, '0');
      list.push({
        partNum: num,
        fileName: `${resolvedPrefix} - Part ${num}.cbz`,
        estimatedSize: `~${avgMb} MB`,
      });
    }
    return list;
  }, [splitSourceFile, estimatedSplitParts, resolvedPrefix, splitMaxMb]);

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((100 * progress.done) / progress.total))
      : null;

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* ─── ACTION SLOT (TOOLBAR ĐỈNH) ─── */}
      <EbookStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          {activeTool === 'combine' ? (
            <button
              type="button"
              data-testid="combine-start-btn"
              onClick={handleStartCombine}
              disabled={running || combineFiles.length < 2}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {running ? 'hourglass_top' : 'merge'}
              </span>
              <span>
                {running
                  ? t('ebookStudio.tools.combining', 'Đang gộp...')
                  : `${t('ebookStudio.tools.startCombine', 'Bắt Đầu Gộp')} (${combineFiles.length})`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="split-cbz-start-btn"
              onClick={handleStartSplit}
              disabled={running || !splitSourceFile}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {running ? 'hourglass_top' : 'call_split'}
              </span>
              <span>
                {running
                  ? t('ebookStudio.tools.splitting', 'Đang cắt...')
                  : t('ebookStudio.tools.startSplit', 'Bắt Đầu Cắt')}
              </span>
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
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {/* 1. Chọn chế độ tiện ích */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.tools.toolTitle', 'Chế độ tiện ích')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!running) {
                      setActiveTool('combine');
                      setResult(null);
                    }
                  }}
                  disabled={running}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-all text-left cursor-pointer active:scale-95 ${
                    activeTool === 'combine'
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                      : 'border-outline-variant/25 bg-surface-container-lowest hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-amber-500">
                    <span className="material-symbols-outlined text-[20px]">merge</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface">
                      {t('ebookStudio.tools.combineTitle', 'Gộp CBZ')}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/70 truncate">
                      {t('ebookStudio.tools.combineDesc', 'Ghép nhiều tập thành 1')}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!running) {
                      setActiveTool('split');
                      setResult(null);
                    }
                  }}
                  disabled={running}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-all text-left cursor-pointer active:scale-95 ${
                    activeTool === 'split'
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                      : 'border-outline-variant/25 bg-surface-container-lowest hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-cyan-400">
                    <span className="material-symbols-outlined text-[20px]">call_split</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface">
                      {t('ebookStudio.tools.splitTitle', 'Cắt CBZ')}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/70 truncate">
                      {t('ebookStudio.tools.splitDesc', 'Chia nhỏ theo MB')}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Nguồn file */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.converter.col1Title', 'Nguồn tệp')}
              </p>
              {activeTool === 'combine' ? (
                <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">
                      {t('ebookStudio.tools.fileListTitle', { count: combineFiles.length }, `File đã chọn (${combineFiles.length})`)}
                    </span>
                    {combineFiles.length > 0 && !running && (
                      <button
                        type="button"
                        onClick={handleClearCombineFiles}
                        className="text-[11px] font-medium text-error hover:underline cursor-pointer"
                      >
                        {t('ebookStudio.tools.clearAll', 'Xóa tất cả')}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCombineFiles}
                    disabled={running}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-high/60 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-cyan-400">add_box</span>
                    <span>{t('ebookStudio.tools.addCbzFiles', 'Thêm File CBZ')}</span>
                  </button>
                  <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                    {t('ebookStudio.tools.combineHint', 'Chọn ít nhất 2 file CBZ để bắt đầu gộp. Có thể kéo thả để sắp xếp thứ tự.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">
                      {splitSourceFile ? '1 tệp đã chọn' : 'Chưa chọn tệp'}
                    </span>
                    {splitSourceFile && !running && (
                      <button
                        type="button"
                        onClick={handleClearSplitFile}
                        className="text-[11px] font-medium text-error hover:underline cursor-pointer"
                      >
                        {t('tools.remove', 'Gỡ bỏ')}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectSplitFile}
                    disabled={running}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-high/60 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-cyan-400">file_open</span>
                    <span>
                      {splitSourceFile
                        ? t('ebookStudio.packaging.change', 'Đổi file CBZ khác...')
                        : t('ebookStudio.tools.selectCbzFile', 'Chọn File CBZ')}
                    </span>
                  </button>
                  <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                    {t('ebookStudio.tools.splitHint', 'Chọn 1 file CBZ để chia tách thành các tập nhỏ hơn.')}
                  </p>
                </div>
              )}
            </div>

            {/* 3. Cấu hình */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                {t('ebookStudio.converter.configTitle', 'Cấu hình')}
              </p>
              <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                {activeTool === 'combine' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface">
                        {t('ebookStudio.tools.outputFileName', 'Tên file sau khi gộp')}
                      </label>
                      <input
                        type="text"
                        value={combineOutputName}
                        onChange={(e) => setCombineOutputName(e.target.value)}
                        placeholder={t('ebookStudio.tools.outputFileNamePlaceholder', 'Tùy chọn (mặc định = tên file đầu)')}
                        disabled={running}
                        className="w-full rounded-lg border border-outline-variant/30 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
                      <span>{t('ebookStudio.tools.dragHint', 'Kéo thả các dòng trong danh sách bên phải để sắp xếp thứ tự các chương/tập trước khi gộp.')}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-on-surface">
                          {t('ebookStudio.tools.outputBaseName', 'Tiền tố tên file cắt')}
                        </label>
                        {splitBaseName.trim() && !running && (
                          <button
                            type="button"
                            onClick={() => setSplitBaseName('')}
                            className="text-[11px] text-on-surface-variant/70 hover:text-primary transition-colors cursor-pointer"
                          >
                            {t('ebookStudio.tools.splitResetPrefix', 'Đặt lại mặc định')}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={splitBaseName}
                        onChange={(e) => setSplitBaseName(e.target.value)}
                        placeholder={t('ebookStudio.tools.outputBaseNamePlaceholder', 'Tùy chọn tiền tố (mặc định = tên file gốc)')}
                        disabled={running}
                        className="w-full rounded-lg border border-outline-variant/30 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none"
                      />

                      {/* Live Name Preview & Example Box */}
                      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high/60 p-2.5 text-[11px] space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-on-surface-variant">
                          <span className="material-symbols-outlined text-[15px] text-primary">visibility</span>
                          <span>
                            {splitBaseName.trim()
                              ? t('ebookStudio.tools.splitLiveResult', 'Tên tệp kết quả tạo ra:')
                              : splitSourceFile
                              ? t('ebookStudio.tools.splitDefaultResult', 'Tên mặc định (theo file gốc):')
                              : t('ebookStudio.tools.splitSamplePrefix', 'Ví dụ mẫu minh họa:')}
                          </span>
                        </div>
                        <div className="font-mono text-primary text-[11px] font-semibold truncate">
                          {previewSplitParts.p1}
                        </div>
                        <div className="font-mono text-primary/70 text-[10px] truncate">
                          {previewSplitParts.p2}...
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface">
                        {t('ebookStudio.tools.maxMb', 'Dung lượng tối đa mỗi tập (MB)')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="4096"
                          value={splitMaxMb}
                          onChange={(e) => setSplitMaxMb(Math.max(1, Number(e.target.value) || 200))}
                          disabled={running}
                          className="w-28 rounded-lg border border-outline-variant/30 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none font-mono"
                        />
                        <span className="text-xs text-on-surface-variant font-medium">MB / file</span>
                      </div>
                    </div>
                    {splitSourceFile?.sizeMb && (
                      <div className="flex items-center gap-2 rounded-lg bg-cyan-500/10 p-2.5 text-xs text-cyan-600 dark:text-cyan-400">
                        <span className="material-symbols-outlined text-[18px] shrink-0">calculate</span>
                        <span>{t('ebookStudio.tools.estimatedParts', { count: estimatedSplitParts }, `Dự kiến chia thành ~${estimatedSplitParts} phần`)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 4. Thư mục đích */}
            <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3.5">
              <span className="text-xs font-semibold text-on-surface">
                {t('ebookStudio.packaging.outputDest', 'Đích lưu tệp')}
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder={savePath || t('ebookStudio.packaging.defaultSaveDir')}
                  disabled={running}
                  className="h-9 min-w-0 flex-1 rounded-md border-none bg-surface-container-highest px-3 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-mono truncate"
                />
                {outputDir && !running && (
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
                  disabled={running}
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

      {/* ─── MAIN PANEL (PANEL PHẢI) ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        {/* Progress Bar khi đang xử lý */}
        {running && (
          <div className="mb-3 space-y-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 shrink-0">
            <div className="flex justify-between text-xs text-on-surface">
              <span className="truncate font-medium">
                {progress?.label || (activeTool === 'combine' ? t('ebookStudio.tools.combining') : t('ebookStudio.tools.splitting'))}
              </span>
              <span className="font-mono text-primary font-semibold">
                {progressPct != null ? `${progressPct}%` : ''}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progressPct || 20}%` }}
              />
            </div>
          </div>
        )}

        {/* Kết quả thông báo */}
        {result && !running && (
          <div
            className={`mb-3 rounded-xl p-3 text-xs border shrink-0 ${
              result.ok
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-error/10 text-error border-error/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">
                  {result.ok ? 'check_circle' : 'error'}
                </span>
                <span className="font-semibold">
                  {result.ok
                    ? activeTool === 'combine'
                      ? t('combineTab.successMsg', { file: result.outputFile || '' })
                      : 'Đã cắt file CBZ thành công!'
                    : result.error}
                </span>
              </div>
              {result.ok && result.outputFile && api?.showItemInFolder && (
                <button
                  type="button"
                  onClick={() => api.showItemInFolder(result.outputFile)}
                  className="px-2 py-1 rounded bg-surface text-on-surface text-[11px] font-medium border border-outline-variant/30 hover:bg-surface-container-high cursor-pointer"
                >
                  Mở vị trí tệp
                </button>
              )}
            </div>
          </div>
        )}

        {/* Toolbar chính */}
        <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
              {activeTool === 'combine'
                ? t('ebookStudio.tools.fileListTitle', { count: combineFiles.length }, `Danh sách tệp gộp (${combineFiles.length})`)
                : t('ebookStudio.tools.splitFileTitle', 'Thông tin tệp cần cắt')}
            </span>
          </div>

          {activeTool === 'combine' && combineFiles.length > 0 && (
            <span className="text-[11px] text-on-surface-variant/60 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">drag_indicator</span>
              <span>{t('ebookStudio.tools.dragHint', 'Kéo thả để đổi thứ tự')}</span>
            </span>
          )}
        </div>

        {/* Khung nội dung chính */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {activeTool === 'combine' ? (
            combineFiles.length === 0 ? (
              <EmptyState
                icon="merge"
                title={t('combineTab.emptyPrompt', 'Chưa có file CBZ nào')}
                description={t('ebookStudio.tools.combineHint', 'Bấm nút "Thêm File CBZ" ở cột bên trái để nạp các file cần gộp.')}
              />
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar space-y-1">
                {combineFiles.map((file, idx) => (
                  <li
                    key={file.path}
                    draggable={!running}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    className="mx-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-container-high transition-colors group select-none cursor-grab active:cursor-grabbing bg-surface-container-lowest/80 border border-outline-variant/10"
                  >
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50 group-hover:text-primary transition-colors shrink-0">
                      drag_indicator
                    </span>

                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-container-high font-mono text-[10px] font-bold text-on-surface-variant">
                      {idx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-on-surface">{file.name}</p>
                      <p className="truncate font-mono text-[10px] text-on-surface-variant/60">{file.path}</p>
                    </div>

                    {!running && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCombineFile(idx)}
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-all cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : !splitSourceFile ? (
            <div className="flex flex-1 flex-col items-center justify-center py-10 px-4">
              <EmptyState
                icon="call_split"
                title={t('splitTab.promptSelect', 'Chưa chọn file CBZ cần cắt')}
                description={t('ebookStudio.tools.splitHint', 'Bấm nút "Chọn File CBZ" ở cột bên trái để chọn file cần chia nhỏ.')}
                action={
                  <div className="mt-2 rounded-xl border border-outline-variant/15 bg-surface-container-high/40 p-3.5 text-left space-y-1.5 max-w-md shadow-xs select-text">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                      <span>{t('ebookStudio.tools.splitRuleTitle', 'Quy tắc đặt tên tệp chia nhỏ:')}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
                      {t('ebookStudio.tools.splitRuleDesc', 'Tệp CBZ được chia nhỏ sẽ có định dạng: [Tiền tố] - Part 01.cbz, [Tiền tố] - Part 02.cbz... Bạn có thể tùy biến tiền tố ở sidebar bên trái hoặc để trống để tự động lấy theo tên tệp gốc.')}
                    </p>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="p-6 space-y-4 max-w-xl mx-auto my-auto w-full overflow-y-auto custom-scrollbar">
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                    <span className="material-symbols-outlined text-[28px]">archive</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface break-words">{splitSourceFile.name}</p>
                    <p className="text-xs font-mono text-on-surface-variant/70 break-all mt-0.5">{splitSourceFile.path}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/15 text-xs">
                  <div className="rounded-xl bg-surface-container-high/50 p-3">
                    <span className="text-on-surface-variant/70 text-[11px]">Dung lượng gốc</span>
                    <p className="text-base font-bold font-mono text-on-surface mt-0.5">
                      {splitSourceFile.sizeMb ? `${splitSourceFile.sizeMb} MB` : 'Đang tính...'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-container-high/50 p-3">
                    <span className="text-on-surface-variant/70 text-[11px]">Dự kiến chia</span>
                    <p className="text-base font-bold font-mono text-primary mt-0.5">
                      ~{estimatedSplitParts} phần ({splitMaxMb} MB/file)
                    </p>
                  </div>
                </div>
              </div>

              {/* Danh sách tệp kết quả dự kiến sau khi split */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">format_list_numbered</span>
                    <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                      {t('ebookStudio.tools.splitPartsListTitle', { count: estimatedSplitParts }, `Danh sách tệp dự kiến sau khi cắt (~${estimatedSplitParts} phần)`)}
                    </h4>
                  </div>
                  <span className="text-[11px] text-primary font-mono font-semibold truncate max-w-[180px]">
                    {splitBaseName.trim() ? `"${splitBaseName.trim()}"` : `"${defaultBaseName}"`}
                  </span>
                </div>

                <ul className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {splitPartList.map((part) => (
                    <li
                      key={part.partNum}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high/40 px-3 py-2 text-xs border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[10px] font-bold text-primary">
                          {part.partNum}
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60 shrink-0">
                          description
                        </span>
                        <span className="font-mono font-medium text-on-surface truncate">
                          {part.fileName}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-on-surface-variant/70">
                        {part.estimatedSize}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="text-[10.5px] text-on-surface-variant/60 leading-relaxed pt-1 border-t border-outline-variant/10">
                  * {t('ebookStudio.tools.splitPartsListHint', 'Tên tệp và số phần được tính toán trực tiếp theo tiền tố và dung lượng mỗi phần (MB). Các chương ảnh được giữ nguyên vẹn không bị xé đôi.')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
