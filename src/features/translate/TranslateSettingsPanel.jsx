import React, { useCallback, useEffect, useMemo, useState, useRef, Component } from 'react';
import { useI18n } from '../../context/I18nContext';
import { SearchableSelect } from '../../shared';
import TranslateProvidersModal, { PRESET_PROVIDERS } from './components/TranslateProvidersModal';
import { PROVIDER_MODEL_GUIDES, PREDEFINED_LOCAL_MODEL_META } from './constants/providerModelGuides';
import {
  SettingCard,
  ResetDefaultsConfirmModal,
  TranslateGuideModal,
  TranslatePipelineEnginesSection,
  TranslateGeneralSettingsSection,
  TranslateOfflineModelsSection,
} from './components/settings';

// Re-export TranslateGuideModal for consumers (e.g. MangaStudioEditor)
export { TranslateGuideModal } from './components/settings';

/**
 * TranslateSettingsPanel — Cấu hình Translation Pipeline.
 *
 * Chọn provider, model AI, cấu hình engine bóc tách, OCR, inpainting, font chữ,
 * quản lý model ONNX offline và bộ nhớ đệm cache.
 * Tích hợp Error Boundary và fallback an toàn chống crash trắng màn hình.
 */

const PROVIDER_LABELS = {
  gemini: { name: 'Google Gemini', icon: 'auto_awesome', hint: 'Free 15 req/min', hintKey: 'translate.settings.hintGemini' },
  openai: { name: 'OpenAI (GPT-4o)', icon: 'smart_toy', hint: 'High quality, token billed', hintKey: 'translate.settings.hintOpenai' },
  claude: { name: 'Anthropic Claude', icon: 'psychology', hint: 'High nuance & context', hintKey: 'translate.settings.hintClaude' },
  deepseek: { name: 'DeepSeek', icon: 'neurology', hint: 'Cost-effective high quality', hintKey: 'translate.settings.hintDeepseek' },
  openrouter: { name: 'OpenRouter', icon: 'hub', hint: 'Multiple providers & free models', hintKey: 'translate.settings.hintOpenrouter' },
  deepl: { name: 'DeepL Translate', icon: 'translate', hint: 'Free 500K chars/month', hintKey: 'translate.settings.hintDeepl' },
  ollama: { name: 'Ollama (Local AI)', icon: 'dns', hint: '100% offline on machine', hintKey: 'translate.settings.hintLocal' },
  lmstudio: { name: 'LM Studio', icon: 'dns', hint: '100% offline on machine', hintKey: 'translate.settings.hintLocal' },
};

const DEFAULT_PRESET_PROVIDERS_MAP = (PRESET_PROVIDERS || []).reduce((acc, p) => {
  acc[p.id] = {
    id: p.id,
    name: p.fullName || p.name,
    type: p.type,
    category: p.category,
    description: p.description,
    baseUrl: p.defaultUrl || '',
    defaultModel: p.defaultModel || '',
    enabled: true,
    isCustom: false,
    credential: '',
  };
  return acc;
}, {});

const OCR_OPTIONS = [
  { value: 'cloud', label: 'Cloud (Gemini/OpenAI Vision)', labelKey: 'translate.settings.ocrCloud', hintKey: 'translate.settings.ocrCloudHint', hint: 'Most accurate' },
  { value: 'local', label: 'Local (Manga OCR)', labelKey: 'translate.settings.ocrLocal', hintKey: 'translate.settings.ocrLocalHint', hint: 'No internet required' },
];

const DETECTION_MODEL_OPTIONS = [
  { value: 'koharu-rf-detr', label: 'Koharu Layout RF-DETR Seg 2XL', icon: 'frame_inspect' },
  { value: 'comic-text-detector', label: 'Comic Text Detector (ogkalu)', icon: 'crop_free' },
  { value: 'yolov5-manga', label: 'YOLOv5 Manga', icon: 'view_in_ar' },
];

const OCR_MODEL_OPTIONS = [
  { value: 'paddleocr-vl-1.6', label: 'PaddleOCR-VL 1.6', icon: 'document_scanner' },
  { value: 'manga-ocr-base', label: 'Manga OCR (ONNX)', icon: 'description' },
  { value: 'baberu-ocr', label: 'Baberu OCR', icon: 'translate' },
  { value: 'hayai-ocr', label: 'Hayai OCR', icon: 'bolt' },
];

const INPAINTING_MODEL_OPTIONS = [
  { value: 'lama', label: 'LaMa Inpainting', icon: 'auto_fix_high' },
  { value: 'aot', label: 'AOT Inpainting', icon: 'brush' },
  { value: 'flux2', label: 'FLUX.2 Klein', icon: 'magic_button' },
  { value: 'rorem', label: 'RORem Mixed', icon: 'palette' },
];

const DEFAULT_FONT_STACK = [
  'CC Wild Words',
  'Adobe 黑体 Std',
  'SVN-CCWildWords',
  'Patrick Hand SC',
  'Shantell Sans',
  'Playpen Sans',
  'HL Comic',
  'Be Vietnam Pro',
  'Arial',
];

const FALLBACK_SETTINGS = {
  translationProvider: 'gemini',
  ocrProvider: 'local',
  apiKeys: {
    gemini: '',
    openai: '',
    deepl: '',
    openaiCompatible: { endpoint: 'http://localhost:11434/v1', key: 'ollama', model: 'qwen2.5:7b' },
  },
  sourceLanguage: 'auto',
  targetLanguage: 'vi',
  detectionModel: 'koharu-rf-detr',
  textThreshold: 'Default',
  bubbleThreshold: 'Default',
  panelThreshold: 'Default',
  ocrModel: 'paddleocr-vl-1.6',
  inpaintingModel: 'lama',
  fontStack: DEFAULT_FONT_STACK,
  enableInpainting: true,
  enableTypesetting: true,
  translationPrompt: '',
  maxConcurrency: 2,
  outputQuality: 90,
  confidenceThreshold: 0.4,
};

const AVAILABLE_FONTS = [
  'CC Wild Words',
  'Adobe 黑体 Std',
  'CCwildwords',
  'CCWILDWORDS',
  'SVN-CCWildWords',
  'Patrick Hand SC',
  'Shantell Sans',
  'Playpen Sans',
  'HL Comic',
  'SVN-Anime Ace 2.0 BB',
  'Patrick Hand',
  'Bangers',
  'Be Vietnam Pro',
  'SVN-Digital Strip',
  'Comic Neue',
  'Arial',
  'Segoe UI',
];

const FALLBACK_LANGUAGES = {
  source: [
    { code: 'auto', name: 'Auto Detect', nameEn: 'Auto Detect', langKey: 'translate.settings.langAuto' },
    { code: 'ja', name: 'Japanese', nameEn: 'Japanese', langKey: 'translate.settings.langJa' },
    { code: 'zh', name: 'Chinese', nameEn: 'Chinese', langKey: 'translate.settings.langZh' },
    { code: 'ko', name: 'Korean', nameEn: 'Korean', langKey: 'translate.settings.langKo' },
    { code: 'en', name: 'English', nameEn: 'English', langKey: 'translate.settings.langEn' },
  ],
  target: [
    { code: 'vi', name: 'Vietnamese', nameEn: 'Vietnamese', langKey: 'translate.settings.langVi' },
    { code: 'en', name: 'English', nameEn: 'English', langKey: 'translate.settings.langEn' },
    { code: 'zh', name: 'Chinese', nameEn: 'Chinese', langKey: 'translate.settings.langZh' },
    { code: 'ko', name: 'Korean', nameEn: 'Korean', langKey: 'translate.settings.langKo' },
    { code: 'ja', name: 'Japanese', nameEn: 'Japanese', langKey: 'translate.settings.langJa' },
  ],
};

class TranslateErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TranslateSettingsPanel] Render Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-6 space-y-3">
          <div className="flex items-center gap-2 text-error font-bold text-sm">
            <span className="material-symbols-outlined">error</span>
            Failed to load Settings & AI Models
          </div>
          <p className="text-xs text-on-surface-variant">
            Error rendering settings: {this.state.error?.message}
          </p>
          <pre className="text-[11px] font-mono p-3 bg-black/40 rounded-lg overflow-auto text-on-surface-variant max-h-40">
            {this.state.error?.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-xs font-semibold text-on-primary hover:brightness-110"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function TranslateSettingsPanelContent({ settings: propSettings, onUpdateSetting, localEngines: propLocalEngines }) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const [settings, setSettings] = useState(propSettings || null);

  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings);
    }
  }, [propSettings]);

  useEffect(() => {
    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setSettings((prev) => ({ ...(prev || {}), ...e.detail }));
      }
    };
    window.addEventListener('translate:settingsUpdated', handleSettingsUpdated);
    return () => window.removeEventListener('translate:settingsUpdated', handleSettingsUpdated);
  }, []);

  const [models, setModels] = useState([]);
  const [downloadProgressMap, setDownloadProgressMap] = useState({});
  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
  const [diskUsage, setDiskUsage] = useState(null);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [clearCacheResult, setClearCacheResult] = useState(null);
  const [importStatus, setImportStatus] = useState(null);

  // Local Engines
  const [localEngines, setLocalEngines] = useState(propLocalEngines || null);

  useEffect(() => {
    if (propLocalEngines) {
      setLocalEngines(propLocalEngines);
    }
  }, [propLocalEngines]);

  const [isCustomModelInputMode, setIsCustomModelInputMode] = useState(false);

  // Guide, Providers & Reset modals
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideInitialTab, setGuideInitialTab] = useState('ollama');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showProvidersModal, setShowProvidersModal] = useState(false);
  const [quickTestBusy, setQuickTestBusy] = useState(false);
  const [quickTestResult, setQuickTestResult] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetToast, setResetToast] = useState(null);

  const loadDiskUsage = useCallback(() => {
    api?.translateGetDiskUsage?.()?.then((u) => {
      if (u) setDiskUsage(u);
    })?.catch(() => { });
  }, [api]);

  const refreshLocalEngines = useCallback(() => {
    api?.translateDetectLocalEngines?.()?.then((eng) => {
      if (eng) setLocalEngines(eng);
    })?.catch(() => { });
  }, [api]);

  // Load settings on mount
  useEffect(() => {
    if (!api) {
      setSettings(FALLBACK_SETTINGS);
      return;
    }

    api.translateGetSettings?.()
      ?.then((s) => {
        if (s) setSettings((prev) => ({ ...FALLBACK_SETTINGS, ...prev, ...s }));
        else setSettings(FALLBACK_SETTINGS);
      })
      ?.catch((err) => {
        console.warn('[TranslateSettingsPanel] loadSettings failed, using fallback:', err.message);
        setSettings(FALLBACK_SETTINGS);
      });

    api.translateGetModelStatus?.()
      ?.then((m) => {
        if (Array.isArray(m)) setModels(m);
      })
      ?.catch(() => { });

    api.translateGetLanguages?.()
      ?.then((l) => {
        if (l?.source && l?.target) setLanguages(l);
      })
      ?.catch(() => { });

    loadDiskUsage();
    refreshLocalEngines();

    const unsub = api.subscribeModelDownloadProgress?.((p) => {
      if (!p?.modelId) return;
      setDownloadProgressMap((prev) => ({
        ...prev,
        [p.modelId]: p,
      }));

      if (p.percent >= 100) {
        setTimeout(() => {
          api.translateGetModelStatus?.()?.then((m) => {
            if (Array.isArray(m)) setModels(m);
          });
          loadDiskUsage();
          setDownloadProgressMap((prev) => {
            const next = { ...prev };
            delete next[p.modelId];
            return next;
          });
        }, 500);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [api, loadDiskUsage, refreshLocalEngines]);

  const handleResetSettings = useCallback(async (keepApiKeys) => {
    setResetBusy(true);
    try {
      const res = await api?.translateResetSettings?.({ keepApiKeys });
      if (res?.success && res.settings) {
        setSettings(res.settings);
        setResetToast(t('translate.settings.resetSuccess'));
        setTimeout(() => setResetToast(null), 4000);
      } else {
        setResetToast(t('translate.settings.resetFailed', { error: res?.error || 'Error' }));
      }
    } catch (err) {
      setResetToast(t('translate.settings.resetFailed', { error: err.message }));
    } finally {
      setResetBusy(false);
      setShowResetModal(false);
    }
  }, [api, t]);

  const save = useCallback((partial) => {
    setSettings((prev) => {
      const current = prev || FALLBACK_SETTINGS;
      const next = { ...current, ...partial };
      api?.translateSaveSettings?.(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('translate:settingsUpdated', { detail: next }));
      }
      return next;
    });
    onUpdateSetting?.(partial);
  }, [api, onUpdateSetting]);

  const safeSettings = useMemo(() => {
    return {
      ...FALLBACK_SETTINGS,
      ...(settings || {}),
      providers: {
        ...DEFAULT_PRESET_PROVIDERS_MAP,
        ...(settings?.providers || {}),
      },
      apiKeys: {
        ...FALLBACK_SETTINGS.apiKeys,
        ...(settings?.apiKeys || {}),
        openaiCompatible: {
          ...FALLBACK_SETTINGS.apiKeys.openaiCompatible,
          ...(settings?.apiKeys?.openaiCompatible || {}),
        },
      },
    };
  }, [settings]);

  const activeProviderId = safeSettings.translationProvider === 'openai_compatible'
    ? 'ollama'
    : (safeSettings.translationProvider || 'gemini');
  const currentProviderConfig = safeSettings.providers?.[activeProviderId] || {};

  const isCurrentProviderLocal = Boolean(
    activeProviderId === 'ollama' ||
    activeProviderId === 'lmstudio' ||
    currentProviderConfig.type === 'local' ||
    currentProviderConfig.category === 'local' ||
    (currentProviderConfig.baseUrl && (
      currentProviderConfig.baseUrl.includes('localhost') ||
      currentProviderConfig.baseUrl.includes('127.0.0.1') ||
      currentProviderConfig.baseUrl.includes('11434') ||
      currentProviderConfig.baseUrl.includes('1234')
    ))
  );

  const isLocalOnline = Boolean(
    localEngines?.ollama?.online ||
    localEngines?.lmstudio?.online ||
    localEngines?.custom?.online ||
    (localEngines?.detectedModels && localEngines.detectedModels.length > 0)
  );

  const isActiveProviderConfigured = Boolean(
    currentProviderConfig.credential?.trim() ||
    (isCurrentProviderLocal && (
      currentProviderConfig.baseUrl ||
      isLocalOnline
    ))
  );

  // Tự động dọn dẹp legacy openai_compatible nếu còn sót lại từ các bản cũ
  useEffect(() => {
    const hasLegacyProvider = safeSettings.translationProvider === 'openai_compatible';
    const hasLegacyConfig = Boolean(safeSettings.providers?.openai_compatible && !safeSettings.providers.openai_compatible.isCustom);
    if (hasLegacyProvider || hasLegacyConfig) {
      const updatedProviders = { ...(safeSettings.providers || {}) };
      if (hasLegacyConfig) {
        delete updatedProviders.openai_compatible;
      }
      save({
        ...(hasLegacyProvider ? { translationProvider: 'ollama' } : {}),
        providers: updatedProviders,
      });
    }
  }, [safeSettings.translationProvider, safeSettings.providers, save]);

  const getProviderDisplayName = useCallback((id, info) => {
    if (info?.name && info.name !== 'openai_compatible') {
      return info.name;
    }
    const i18nKey = `translate.providers.${id}`;
    const translated = t(i18nKey);
    if (translated && translated !== i18nKey) return translated;
    const FALLBACK_NAMES = {
      gemini: 'Google Gemini',
      openai: 'OpenAI (GPT-4o)',
      claude: 'Anthropic Claude',
      deepseek: 'DeepSeek',
      openrouter: 'OpenRouter',
      deepl: 'DeepL Translate',
      ollama: 'Ollama (Local AI)',
      lmstudio: 'LM Studio',
    };
    return FALLBACK_NAMES[id] || id;
  }, [t]);

  const isLocalProvider = useCallback((id, info) => {
    if (id === 'ollama' || id === 'lmstudio') return true;
    if (info?.type === 'local' || info?.category === 'local') return true;
    const url = (info?.baseUrl || '').toLowerCase();
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('11434') || url.includes('1234')) {
      return true;
    }
    return false;
  }, []);

  const { providerSelectGroups, providerSelectOptions } = useMemo(() => {
    const providers = safeSettings.providers || {};
    const localList = [];
    const cloudList = [];
    const allList = [];

    for (const [id, info] of Object.entries(providers)) {
      // Dọn sạch: Bỏ qua mục openai_compatible thừa nếu không phải custom do người dùng tự thêm
      if (id === 'openai_compatible' && !info.isCustom) continue;

      const isLocal = isLocalProvider(id, info);
      const isReady = isLocal
        ? Boolean(info.credential?.trim() || info.baseUrl || id === 'ollama' || id === 'lmstudio' || isLocalOnline)
        : Boolean(info.credential?.trim());
      const isCustom = Boolean(info.isCustom);

      const dispName = getProviderDisplayName(id, info);
      const customTag = isCustom ? ` ${t('translate.settings.statusCustom') || '(Tùy chỉnh)'}` : '';
      const statusTag = isReady
        ? ` • ${t('translate.settings.statusReady') || 'Sẵn sàng'}`
        : (isLocal ? ` ${t('translate.settings.statusOffline') || '(Offline)'}` : ` ${t('translate.settings.statusNoKey') || '(Chưa có key)'}`);

      const icon = info.type === 'gemini'
        ? 'auto_awesome'
        : (info.type === 'claude'
          ? 'psychology'
          : (info.type === 'deepl'
            ? 'translate'
            : (id === 'openrouter'
              ? 'hub'
              : (id === 'deepseek'
                ? 'neurology'
                : (isLocal ? 'dns' : 'cloud')))));

      const opt = {
        value: id,
        label: `${dispName}${customTag}${statusTag}`,
        icon,
      };

      if (isLocal) {
        localList.push(opt);
      } else {
        cloudList.push(opt);
      }
      allList.push(opt);
    }

    const groups = [
      {
        label: t('translate.settings.groupLocal') || 'Mô hình Local LLM (Offline)',
        icon: 'dns',
        options: localList,
      },
      {
        label: t('translate.settings.groupCloud') || 'Nhà cung cấp Cloud API (Trực tuyến)',
        icon: 'cloud',
        options: cloudList,
      },
    ].filter((g) => g.options.length > 0);

    return { providerSelectGroups: groups, providerSelectOptions: allList };
  }, [safeSettings.providers, isLocalProvider, getProviderDisplayName, isLocalOnline, t]);

  const activeGuide = useMemo(() => {
    return PROVIDER_MODEL_GUIDES[activeProviderId] || null;
  }, [activeProviderId]);

  const modelSelectOptions = useMemo(() => {
    const pId = activeProviderId;
    if (pId === 'deepl') return [];

    const isLocal = isLocalProvider(pId);
    if (isLocal) {
      const engines = localEngines;
      const installed = [
        ...(engines?.ollama?.models || []),
        ...(engines?.lmstudio?.models || []),
        ...(engines?.detectedModels || []),
      ];

      const modelMap = new Map();
      installed.forEach((m) => {
        const mid = m.id || m.name;
        if (!mid) return;
        if (/ocr|paddle|detr/i.test(mid)) return;
        const meta = PREDEFINED_LOCAL_MODEL_META[mid] || {};
        modelMap.set(mid, {
          value: mid,
          label: `${meta.name || m.name || mid} (${mid})`,
          badge: meta.badge || m.size || m.engine || 'Đã cài',
          materialIcon: 'smart_toy',
        });
      });

      // Nếu chưa có model nào được phát hiện trong máy (chưa bật server hoặc chưa tải model), mới hiển thị gợi ý preset từ guide
      if (modelMap.size === 0) {
        const guideModels = PROVIDER_MODEL_GUIDES[pId]?.models || [];
        guideModels.forEach((gm) => {
          if (!modelMap.has(gm.id)) {
            modelMap.set(gm.id, {
              value: gm.id,
              label: `${gm.name} (${gm.id})`,
              badge: gm.badge,
              materialIcon: gm.highlight ? 'star' : 'smart_toy',
            });
          }
        });
      }

      return Array.from(modelMap.values());
    }

    // Kiểm tra danh sách model đã phát hiện động (Dynamic Discovery) từ cache
    let discoveredModels = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem(`manga_crawler_discovered_models_${activeProviderId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            discoveredModels = parsed;
          }
        }
      }
    } catch {}

    if (discoveredModels && discoveredModels.length > 0) {
      const guideModels = activeGuide?.models || [];
      const guideMap = new Map(guideModels.map((g) => [g.id, g]));
      return discoveredModels.map((m) => {
        const gInfo = guideMap.get(m.id);
        return {
          value: m.id,
          label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
          badge: gInfo?.badge || (m.id.includes('flash') ? 'Flash' : m.id.includes('pro') ? 'Pro' : 'API'),
          materialIcon: gInfo?.highlight ? 'star' : 'auto_awesome',
        };
      });
    }

    if (activeGuide?.models?.length > 0) {
      return activeGuide.models.map((m) => ({
        value: m.id,
        label: `${m.name} (${m.id})`,
        badge: m.badge,
        materialIcon: m.highlight ? 'star' : 'auto_awesome',
      }));
    }

    if (currentProviderConfig.isCustom) {
      return [
        { value: 'gpt-4o', label: 'GPT-4o (Omni)', badge: 'SOTA', materialIcon: 'star' },
        { value: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', badge: 'Anthropic', materialIcon: 'auto_awesome' },
        { value: 'deepseek-chat', label: 'DeepSeek V3', badge: 'Khuyên dùng', materialIcon: 'star' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Google', materialIcon: 'auto_awesome' },
      ];
    }

    return [
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', badge: 'Nhanh', materialIcon: 'star' },
      { value: 'gpt-4o', label: 'GPT-4o', badge: 'SOTA', materialIcon: 'auto_awesome' },
      { value: 'deepseek-chat', label: 'DeepSeek-V3', badge: 'Rẻ & Tốt', materialIcon: 'star' },
    ];
  }, [activeProviderId, isLocalProvider, localEngines, activeGuide, currentProviderConfig]);

  const fullModelSelectOptions = useMemo(() => {
    const cur = safeSettings.activeModel;
    const exists = !cur || modelSelectOptions.some((o) => o.value === cur);
    const baseList = exists
      ? [...modelSelectOptions]
      : [
          {
            value: cur,
            label: `Model tùy chỉnh: ${cur}`,
            badge: 'Tùy chỉnh',
            materialIcon: 'edit',
          },
          ...modelSelectOptions,
        ];

    return baseList;
  }, [modelSelectOptions, safeSettings.activeModel]);

  const detectionModelOptions = useMemo(() => {
    const cur = safeSettings.detectionModel;
    if (cur && !DETECTION_MODEL_OPTIONS.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur, icon: 'frame_inspect' }, ...DETECTION_MODEL_OPTIONS];
    }
    return DETECTION_MODEL_OPTIONS;
  }, [safeSettings.detectionModel]);

  const ocrModelOptions = useMemo(() => {
    const cur = safeSettings.ocrModel;
    if (cur && !OCR_MODEL_OPTIONS.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur, icon: 'document_scanner' }, ...OCR_MODEL_OPTIONS];
    }
    return OCR_MODEL_OPTIONS;
  }, [safeSettings.ocrModel]);

  const inpaintingModelOptions = useMemo(() => {
    const cur = safeSettings.inpaintingModel;
    if (cur && !INPAINTING_MODEL_OPTIONS.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur, icon: 'auto_fix_high' }, ...INPAINTING_MODEL_OPTIONS];
    }
    return INPAINTING_MODEL_OPTIONS;
  }, [safeSettings.inpaintingModel]);

  const sourceLanguageOptions = useMemo(() => {
    return (languages?.source || []).map((l) => ({
      value: l.code,
      label: l.langKey ? t(l.langKey) : l.name,
      icon: 'language',
    }));
  }, [languages?.source, t]);

  const targetLanguageOptions = useMemo(() => {
    return (languages?.target || []).map((l) => ({
      value: l.code,
      label: l.langKey ? t(l.langKey) : l.name,
      icon: 'flag',
    }));
  }, [languages?.target, t]);

  const allAvailableFontOptions = useMemo(() => {
    const currentStack = safeSettings.fontStack || DEFAULT_FONT_STACK;
    const set = new Set([...currentStack, ...AVAILABLE_FONTS]);
    return Array.from(set).map((f) => ({
      value: f,
      label: f,
      icon: 'font_download',
    }));
  }, [safeSettings.fontStack]);

  const unaddedFontOptions = useMemo(() => {
    const currentStack = safeSettings.fontStack || DEFAULT_FONT_STACK;
    return AVAILABLE_FONTS
      .filter((f) => !currentStack.includes(f))
      .map((f) => ({
        value: f,
        label: f,
        icon: 'add_circle',
      }));
  }, [safeSettings.fontStack]);

  const handleQuickTest = useCallback(async () => {
    const pId = safeSettings.translationProvider || 'gemini';
    const pConfig = safeSettings.providers?.[pId] || {};
    setQuickTestBusy(true);
    setQuickTestResult(null);
    try {
      const res = await api?.translateTestProviderConnection?.({
        id: pId,
        type: pConfig.type,
        credential: pConfig.credential,
        baseUrl: pConfig.baseUrl,
        model: safeSettings.activeModel || pConfig.defaultModel,
      });
      setQuickTestResult(res || { success: false, error: 'Không nhận được phản hồi' });
    } catch (err) {
      setQuickTestResult({ success: false, error: err.message });
    } finally {
      setQuickTestBusy(false);
    }
  }, [api, safeSettings]);

  const handleDownloadModel = useCallback(async (modelId) => {
    if (!api?.translateDownloadModel) return;
    setDownloadProgressMap((prev) => ({
      ...prev,
      [modelId]: { modelId, percent: 0, detail: t('translate.settings.startConnectMsg') },
    }));
    try {
      const res = await api.translateDownloadModel(modelId);
      if (res && !res.success) {
        setDownloadProgressMap((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    } catch {
      setDownloadProgressMap((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
    api.translateGetModelStatus?.()?.then((m) => {
      if (Array.isArray(m)) setModels(m);
    });
    loadDiskUsage();
  }, [api, loadDiskUsage, t]);

  const handleCancelDownload = useCallback((modelId) => {
    api?.translateCancelModelDownload?.(modelId);
    setDownloadProgressMap((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, [api]);

  const handleDownloadAll = useCallback(() => {
    const uninstalled = (models || []).filter((m) => !m.installed && !downloadProgressMap[m.id]);
    for (const m of uninstalled) {
      handleDownloadModel(m.id);
    }
  }, [models, downloadProgressMap, handleDownloadModel]);

  const handleDeleteModel = useCallback(async (modelId) => {
    if (!api?.translateDeleteModel) return;
    await api.translateDeleteModel(modelId);
    api.translateGetModelStatus?.()?.then((m) => {
      if (Array.isArray(m)) setModels(m);
    });
    loadDiskUsage();
  }, [api, loadDiskUsage]);

  const handleRefreshModels = useCallback(() => {
    api?.translateGetModelStatus?.()?.then((m) => {
      if (Array.isArray(m)) setModels(m);
    });
    loadDiskUsage();
  }, [api, loadDiskUsage]);

  const handleOpenModelFolder = useCallback((modelId) => {
    api?.translateOpenModelFolder?.(modelId);
  }, [api]);

  const handleImportModelFile = useCallback(async (modelId, targetFilename) => {
    if (!api?.translateImportModelFile) return;
    setImportStatus(null);
    try {
      const res = await api.translateImportModelFile(modelId, targetFilename);
      if (res?.canceled) return;
      if (res?.success) {
        setImportStatus({
          success: true,
          message: t('translate.settings.importSuccess', { filename: res.filename || '' }),
        });
        api.translateGetModelStatus?.()?.then((m) => {
          if (Array.isArray(m)) setModels(m);
        });
        loadDiskUsage();
      } else {
        setImportStatus({
          success: false,
          message: t('translate.settings.importFailed', { error: res?.error || 'Error' }),
        });
      }
    } catch (err) {
      setImportStatus({
        success: false,
        message: t('translate.settings.importFailed', { error: err.message || 'Error' }),
      });
    }
  }, [api, loadDiskUsage, t]);

  const handleClearCache = useCallback(async () => {
    if (!api?.translateClearCache) return;
    setClearCacheBusy(true);
    setClearCacheResult(null);
    try {
      const res = await api.translateClearCache();
      const freedMb = ((res?.freedBytes || 0) / (1024 * 1024)).toFixed(1);
      setClearCacheResult({
        success: true,
        message: t('translate.settings.clearCacheSuccess', { count: res?.deletedFiles || 0, freedMb }),
      });
      loadDiskUsage();
    } catch (err) {
      setClearCacheResult({
        success: false,
        message: t('translate.settings.clearCacheFailed', { error: err.message || 'Error' }),
      });
    } finally {
      setClearCacheBusy(false);
    }
  }, [api, loadDiskUsage, t]);

  const [collapsedCards, setCollapsedCards] = useState({});

  const isCardOpen = (id) => !collapsedCards[id];
  const toggleCard = (id) => {
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Reset Toast Notification */}
      {resetToast && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{resetToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetToast(null)}
            className="cursor-pointer text-emerald-700 dark:text-emerald-300 hover:opacity-75"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ─── 1. BÓC TÁCH KHUNG, OCR & TẨY CHỮ (PIPELINE ENGINES) ─── */}
      <TranslatePipelineEnginesSection
        safeSettings={safeSettings}
        save={save}
        isCardOpen={isCardOpen}
        toggleCard={toggleCard}
        detectionModelOptions={detectionModelOptions}
        ocrModelOptions={ocrModelOptions}
        inpaintingModelOptions={inpaintingModelOptions}
      />

      {/* ─── 2. ĐỘNG CƠ DỊCH THUẬT & API KEY (AI PROVIDER) ─── */}
      <div className="space-y-3.5">
        <SettingCard
          isOpen={isCardOpen('engine')}
          onToggle={() => toggleCard('engine')}
          icon="translate"
          title={t('translate.settings.sec1Title') || 'Động cơ dịch thuật'}
          badge={
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${
              isActiveProviderConfigured
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
            }`}>
              {isActiveProviderConfigured
                ? (t('translate.settings.statusReadyBadge') || '✓ Sẵn sàng')
                : (t('translate.settings.statusNoKeyBadge') || '⚠ Chưa có Key')}
            </span>
          }
        >
          <div className="space-y-3.5">
            {/* Row 1: Active Provider Dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-on-surface block">
                  {t('translate.settings.providerLabel') || 'Nhà cung cấp AI (Provider)'}
                </label>
              </div>

              <SearchableSelect
                value={activeProviderId}
                onChange={(val) => {
                  const targetProvider = safeSettings.providers?.[val];
                  let nextModel = targetProvider?.defaultModel;
                  if (!nextModel) {
                    if (val === 'ollama' && localEngines) {
                      const detected = [
                        ...(localEngines?.ollama?.models || []),
                        ...(localEngines?.detectedModels || []),
                      ];
                      if (detected.length > 0 && (detected[0].id || detected[0].name)) {
                        nextModel = detected[0].id || detected[0].name;
                      }
                    }
                    if (!nextModel) {
                      nextModel = PROVIDER_MODEL_GUIDES[val]?.recommended;
                    }
                  }
                  save({
                    translationProvider: val,
                    ...(nextModel ? { activeModel: nextModel } : {}),
                    ...(nextModel && targetProvider
                      ? {
                          providers: {
                            ...(safeSettings.providers || {}),
                            [val]: { ...targetProvider, defaultModel: nextModel },
                          },
                        }
                      : {}),
                  });
                }}
                groups={providerSelectGroups}
                options={providerSelectOptions}
                placeholder={t('translate.settings.providerSelectPlaceholder') || 'Chọn nhà cung cấp AI...'}
                className="w-full"
              />
            </div>

            {/* Row 2: Model selection / input */}
            {activeProviderId === 'deepl' ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-high/40 text-xs">
                <div className="flex items-center gap-2 text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-primary">translate</span>
                  <span className="font-semibold text-xs">DeepL Translate API</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Tự động (Không cần model)
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-on-surface block">
                      Model AI
                    </label>
                    {activeGuide?.name && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant/80 font-mono">
                        {activeGuide.name}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomModelInputMode((prev) => !prev)}
                    className="cursor-pointer text-[11px] text-primary hover:opacity-80 flex items-center gap-1 font-medium transition-colors"
                    data-tooltip={isCustomModelInputMode ? 'Quay lại danh sách chọn model' : 'Gõ mã model tùy chỉnh'}
                    aria-label={isCustomModelInputMode ? 'Quay lại danh sách chọn model' : 'Gõ mã model tùy chỉnh'}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {isCustomModelInputMode ? 'list' : 'edit'}
                    </span>
                    <span>{isCustomModelInputMode ? 'Chọn từ danh sách' : 'Nhập tay model'}</span>
                  </button>
                </div>

                {isCustomModelInputMode ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={
                        activeGuide?.recommended
                          ? `Ví dụ: ${activeGuide.recommended}`
                          : 'Nhập mã model (VD: mistral:7b)...'
                      }
                      value={safeSettings.activeModel || ''}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        const currentPId = safeSettings.translationProvider;
                        const currentP = safeSettings.providers?.[currentPId] || {};
                        save({
                          activeModel: newModel,
                          ...(currentPId
                            ? {
                                providers: {
                                  ...(safeSettings.providers || {}),
                                  [currentPId]: { ...currentP, defaultModel: newModel },
                                },
                              }
                            : {}),
                        });
                      }}
                      className="flex-1 min-w-0 h-10 rounded-xl border border-primary/40 bg-surface-container-lowest px-3 text-xs font-mono text-on-surface focus:border-primary focus:outline-none transition-colors"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomModelInputMode(false)}
                      className="cursor-pointer h-10 px-3 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface flex items-center gap-1 shrink-0 transition-colors"
                      data-tooltip="Quay lại danh sách chọn model"
                      aria-label="Quay lại danh sách chọn model"
                    >
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>Xong</span>
                    </button>
                  </div>
                ) : (
                  <SearchableSelect
                    value={
                      fullModelSelectOptions.some((m) => m.value === (safeSettings.activeModel || ''))
                        ? (safeSettings.activeModel || '')
                        : ''
                    }
                    onChange={(val, customQuery) => {
                      if (val === '__custom__') {
                        if (customQuery) {
                          const currentPId = safeSettings.translationProvider;
                          save({
                            activeModel: customQuery,
                            ...(currentPId
                              ? {
                                  providers: {
                                    ...(safeSettings.providers || {}),
                                    [currentPId]: {
                                      ...(safeSettings.providers?.[currentPId] || {}),
                                      defaultModel: customQuery,
                                      model: customQuery,
                                    },
                                  },
                                }
                              : {}),
                          });
                        }
                        setIsCustomModelInputMode(true);
                        return;
                      }
                      if (val) {
                        const currentPId = safeSettings.translationProvider;
                        const currentP = safeSettings.providers?.[currentPId] || {};
                        save({
                          activeModel: val,
                          ...(currentPId
                            ? {
                                providers: {
                                  ...(safeSettings.providers || {}),
                                  [currentPId]: { ...currentP, defaultModel: val },
                                },
                              }
                            : {}),
                        });
                      }
                    }}
                    options={fullModelSelectOptions}
                    placeholder="Chọn Model AI..."
                    showPlaceholderOption={false}
                    className="w-full"
                  />
                )}

                {/* Model description or custom model note */}
                {(() => {
                  const currentMId = safeSettings.activeModel;
                  const currentInfo = activeGuide?.models?.find((m) => m.id === currentMId);
                  if (currentInfo?.desc) {
                    return (
                      <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">info</span>
                        <span>{currentInfo.desc}</span>
                      </div>
                    );
                  }
                  if (currentMId && !currentInfo && !modelSelectOptions.some((m) => m.value === currentMId)) {
                    return (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-primary flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">edit</span>
                        <span>Model tùy chỉnh: <code className="font-mono font-semibold">{currentMId}</code></span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Row 3: Quick Action Bar */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickTest}
                  disabled={quickTestBusy}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-primary hover:brightness-110 px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-all disabled:opacity-40 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px] leading-none">
                    {quickTestBusy ? 'progress_activity' : 'bolt'}
                  </span>
                  <span>{quickTestBusy ? 'Đang kiểm tra...' : 'Test kết nối'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowProvidersModal(true)}
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all shadow-2xs"
                  data-tooltip="Mở bảng điều khiển kết nối Providers & gợi ý chọn model chi tiết"
                >
                  <span className="material-symbols-outlined text-[15px] text-primary">tune</span>
                  <span>Quản lý & Gợi ý model</span>
                </button>

                {quickTestResult?.success && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold animate-fadeIn">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    <span>Sẵn sàng ({quickTestResult.latencyMs}ms)</span>
                  </span>
                )}
              </div>

              {quickTestResult && !quickTestResult.success && (
                <div className="text-xs px-3 py-2 rounded-xl border border-error/30 bg-error/10 text-error flex items-start gap-2 animate-fadeIn">
                  <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5">error</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-xs block">Kiểm tra kết nối thất bại</span>
                    {quickTestResult.error && (
                      <p className="text-[11px] text-on-surface-variant break-words leading-relaxed mt-0.5 font-mono">
                        {quickTestResult.error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* DeepL OCR Notice Callout */}
            {safeSettings.translationProvider === 'deepl' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-on-surface space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <span>DeepL chỉ dịch văn bản thuần</span>
                </div>
                <p className="text-on-surface-variant leading-relaxed text-[11px]">
                  DeepL không hỗ trợ Vision OCR đọc trực tiếp từ tranh. Quy trình sẽ sử dụng PaddleOCR / Manga OCR để đọc chữ trước khi gửi sang DeepL dịch.
                </p>
              </div>
            )}
          </div>
        </SettingCard>
      </div>

      {/* ─── 3. CÀI ĐẶT CHUNG (LANGUAGE PAIR, TYPOGRAPHY, CACHE, RESET) ─── */}
      <TranslateGeneralSettingsSection
        safeSettings={safeSettings}
        save={save}
        isCardOpen={isCardOpen}
        toggleCard={toggleCard}
        sourceLanguageOptions={sourceLanguageOptions}
        targetLanguageOptions={targetLanguageOptions}
        allAvailableFontOptions={allAvailableFontOptions}
        unaddedFontOptions={unaddedFontOptions}
        defaultFontStack={DEFAULT_FONT_STACK}
        diskUsage={diskUsage}
        clearCacheBusy={clearCacheBusy}
        clearCacheResult={clearCacheResult}
        onClearCache={handleClearCache}
        onOpenResetModal={() => setShowResetModal(true)}
      />

      {/* ─── 4. MODELS AI OFFLINE ─── */}
      <TranslateOfflineModelsSection
        models={models}
        downloadProgressMap={downloadProgressMap}
        importStatus={importStatus}
        setImportStatus={setImportStatus}
        isCardOpen={isCardOpen}
        toggleCard={toggleCard}
        onRefreshModels={handleRefreshModels}
        onOpenModelFolder={handleOpenModelFolder}
        onDownloadAll={handleDownloadAll}
        onDownloadModel={handleDownloadModel}
        onCancelDownload={handleCancelDownload}
        onDeleteModel={handleDeleteModel}
        onImportModelFile={handleImportModelFile}
      />

      {/* ─── Guide Modal, Providers Modal & Reset Defaults Confirmation Modal ─── */}
      <TranslateGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialTab={guideInitialTab}
      />

      <TranslateProvidersModal
        isOpen={showProvidersModal}
        onClose={() => setShowProvidersModal(false)}
        settings={safeSettings}
        onUpdateSetting={save}
      />

      <ResetDefaultsConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleResetSettings}
        busy={resetBusy}
      />
    </div>
  );
}

export default function TranslateSettingsPanel({ settings, onUpdateSetting, localEngines }) {
  return (
    <TranslateErrorBoundary>
      <TranslateSettingsPanelContent
        settings={settings}
        onUpdateSetting={onUpdateSetting}
        localEngines={localEngines}
      />
    </TranslateErrorBoundary>
  );
}
