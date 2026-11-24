import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, useToolsSidebarResize, EmptyState, SaveDirErrorModal, SectionTitle, OutputDestinationSelector } from '../../../shared';
import { MaxMbLimitInput } from './forms/ConfigFormFields';
import { EbookStudioActionSlot, EbookStudioCenterSlot } from '../EbookStudioActionSlot';

function getParentDir(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const sep = filePath.includes('/') ? '/' : '\\';
  const idx = filePath.lastIndexOf(sep);
  if (idx < 0) return '';
  if (sep === '\\' && idx === 2 && filePath[1] === ':') return filePath.slice(0, 3);
  return filePath.slice(0, idx) || sep;
}

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
  const [sidebarTab, setSidebarTab] = useState('config'); // 'config' | 'output'

  // Combine mode states
  const [combineFiles, setCombineFiles] = useState([]);
  const [combineOutputName, setCombineOutputName] = useState('');

  // Split mode states
  const [splitSourceFile, setSplitSourceFile] = useState(null);
  const [splitBaseName, setSplitBaseName] = useState('');
  const [splitMaxMb, setSplitMaxMb] = useState(200);

  // Common states
  const [inPlace, setInPlace] = useState(true);
  const [outputDir, setOutputDir] = useState('');
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedError, setCopiedError] = useState(false);

  const [outputWarning, setOutputWarning] = useState(false);
  const [outputWarningMsg, setOutputWarningMsg] = useState('');
  const [saveDirErrorModal, setSaveDirErrorModal] = useState(null);
  const copyTimerRef = useRef(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const activeSourceFallback = activeTool === 'combine' ? combineFiles[0]?.path : splitSourceFile?.path;
  const effectiveOutputDir = inPlace
    ? (getParentDir(activeSourceFallback) || (activeSourceFallback ? (savePath || '').trim() : ''))
    : (outputDir || '').trim();

  const handleCopyError = useCallback(async () => {
    const errText = result?.error;
    if (!errText) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(errText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = errText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedError(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedError(false), 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
    }
  }, [result?.error]);

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

  const dragIndexRef = useRef(null);

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
    if (dir) {
      setOutputDir(dir);
      setInPlace(false);
    }
  };

  const resolveTargetDir = (fallbackFile) => {
    if (!inPlace) return (outputDir || '').trim();
    const parent = getParentDir(fallbackFile);
    if (parent) return parent;
    return (savePath || '').trim();
  };

  const handleStartCombine = async () => {
    if (!api?.combineCbz || combineFiles.length < 2) return;

    const targetOut = resolveTargetDir(combineFiles[0]?.path);
    if (!targetOut) {
      const errMsg = t('app.log.needSavePathShort') || 'Vui lòng chọn thư mục lưu tệp.';
      setOutputWarning(true);
      setSidebarTab('output');
      setOutputWarningMsg(errMsg);
      setSaveDirErrorModal({ path: '', message: errMsg });
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
          setSaveDirErrorModal({ path: targetOut, message: errMsg });
          return;
        }
      } catch {
        /* proceed if unexpected error */
      }
    }

    setOutputWarning(false);
    setOutputWarningMsg('');
    setCopiedError(false);
    setResult(null);
    setProgress(null);
    setRunning(true);
    try {
      const payload = {
        inputFiles: combineFiles.map((f) => f.path),
        ...(!inPlace && outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(combineOutputName.trim() ? { outputFileName: combineOutputName.trim() } : {}),
      };
      const r = await api.combineCbz(payload);
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir = (!inPlace && outputDir.trim()) || getParentDir(r.outputFile);
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

    const targetOut = resolveTargetDir(splitSourceFile?.path);
    if (!targetOut) {
      const errMsg = t('app.log.needSavePathShort') || 'Vui lòng chọn thư mục lưu tệp.';
      setOutputWarning(true);
      setSidebarTab('output');
      setOutputWarningMsg(errMsg);
      setSaveDirErrorModal({ path: '', message: errMsg });
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
          setSaveDirErrorModal({ path: targetOut, message: errMsg });
          return;
        }
      } catch {
        /* proceed if unexpected error */
      }
    }

    setOutputWarning(false);
    setOutputWarningMsg('');
    setCopiedError(false);
    setResult(null);
    setProgress(null);
    setRunning(true);
    try {
      const r = await api.splitCbz({
        inputFile: splitSourceFile.path,
        maxMbPerFile: Math.min(4096, Math.max(1, splitMaxMb)),
        ...(!inPlace && outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(splitBaseName.trim() ? { outputBaseName: splitBaseName.trim() } : {}),
      });
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir =
          (!inPlace && outputDir.trim()) || getParentDir(r.outputFiles?.[0] || splitSourceFile.path);
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
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
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
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
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
          {/* Sub-tab Navigation: Cấu hình / Thiết lập đầu ra (đồng bộ Đóng gói & Chuyển đổi) */}
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
            {/* 1. Chọn chế độ tiện ích */}
            <div className="space-y-2">
              <SectionTitle as="p">
                {t('ebookStudio.tools.toolTitle', 'Chế độ tiện ích')}
              </SectionTitle>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!running) {
                      setActiveTool('combine');
                      setResult(null);
                    }
                  }}
                  disabled={running}
                  aria-pressed={activeTool === 'combine'}
                  className={`h-9 rounded-xl border px-2 flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 select-none ${
                    activeTool === 'combine'
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                      : 'border-outline-variant/25 bg-surface-container-high/50 font-medium text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] leading-none shrink-0 ${activeTool === 'combine' ? 'text-primary' : 'text-amber-500'}`}>
                    merge
                  </span>
                  <span className="truncate">{t('ebookStudio.tools.combineTitle', 'Gộp CBZ')}</span>
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
                  aria-pressed={activeTool === 'split'}
                  className={`h-9 rounded-xl border px-2 flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 select-none ${
                    activeTool === 'split'
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                      : 'border-outline-variant/25 bg-surface-container-high/50 font-medium text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] leading-none shrink-0 ${activeTool === 'split' ? 'text-primary' : 'text-cyan-400'}`}>
                    call_split
                  </span>
                  <span className="truncate">{t('ebookStudio.tools.splitTitle', 'Cắt CBZ')}</span>
                </button>
              </div>
            </div>

            {/* 2. Nguồn file */}
            <div className="space-y-2 pt-3 border-t border-outline-variant/15">
              {activeTool === 'combine' ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle as="p">
                      {t('ebookStudio.tools.sourceTitle')}
                    </SectionTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-on-surface-variant tabular-nums">
                        {t('ebookStudio.tools.fileListTitle', { count: combineFiles.length }, `File đã chọn (${combineFiles.length})`)}
                      </span>
                      {combineFiles.length > 0 && !running && (
                        <button
                          type="button"
                          onClick={handleClearCombineFiles}
                          className="text-[11px] font-medium text-error hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          {t('ebookStudio.tools.clearAll', 'Xóa tất cả')}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCombineFiles}
                    disabled={running}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-cyan-400">add_box</span>
                    <span>{t('ebookStudio.tools.addCbzFiles', 'Thêm File CBZ')}</span>
                  </button>
                  <p className="text-[11px] text-on-surface-variant/65 leading-relaxed">
                    {t('ebookStudio.tools.combineHint', 'Chọn ít nhất 2 file CBZ để bắt đầu gộp. Có thể kéo thả để sắp xếp thứ tự.')}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle as="p">
                      {t('ebookStudio.tools.sourceTitle')}
                    </SectionTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-on-surface-variant">
                        {splitSourceFile ? t('ebookStudio.tools.oneFileSelected') : t('ebookStudio.tools.noFileSelected')}
                      </span>
                      {splitSourceFile && !running && (
                        <button
                          type="button"
                          onClick={handleClearSplitFile}
                          className="text-[11px] font-medium text-error hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          {t('ebookStudio.tools.removeSource')}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectSplitFile}
                    disabled={running}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-cyan-400">file_open</span>
                    <span>
                      {splitSourceFile
                        ? t('ebookStudio.tools.changeCbzFile')
                        : t('ebookStudio.tools.selectCbzFile', 'Chọn File CBZ')}
                    </span>
                  </button>
                  <p className="text-[11px] text-on-surface-variant/65 leading-relaxed">
                    {t('ebookStudio.tools.splitHint', 'Chọn 1 file CBZ để chia tách thành các tập nhỏ hơn.')}
                  </p>
                </>
              )}
            </div>

            {/* 3. Cấu hình (chế độ Cắt CBZ) */}
            {activeTool === 'split' && (
              <div className="space-y-2.5 pt-3 border-t border-outline-variant/15">
                <SectionTitle as="p">
                  {t('ebookStudio.converter.configTitle', 'Cấu hình')}
                </SectionTitle>
                <MaxMbLimitInput
                  id="tools-split-max-mb"
                  label={t('ebookStudio.tools.maxMb', 'Dung lượng tối đa mỗi tập (MB)')}
                  value={splitMaxMb}
                  onChange={setSplitMaxMb}
                  disabled={running}
                  min={10}
                  max={4096}
                />
                {splitSourceFile?.sizeMb != null && (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                    <span className="material-symbols-outlined text-[15px] shrink-0">calculate</span>
                    <span>{t('ebookStudio.tools.estimatedParts', { count: estimatedSplitParts }, `Dự kiến chia thành ~${estimatedSplitParts} phần`)}</span>
                  </div>
                )}
              </div>
            )}
              </>
            )}

            {sidebarTab === 'output' && (
              <>
            {/* 4. Thư mục xuất (đồng bộ OutputDestinationSelector) */}
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
              disabled={running}
              radioName="ebook-tools-output-destination"
              showOpenFolderAfter={true}
              openFolderAfter={openFolderAfter}
              onOpenFolderAfterChange={setOpenFolderAfter}
              warning={outputWarning}
              warningMessage={outputWarningMsg}
            />

            {/* 5. Tên tệp đầu ra / tiền tố */}
            <div className="space-y-2.5 pt-3 border-t border-outline-variant/15">
              {activeTool === 'combine' ? (
                <>
                  <SectionTitle as="label" htmlFor="tools-combine-output-name" className="block">
                    {t('ebookStudio.tools.outputFileName', 'Tên file sau khi gộp')}
                  </SectionTitle>
                  <input
                    id="tools-combine-output-name"
                    type="text"
                    value={combineOutputName}
                    onChange={(e) => setCombineOutputName(e.target.value)}
                    placeholder={t('ebookStudio.tools.outputFileNamePlaceholder', 'Tùy chọn (mặc định = tên file đầu)')}
                    disabled={running}
                    className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs sm:text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <SectionTitle as="label" htmlFor="tools-split-base-name">
                      {t('ebookStudio.tools.outputBaseName', 'Tiền tố tên file cắt')}
                    </SectionTitle>
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
                    id="tools-split-base-name"
                    type="text"
                    value={splitBaseName}
                    onChange={(e) => setSplitBaseName(e.target.value)}
                    placeholder={t('ebookStudio.tools.outputBaseNamePlaceholder', 'Tùy chọn tiền tố (mặc định = tên file gốc)')}
                    disabled={running}
                    className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs sm:text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />

                  {/* Live Name Preview & Example Box */}
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high/60 p-2.5 text-[11px] space-y-1">
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

                  {/* Quy tắc đặt tên tệp chia nhỏ */}
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high/40 p-2.5 text-[11px] space-y-1 select-text">
                    <div className="flex items-center gap-1.5 font-medium text-on-surface">
                      <span className="material-symbols-outlined text-[15px] text-primary shrink-0">info</span>
                      <span>{t('ebookStudio.tools.splitRuleTitle', 'Quy tắc đặt tên tệp chia nhỏ:')}</span>
                    </div>
                    <p className="text-on-surface-variant/75 leading-relaxed">
                      {t('ebookStudio.tools.splitRuleDesc')}
                    </p>
                  </div>
                </>
              )}
            </div>
              </>
            )}

            {/* 6. Thông báo kết quả thống nhất */}
            {result && !running && !result.ok && (
              <div
                data-testid="tools-status-error"
                role="alert"
                className="flex items-start justify-between gap-2 text-xs text-error whitespace-pre-wrap"
              >
                <p className="select-text break-words flex-1">{result.error}</p>
                <button
                  type="button"
                  onClick={handleCopyError}
                  data-tooltip={copiedError ? (t('ebookStudio.converter.copiedError') || 'Đã sao chép lỗi') : (t('ebookStudio.converter.copyError') || 'Sao chép lỗi')}
                  aria-label={t('ebookStudio.converter.copyError') || 'Sao chép lỗi'}
                  className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-error/15 text-error shrink-0 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copiedError ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            )}
            {result && !running && result.ok && (
              <div
                data-testid="tools-status-message"
                role="status"
                className="text-xs text-on-surface whitespace-pre-wrap border border-outline-variant/20 rounded-xl p-3 bg-surface-container-highest/50"
              >
                <p className="select-text break-words">
                  {activeTool === 'combine'
                    ? t('combineTab.successMsg', { file: result.outputFile || '' })
                    : t('ebookStudio.tools.splitSuccess')}
                </p>
                {(() => {
                  const openTarget = result.outputFile || result.outputFiles?.[0];
                  return openTarget && api?.showItemInFolder ? (
                    <button
                      type="button"
                      onClick={() => api.showItemInFolder(openTarget)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-high px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">folder_open</span>
                      <span>{t('ebookStudio.tools.openFileLocation')}</span>
                    </button>
                  ) : null;
                })()}
              </div>
            )}

            {/* 7. Thẻ thống kê tổng quan (đồng bộ Đóng gói & Chuyển đổi) */}
            <div className="mt-auto pt-2">
              <div
                data-testid="tools-overview-card"
                className="rounded-xl border border-primary/15 bg-primary/5 p-3"
              >
                <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                  <span>{t('ebookStudio.overview.title')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-on-surface-variant">{t('ebookStudio.overview.mode')}</span>
                  <span className="font-bold text-primary text-right">
                    {activeTool === 'combine'
                      ? t('ebookStudio.tools.combineTitle')
                      : t('ebookStudio.tools.splitTitle')}
                  </span>
                  {activeTool === 'combine' ? (
                    <>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.totalFiles')}</span>
                      <span className="font-bold text-on-surface text-right tabular-nums">
                        {combineFiles.length > 0 ? combineFiles.length : '—'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.sourceSize')}</span>
                      <span className="font-bold text-on-surface text-right tabular-nums">
                        {splitSourceFile?.sizeMb != null ? `${splitSourceFile.sizeMb} MB` : '—'}
                      </span>
                      <span className="text-on-surface-variant">{t('ebookStudio.overview.estimatedParts')}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">
                        {splitSourceFile ? `~${estimatedSplitParts}` : '—'}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2.5 pt-2 border-t border-primary/10 text-[10px] text-on-surface-variant/75 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                      <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                    </span>
                    <span className="flex-1 min-w-0 leading-snug pt-0.5">
                      {activeTool === 'combine'
                        ? t('ebookStudio.overview.toolsCombineTip')
                        : t('ebookStudio.overview.toolsSplitTip')}
                    </span>
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

      {/* ─── MAIN PANEL (PANEL PHẢI) ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        {/* Thanh tiến trình khi đang xử lý */}
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

        {/* Toolbar chính */}
        <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <SectionTitle as="span">
              {activeTool === 'combine'
                ? t('ebookStudio.tools.fileListTitle', { count: combineFiles.length }, `Danh sách tệp gộp (${combineFiles.length})`)
                : t('ebookStudio.tools.splitFileTitle', 'Thông tin tệp cần cắt')}
            </SectionTitle>
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
                title={t('combineTab.emptyPrompt')}
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
                        data-tooltip={t('combineTab.removeFile')}
                        aria-label={t('combineTab.removeFile')}
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
            <EmptyState
              icon="call_split"
              title={t('splitTab.promptSelect')}
              description={t('ebookStudio.tools.splitHint', 'Bấm nút "Chọn File CBZ" ở cột bên trái để chọn file cần chia nhỏ.')}
            />
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
                    <span className="text-on-surface-variant/70 text-[11px]">{t('ebookStudio.tools.sourceSizeLabel')}</span>
                    <p className="text-base font-bold font-mono text-on-surface mt-0.5">
                      {splitSourceFile.sizeMb != null ? `${splitSourceFile.sizeMb} MB` : t('ebookStudio.tools.calculating')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-container-high/50 p-3">
                    <span className="text-on-surface-variant/70 text-[11px]">{t('ebookStudio.tools.estimatedPartsLabel')}</span>
                    <p className="text-base font-bold font-mono text-primary mt-0.5">
                      ~{estimatedSplitParts} {t('ebookStudio.tools.partsUnit')} ({splitMaxMb} MB/file)
                    </p>
                  </div>
                </div>
              </div>

              {/* Danh sách tệp kết quả dự kiến sau khi split */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">format_list_numbered</span>
                    <SectionTitle as="h4">
                      {t('ebookStudio.tools.splitPartsListTitle', { count: estimatedSplitParts }, `Danh sách tệp dự kiến sau khi cắt (~${estimatedSplitParts} phần)`)}
                    </SectionTitle>
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
