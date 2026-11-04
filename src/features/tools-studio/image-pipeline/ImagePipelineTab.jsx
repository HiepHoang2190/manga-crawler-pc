// src/features/tools-studio/image-pipeline/ImagePipelineTab.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { SourcePicker, ResizeSplitter, StudioLayout, OutputFormatSelector, OutputDestinationSelector, SearchableSelect } from '../../../shared';
import { ToolsStudioActionSlot, ToolsStudioCenterSlot } from '../ToolsStudioActionSlot';
import { generateId } from './actionTypes';
import { actionStackReducer, initialStackState, countEnabled } from './actionStack';
import {
  SYSTEM_TEMPLATE_ID, ACTIVE_TEMPLATE_KEY, ensureTemplates, saveTemplates, serializeTemplate, parseImportedTemplate, templateSignature,
  normalizeOutput, loadDestination, saveDestination,
} from './templates';
import { markDownstreamStaleAll, markReorderStale, removeActionOverrides, removeFileOverrides, toBackendOverrides, toBackendOverridesAll } from './overrides';
import { filterAndSortImages, countByFilter } from './imageListModel';
import ActionStackPanel from './ActionStackPanel';
import PipelineImageList from './PipelineImageList';
import PipelinePreviewPanel from './PipelinePreviewPanel';
import PipelinePreviewModal from './PipelinePreviewModal';
import TemplateToolbar from './TemplateToolbar';
import SaveTemplateDialog from './SaveTemplateDialog';
import { NumberField } from './formControls';

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const toFileRefs = (list) => list.map(({ absolutePath, relativePath }) => ({ absolutePath, relativePath }));
const INITIAL_ANALYZE_LIMIT = 50;

export default function ImagePipelineTab({
  isActive,
  onRunningChange,
  sidebarWidth,
  handleSplitPointerDown,
  showSidebar,
  showRightSidebar,
  rightWidth,
  onRightResizeStart,
  onToggleRightSidebar,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const [initial] = useState(() => {
    const storage = safeStorage();
    const list = ensureTemplates(storage);
    let savedId = null;
    try {
      savedId = storage?.getItem(ACTIVE_TEMPLATE_KEY) ?? null;
    } catch {
      savedId = null;
    }
    let active = list.find((tpl) => tpl.id === savedId);
    if (!active || active.id === SYSTEM_TEMPLATE_ID || (active.name === 'Mặc định' && active.actions?.length === 3)) {
      active = list[0];
      try {
        storage?.setItem(ACTIVE_TEMPLATE_KEY, active.id);
      } catch {}
    }
    return { list, active };
  });

  const [sourceDir, setSourceDir] = useState('');
  const [sourceFiles, setSourceFiles] = useState([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [images, setImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [templates, setTemplates] = useState(initial.list);
  const [activeTemplateId, setActiveTemplateId] = useState(initial.active.id);
  const [stack, setStack] = useState(() => actionStackReducer(initialStackState, { type: 'load', actions: initial.active.actions }));
  const [output, setOutput] = useState(() => normalizeOutput(initial.active.output));
  const [destination, setDestination] = useState(() => loadDestination(safeStorage()));
  const [overrides, setOverrides] = useState({});
  const [analysis, setAnalysis] = useState({});
  const [analyzeProgress, setAnalyzeProgress] = useState(null);
  const [analyzeAllRequested, setAnalyzeAllRequested] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [runProgress, setRunProgress] = useState(null);
  const [runErrors, setRunErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [activePath, setActivePath] = useState(null);
  const [view, setView] = useState({ filter: 'all', search: '', sort: 'nameAsc' });
  const [modalIndex, setModalIndex] = useState(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('actions');

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const scanReq = useRef(0);
  const analyzeReq = useRef(0);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const sourceKey = `${sourceDir}|${(sourceFiles || []).join(',')}`;
  const lastSourceKeyRef = useRef(sourceKey);

  const backendActions = useMemo(() => stack.actions.map(({ id, type, enabled, params }) => ({ id, type, enabled, params })), [stack.actions]);
  const backendOverridesAll = useMemo(() => toBackendOverridesAll(overrides), [overrides]);
  const actionsKey = useMemo(() => JSON.stringify(backendActions), [backendActions]);
  const lastActionsKeyRef = useRef(actionsKey);
  const activeTemplate = templates.find((tpl) => tpl.id === activeTemplateId) || null;
  const dirty = !activeTemplate || templateSignature({ actions: stack.actions, output }) !== templateSignature(activeTemplate);
  const selectedStepIndex = stack.actions.findIndex((a) => a.id === stack.selectedId);
  const statusCtx = useMemo(() => ({ analysis, overrides, runErrors }), [analysis, overrides, runErrors]);

  const cpuCount = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const autoThreads = cpuCount > 2 ? cpuCount - 1 : cpuCount;

  const concurrencyOptions = useMemo(
    () => [
      { value: 'auto', label: t('imagePipeline.output.concurrencyAuto', { threads: autoThreads }), icon: 'auto_mode' },
      { value: '2', label: t('imagePipeline.output.concurrencyThreads2'), icon: 'speed' },
      { value: '4', label: t('imagePipeline.output.concurrencyThreads4'), icon: 'speed' },
      ...(cpuCount >= 8 ? [{ value: '8', label: t('imagePipeline.output.concurrencyThreads8'), icon: 'speed' }] : []),
      { value: 'max', label: t('imagePipeline.output.concurrencyMax', { threads: cpuCount }), icon: 'bolt' },
    ],
    [t, autoThreads, cpuCount]
  );
  const displayed = useMemo(() => filterAndSortImages(images, { ...view, ...statusCtx }), [images, view, statusCtx]);
  const counts = useMemo(() => countByFilter(images, statusCtx), [images, statusCtx]);
  const analyzedCount = useMemo(() => images.filter((img) => Boolean(analysis[img.absolutePath])).length, [images, analysis]);
  const hasUnanalyzed = images.length > INITIAL_ANALYZE_LIMIT && images.length > analyzedCount;
  const activeImageIndex = images.findIndex((img) => img.absolutePath === activePath);
  const activeImage = activeImageIndex >= 0 ? { ...images[activeImageIndex], index: activeImageIndex } : null;
  const hasSource = Boolean(sourceDir || sourceFiles.length);
  const hasSplit = stack.actions.some((a) => a.enabled && a.type === 'splitPage');
  const hasWork =
    countEnabled(stack.actions) > 0 ||
    output.format !== 'original' ||
    Boolean(output.resizePercent) ||
    (!destination.inPlace && Boolean(destination.outputDir)) ||
    (output.format !== 'png' && Number(output.quality) < 100);
  const selectedFiles = useMemo(() => images.filter((img) => selected.has(img.absolutePath)), [images, selected]);
  const hasSelected = selectedFiles.length > 0;
  const canStart = hasSelected && !processing && !scanning && hasWork;

  const startTooltip = useMemo(() => {
    if (processing) return null;
    if (scanning) return t('imagePipeline.startHint.scanning');
    if (!hasSelected) return t('imagePipeline.startHint.noSelected');
    if (!hasWork) return t('imagePipeline.startHint.noWork');
    if (!destination.inPlace && !destination.outputDir) return t('imagePipeline.startHint.noDestination');
    return null;
  }, [processing, scanning, hasSelected, hasWork, destination.inPlace, destination.outputDir, t]);

  useEffect(() => {
    onRunningChange?.(processing || scanning);
  }, [processing, scanning, onRunningChange]);

  // Mặc định luôn mở khung xem trước khi mở tab Xử lý ảnh
  useEffect(() => {
    if (!showRightSidebar && onToggleRightSidebar) {
      onToggleRightSidebar();
    }
  }, []);

  useEffect(() => {
    saveDestination(safeStorage(), destination);
  }, [destination]);

  useEffect(() => {
    try {
      safeStorage()?.setItem(ACTIVE_TEMPLATE_KEY, activeTemplateId);
    } catch {
      /* ignore storage errors */
    }
  }, [activeTemplateId]);

  useEffect(() => {
    if (!api?.subscribePipelineProgress) return undefined;
    return api.subscribePipelineProgress((evt) => {
      if (evt?.phase === 'run') setRunProgress(evt);
      else if (evt?.phase === 'analyze') setAnalyzeProgress(evt);
    });
  }, [api]);

  const errorText = useCallback(
    (code) => (code === 'SHARP_UNAVAILABLE' ? t('imagePipeline.status.sharpMissing') : t('imagePipeline.status.error', { message: code || '' })),
    [t]
  );

  const scan = useCallback(async () => {
    const reqId = ++scanReq.current;
    if (!api?.pipelineScan || (!sourceDir && sourceFiles.length === 0)) {
      setImages([]);
      return true;
    }
    setScanning(true);
    try {
      const res = await api.pipelineScan({ sourceDir, sourceFiles, includeSubfolders });
      if (reqId !== scanReq.current) return false;
      if (!res?.ok) {
        setStatus({ type: 'error', text: errorText(res?.error) });
        setImages([]);
        return false;
      }
      const scanned = res.images || [];
      const isNewSource = lastSourceKeyRef.current !== sourceKey;
      lastSourceKeyRef.current = sourceKey;

      if (isNewSource) {
        setAnalysis({});
        setRunErrors({});
        setOverrides({});
        setAnalyzeAllRequested(false);
      }

      const isSameImages =
        !isNewSource &&
        imagesRef.current.length === scanned.length &&
        imagesRef.current.every((img, i) => img.absolutePath === scanned[i].absolutePath);

      if (isSameImages) {
        // Danh sách file hoàn toàn không đổi khi bật/tắt thư mục con -> Không cập nhật lại state hay quét lại
        return true;
      }

      setImages(scanned);
      setSelected(new Set(scanned.map((img) => img.absolutePath)));
      setActivePath((prev) => {
        if (prev && scanned.some((img) => img.absolutePath === prev)) return prev;
        return scanned[0]?.absolutePath ?? null;
      });
      return true;
    } catch (err) {
      if (reqId !== scanReq.current) return false;
      setStatus({ type: 'error', text: errorText(String(err?.message || err)) });
      return false;
    } finally {
      if (reqId === scanReq.current) setScanning(false);
    }
  }, [api, sourceDir, sourceFiles, sourceKey, includeSubfolders, errorText]);

  useEffect(() => {
    scan();
  }, [scan]);

  useEffect(() => {
    if (processing) {
      analyzeReq.current += 1;
      setAnalyzeProgress(null);
      return undefined;
    }
    if (!api?.pipelineAnalyze || images.length === 0) return undefined;

    const actionsChanged = lastActionsKeyRef.current !== actionsKey;
    lastActionsKeyRef.current = actionsKey;

    if (actionsChanged) {
      setAnalyzeAllRequested(false);
    }

    // Nếu actions thay đổi -> phân tích lại tất cả ảnh
    // Nếu actions không đổi -> chỉ phân tích những ảnh chưa có trong cache
    const unanalyzed = actionsChanged
      ? images
      : images.filter((img) => !analysisRef.current[img.absolutePath]);

    if (unanalyzed.length === 0) {
      setAnalyzeProgress(null);
      return undefined;
    }

    const activeNeedsAnalysis = Boolean(activePath && !analysisRef.current[activePath]);
    const initialBatchNeeded =
      images.length > 0 &&
      Object.keys(analysisRef.current).length < Math.min(INITIAL_ANALYZE_LIMIT, images.length);

    if (!analyzeAllRequested && !actionsChanged && !activeNeedsAnalysis && !initialBatchNeeded) {
      return undefined;
    }

    // Đưa ảnh đang active (đang xem trước) lên đầu hàng đợi để phân tích ngay lập tức
    const sortedFiles = activePath
      ? [
          ...unanalyzed.filter((img) => img.absolutePath === activePath),
          ...unanalyzed.filter((img) => img.absolutePath !== activePath),
        ]
      : unanalyzed;

    const filesToAnalyze = !analyzeAllRequested && sortedFiles.length > INITIAL_ANALYZE_LIMIT
      ? sortedFiles.slice(0, INITIAL_ANALYZE_LIMIT)
      : sortedFiles;

    const reqId = ++analyzeReq.current;
    const currentActionsKey = actionsKey;

    const timer = setTimeout(async () => {
      try {
        const res = await api.pipelineAnalyze({
          files: toFileRefs(filesToAnalyze),
          actions: backendActions,
          overrides: backendOverridesAll,
        });
        // Không lưu nếu actions đã thay đổi sang cấu hình khác
        if (lastActionsKeyRef.current !== currentActionsKey) return;
        if (!res?.ok) {
          if (reqId === analyzeReq.current) setAnalyzeProgress(null);
          return;
        }
        const newResults = Object.fromEntries(res.results.map((r) => [r.absolutePath, r]));
        Object.assign(analysisRef.current, newResults);
        setAnalysis((prev) => (actionsChanged ? newResults : { ...prev, ...newResults }));
        if (reqId === analyzeReq.current) {
          setAnalyzeProgress(null);
        }
      } catch {
        if (reqId === analyzeReq.current) setAnalyzeProgress(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [api, images, activePath, actionsKey, backendActions, backendOverridesAll, processing, analyzeAllRequested]);

  const updateStack = useCallback((event) => {
    const prev = stackRef.current;
    const next = actionStackReducer(prev, event);
    if (next === prev) return;
    stackRef.current = next;
    setStack(next);
    if (event.type === 'setParams' || event.type === 'toggleEnabled') setOverrides((o) => markDownstreamStaleAll(o, next.actions, event.id));
    else if (event.type === 'move') setOverrides((o) => markReorderStale(o, prev.actions, next.actions));
    else if (event.type === 'remove') setOverrides((o) => removeActionOverrides(o, event.id));
    else if (event.type === 'clear' || event.type === 'load') setOverrides({});
  }, []);

  const persistTemplates = (list) => {
    setTemplates(list);
    saveTemplates(safeStorage(), list);
  };

  const loadTemplate = (tpl) => {
    setActiveTemplateId(tpl.id);
    updateStack({ type: 'load', actions: tpl.actions });
    setOutput(normalizeOutput(tpl.output));
  };

  const templateName = (tpl) => (tpl?.nameKey ? t(tpl.nameKey) : tpl?.name || '');

  const handleSaveTemplate = () => {
    if (!activeTemplate || activeTemplate.system) {
      setSaveDialogOpen(true);
      return;
    }
    persistTemplates(templates.map((tpl) => (tpl.id === activeTemplate.id ? { ...tpl, actions: structuredClone(stack.actions), output: { ...output } } : tpl)));
    setStatus({ type: 'success', text: t('imagePipeline.template.saved') });
  };

  const handleSaveAs = (name) => {
    const tpl = { id: generateId('tpl'), name, version: 1, actions: structuredClone(stack.actions), output: { ...output } };
    persistTemplates([...templates, tpl]);
    setActiveTemplateId(tpl.id);
    setSaveDialogOpen(false);
    setStatus({ type: 'success', text: t('imagePipeline.template.saved') });
  };

  const handleDeleteTemplate = () => {
    if (!activeTemplate || activeTemplate.system) return;
    const list = templates.filter((tpl) => tpl.id !== activeTemplate.id);
    persistTemplates(list);
    loadTemplate(list[0]);
  };

  const handleExport = async () => {
    const res = await api?.pipelineExportTemplate?.({
      template: serializeTemplate({ id: activeTemplate?.id || generateId('tpl'), name: templateName(activeTemplate) || 'template', actions: stack.actions, output }),
    });
    if (res?.ok) setStatus({ type: 'success', text: t('imagePipeline.template.exported') });
  };

  const handleImport = async () => {
    const res = await api?.pipelineImportTemplate?.();
    if (!res?.ok || !res.text) return;
    try {
      const { template, dropped } = parseImportedTemplate(res.text, templates.map((tpl) => tpl.id));
      persistTemplates([...templates, template]);
      loadTemplate(template);
      setStatus({
        type: 'success',
        text: dropped
          ? t('imagePipeline.template.importedDropped', { name: template.name, count: dropped })
          : t('imagePipeline.template.imported', { name: template.name }),
      });
    } catch {
      setStatus({ type: 'error', text: t('imagePipeline.template.importFailed') });
    }
  };

  const handleSelectFolder = async () => {
    const dir = await api?.selectDirectory?.();
    if (dir) {
      setSourceFiles([]);
      setSourceDir(dir);
      setAnalyzeAllRequested(false);
      setStatus(null);
    }
  };

  const handleSelectFiles = async () => {
    const files = await api?.selectImageFiles?.();
    if (Array.isArray(files) && files.length > 0) {
      setSourceDir('');
      setSourceFiles(files);
      setAnalyzeAllRequested(false);
      setStatus(null);
    }
  };

  const handleClearSource = () => {
    setSourceDir('');
    setSourceFiles([]);
    setAnalyzeAllRequested(false);
  };

  const handleBrowseOutput = async () => {
    const dir = await api?.selectDirectory?.();
    if (dir) setDestination((d) => ({ ...d, outputDir: dir }));
  };

  const handleStart = async () => {
    if (!canStart) return;

    let targetDestination = destination;
    if (!destination.inPlace && !destination.outputDir) {
      setSidebarTab('output');
      const dir = await api?.selectDirectory?.();
      if (!dir) {
        setStatus({ type: 'error', text: t('imagePipeline.startHint.noDestination') });
        return;
      }
      targetDestination = { ...destination, outputDir: dir };
      setDestination(targetDestination);
    }

    setProcessing(true);
    setStatus(null);
    setRunErrors({});
    setRunProgress({ phase: 'run', current: 0, total: selectedFiles.length });
    try {
      const res = await api.pipelineRun({
        files: toFileRefs(selectedFiles),
        actions: backendActions,
        overrides: backendOverridesAll,
        output: { ...output, inPlace: targetDestination.inPlace, outputDir: targetDestination.outputDir },
        concurrency: output.concurrency === 'auto' ? undefined : (output.concurrency === 'max' ? 'max' : Number(output.concurrency)),
      });
      if (!res?.ok) {
        setStatus({ type: 'error', text: errorText(res?.error) });
        return;
      }
      if (targetDestination.inPlace) {
        const scanOk = await scan();
        if (!scanOk) return;
      }
      setRunErrors(Object.fromEntries((res.failed || []).map((f) => [f.path, f.error])));
      setStatus({
        type: res.failed?.length ? 'error' : 'success',
        text: res.cancelled
          ? t('imagePipeline.status.cancelled', { done: res.done })
          : t('imagePipeline.status.done', { done: res.done, failed: res.failed?.length || 0 }),
      });
      if (!res.cancelled && api?.openPath) {
        const target = targetDestination.inPlace
          ? (sourceDir || (sourceFiles?.[0] ? sourceFiles[0].replace(/[^\\/]+$/, '') : ''))
          : targetDestination.outputDir;
        if (target) api.openPath(target);
      }
    } catch (err) {
      setStatus({ type: 'error', text: errorText(String(err?.message || err)) });
    } finally {
      setProcessing(false);
      setRunProgress(null);
    }
  };

  const handleStop = async () => {
    await api?.pipelineCancel?.();
  };

  const toggleSelect = (path) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const all = displayed.length > 0 && displayed.every((img) => prev.has(img.absolutePath));
      const next = new Set(prev);
      for (const img of displayed) {
        if (all) next.delete(img.absolutePath);
        else next.add(img.absolutePath);
      }
      return next;
    });

  const removeImage = (path) => {
    setImages((list) => list.filter((img) => img.absolutePath !== path));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    setOverrides((o) => removeFileOverrides(o, path));
    setAnalysis((a) => {
      const next = { ...a };
      delete next[path];
      return next;
    });
    if (activePath === path) setActivePath(null);
  };

  const handleActivateImage = useCallback(
    (path) => {
      setActivePath(path);
      if (!showRightSidebar && onToggleRightSidebar) {
        onToggleRightSidebar();
      }
    },
    [showRightSidebar, onToggleRightSidebar]
  );

  const openModalFor = (path) => {
    const idx = displayed.findIndex((img) => img.absolutePath === path);
    if (idx >= 0) {
      setActivePath(path);
      setModalIndex(idx);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      {/* Center action slot: Primary Execution Controls (Bắt đầu, Dừng) */}
      <ToolsStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="image-pipeline-start-btn"
            onClick={handleStart}
            disabled={!canStart}
            data-tooltip={startTooltip || undefined}
            aria-label={t('imagePipeline.start')}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">play_arrow</span>
            <span>
              {processing
                ? t('imagePipeline.processing', { current: runProgress?.current || 0, total: runProgress?.total || 0 })
                : t('imagePipeline.start')}
            </span>
          </button>
          <button
            type="button"
            data-testid="image-pipeline-stop-btn"
            onClick={handleStop}
            disabled={!processing || !api?.pipelineCancel}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-error/40 px-3 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
            <span>{t('imagePipeline.stop')}</span>
          </button>
        </div>
      </ToolsStudioCenterSlot>

      {/* Right action slot: Template Toolbar + Preview Toggle */}
      <ToolsStudioActionSlot active={isActive}>
        <div className="flex items-center gap-2">
          <TemplateToolbar
            templates={templates}
            activeId={activeTemplateId}
            dirty={dirty}
            disabled={processing}
            onSelect={(id) => {
              const tpl = templates.find((x) => x.id === id);
              if (tpl) loadTemplate(tpl);
            }}
            onSave={handleSaveTemplate}
            onSaveAs={() => setSaveDialogOpen(true)}
            onDelete={handleDeleteTemplate}
            onImport={handleImport}
            onExport={handleExport}
          />
          <div className="h-5 w-px bg-outline-variant/30" />
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${showRightSidebar ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            data-tooltip={t('imagePipeline.togglePreview')}
            aria-label={t('imagePipeline.togglePreview')}
          >
            <span className="material-symbols-outlined text-[18px]">view_sidebar</span>
          </button>
        </div>
      </ToolsStudioActionSlot>

      {showSidebar && (
        <div className="relative flex flex-col border-r border-outline-variant/20 overflow-visible shrink-0" style={{ width: sidebarWidth }}>
          {/* Sub-tab Navigation */}
          <div className="px-3.5 pt-3 pb-2.5 border-b border-outline-variant/15 shrink-0 bg-surface-container-low/40">
            <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 gap-1">
              <button
                type="button"
                onClick={() => setSidebarTab('actions')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  sidebarTab === 'actions'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">tune</span>
                <span className="truncate">{t('imagePipeline.sidebarTab.actions', { count: countEnabled(stack.actions) })}</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('output')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  sidebarTab === 'output'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">output</span>
                <span className="truncate">{t('imagePipeline.sidebarTab.output')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 mr-1.5">
            {sidebarTab === 'actions' ? (
              <>
                <SourcePicker
                  sourceDir={sourceDir}
                  sourceFiles={sourceFiles}
                  includeSubfolders={includeSubfolders}
                  onIncludeSubfoldersChange={setIncludeSubfolders}
                  onSelectFolder={handleSelectFolder}
                  onSelectFiles={handleSelectFiles}
                  onClear={handleClearSource}
                  disabled={processing || scanning}
                />

                <ActionStackPanel actions={stack.actions} selectedId={stack.selectedId} onEvent={updateStack} disabled={processing} />
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <OutputFormatSelector
                    value={output.format}
                    disabled={processing}
                    onChange={(format) =>
                      setOutput((o) =>
                        normalizeOutput({
                          ...o,
                          format,
                          quality: format === 'original' ? 100 : (o.format === 'original' && o.quality === 100 ? 90 : o.quality),
                        })
                      )
                    }
                  />
                  {output.format === 'png' ? (
                    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0 select-none mt-0.5">info</span>
                      <span>{t('imagePipeline.output.pngLosslessHint')}</span>
                    </div>
                  ) : (
                    <label className="block space-y-1 text-xs text-on-surface-variant">
                      <div className="flex items-center justify-between">
                        <span>{t('imagePipeline.output.quality', { value: output.quality })}</span>
                        <span className="text-[10px] text-on-surface-variant/60">{t('imagePipeline.output.qualityHint')}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={output.quality}
                        disabled={processing}
                        onChange={(e) => setOutput((o) => normalizeOutput({ ...o, quality: Number(e.target.value) }))}
                        className="w-full accent-primary"
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded accent-primary"
                      checked={Boolean(output.resizePercent)}
                      disabled={processing}
                      onChange={(e) => setOutput((o) => normalizeOutput({ ...o, resizePercent: e.target.checked ? 80 : null }))}
                    />
                    {t('imagePipeline.output.resize')}
                  </label>
                  {output.resizePercent && (
                    <NumberField
                      label={t('imagePipeline.output.resizePercent')}
                      value={output.resizePercent}
                      min={10}
                      max={99}
                      disabled={processing}
                      onChange={(resizePercent) => setOutput((o) => normalizeOutput({ ...o, resizePercent }))}
                    />
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-outline-variant/15">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
                        {t('imagePipeline.output.concurrency')}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/60">
                        {t('imagePipeline.output.concurrencyHint')}
                      </span>
                    </div>
                    <SearchableSelect
                      value={output.concurrency || 'auto'}
                      onChange={(concurrency) => setOutput((o) => normalizeOutput({ ...o, concurrency }))}
                      options={concurrencyOptions}
                      disabled={processing}
                      className="w-full"
                    />
                    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0 select-none mt-0.5">bolt</span>
                      <span>{t('imagePipeline.output.concurrencySpeedCallout')}</span>
                    </div>
                  </div>
                </div>

                <OutputDestinationSelector
                  inPlace={destination.inPlace}
                  onInPlaceChange={(inPlace) => setDestination((d) => ({ ...d, inPlace }))}
                  outputDir={destination.outputDir}
                  onOutputDirChange={(outputDir) => setDestination((d) => ({ ...d, outputDir }))}
                  onBrowse={handleBrowseOutput}
                  showOpenFolderAfter={false}
                  overwriteWarning={hasSplit ? t('imagePipeline.output.splitInPlaceWarning') : t('imagePipeline.output.inPlaceWarning')}
                  radioName="image-pipeline-destination"
                  disabled={processing}
                />
              </>
            )}

            {status && <p className={`text-xs font-medium ${status.type === 'error' ? 'text-error' : 'text-emerald-400'}`}>{status.text}</p>}
          </div>
          <ResizeSplitter variant="overlay" side="right" onPointerDown={handleSplitPointerDown} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 overflow-hidden">
        <PipelineImageList
          images={displayed}
          counts={counts}
          view={view}
          onViewChange={(patch) => setView((v) => ({ ...v, ...patch }))}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          activePath={activePath}
          onActivate={handleActivateImage}
          onOpenPreview={openModalFor}
          onRemove={removeImage}
          statusCtx={statusCtx}
          scanning={scanning}
          analyzeProgress={analyzeProgress}
          runProgress={runProgress}
          processing={processing}
          hasSource={hasSource}
          hasUnanalyzed={hasUnanalyzed}
          onAnalyzeAll={() => setAnalyzeAllRequested(true)}
          tabActive={isActive}
          disabledKeyboardNav={modalIndex !== null || saveDialogOpen}
        />
      </div>

      <StudioLayout.RightSidebar
        open={showRightSidebar}
        width={rightWidth}
        onResizeStart={onRightResizeStart}
        onClose={onToggleRightSidebar}
        icon="visibility"
        title={
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span>{t('imagePipeline.preview.title')}</span>
            <span className="text-[11px] font-normal text-on-surface-variant/70 tracking-normal truncate">
              ({t('imagePipeline.preview.spaceHint')})
            </span>
          </span>
        }
      >
        <PipelinePreviewPanel
          api={api}
          image={activeImage}
          actions={backendActions}
          stackActions={stack.actions}
          fileOverrides={toBackendOverrides(overrides[activePath])}
          selectedStepIndex={selectedStepIndex >= 0 ? selectedStepIndex : null}
          output={output}
          onOpenFull={() => activePath && openModalFor(activePath)}
        />
      </StudioLayout.RightSidebar>

      {modalIndex !== null && displayed[modalIndex] && (
        <PipelinePreviewModal
          api={api}
          images={displayed}
          index={modalIndex}
          onIndexChange={(i) => {
            setModalIndex(i);
            setActivePath(displayed[i]?.absolutePath ?? null);
          }}
          onClose={() => setModalIndex(null)}
          actions={backendActions}
          stackActions={stack.actions}
          overrides={overrides}
          onOverridesChange={setOverrides}
          output={output}
          initialStepIndex={selectedStepIndex >= 0 ? selectedStepIndex : null}
        />
      )}

      {saveDialogOpen && (
        <SaveTemplateDialog initialName={templateName(activeTemplate)} onConfirm={handleSaveAs} onCancel={() => setSaveDialogOpen(false)} />
      )}
    </div>
  );
}
