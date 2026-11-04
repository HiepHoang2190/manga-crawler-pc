import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { SourcePicker, ResizeSplitter, useToolsSidebarResize, SearchableSelect, OutputFormatSelector, OutputDestinationSelector } from '../../../shared';
import { ToolsStudioActionSlot, ToolsStudioCenterSlot } from '../../tools-studio/ToolsStudioActionSlot';
import { getUpscaleSuffix, buildUpscaleOutputPath } from './upscaleNaming';
import InteractiveUpscalePreviewModal from './InteractiveUpscalePreviewModal';
import { ExtrasInstallModal } from '../../extras';

const UPSCALE_MODEL_KEY = 'manga_upscale_model';
const UPSCALE_SCALE_KEY = 'manga_upscale_scale';
const UPSCALE_DENOISE_KEY = 'manga_upscale_denoise';
const UPSCALE_TILE_KEY = 'manga_upscale_tile';
const UPSCALE_GPU_KEY = 'manga_upscale_gpu';
const UPSCALE_OUTPUT_DIR_KEY = 'manga_upscale_output_dir';
const UPSCALE_IN_PLACE_KEY = 'manga_upscale_in_place';
const UPSCALE_APPEND_PARAMS_KEY = 'manga_upscale_append_params';
const UPSCALE_SKIP_EXISTING_KEY = 'manga_upscale_skip_existing';
const UPSCALE_LAST_SESSION_KEY = 'manga_upscale_last_session';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.avif']);

function getExtension(filePath) {
  const idx = filePath.lastIndexOf('.');
  return idx >= 0 ? filePath.slice(idx).toLowerCase() : '';
}

function formatEtaSeconds(sec) {
  if (!sec || sec <= 0) return '< 1s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM > 0 ? `${remM}m` : ''}`.trim();
}

export default function UpscaleTab({
  onRunningChange,
  sidebarWidth: propWidth,
  handleSplitPointerDown: propHandleSplit,
  showSidebar = true,
  isActive = true,
}) {
  const { t, locale, lang } = useI18n();
  const currentLang = locale || lang || 'vi';
  const fallbackResize = useToolsSidebarResize();
  const sidebarWidth = propWidth ?? fallbackResize.sidebarWidth;
  const handleSplitPointerDown = propHandleSplit ?? fallbackResize.handleSplitPointerDown;
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // -- Source selection
  const [sourceDir, setSourceDir] = useState('');
  const [sourceFiles, setSourceFiles] = useState([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  // -- Engine / Model selection
  const [engines, setEngines] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(() => {
    try { return localStorage.getItem(UPSCALE_MODEL_KEY) || 'mangajanai-2x-1600p'; } catch { return 'mangajanai-2x-1600p'; }
  });
  const [selectedScale, setSelectedScale] = useState(() => {
    try { return parseInt(localStorage.getItem(UPSCALE_SCALE_KEY)) || 2; } catch { return 2; }
  });
  const [denoise, setDenoise] = useState(() => {
    try { return parseInt(localStorage.getItem(UPSCALE_DENOISE_KEY)) || 1; } catch { return 1; }
  });
  const [tileSize, setTileSize] = useState(() => {
    try { return parseInt(localStorage.getItem(UPSCALE_TILE_KEY)) || 0; } catch { return 0; }
  });
  const [selectedGpu, setSelectedGpu] = useState(() => {
    try { return localStorage.getItem(UPSCALE_GPU_KEY) || 'auto'; } catch { return 'auto'; }
  });
  const [discoveredGpus, setDiscoveredGpus] = useState([]);

  // -- Output options
  const [outputDir, setOutputDir] = useState(() => {
    try { return localStorage.getItem(UPSCALE_OUTPUT_DIR_KEY) || ''; } catch { return ''; }
  });
  const [inPlace, setInPlace] = useState(() => {
    try { return localStorage.getItem(UPSCALE_IN_PLACE_KEY) === 'true'; } catch { return false; }
  });
  const [outputFormat, setOutputFormat] = useState('original');
  const [appendParams, setAppendParams] = useState(() => {
    try { const v = localStorage.getItem(UPSCALE_APPEND_PARAMS_KEY); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [skipExisting, setSkipExisting] = useState(() => {
    try { const v = localStorage.getItem(UPSCALE_SKIP_EXISTING_KEY); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [sidebarTab, setSidebarTab] = useState('config');
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState(false);

  // Persist settings
  useEffect(() => { try { localStorage.setItem(UPSCALE_MODEL_KEY, selectedModelId); } catch {} }, [selectedModelId]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_SCALE_KEY, String(selectedScale)); } catch {} }, [selectedScale]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_DENOISE_KEY, String(denoise)); } catch {} }, [denoise]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_TILE_KEY, String(tileSize)); } catch {} }, [tileSize]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_GPU_KEY, String(selectedGpu)); } catch {} }, [selectedGpu]);
  useEffect(() => { try { outputDir ? localStorage.setItem(UPSCALE_OUTPUT_DIR_KEY, outputDir) : localStorage.removeItem(UPSCALE_OUTPUT_DIR_KEY); } catch {} }, [outputDir]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_IN_PLACE_KEY, inPlace ? 'true' : 'false'); } catch {} }, [inPlace]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_APPEND_PARAMS_KEY, appendParams ? 'true' : 'false'); } catch {} }, [appendParams]);
  useEffect(() => { try { localStorage.setItem(UPSCALE_SKIP_EXISTING_KEY, skipExisting ? 'true' : 'false'); } catch {} }, [skipExisting]);

  // Query discovered GPUs on mount
  useEffect(() => {
    if (!api?.upscaleGetGpuList) return;
    api.upscaleGetGpuList().then((res) => {
      if (res?.ok && Array.isArray(res.gpus) && res.gpus.length > 0) {
        setDiscoveredGpus(res.gpus);
      }
    }).catch(() => {});
  }, [api]);

  // Images & processing state
  const [images, setImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [activeFilePercent, setActiveFilePercent] = useState(0);
  const [batchStartTime, setBatchStartTime] = useState(null);
  const [avgSecondsPerImage, setAvgSecondsPerImage] = useState(null);
  const [etaText, setEtaText] = useState('');
  const [error, setError] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);

  // Filter & sorting
  const [uncheckedPaths, setUncheckedPaths] = useState(() => new Set());
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [completedPaths, setCompletedPaths] = useState(() => new Set());
  const [skippedPaths, setSkippedPaths] = useState(() => new Set());
  const [errorMap, setErrorMap] = useState(() => ({}));
  const [errorModalData, setErrorModalData] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [recoverableSession, setRecoverableSession] = useState(null);
  const [copyDone, setCopyDone] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const batchStartTimeRef = useRef(null);
  const batchProcessedCountRef = useRef(0);

  // Check for recoverable session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPSCALE_LAST_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session && (session.sourceDir || (session.sourceFiles && session.sourceFiles.length > 0))) {
          setRecoverableSession(session);
        }
      }
    } catch {}
  }, []);

  const handleRecoverSession = useCallback(() => {
    if (!recoverableSession) return;
    if (recoverableSession.sourceDir) setSourceDir(recoverableSession.sourceDir);
    if (recoverableSession.sourceFiles) setSourceFiles(recoverableSession.sourceFiles);
    if (typeof recoverableSession.includeSubfolders === 'boolean') setIncludeSubfolders(recoverableSession.includeSubfolders);
    if (recoverableSession.outputDir) setOutputDir(recoverableSession.outputDir);
    if (typeof recoverableSession.inPlace === 'boolean') setInPlace(recoverableSession.inPlace);
    if (recoverableSession.selectedModelId) setSelectedModelId(recoverableSession.selectedModelId);
    if (recoverableSession.selectedScale) setSelectedScale(recoverableSession.selectedScale);
    if (typeof recoverableSession.denoise === 'number') setDenoise(recoverableSession.denoise);
    if (typeof recoverableSession.tileSize === 'number') setTileSize(recoverableSession.tileSize);
    if (recoverableSession.selectedGpu) setSelectedGpu(recoverableSession.selectedGpu);
    if (recoverableSession.outputFormat) setOutputFormat(recoverableSession.outputFormat);
    setRecoverableSession(null);
  }, [recoverableSession]);

  const handleDismissSession = useCallback(() => {
    try { localStorage.removeItem(UPSCALE_LAST_SESSION_KEY); } catch {}
    setRecoverableSession(null);
  }, []);

  const saveSessionSnapshot = useCallback((override = {}) => {
    try {
      const snapshot = {
        sourceDir,
        sourceFiles,
        includeSubfolders,
        outputDir,
        inPlace,
        selectedModelId,
        selectedScale,
        denoise,
        tileSize,
        selectedGpu,
        outputFormat,
        timestamp: Date.now(),
        ...override,
      };
      localStorage.setItem(UPSCALE_LAST_SESSION_KEY, JSON.stringify(snapshot));
    } catch {}
  }, [sourceDir, sourceFiles, includeSubfolders, outputDir, inPlace, selectedModelId, selectedScale, denoise, tileSize, selectedGpu, outputFormat]);

  const handleCopyError = useCallback(async () => {
    if (!errorModalData) return;
    const text = [
      `${t('upscale.errorFile')}: ${errorModalData.relativePath || errorModalData.fileName}`,
      `${t('upscale.errorPath')}: ${errorModalData.absolutePath}`,
      `${t('upscale.errorConfig')}: ${errorModalData.model} (${errorModalData.scale}x)`,
      ``,
      `${t('history.bugMessage')}:`,
      errorModalData.error,
    ].join('\n');

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('No clipboard');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }, [errorModalData, t]);

  // Notify parent if busy
  useEffect(() => {
    onRunningChange?.(processing || scanning);
  }, [processing, scanning, onRunningChange]);

  // Binary availability status: { [engineId]: { available, binaryPath } }
  const [binaryStatus, setBinaryStatus] = useState({});

  // Load engine/model list on mount
  useEffect(() => {
    if (!api?.upscaleListModels) return;
    api.upscaleListModels().then((res) => {
      if (res?.ok) {
        setEngines(res.engines || []);
        setModels(res.models || []);
      }
    });
  }, [api]);

  // Check binary availability whenever engines change
  useEffect(() => {
    if (!api?.upscaleCheckBinary || engines.length === 0) return;
    const checkAll = async () => {
      const status = {};
      for (const engine of engines) {
        try {
          const res = await api.upscaleCheckBinary(engine.id);
          status[engine.id] = { available: res?.available || false, binaryPath: res?.binaryPath || '' };
        } catch {
          status[engine.id] = { available: false, binaryPath: '' };
        }
      }
      setBinaryStatus(status);
    };
    checkAll();
  }, [api, engines]);

  // Selected model config
  const selectedModel = useMemo(() => {
    return models.find((m) => m.id === selectedModelId) || null;
  }, [models, selectedModelId]);

  const selectedEngine = useMemo(() => {
    if (!selectedModel) return null;
    return engines.find((e) => e.id === selectedModel.engineId) || null;
  }, [selectedModel, engines]);

  // Available scales from selected model
  const availableScales = useMemo(() => {
    return selectedModel?.scales || [2];
  }, [selectedModel]);

  // Denoise options supported by the selected model & scale
  const availableDenoiseOptions = useMemo(() => {
    if (!selectedEngine?.supportsDenoise || selectedModel?.id === 'realcugan-nose') {
      return [];
    }
    const isRestricted = selectedModel?.id === 'realcugan-pro' || (selectedModel?.id === 'realcugan-se' && selectedScale > 2);
    if (isRestricted) {
      return [
        { value: -1, label: t('upscale.denoiseNone'), icon: 'block' },
        { value: 3, label: t('upscale.denoiseStrong'), icon: 'blur_circular' },
      ];
    }
    return [
      { value: -1, label: t('upscale.denoiseNone'), icon: 'block' },
      { value: 1, label: t('upscale.denoiseLight'), icon: 'blur_on' },
      { value: 2, label: t('upscale.denoiseMedium'), icon: 'blur_medium' },
      { value: 3, label: t('upscale.denoiseStrong'), icon: 'blur_circular' },
    ];
  }, [selectedEngine, selectedModel, selectedScale, t]);

  // Current filename suffix based on parameters
  const currentSuffix = useMemo(() => {
    if (!appendParams) return '';
    const hasDenoise = availableDenoiseOptions.length > 0;
    return getUpscaleSuffix(
      selectedModel,
      selectedScale,
      hasDenoise ? denoise : -1,
      hasDenoise
    );
  }, [appendParams, selectedModel, selectedScale, denoise, availableDenoiseOptions]);

  const previewExampleFilename = useMemo(() => {
    const ext = outputFormat === 'original' ? '.png' : `.${outputFormat}`;
    return `1${currentSuffix || '_cugan_noise1_2x'}${ext}`;
  }, [currentSuffix, outputFormat]);

  // Auto-fix scale if not available for selected model
  useEffect(() => {
    if (availableScales.length > 0 && !availableScales.includes(selectedScale)) {
      setSelectedScale(availableScales[0]);
    }
  }, [availableScales, selectedScale]);

  // Auto-adjust denoise if current value is not supported by selected model/scale
  useEffect(() => {
    if (availableDenoiseOptions.length > 0) {
      const isCurrentValid = availableDenoiseOptions.some((d) => d.value === denoise);
      if (!isCurrentValid) {
        setDenoise(-1);
      }
    }
  }, [availableDenoiseOptions, denoise]);

  // Model groups for SearchableSelect
  const modelGroups = useMemo(() => {
    const isVi = currentLang === 'vi';
    const isMangaJaNai = (m) => m.id.startsWith('mangajanai') || m.id.startsWith('illustrationjanai');
    const formatOption = (m) => {
      let label = isVi ? (m.labelVi || m.label) : m.label;
      if (['realcugan-se', 'cunet', 'realesrgan-x4plus-anime', 'mangajanai-2x-1600p'].includes(m.id)) {
        label = `⭐ ${label}`;
      }
      return {
        value: m.id,
        label,
        icon: m.id.startsWith('mangajanai')
          ? 'menu_book'
          : m.id.startsWith('illustrationjanai')
            ? 'brush'
            : m.engineId === 'realcugan'
              ? 'palette'
              : m.engineId === 'waifu2x'
                ? 'auto_awesome'
                : 'photo_library',
      };
    };

    return [
      {
        label: t('upscale.groupMangaJaNai'),
        icon: 'menu_book',
        options: models.filter((m) => isMangaJaNai(m)).map(formatOption),
      },
      {
        label: t('upscale.groupRealCUGAN'),
        icon: 'palette',
        options: models.filter((m) => m.engineId === 'realcugan' && !isMangaJaNai(m)).map(formatOption),
      },
      {
        label: t('upscale.groupWaifu2x'),
        icon: 'auto_awesome',
        options: models.filter((m) => m.engineId === 'waifu2x' && !isMangaJaNai(m)).map(formatOption),
      },
      {
        label: t('upscale.groupRealESRGAN'),
        icon: 'photo_library',
        options: models.filter((m) => m.engineId === 'realesrgan' && !isMangaJaNai(m)).map(formatOption),
      },
    ].filter((g) => g.options.length > 0);
  }, [models, currentLang, t]);

  // GPU / Processing device options
  const gpuOptions = useMemo(() => {
    const opts = [
      { value: 'auto', label: t('upscale.gpuAuto'), icon: 'auto_awesome' },
    ];
    if (discoveredGpus.length > 0) {
      for (const g of discoveredGpus) {
        opts.push({
          value: String(g.id),
          label: `GPU ${g.id}: ${g.name}`,
          icon: 'memory',
        });
      }
    } else {
      opts.push({ value: '0', label: 'GPU 0', icon: 'memory' });
    }
    opts.push({ value: '-1', label: t('upscale.gpuCpu'), icon: 'developer_board' });
    return opts;
  }, [discoveredGpus, t]);

  // Tile size options
  const tileSizeOptions = useMemo(() => [
    { value: '0', label: t('upscale.tileSizeAuto'), icon: 'tune' },
    { value: '100', label: '100 px', icon: 'grid_view' },
    { value: '200', label: '200 px', icon: 'grid_view' },
    { value: '400', label: '400 px', icon: 'grid_view' },
    { value: '256', label: '256 px', icon: 'grid_view' },
    { value: '512', label: '512 px', icon: 'grid_view' },
    { value: '1024', label: '1024 px', icon: 'grid_view' },
  ], [t]);

  // Sort options
  const sortOptions = useMemo(() => [
    { value: 'name_asc', label: `${t('upscale.sortByName')} ↑`, icon: 'sort_by_alpha' },
    { value: 'name_desc', label: `${t('upscale.sortByName')} ↓`, icon: 'sort_by_alpha' },
    { value: 'size_asc', label: `${t('upscale.sortBySize')} ↑`, icon: 'straighten' },
    { value: 'size_desc', label: `${t('upscale.sortBySize')} ↓`, icon: 'straighten' },
  ], [t]);

  // ─── Scan for images ──────────────────────────────────────────────────
  const scanForImages = useCallback(async () => {
    if (!sourceDir && (!sourceFiles || sourceFiles.length === 0)) {
      setImages([]);
      return;
    }

    setScanning(true);
    setError(null);

    try {
      let imageList = [];
      if (sourceFiles && sourceFiles.length > 0) {
        imageList = sourceFiles
          .filter((f) => IMAGE_EXTENSIONS.has(getExtension(f)))
          .map((fp) => {
            const fileName = fp.split(/[\\/]/).pop() || fp;
            return { absolutePath: fp, fileName, relativePath: fileName };
          });
      } else if (sourceDir && api) {
        // Fast image scanner without heavy pixel decoding / crop analysis
        const scanFn = api.listImportedImages || api.duplicateListFiles;
        if (scanFn) {
          const res = await scanFn({
            sourceDir,
            includeSubfolders,
          });
          if (res?.ok && Array.isArray(res.files)) {
            imageList = res.files.map((f) => ({
              absolutePath: f.fullPath,
              fileName: f.name,
              relativePath: f.relativePath || f.name,
              sizeBytes: f.sizeBytes,
            }));
          }
        } else if (api.scanForCrop) {
          // Fallback legacy scanner
          const res = await api.scanForCrop({
            sourceDir,
            sourceFiles: [],
            includeSubfolders,
            cropMode: 'autoTrim',
            options: {},
          });
          if (res?.ok && res.images) {
            imageList = res.images.map((img) => {
              const fileName = img.absolutePath.split(/[\\/]/).pop() || img.absolutePath;
              let rel = img.relativePath;
              if (!rel) {
                const normSource = sourceDir.replace(/\\/g, '/').replace(/\/$/, '');
                const normAbs = img.absolutePath.replace(/\\/g, '/');
                rel = normAbs.startsWith(normSource)
                  ? normAbs.slice(normSource.length).replace(/^\/+/, '')
                  : fileName;
              }
              return {
                absolutePath: img.absolutePath,
                fileName,
                relativePath: rel,
              };
            });
          }
        }
      }

      setImages(imageList);
      setUncheckedPaths(new Set());
      setCompletedPaths(new Set());
      setErrorMap({});
      setResultMsg(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, [api, sourceDir, sourceFiles, includeSubfolders]);

  // Auto-scan on source change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sourceDir || (sourceFiles && sourceFiles.length > 0)) {
        scanForImages();
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [scanForImages, sourceDir, sourceFiles]);

  // Source handlers
  const handleSelectSource = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) {
      setSourceDir(dir);
      setSourceFiles([]);
      setResultMsg(null);
      setError(null);
    }
  };

  const handleSelectFiles = async () => {
    if (!api?.selectImageFiles) return;
    const files = await api.selectImageFiles();
    if (files && files.length > 0) {
      setSourceFiles(files);
      setSourceDir('');
      setResultMsg(null);
      setError(null);
    }
  };

  const handleClearSource = () => {
    setSourceDir('');
    setSourceFiles([]);
    setImages([]);
    setUncheckedPaths(new Set());
    setCompletedPaths(new Set());
    setResultMsg(null);
    setError(null);
  };

  const handleBrowseOutput = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  // ─── Image check / filter / sort ──────────────────────────────────────
  const toggleImageCheck = (absPath) => {
    setUncheckedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(absPath)) next.delete(absPath);
      else next.add(absPath);
      return next;
    });
  };

  const displayedImages = useMemo(() => {
    let list = [...images];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((img) => (img.relativePath || '').toLowerCase().includes(q));
    }

    if (filterStatus === 'pending') {
      list = list.filter((img) => !completedPaths.has(img.absolutePath) && !errorMap[img.absolutePath]);
    } else if (filterStatus === 'done') {
      list = list.filter((img) => completedPaths.has(img.absolutePath) && !errorMap[img.absolutePath]);
    } else if (filterStatus === 'failed') {
      list = list.filter((img) => Boolean(errorMap[img.absolutePath]));
    }

    list.sort((a, b) => {
      if (sortBy === 'name_asc') return (a.relativePath || '').localeCompare(b.relativePath || '');
      if (sortBy === 'name_desc') return (b.relativePath || '').localeCompare(a.relativePath || '');
      if (sortBy === 'size_asc') return (a.sizeBytes || 0) - (b.sizeBytes || 0);
      if (sortBy === 'size_desc') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      return 0;
    });

    return list;
  }, [images, searchQuery, filterStatus, completedPaths, errorMap, sortBy]);

  // Master checkbox
  const allDisplayedChecked = useMemo(() => {
    if (displayedImages.length === 0) return false;
    return displayedImages.every((img) => !uncheckedPaths.has(img.absolutePath));
  }, [displayedImages, uncheckedPaths]);

  const someDisplayedChecked = useMemo(() => {
    if (displayedImages.length === 0) return false;
    const checkedCount = displayedImages.filter((img) => !uncheckedPaths.has(img.absolutePath)).length;
    return checkedCount > 0 && checkedCount < displayedImages.length;
  }, [displayedImages, uncheckedPaths]);

  const toggleSelectAll = useCallback(() => {
    if (displayedImages.length === 0) return;
    setUncheckedPaths((prev) => {
      const next = new Set(prev);
      if (allDisplayedChecked) {
        for (const img of displayedImages) next.add(img.absolutePath);
      } else {
        for (const img of displayedImages) next.delete(img.absolutePath);
      }
      return next;
    });
  }, [allDisplayedChecked, displayedImages]);

  const stats = useMemo(() => {
    let done = 0;
    let failed = 0;
    let pending = 0;
    for (const img of images) {
      if (errorMap[img.absolutePath]) {
        failed++;
      } else if (completedPaths.has(img.absolutePath)) {
        done++;
      } else {
        pending++;
      }
    }
    return { total: images.length, pending, done, failed };
  }, [images, completedPaths, errorMap]);

  const filterOptions = useMemo(() => [
    { value: 'all', label: `${t('upscale.filterAll')} (${stats.total})`, icon: 'filter_list' },
    { value: 'pending', label: `${t('upscale.filterPending')} (${stats.pending})`, icon: 'hourglass_empty' },
    { value: 'done', label: `${t('upscale.filterDone')} (${stats.done})`, icon: 'check_circle' },
    ...(stats.failed > 0 || filterStatus === 'failed'
      ? [{ value: 'failed', label: `${t('upscale.filterFailed')} (${stats.failed})`, icon: 'error' }]
      : []),
  ], [t, stats, filterStatus]);

  const handleRemoveImage = useCallback((pathToRemove) => {
    setImages((prev) => prev.filter((img) => img.absolutePath !== pathToRemove));
    setUncheckedPaths((prev) => {
      if (!prev.has(pathToRemove)) return prev;
      const next = new Set(prev);
      next.delete(pathToRemove);
      return next;
    });
    setCompletedPaths((prev) => {
      if (!prev.has(pathToRemove)) return prev;
      const next = new Set(prev);
      next.delete(pathToRemove);
      return next;
    });
    setErrorMap((prev) => {
      if (!prev[pathToRemove]) return prev;
      const next = { ...prev };
      delete next[pathToRemove];
      return next;
    });
  }, []);

  // Speed and ETA calculation helper
  const updateSpeedAndEta = useCallback((totalToProcess) => {
    if (!batchStartTimeRef.current) return;
    batchProcessedCountRef.current += 1;
    const elapsedSec = (Date.now() - batchStartTimeRef.current) / 1000;
    const doneCount = batchProcessedCountRef.current;
    if (doneCount > 0) {
      const avgSpeed = elapsedSec / doneCount;
      setAvgSecondsPerImage(avgSpeed);
      const remainingCount = Math.max(0, totalToProcess - doneCount);
      const etaSec = Math.round(remainingCount * avgSpeed);
      setEtaText(t('upscale.etaLeft', { time: formatEtaSeconds(etaSec) }));
    }
  }, [t]);

  // ─── Batch Processing ─────────────────────────────────────────────────
  const runBatch = async (imagesToProcess, { isResume = false, isRetry = false } = {}) => {
    if (!api?.upscaleStart || imagesToProcess.length === 0) return;
    setProcessing(true);
    setError(null);
    setResultMsg(null);
    setActiveFilePercent(0);
    setBatchStartTime(Date.now());
    batchStartTimeRef.current = Date.now();
    batchProcessedCountRef.current = 0;
    setAvgSecondsPerImage(null);
    setEtaText('');

    const targetPathSet = new Set(imagesToProcess.map((img) => img.absolutePath));

    if (!isResume && !isRetry) {
      // Clear previous errors & completed status for images about to run
      setErrorMap((prev) => {
        const next = { ...prev };
        for (const p of targetPathSet) delete next[p];
        return next;
      });
      setCompletedPaths((prev) => {
        const next = new Set(prev);
        for (const p of targetPathSet) next.delete(p);
        return next;
      });
      setSkippedPaths((prev) => {
        const next = new Set(prev);
        for (const p of targetPathSet) next.delete(p);
        return next;
      });
    } else if (isRetry) {
      // Clear errors only for these retry images
      setErrorMap((prev) => {
        const next = { ...prev };
        for (const p of targetPathSet) delete next[p];
        return next;
      });
    }

    const imagePairs = imagesToProcess.map((img) => {
      const outPath = buildUpscaleOutputPath({
        inputPath: img.absolutePath,
        relativePath: img.relativePath,
        sourceDir,
        inPlace,
        outputDir,
        outputFormat,
        appendParams,
        suffix: currentSuffix,
      });
      return { input: img.absolutePath, output: outPath, fileName: img.fileName, relativePath: img.relativePath };
    });

    setProgress({ current: 0, total: imagesToProcess.length, percent: 0, currentFile: imagesToProcess[0]?.fileName || '' });

    // Save session snapshot on start
    saveSessionSnapshot();

    const unsubscribe = api.subscribeUpscaleProgress?.((prog) => {
      setProgress(prog);
      if (typeof prog.filePercent === 'number') {
        setActiveFilePercent(prog.filePercent);
      }
      const absPath = prog.inputPath || imagesToProcess.find((img) => img.fileName === prog.currentFile)?.absolutePath;
      if (!absPath) return;

      if (prog.status === 'done') {
        setCompletedPaths((prev) => new Set(prev).add(absPath));
        setErrorMap((prev) => {
          if (!prev[absPath]) return prev;
          const next = { ...prev };
          delete next[absPath];
          return next;
        });
        updateSpeedAndEta(imagesToProcess.length);
      } else if (prog.status === 'skipped') {
        setSkippedPaths((prev) => new Set(prev).add(absPath));
        setCompletedPaths((prev) => new Set(prev).add(absPath));
        updateSpeedAndEta(imagesToProcess.length);
      } else if (prog.status === 'error') {
        setErrorMap((prev) => ({
          ...prev,
          [absPath]: prog.error || t('upscale.failed'),
        }));
      }
    });

    try {
      const res = await api.upscaleStart({
        images: imagePairs,
        engineId: selectedModel?.engineId || 'waifu2x',
        modelId: selectedModelId,
        scale: selectedScale,
        denoise: availableDenoiseOptions.length > 0 ? denoise : 0,
        tileSize,
        gpuId: selectedGpu,
        outputFormat,
        skipExisting,
      });

      // Refresh GPU list from probe
      api?.upscaleGetGpuList?.().then((gpuRes) => {
        if (gpuRes?.ok && Array.isArray(gpuRes.gpus) && gpuRes.gpus.length > 0) {
          setDiscoveredGpus(gpuRes.gpus);
        }
      }).catch(() => {});

      if (res?.ok) {
        if (res.results && Array.isArray(res.results)) {
          const newErrors = {};
          const newDones = new Set(completedPaths);
          const newSkipped = new Set(skippedPaths);
          for (const r of res.results) {
            if (r.skipped) {
              newSkipped.add(r.input);
              newDones.add(r.input);
            } else if (r.success) {
              newDones.add(r.input);
            } else if (r.error && !res.cancelled) {
              newErrors[r.input] = r.error;
            }
          }
          setCompletedPaths(newDones);
          setSkippedPaths(newSkipped);
          if (Object.keys(newErrors).length > 0) {
            setErrorMap((prev) => ({ ...prev, ...newErrors }));
          }
        }

        if (res.cancelled) {
          setResultMsg(t('upscale.stop'));
        } else {
          setResultMsg(t('upscale.resultSuccess', { count: res.completed }));
          if (res.failed > 0) {
            setError(t('upscale.resultError', { count: res.failed }));
          } else {
            // Clean up session snapshot if fully completed without errors
            try { localStorage.removeItem(UPSCALE_LAST_SESSION_KEY); } catch {}
          }
        }

        if (api?.openPath && !res.cancelled) {
          const target = inPlace ? (sourceDir || (sourceFiles[0] ? sourceFiles[0].replace(/[^\\/]+$/, '') : '')) : outputDir;
          if (target) api.openPath(target);
        }
      } else {
        setError(res?.error || t('upscale.failed'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      unsubscribe?.();
      setProcessing(false);
      setActiveFilePercent(0);
    }
  };

  const handleStart = () => {
    const engineStatus = selectedModel ? binaryStatus[selectedModel.engineId] : null;
    if (engineStatus && !engineStatus.available) {
      setIsExtrasModalOpen(true);
      return;
    }
    const checkedImages = images.filter((img) => !uncheckedPaths.has(img.absolutePath));
    runBatch(checkedImages, { isResume: false, isRetry: false });
  };

  const handleResume = () => {
    const pendingImages = images.filter((img) => !completedPaths.has(img.absolutePath) && !uncheckedPaths.has(img.absolutePath));
    runBatch(pendingImages, { isResume: true, isRetry: false });
  };

  const handleRetryFailed = () => {
    const failedImages = images.filter((img) => Boolean(errorMap[img.absolutePath]));
    runBatch(failedImages, { isResume: false, isRetry: true });
  };

  const handleOpenOutputDir = () => {
    const target = inPlace ? (sourceDir || (sourceFiles[0] ? sourceFiles[0].replace(/[^\\/]+$/, '') : '')) : outputDir;
    if (target && api?.openPath) api.openPath(target);
  };

  const handleStop = async () => {
    if (!api?.upscaleCancel) return;
    await api.upscaleCancel();
  };

  // Preview items & navigation
  const completedItemsForPreview = useMemo(() => {
    return images
      .filter((img) => completedPaths.has(img.absolutePath) && !errorMap[img.absolutePath])
      .map((img) => {
        const outPath = buildUpscaleOutputPath({
          inputPath: img.absolutePath,
          relativePath: img.relativePath,
          sourceDir,
          inPlace,
          outputDir,
          outputFormat,
          appendParams,
          suffix: currentSuffix,
        });
        return {
          input: img.absolutePath,
          output: outPath,
          fileName: img.fileName,
          relativePath: img.relativePath,
        };
      });
  }, [images, completedPaths, errorMap, inPlace, outputDir, outputFormat, appendParams, currentSuffix, sourceDir]);

  const handleOpenPreview = useCallback((img) => {
    const idx = completedItemsForPreview.findIndex((it) => it.input === img.absolutePath);
    if (idx !== -1) {
      setPreviewIndex(idx);
    }
  }, [completedItemsForPreview]);

  // Has source?
  const hasSource = Boolean(sourceDir || (sourceFiles && sourceFiles.length > 0));
  const startDisabled = processing || scanning || images.length === 0 || (!inPlace && !outputDir);

  // ─── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface" data-testid="tab-content-upscale">
      <ToolsStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="upscale-start-btn"
            disabled={startDisabled}
            onClick={completedPaths.size > 0 && stats.pending > 0 ? handleResume : handleStart}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {processing
                ? 'hourglass_top'
                : completedPaths.size > 0 && stats.pending > 0
                ? 'play_arrow'
                : 'photo_size_select_large'}
            </span>
            <span>
              {processing
                ? t('upscale.processing', { current: progress?.current || 0, total: progress?.total || 0 })
                : completedPaths.size > 0 && stats.pending > 0
                ? t('upscale.resume', { remaining: stats.pending })
                : t('upscale.start')}
            </span>
          </button>
          <button
            type="button"
            data-testid="upscale-stop-btn"
            disabled={!processing}
            onClick={handleStop}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-error/40 px-2.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
            <span>{t('upscale.stop')}</span>
          </button>
        </div>
      </ToolsStudioCenterSlot>
      <ToolsStudioActionSlot active={isActive}></ToolsStudioActionSlot>

      {/* ─── SIDEBAR / CONTROLS ─── */}
      {showSidebar && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          {/* Sub-tab Navigation */}
          <div className="px-3.5 pt-3 pb-2.5 border-b border-outline-variant/15 shrink-0 bg-surface-container-low/40">
            <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 gap-1">
              <button
                type="button"
                onClick={() => setSidebarTab('config')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  sidebarTab === 'config'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">tune</span>
                <span className="truncate">{t('upscale.sidebarTab.config')}</span>
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
                <span className="truncate">{t('upscale.sidebarTab.output')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 mr-1.5">
            {sidebarTab === 'config' ? (
              <>
                {/* 1. Source Selection */}
                <SourcePicker
          sourceDir={sourceDir}
          sourceFiles={sourceFiles}
          includeSubfolders={includeSubfolders}
          onIncludeSubfoldersChange={setIncludeSubfolders}
          onSelectFolder={handleSelectSource}
          onSelectFiles={handleSelectFiles}
          onClear={handleClearSource}
          disabled={processing || !api}
        />

        {/* 2. Engine & Model */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            {t('upscale.sectionEngine')}
          </p>
          <SearchableSelect
            groups={modelGroups}
            value={selectedModelId}
            onChange={(val) => setSelectedModelId(val)}
            disabled={processing}
          />
          {selectedModel && (() => {
            const isVi = currentLang === 'vi';
            const engineStatus = binaryStatus[selectedModel.engineId];
            const isEngineReady = engineStatus?.available;
            const pros = isVi ? (selectedModel.prosVi || []) : (selectedModel.prosEn || []);
            const cons = isVi ? (selectedModel.consVi || []) : (selectedModel.consEn || []);

            const handleDownloadEngine = () => {
              setIsExtrasModalOpen(true);
            };

            return (
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high/80 overflow-hidden">
                {/* Status badges row */}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-outline-variant/10">
                  {/* Engine status */}
                  {engineStatus && (
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                      isEngineReady
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-error/30 bg-error/10 text-error'
                    }`}>
                      <span className="material-symbols-outlined text-[12px]">{isEngineReady ? 'check_circle' : 'error'}</span>
                      {isEngineReady ? t('upscale.engineReady') : t('upscale.engineMissing')}
                    </span>
                  )}
                  {/* Bundled status */}
                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                    selectedModel.bundled
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  }`}>
                    <span className="material-symbols-outlined text-[12px]">{selectedModel.bundled ? 'inventory_2' : 'cloud_download'}</span>
                    {selectedModel.bundled
                      ? t('upscale.bundled')
                      : t('upscale.needDownload', { size: selectedModel.estimatedSizeMB })}
                  </span>
                  {/* Scale chips */}
                  <span className="text-[10px] text-on-surface-variant/50 ml-auto">
                    {selectedModel.scales.map(s => `${s}x`).join(' · ')} · ~{selectedModel.estimatedSizeMB}MB
                  </span>
                </div>
                {/* Description */}
                <div className="px-3 py-2 text-[11px] leading-relaxed text-on-surface-variant">
                  {isVi ? (selectedModel.descriptionVi || selectedModel.description) : selectedModel.description}
                </div>
                {/* Pros & Cons */}
                {(pros.length > 0 || cons.length > 0) && (
                  <div className="px-3 pb-2.5 space-y-1">
                    {pros.map((p, i) => (
                      <div key={`pro-${i}`} className="flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[13px] leading-[16px] text-emerald-500 dark:text-emerald-400 shrink-0 select-none">
                          add_circle
                        </span>
                        <span className="relative top-[1px] text-[10.5px] leading-[16px] text-on-surface-variant">
                          {p}
                        </span>
                      </div>
                    ))}
                    {cons.map((c, i) => (
                      <div key={`con-${i}`} className="flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[13px] leading-[16px] text-amber-600 dark:text-amber-400 shrink-0 select-none">
                          remove_circle
                        </span>
                        <span className="relative top-[1px] text-[10.5px] leading-[16px] text-on-surface-variant">
                          {c}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Download button when engine missing */}
                {engineStatus && !isEngineReady && (
                  <div className="px-3 pb-2.5 space-y-1.5">
                    <button
                      onClick={handleDownloadEngine}
                      disabled={downloading || processing}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-xs font-bold text-on-primary shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">{downloading ? 'hourglass_top' : 'cloud_download'}</span>
                      {downloading ? t('upscale.downloading') : t('upscale.downloadEngine')}
                    </button>
                    {downloadMsg && (
                      <p className={`text-[10px] font-medium ${downloadMsg.includes('!') ? 'text-emerald-400' : 'text-error'}`}>
                        {downloadMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* 3. Scale Factor */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            {t('upscale.scale')}
          </p>
          <div className="inline-flex p-0.5 rounded-lg bg-surface-container-highest/60 border border-outline-variant/20 gap-0.5">
            {availableScales.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedScale(s)}
                disabled={processing || availableScales.length === 1}
                className={`flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all select-none ${
                  selectedScale === s
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                } ${availableScales.length === 1 ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className="material-symbols-outlined text-[13px] leading-none">zoom_in</span>
                <span>{s}x</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Denoise Level */}
        {availableDenoiseOptions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              {t('upscale.denoise')}
            </p>
            <div className={`grid ${availableDenoiseOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-4'} p-0.5 rounded-lg bg-surface-container-highest/60 border border-outline-variant/20 gap-1`}>
              {availableDenoiseOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDenoise(d.value)}
                  disabled={processing}
                  className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-xs font-medium transition-all cursor-pointer select-none ${
                    denoise === d.value
                      ? 'bg-primary text-on-primary shadow-xs font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] leading-none">{d.icon}</span>
                  <span className="truncate">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5. Hardware Device (GPU / CPU) */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            {t('upscale.gpuDevice')}
          </p>
          <SearchableSelect
            options={gpuOptions}
            value={String(selectedGpu)}
            onChange={(val) => setSelectedGpu(val)}
            disabled={processing}
          />
          <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
            {t('upscale.gpuCallout')}
          </p>
        </div>

        {/* 6. Tile Size */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            {t('upscale.tileSize')}
          </p>
          <SearchableSelect
            options={tileSizeOptions}
            value={String(tileSize)}
            onChange={(val) => setTileSize(parseInt(val) || 0)}
            disabled={processing}
          />
          {/* Contextual Callout */}
          <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
            {t(`upscale.tileSize${[100, 200, 400, 256, 512, 1024].includes(tileSize) ? tileSize : 'Auto'}Callout`)}
          </p>
        </div>
              </>
            ) : (
              <>
                {/* 1. Output Format */}
                <OutputFormatSelector value={outputFormat} onChange={setOutputFormat} disabled={processing} />

                {/* 2. Output Destination */}
                <OutputDestinationSelector
                  inPlace={inPlace}
                  onInPlaceChange={setInPlace}
                  outputDir={outputDir}
                  onOutputDirChange={setOutputDir}
                  onBrowse={handleBrowseOutput}
                  disabled={processing}
                  showOpenFolderAfter={false}
                  overwriteWarning={inPlace && !appendParams ? t('upscale.overwriteWarning') : null}
                  radioName="upscale-output"
                  extraOptions={
                    <div className="space-y-1.5 pt-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface select-none">
                        <input
                          type="checkbox"
                          checked={appendParams}
                          onChange={(e) => setAppendParams(e.target.checked)}
                          disabled={processing}
                          className="rounded accent-primary"
                        />
                        <span>{t('upscale.appendParams')}</span>
                      </label>
                      {appendParams && (
                        <p className="ml-5 text-[11px] font-mono text-primary">
                          {t('upscale.appendParamsHint', { example: previewExampleFilename })}
                        </p>
                      )}
                      {inPlace && appendParams && (
                        <p className="ml-5 text-[10px] text-emerald-400 font-medium">
                          {t('upscale.inPlaceSafeNotice')}
                        </p>
                      )}

                      {/* Smart Skip Existing Target Files */}
                      <div className="pt-1">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface select-none">
                          <input
                            type="checkbox"
                            checked={skipExisting}
                            onChange={(e) => setSkipExisting(e.target.checked)}
                            disabled={processing}
                            className="rounded accent-primary"
                          />
                          <span>{t('upscale.skipExisting')}</span>
                        </label>
                        <p className="ml-5 text-[10px] text-on-surface-variant/70">
                          {t('upscale.skipExistingNotice')}
                        </p>
                      </div>
                    </div>
                  }
                />
              </>
            )}

        {/* 8. Status Feedback */}
        {(resultMsg || error) && (
          <div className="space-y-1 pt-1">
            {resultMsg && <p className="text-xs text-emerald-400 font-medium">{resultMsg}</p>}
            {error && <p className="text-xs text-error font-medium">{error}</p>}
          </div>
        )}
      </div>

      {/* ResizeSplitter */}
      <ResizeSplitter variant="overlay" side="right" onPointerDown={handleSplitPointerDown} />
        </div>
      )}

      {/* ─── MAIN PANEL / IMAGE LIST ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 px-5 pb-5 pt-4 overflow-hidden">
        {/* Crash Recovery Banner */}
        {recoverableSession && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 p-3 text-xs text-on-surface flex items-center justify-between gap-3 shadow-xs animate-in fade-in-0 duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[20px] shrink-0">restore</span>
              <div className="min-w-0">
                <p className="font-semibold text-on-surface truncate">{t('upscale.sessionRecoverPrompt')}</p>
                <p className="text-[11px] text-on-surface-variant font-mono truncate">
                  {recoverableSession.sourceDir || (recoverableSession.sourceFiles?.[0] ? `${recoverableSession.sourceFiles[0]} (+${recoverableSession.sourceFiles.length - 1})` : '')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRecoverSession}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-gray-950 px-3 py-1.5 font-semibold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                {t('upscale.sessionRecover')}
              </button>
              <button
                type="button"
                onClick={handleDismissSession}
                className="text-on-surface-variant hover:text-on-surface text-xs font-medium transition-colors px-2 py-1 cursor-pointer"
              >
                {t('upscale.sessionDismiss')}
              </button>
            </div>
          </div>
        )}

        {/* Dual Progress Bar */}
        {processing && progress && (
          <div className="mb-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2.5 shadow-xs">
            {/* Overall batch progress */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-on-surface">
                <span className="flex items-center gap-1.5 truncate pr-2">
                  <span className="material-symbols-outlined text-primary text-[16px] animate-spin shrink-0">progress_activity</span>
                  <span className="truncate">{progress.currentFile || ''}</span>
                </span>
                <span className="font-mono text-primary shrink-0">
                  {progress.percent || 0}% ({progress.current || 0} / {progress.total || 0})
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percent || 0}%` }}
                />
              </div>
            </div>

            {/* Per-image streaming progress */}
            <div className="space-y-1 pt-0.5">
              <div className="flex justify-between items-center text-[11px] text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-primary">hourglass_top</span>
                  <span>{t('upscale.fileProgress')}</span>
                </span>
                <span className="font-mono font-bold text-primary">{activeFilePercent}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-surface-container-highest/60 overflow-hidden">
                <div
                  className="h-full bg-primary/80 transition-all duration-100 rounded-full"
                  style={{ width: `${activeFilePercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 4-Column Stats Dashboard Card */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {/* Box 1: Total */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/60 p-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0">
                <span className="material-symbols-outlined text-[18px]">photo_library</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-semibold truncate">
                  {t('upscale.statsTotal')}
                </p>
                <p className="text-sm font-bold text-on-surface font-mono">
                  {stats.total}{' '}
                  <span className="text-[10px] font-normal text-on-surface-variant/60">
                    ({stats.pending} {t('upscale.filterPending')})
                  </span>
                </p>
              </div>
            </div>

            {/* Box 2: Completed */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-semibold truncate">
                  {t('upscale.statsDone')}
                </p>
                <p className="text-sm font-bold text-emerald-400 font-mono">
                  {stats.done}{' '}
                  <span className="text-[10px] font-normal text-emerald-500/60">
                    ({stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%)
                  </span>
                </p>
              </div>
            </div>

            {/* Box 3: Failed */}
            <div className={`rounded-xl border p-2.5 flex items-center gap-2.5 transition-colors ${
              stats.failed > 0
                ? 'border-error/30 bg-error/10 text-error'
                : 'border-outline-variant/15 bg-surface-container-low/60 text-on-surface-variant'
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                stats.failed > 0 ? 'bg-error/20 text-error' : 'bg-surface-container-highest text-on-surface-variant/50'
              }`}>
                <span className="material-symbols-outlined text-[18px]">error</span>
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-wider font-semibold truncate ${
                  stats.failed > 0 ? 'text-error' : 'text-on-surface-variant/70'
                }`}>
                  {t('upscale.statsFailed')}
                </p>
                <p className="text-sm font-bold font-mono">{stats.failed}</p>
              </div>
            </div>

            {/* Box 4: Speed & ETA */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[18px]">speed</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-primary/80 uppercase tracking-wider font-semibold truncate">
                  {t('upscale.statsSpeed')}
                </p>
                <p className="text-xs font-bold text-on-surface font-mono truncate">
                  {avgSecondsPerImage ? t('upscale.speedPerImg', { speed: avgSecondsPerImage.toFixed(1) }) : '--'}
                </p>
                <p className="text-[10px] text-on-surface-variant/70 font-mono truncate">
                  {etaText || '--'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Master Checkbox */}
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={images.length === 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-container-highest/60 hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-40 cursor-pointer"
              aria-label={allDisplayedChecked ? t('crop.uncheckAll') : t('crop.checkAll')}
            >
              <span className="material-symbols-outlined text-[18px]">
                {allDisplayedChecked ? 'check_box' : someDisplayedChecked ? 'indeterminate_check_box' : 'check_box_outline_blank'}
              </span>
            </button>

            {/* Filter Select */}
            <SearchableSelect
              value={filterStatus}
              onChange={(val) => setFilterStatus(val)}
              size="sm"
              showPlaceholderOption={false}
              className="min-w-[11.5rem]"
              options={filterOptions}
              disabled={images.length === 0}
            />

            {/* Retry Failed Button */}
            {stats.failed > 0 && (
              <button
                type="button"
                disabled={processing}
                onClick={handleRetryFailed}
                className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-error/15 text-error font-semibold text-xs border border-error/30 hover:bg-error/25 disabled:opacity-40 transition-all cursor-pointer shadow-xs"
                data-tooltip={t('upscale.retryFailed', { count: stats.failed })}
                aria-label={t('upscale.retryFailed', { count: stats.failed })}
              >
                <span className="material-symbols-outlined text-[16px]">replay</span>
                <span>{t('upscale.retryFailed', { count: stats.failed })}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Open Output Folder Button */}
            {(outputDir || inPlace) && (
              <button
                type="button"
                onClick={handleOpenOutputDir}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-container-highest/60 hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
                data-tooltip={t('upscale.openOutputFolder')}
                aria-label={t('upscale.openOutputFolder')}
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
              </button>
            )}

            {/* Search Box */}
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('upscale.searchPlaceholder')}
                disabled={images.length === 0}
                className="h-8 w-40 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                  data-tooltip={t('upscale.clearSearch')}
                  aria-label={t('upscale.clearSearch')}
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              )}
            </div>

            {/* Sort Select */}
            <SearchableSelect
              options={sortOptions}
              value={sortBy}
              onChange={(val) => setSortBy(val)}
              size="sm"
              showPlaceholderOption={false}
              disabled={images.length === 0}
              className="min-w-[11.5rem]"
            />
          </div>
        </div>

        {/* Image List */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {displayedImages.length > 0 ? (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar">
              {displayedImages.map((img) => {
                const isChecked = !uncheckedPaths.has(img.absolutePath);
                const imgError = errorMap[img.absolutePath];
                const isDone = completedPaths.has(img.absolutePath) && !imgError;
                const isSkipped = skippedPaths.has(img.absolutePath);
                const isCurrentlyProcessing = processing && (progress?.inputPath === img.absolutePath || progress?.currentFile === img.fileName);

                return (
                  <li
                    key={img.absolutePath}
                    className={`mx-1 relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors group overflow-hidden ${
                      isCurrentlyProcessing
                        ? 'bg-primary/10 border border-primary/40 ring-1 ring-primary/20'
                        : imgError
                        ? 'bg-error/5 border border-error/20 hover:bg-error/10'
                        : 'hover:bg-surface-container-high'
                    }`}
                  >
                    {/* Mini progress line along bottom of active row */}
                    {isCurrentlyProcessing && (
                      <div
                        className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-100"
                        style={{ width: `${activeFilePercent}%` }}
                      />
                    )}

                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleImageCheck(img.absolutePath)}
                      className="shrink-0 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isChecked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </button>

                    {/* Icon */}
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40 group-hover:text-primary shrink-0">
                      image
                    </span>

                    {/* File name */}
                    <span
                      className={`truncate font-medium flex-1 min-w-0 ${imgError ? 'text-error font-semibold' : 'text-on-surface'}`}
                      data-tooltip={
                        appendParams && currentSuffix
                          ? `${img.relativePath || img.fileName} → ${img.fileName.replace(/\.[^.]+$/, '')}${currentSuffix}${outputFormat === 'original' ? getExtension(img.absolutePath) : `.${outputFormat}`}`
                          : (img.relativePath || img.fileName)
                      }
                    >
                      {img.relativePath || img.fileName}
                    </span>

                    {/* Scale badge */}
                    <span className="shrink-0 text-[11px] font-mono font-semibold text-primary">
                      {selectedScale}x
                    </span>

                    {/* Status indicator */}
                    {isCurrentlyProcessing ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold border border-primary/40 bg-primary/20 text-primary font-mono shrink-0 animate-pulse">
                        {activeFilePercent}%
                      </span>
                    ) : isSkipped ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shrink-0">
                        {t('upscale.alreadyExists')}
                      </span>
                    ) : isDone ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0">
                        ✓
                      </span>
                    ) : !imgError ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold border border-outline-variant/20 bg-surface-container-high text-on-surface-variant/50 shrink-0">
                        {t('upscale.filterPending')}
                      </span>
                    ) : null}

                    {/* Preview Button (Eye) for completed items */}
                    {isDone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPreview(img);
                        }}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-container-highest hover:text-primary text-on-surface-variant transition-all cursor-pointer"
                        data-tooltip={t('upscale.preview')}
                        aria-label={t('upscale.preview')}
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
                    )}

                    {/* Bug report button */}
                    {imgError && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCopyDone(false);
                          setErrorModalData({
                            fileName: img.fileName,
                            relativePath: img.relativePath,
                            absolutePath: img.absolutePath,
                            error: imgError,
                            scale: selectedScale,
                            model: selectedModel?.label || selectedModelId,
                          });
                        }}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-error hover:bg-error/15 transition-all cursor-pointer"
                        data-tooltip={t('history.bugDetailOpenTitle')}
                        aria-label={t('history.bugDetailOpenTitle')}
                      >
                        <span className="material-symbols-outlined text-[18px]">bug_report</span>
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.absolutePath); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center hover:bg-error/10 hover:text-error text-on-surface-variant/40 transition-all cursor-pointer"
                      aria-label={t('imagePipeline.list.remove')}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-on-surface-variant/50">
              <span className="material-symbols-outlined text-[48px] opacity-40">
                {hasSource ? 'search_off' : 'photo_size_select_large'}
              </span>
              <p className="text-sm">
                {hasSource ? t('upscale.emptyNoMatch') : t('upscale.emptyNoSource')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── ERROR DETAIL MODAL (matches HistoryTab) ─── */}
      {errorModalData && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upscale-error-title"
          onClick={() => setErrorModalData(null)}
        >
          <div
            className="bg-surface max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border border-outline-variant/20 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-outline-variant/15 shrink-0 flex items-center justify-between">
              <h2 id="upscale-error-title" className="text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-[20px]">bug_report</span>
                <span>{t('history.bugDetailTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setErrorModalData(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
                aria-label={t('history.detailClose')}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto custom-scrollbar min-h-0 flex-1 select-text">
              <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/15 select-text text-on-surface">
                <span className="text-on-surface-variant font-semibold">{t('upscale.errorFile')}: </span>
                <span className="text-on-surface font-medium">{errorModalData.relativePath || errorModalData.fileName}</span>
                {'\n'}
                <span className="text-on-surface-variant font-semibold">{t('upscale.errorPath')}: </span>
                <span className="text-on-surface-variant/80">{errorModalData.absolutePath}</span>
                {'\n'}
                <span className="text-on-surface-variant font-semibold">{t('upscale.errorConfig')}: </span>
                <span className="text-on-surface">{errorModalData.model} ({errorModalData.scale}x)</span>
                {'\n\n'}
                <span className="text-on-surface-variant font-semibold">{t('history.bugMessage')}:</span>
                {'\n'}
                <span className="text-error">{errorModalData.error}</span>
              </pre>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant/15 flex flex-wrap gap-2 shrink-0 justify-end">
              <button
                type="button"
                onClick={handleCopyError}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-on-primary hover:brightness-110 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">{copyDone ? 'check' : 'content_copy'}</span>
                <span>{copyDone ? t('history.detailCopied') : t('history.detailCopy')}</span>
              </button>
              <button
                type="button"
                onClick={() => setErrorModalData(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
              >
                {t('history.detailClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── INTERACTIVE PREVIEW MODAL ─── */}
      <InteractiveUpscalePreviewModal
        isOpen={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        items={completedItemsForPreview}
        currentIndex={previewIndex ?? 0}
        onNavigate={setPreviewIndex}
        api={api}
      />

      {/* ─── EXTRAS INSTALL MODAL ─── */}
      <ExtrasInstallModal
        isOpen={isExtrasModalOpen}
        onClose={() => {
          setIsExtrasModalOpen(false);
          if (api?.upscaleCheckBinary && engines.length > 0) {
            engines.forEach((e) => {
              api.upscaleCheckBinary(e.id).then((res) => {
                setBinaryStatus((prev) => ({
                  ...prev,
                  [e.id]: { available: res?.available || false, binaryPath: res?.binaryPath || '' },
                }));
              });
            });
          }
        }}
      />
    </div>
  );
}

