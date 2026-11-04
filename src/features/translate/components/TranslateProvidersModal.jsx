import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect } from '../../../shared';
import { PROVIDER_MODEL_GUIDES, PREDEFINED_LOCAL_MODEL_META } from '../constants/providerModelGuides';

/**
 * Danh sách Preset Providers chuẩn theo phong cách Koharu,
 * chia thành 2 nhóm rõ ràng: 'local' (offline) và 'api' (cloud).
 */
export const PRESET_PROVIDERS = [
  // ─── NHÀ CUNG CẤP CLOUD API (TRỰC TUYẾN) ───
  {
    id: 'gemini',
    name: 'Gemini',
    fullName: 'Google Gemini',
    description: 'Google Gemini models — Free tier 15 req/phút, hỗ trợ dịch thuật & OCR',
    icon: 'auto_awesome',
    type: 'gemini',
    category: 'api',
    badge: 'Cloud',
    hasCustomUrl: false,
    defaultModel: 'gemini-3.5-flash',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIzaSy...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    fullName: 'OpenAI',
    description: 'OpenAI language models (GPT-4o, GPT-4o-mini)',
    icon: 'smart_toy',
    type: 'openai_compatible',
    category: 'api',
    badge: 'Cloud',
    hasCustomUrl: true,
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
  },
  {
    id: 'claude',
    name: 'Claude',
    fullName: 'Anthropic Claude',
    description: 'Anthropic Claude models (Claude 3.5 Sonnet / Haiku)',
    icon: 'psychology',
    type: 'claude',
    category: 'api',
    badge: 'Cloud',
    hasCustomUrl: true,
    defaultUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-7-sonnet',
    docsUrl: 'https://console.anthropic.com/',
    keyHint: 'sk-ant-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    fullName: 'DeepSeek',
    description: 'DeepSeek language models (V3, R1)',
    icon: 'neurology',
    type: 'openai_compatible',
    category: 'api',
    badge: 'Cloud',
    hasCustomUrl: true,
    defaultUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/',
    keyHint: 'sk-...',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    fullName: 'OpenRouter',
    description: 'Models routed through OpenRouter (hỗ trợ Free models)',
    icon: 'hub',
    type: 'openai_compatible',
    category: 'api',
    badge: 'Router',
    hasCustomUrl: true,
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    docsUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-...',
  },
  {
    id: 'deepl',
    name: 'DeepL',
    fullName: 'DeepL Translate',
    description: 'DeepL translation API (Free 500K chars/tháng)',
    icon: 'translate',
    type: 'deepl',
    category: 'api',
    badge: 'Service',
    hasCustomUrl: true,
    defaultUrl: 'https://api-free.deepl.com/v2',
    defaultModel: '',
    docsUrl: 'https://www.deepl.com/pro-api',
    keyHint: '...',
  },

  // ─── MÔ HÌNH LOCAL LLM (100% OFFLINE) ───
  {
    id: 'ollama',
    name: 'Ollama',
    fullName: 'Ollama (Local AI)',
    description: 'Local LLM offline 100% trên máy tính qua Ollama server (port 11434)',
    icon: 'dns',
    type: 'local',
    category: 'local',
    badge: 'Local',
    hasCustomUrl: true,
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    keyHint: 'ollama',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    fullName: 'LM Studio',
    description: 'Mô hình phục vụ qua LM Studio Local Server offline (port 1234)',
    icon: 'terminal',
    type: 'local',
    category: 'local',
    badge: 'Local',
    hasCustomUrl: true,
    defaultUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    keyHint: 'lm-studio',
  },
];

/**
 * Helper phân tách danh sách các keys từ chuỗi credential (hoặc mảng).
 */
export function parseKeys(credential) {
  if (Array.isArray(credential)) {
    return credential.length > 0 ? credential : [''];
  }
  if (typeof credential !== 'string' || !credential) return [''];
  if (!credential.includes('\n') && (credential.includes(',') || credential.includes(';'))) {
    const parts = credential.split(/[,;]+/).map((k) => k.trim());
    return parts.length > 0 ? parts : [''];
  }
  const lines = credential.split(/\r?\n/).map((k) => k.trim());
  return lines.length > 0 ? lines : [''];
}

/**
 * Component hiển thị danh sách nhiều API Keys cho một Provider,
 * mỗi key có icon test kết nối riêng biệt, nút ẩn/hiện và nút xóa.
 */
function ProviderKeyList({
  providerId,
  providerConfig,
  placeholder,
  testStatusMap,
  showKeyMap,
  onToggleShowKey,
  onUpdateKeyAt,
  onAddKeyRow,
  onDeleteKeyRow,
  onTestKey,
}) {
  const rawCred = providerConfig?.credential || '';
  const keys = useMemo(() => parseKeys(rawCred), [rawCred]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          API Keys ({keys.filter((k) => k.trim()).length})
        </label>
        {keys.filter((k) => k.trim()).length > 0 ? (
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[12px]">check</span>
            <span>{keys.filter((k) => k.trim()).length} key đã cấu hình</span>
          </span>
        ) : (
          <span className="text-[10px] font-medium text-on-surface-variant/50">
            Chưa nhập key
          </span>
        )}
      </div>

      <div className="space-y-2">
        {keys.map((keyVal, keyIdx) => {
          const keyTestId = `${providerId}_key_${keyIdx}`;
          const keyStatus = testStatusMap[keyTestId];
          const isVisible = showKeyMap[`${providerId}_${keyIdx}`];

          return (
            <div key={keyIdx} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    placeholder={placeholder || 'sk-...'}
                    value={keyVal}
                    onChange={(e) => onUpdateKeyAt(providerId, keyIdx, e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 py-1.5 text-xs font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => onToggleShowKey(providerId, keyIdx)}
                    className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface p-0.5"
                    data-tooltip={isVisible ? 'Ẩn key' : 'Hiện key'}
                    aria-label={isVisible ? 'Ẩn key' : 'Hiện key'}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isVisible ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>

                {/* Nút test riêng cho key này */}
                <button
                  type="button"
                  disabled={!keyVal.trim() || keyStatus?.testing}
                  onClick={() => onTestKey(providerConfig, keyIdx, keyVal)}
                  className={`cursor-pointer shrink-0 h-8 px-2.5 rounded-xl border flex items-center gap-1 text-xs font-medium transition-all ${
                    keyStatus?.success === true
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : keyStatus?.success === false
                      ? 'border-error/40 bg-error/10 text-error'
                      : 'border-outline-variant/30 hover:border-primary hover:bg-primary/5 text-on-surface-variant'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  data-tooltip="Kiểm tra kết nối và đo độ trễ riêng cho key này"
                  aria-label="Kiểm tra kết nối riêng cho key này"
                >
                  {keyStatus?.testing ? (
                    <span className="material-symbols-outlined text-[15px] animate-spin text-primary">
                      progress_activity
                    </span>
                  ) : keyStatus?.success === true ? (
                    <>
                      <span className="material-symbols-outlined text-[15px] text-emerald-500">check_circle</span>
                      {keyStatus.latencyMs !== undefined && (
                        <span className="text-[11px] font-mono font-bold">{keyStatus.latencyMs}ms</span>
                      )}
                    </>
                  ) : keyStatus?.success === false ? (
                    <>
                      <span className="material-symbols-outlined text-[15px] text-error">error</span>
                      <span className="text-[11px] font-bold">Lỗi</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[15px] text-amber-500">bolt</span>
                      <span className="text-[11px]">Test</span>
                    </>
                  )}
                </button>

                {/* Nút xóa dòng key nếu có nhiều hơn 1 dòng */}
                {keys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteKeyRow(providerId, keyIdx)}
                    className="cursor-pointer shrink-0 w-8 h-8 rounded-xl border border-outline-variant/20 hover:border-error/40 hover:bg-error/10 hover:text-error text-on-surface-variant flex items-center justify-center transition-colors"
                    data-tooltip="Xóa API Key này"
                    aria-label="Xóa API Key này"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>

              {/* Chi tiết lỗi nếu key test lỗi */}
              {keyStatus?.success === false && keyStatus.error && (
                <div className="rounded-lg border border-error/30 bg-error/10 px-2.5 py-1.5 text-xs text-error flex items-start gap-2 animate-in fade-in-0 duration-150">
                  <span className="material-symbols-outlined text-[15px] shrink-0 text-error mt-0.5">error</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[11px] text-error">Lỗi kiểm tra API Key:</p>
                    <p className="text-[11px] text-on-surface-variant break-words leading-relaxed font-mono mt-0.5">
                      {keyStatus.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút Thêm API Key */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => onAddKeyRow(providerId)}
          className="cursor-pointer text-[11px] text-primary hover:opacity-80 font-semibold inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">add_circle</span>
          <span>Thêm API Key</span>
        </button>
      </div>
    </div>
  );
}

export default function TranslateProvidersModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // Lựa chọn phân nhóm: 'all' | 'local' | 'api'
  const [activeCategory, setActiveCategory] = useState('all');

  // Trạng thái test connection: { [testId]: { testing, success, latencyMs, error } }
  const [testStatusMap, setTestStatusMap] = useState({});
  // Trạng thái ẩn/hiện mật khẩu key: { [keyId]: boolean }
  const [showKeyMap, setShowKeyMap] = useState({});
  // Trạng thái mở rộng / thu gọn từng connection: { [id]: boolean } (Mặc định COLLAPSE rỗng {})
  const [expandedMap, setExpandedMap] = useState({});

  // Dynamic Model Discovery state: danh sách model phát hiện được từ API
  const [discoveredModelsMap, setDiscoveredModelsMap] = useState(() => {
    const initial = {};
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        PRESET_PROVIDERS.forEach((p) => {
          const cached = localStorage.getItem(`manga_crawler_discovered_models_${p.id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              initial[p.id] = parsed;
            }
          }
        });
      } catch {}
    }
    return initial;
  });
  const [isFetchingModelsMap, setIsFetchingModelsMap] = useState({});
  const [fetchModelErrorMap, setFetchModelErrorMap] = useState({});

  // Local LLM engine discovery & downloaded models
  const [localEngines, setLocalEngines] = useState(null);
  const [scanningLocal, setScanningLocal] = useState(false);
  const [modelSyncNotice, setModelSyncNotice] = useState(null);
  const [customInputMap, setCustomInputMap] = useState({});

  const toggleExpand = useCallback((id) => {
    setExpandedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleToggleExpandAll = useCallback((ids, shouldExpand) => {
    setExpandedMap((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = shouldExpand;
      });
      return next;
    });
  }, []);

  // Form tạo Custom Provider (như ShopAIKey, OneAPI, vLLM...)
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: '',
    baseUrl: 'https://api.shopaikey.com/v1',
    credential: '',
    defaultModel: 'gpt-4o',
    type: 'openai_compatible',
  });

  // Modal xác nhận xoá Custom Provider (không dùng window.confirm)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Lấy providers an toàn từ settings (dọn dẹp legacy openai_compatible thừa)
  const safeProviders = useMemo(() => {
    const p = { ...(settings?.providers || {}) };
    if (p.openai_compatible && !p.openai_compatible.isCustom) {
      delete p.openai_compatible;
    }
    return p;
  }, [settings]);

  // Quét danh sách mô hình Local đã tải về trong máy
  const fetchLocalEngines = useCallback(
    async (customEndpoint) => {
      if (!api?.translateDetectLocalEngines) return;
      setScanningLocal(true);
      try {
        const res = await api.translateDetectLocalEngines(
          customEndpoint ? { endpoint: customEndpoint } : {}
        );
        if (res) setLocalEngines(res);
      } catch {
        // ignore
      } finally {
        setScanningLocal(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (isOpen) {
      fetchLocalEngines();
    }
  }, [isOpen, fetchLocalEngines]);

  // Danh sách Custom Providers
  const customProviders = useMemo(() => {
    return Object.values(safeProviders).filter((p) => p?.isCustom);
  }, [safeProviders]);

  // Phân chia danh sách Preset & Custom thành 2 nhóm: Local (Offline) và API (Cloud)
  const isLocalCustom = useCallback((p) => {
    if (!p) return false;
    if (p.type === 'local' || p.category === 'local') return true;
    const url = (p.baseUrl || '').toLowerCase();
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('11434') || url.includes('1234');
  }, []);

  const localProviders = useMemo(() => {
    const presets = PRESET_PROVIDERS.filter((p) => p.category === 'local');
    const customs = customProviders.filter(isLocalCustom);
    return [...presets, ...customs];
  }, [customProviders, isLocalCustom]);

  const apiProviders = useMemo(() => {
    const presets = PRESET_PROVIDERS.filter((p) => p.category === 'api');
    const customs = customProviders.filter((p) => !isLocalCustom(p));
    return [...presets, ...customs];
  }, [customProviders, isLocalCustom]);

  // Trạng thái server Local online / offline
  const isLocalServerOnline = Boolean(
    localEngines?.ollama?.online ||
    localEngines?.lmstudio?.online ||
    localEngines?.custom?.online ||
    (localEngines?.detectedModels && localEngines.detectedModels.length > 0)
  );

  // Kiểm tra model đã được tải về trong máy chưa (khớp logic với MangaStudioEditor)
  const isModelInstalled = useCallback(
    (modelId) => {
      if (!modelId) return false;
      const engines = localEngines;
      if (!engines) return false;
      const allModels = [
        ...(engines.ollama?.models || []),
        ...(engines.lmstudio?.models || []),
        ...(engines.detectedModels || []),
      ];
      const target = modelId.toLowerCase().trim();
      return allModels.some((m) => {
        const mid = (m.id || m.name || '').toLowerCase().trim();
        return mid === target || mid.startsWith(target) || target.startsWith(mid);
      });
    },
    [localEngines]
  );

  // Model ID hiện đang active ở ngoài editor
  const activeModelId = settings?.activeModel || settings?.apiKeys?.openaiCompatible?.model || 'qwen2.5:7b';

  // DANH SÁCH MÔ HÌNH LOCAL (Chỉ hiển thị các model THỰC SỰ ĐÃ TẢI VỀ TRONG MÁY QUA SERVER)
  const localModels = useMemo(() => {
    const predefinedMeta = PREDEFINED_LOCAL_MODEL_META;

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
      // Lọc bỏ hoàn toàn các model không phải LLM dịch thuật (như PaddleOCR, Vision OCR)
      if (/ocr|paddle|detr/i.test(mid)) return;

      const meta = predefinedMeta[mid] || {};
      let displayName = meta.name || m.name || mid;
      if (displayName.length > 32) {
        displayName = displayName.slice(0, 28) + '...';
      }

      modelMap.set(mid, {
        id: mid,
        name: displayName,
        fullName: m.name || mid,
        badge: meta.badge || m.engine || 'Local',
        isInstalled: true,
        isReady: isLocalServerOnline,
      });
    });

    if (activeModelId && !modelMap.has(activeModelId) && isModelInstalled(activeModelId)) {
      modelMap.set(activeModelId, {
        id: activeModelId,
        name: activeModelId,
        badge: 'Custom',
        isInstalled: true,
        isReady: isLocalServerOnline,
      });
    }

    return Array.from(modelMap.values());
  }, [localEngines, isLocalServerOnline, isModelInstalled, activeModelId]);

  // Danh sách các mô hình Local đã tải về máy (downloadedLocalModels)
  const downloadedLocalModels = useMemo(() => {
    return localModels.filter((m) => m.isInstalled);
  }, [localModels]);

  // Cập nhật trường thuộc tính của một Provider
  const handleUpdateProviderField = useCallback(
    (providerId, field, value) => {
      const current = safeProviders[providerId] || {};
      const updatedProvider = {
        ...current,
        id: providerId,
        [field]: value,
      };
      if (field === 'defaultModel') {
        updatedProvider.model = value;
      }
      const updated = {
        ...safeProviders,
        [providerId]: updatedProvider,
      };
      const partial = { providers: updated };
      if (field === 'credential') {
        const prevApiKeys = settings?.apiKeys || {};
        partial.apiKeys = {
          ...prevApiKeys,
          [providerId]: value,
        };
      }
      if (field === 'defaultModel' && settings?.translationProvider === providerId) {
        partial.activeModel = value;
      }
      onUpdateSetting?.(partial);
    },
    [safeProviders, settings?.apiKeys, settings?.translationProvider, onUpdateSetting]
  );

  // Helper lấy credential hiện tại của một provider (từ providers hoặc fallback apiKeys)
  const getProviderCredential = useCallback(
    (providerId) => {
      const current = safeProviders[providerId] || {};
      if (current.credential !== undefined) return current.credential;
      const fallbackKey = settings?.apiKeys?.[providerId];
      return typeof fallbackKey === 'string' ? fallbackKey : '';
    },
    [safeProviders, settings?.apiKeys]
  );

  // Toggle ẩn/hiện từng key
  const handleToggleShowKey = useCallback((providerId, keyIndex) => {
    const mapKey = `${providerId}_${keyIndex}`;
    setShowKeyMap((prev) => ({ ...prev, [mapKey]: !prev[mapKey] }));
  }, []);

  // Cập nhật key tại vị trí index
  const handleUpdateKeyAt = useCallback(
    (providerId, index, newText) => {
      const currentCred = getProviderCredential(providerId);
      const currentKeys = parseKeys(currentCred);
      let updated;
      if (newText.includes('\n') || newText.includes('\r')) {
        const pastedLines = newText.split(/[\r\n]+/).map((k) => k.trim()).filter(Boolean);
        updated = [...currentKeys];
        updated.splice(index, 1, ...(pastedLines.length > 0 ? pastedLines : ['']));
      } else {
        updated = [...currentKeys];
        updated[index] = newText;
      }
      handleUpdateProviderField(providerId, 'credential', updated.join('\n'));
    },
    [getProviderCredential, handleUpdateProviderField]
  );

  // Thêm dòng key mới cho provider
  const handleAddKeyRow = useCallback(
    (providerId) => {
      const currentCred = getProviderCredential(providerId);
      const currentKeys = parseKeys(currentCred);
      const updated = [...currentKeys, ''];
      handleUpdateProviderField(providerId, 'credential', updated.join('\n'));
    },
    [getProviderCredential, handleUpdateProviderField]
  );

  // Xoá dòng key tại vị trí index
  const handleDeleteKeyRow = useCallback(
    (providerId, index) => {
      const currentCred = getProviderCredential(providerId);
      const currentKeys = parseKeys(currentCred);
      const updated = currentKeys.filter((_, i) => i !== index);
      handleUpdateProviderField(providerId, 'credential', updated.join('\n'));
    },
    [getProviderCredential, handleUpdateProviderField]
  );

  // Test riêng một key cụ thể
  const handleTestKey = useCallback(
    async (providerConfig, keyIndex, specificKey) => {
      const pId = providerConfig.id;
      const testKeyId = `${pId}_key_${keyIndex}`;
      setTestStatusMap((prev) => ({
        ...prev,
        [testKeyId]: { testing: true, success: null, error: null },
      }));

      try {
        let res;
        const configToTest = {
          ...providerConfig,
          credential: specificKey,
        };
        if (api?.translateTestProviderConnection) {
          res = await api.translateTestProviderConnection(configToTest);
        } else if (api?.translateTestProvider) {
          res = await api.translateTestProvider({
            provider: providerConfig.id,
            apiKey: specificKey,
            endpoint: providerConfig.baseUrl,
            model: providerConfig.defaultModel,
          });
        } else {
          res = { success: false, error: 'API không khả dụng.' };
        }

        setTestStatusMap((prev) => ({
          ...prev,
          [testKeyId]: {
            testing: false,
            success: Boolean(res?.success),
            latencyMs: res?.latencyMs,
            error: res?.error,
          },
        }));
      } catch (err) {
        setTestStatusMap((prev) => ({
          ...prev,
          [testKeyId]: {
            testing: false,
            success: false,
            error: err.message,
          },
        }));
      }
    },
    [api]
  );

  // Test kết nối server endpoint (DÀNH CHO LOCAL LLM)
  const handleTestConnection = useCallback(
    async (providerConfig) => {
      const pId = providerConfig.id;
      setTestStatusMap((prev) => ({
        ...prev,
        [pId]: { testing: true, success: null, error: null },
      }));

      try {
        let res;
        if (api?.translateTestProviderConnection) {
          res = await api.translateTestProviderConnection(providerConfig);
        } else if (api?.translateTestProvider) {
          res = await api.translateTestProvider({
            provider: providerConfig.id,
            apiKey: providerConfig.credential,
            endpoint: providerConfig.baseUrl,
            model: providerConfig.defaultModel,
          });
        } else {
          res = { success: false, error: 'API không khả dụng.' };
        }

        setTestStatusMap((prev) => ({
          ...prev,
          [pId]: {
            testing: false,
            success: Boolean(res?.success),
            latencyMs: res?.latencyMs,
            error: res?.error,
          },
        }));

        // Đồng thời làm mới danh sách models từ server local
        fetchLocalEngines(providerConfig.baseUrl);
      } catch (err) {
        setTestStatusMap((prev) => ({
          ...prev,
          [pId]: {
            testing: false,
            success: false,
            error: err.message,
          },
        }));
      }
    },
    [api, fetchLocalEngines]
  );

  // Quét danh sách mô hình AI khả dụng từ API (Dynamic Model Discovery)
  const handleFetchModels = useCallback(
    async (provider) => {
      if (!provider?.id) return;
      const pId = provider.id;
      const credential = getProviderCredential(pId) || provider.credential || '';
      const baseUrl = provider.baseUrl || provider.defaultUrl || '';
      const type = provider.type;

      const isNoKeyRequired = pId === 'openrouter' || pId === 'ollama' || pId === 'lmstudio' || type === 'local';
      if (!credential.trim() && !isNoKeyRequired) {
        setFetchModelErrorMap((prev) => ({
          ...prev,
          [pId]: `Vui lòng nhập API Key của ${provider.name || pId} trước khi quét model khả dụng.`,
        }));
        return;
      }

      setIsFetchingModelsMap((prev) => ({ ...prev, [pId]: true }));
      setFetchModelErrorMap((prev) => ({ ...prev, [pId]: null }));

      try {
        if (!api?.translateFetchAvailableModels) {
          throw new Error('Tính năng quét model không khả dụng trong môi trường này.');
        }

        const res = await api.translateFetchAvailableModels({
          id: pId,
          type,
          credential,
          baseUrl,
        });

        if (res && res.success && Array.isArray(res.models)) {
          setDiscoveredModelsMap((prev) => ({
            ...prev,
            [pId]: res.models,
          }));
          try {
            localStorage.setItem(
              `manga_crawler_discovered_models_${pId}`,
              JSON.stringify(res.models)
            );
          } catch (e) {
            console.warn('Failed to save discovered models to localStorage', e);
          }
        } else {
          const errMsg = res?.error || 'Không thể lấy danh sách model từ API.';
          setFetchModelErrorMap((prev) => ({ ...prev, [pId]: errMsg }));
        }
      } catch (err) {
        setFetchModelErrorMap((prev) => ({ ...prev, [pId]: err.message || 'Lỗi khi quét model.' }));
      } finally {
        setIsFetchingModelsMap((prev) => ({ ...prev, [pId]: false }));
      }
    },
    [api, getProviderCredential]
  );

  // Tải danh sách model từ cache localStorage hoặc tự động quét khi mở rộng card provider
  useEffect(() => {
    Object.keys(expandedMap).forEach((pId) => {
      if (!expandedMap[pId] || pId === 'deepl') return;

      if (discoveredModelsMap[pId]?.length > 0) return;

      // 1. Thử đọc từ localStorage
      try {
        const cached = localStorage.getItem(`manga_crawler_discovered_models_${pId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDiscoveredModelsMap((prev) => ({ ...prev, [pId]: parsed }));
            return;
          }
        }
      } catch {}

      // 2. Nếu có credential hoặc provider không cần key và chưa quét: tự động quét
      const cred = getProviderCredential(pId);
      const isNoKeyRequired = pId === 'openrouter' || pId === 'ollama' || pId === 'lmstudio';
      if ((isNoKeyRequired || (cred && cred.trim())) && !isFetchingModelsMap[pId]) {
        const prov = PRESET_PROVIDERS.find((p) => p.id === pId) || safeProviders[pId];
        if (prov) {
          handleFetchModels(prov);
        }
      }
    });
  }, [expandedMap, discoveredModelsMap, getProviderCredential, isFetchingModelsMap, handleFetchModels, safeProviders]);

  // KHI CHỌN MODEL TRONG LOCAL: ĐỒNG BỘ NGAY RA NGOÀI (Thanh công cụ, MangaStudioEditor, TranslateSettingsPanel)
  const handleSelectLocalModel = useCallback(
    (modelId) => {
      const providerId = 'ollama';
      const current = safeProviders[providerId] || {};
      const baseUrl = current.baseUrl || 'http://localhost:11434/v1';

      const updatedProviders = {
        ...safeProviders,
        [providerId]: {
          ...current,
          id: providerId,
          defaultModel: modelId,
        },
      };
      delete updatedProviders.openai_compatible;

      const prevApiKeys = settings?.apiKeys || {};
      const updatedApiKeys = {
        ...prevApiKeys,
        openaiCompatible: {
          ...(prevApiKeys.openaiCompatible || {}),
          model: modelId,
          endpoint: baseUrl,
        },
      };

      // Đồng bộ đồng thời: activeModel, translationProvider: 'ollama', providers, và apiKeys.openaiCompatible.model
      onUpdateSetting?.({
        activeModel: modelId,
        translationProvider: 'ollama',
        providers: updatedProviders,
        apiKeys: updatedApiKeys,
      });

      setModelSyncNotice(`Đã chọn model: ${modelId} (Đã đồng bộ ra thanh công cụ ngoài)`);
      setTimeout(() => {
        setModelSyncNotice(null);
      }, 3500);
    },
    [safeProviders, settings?.apiKeys, onUpdateSetting]
  );

  // KHI CHỌN CLOUD API PROVIDER: ĐỒNG BỘ RA NGOÀI
  const handleSelectCloudProvider = useCallback(
    (providerId, defaultModel) => {
      const preset = PRESET_PROVIDERS.find((p) => p.id === providerId);
      const customP = safeProviders[providerId];
      const displayName = customP?.name || preset?.name || providerId;

      const currentConfig = safeProviders[providerId] || {};
      const credential = getProviderCredential(providerId);
      const targetModel = currentConfig.defaultModel || defaultModel || preset?.defaultModel || '';

      const updatedProviders = {
        ...safeProviders,
        [providerId]: {
          ...(preset ? {
            id: preset.id,
            name: preset.name,
            type: preset.type,
            description: preset.description,
            baseUrl: preset.defaultUrl || '',
            defaultModel: preset.defaultModel || '',
            enabled: true,
            isCustom: false,
          } : {}),
          ...currentConfig,
          id: providerId,
          credential,
          ...(targetModel ? { defaultModel: targetModel, model: targetModel } : {}),
        },
      };

      const partial = {
        translationProvider: providerId,
        ...(targetModel ? { activeModel: targetModel } : {}),
        providers: updatedProviders,
      };

      if (credential) {
        partial.apiKeys = {
          ...(settings?.apiKeys || {}),
          [providerId]: credential,
        };
      }

      onUpdateSetting?.(partial);
      setModelSyncNotice(`Đã chọn động cơ: ${displayName} (Đã đồng bộ ra thanh công cụ ngoài)`);
      setTimeout(() => {
        setModelSyncNotice(null);
      }, 3500);
    },
    [safeProviders, settings?.apiKeys, getProviderCredential, onUpdateSetting]
  );


  // Tự động chuyển sang model hợp lệ nếu model đã lưu trong settings không còn tồn tại trên server local
  // CHỈ chạy khi provider hiện tại LÀ Local Provider (ollama, lmstudio). Tuyệt đối không can thiệp khi dùng Cloud API!
  useEffect(() => {
    if (!isLocalServerOnline || downloadedLocalModels.length === 0) return;
    const isLocalProvider =
      settings?.translationProvider === 'ollama' ||
      settings?.translationProvider === 'lmstudio' ||
      settings?.translationProvider === 'openai_compatible';
    if (!isLocalProvider) return;

    const isCurrentInstalled = downloadedLocalModels.some((m) => m.id === activeModelId);
    if (!isCurrentInstalled) {
      const matching = downloadedLocalModels.find((m) => {
        const mid = m.id.toLowerCase();
        const act = activeModelId.toLowerCase();
        return (act.includes('gemma') && mid.includes('gemma')) ||
               (act.includes('qwen') && mid.includes('qwen'));
      });
      const nextModel = matching ? matching.id : downloadedLocalModels[0].id;
      if (nextModel && nextModel !== activeModelId) {
        handleSelectLocalModel(nextModel);
      }
    }
  }, [isLocalServerOnline, downloadedLocalModels, activeModelId, handleSelectLocalModel, settings?.translationProvider]);

  // Thêm Custom Provider mới
  const handleAddCustomProvider = useCallback(() => {
    if (!customForm.name.trim()) return;
    const customId = `custom_${Date.now()}`;
    const isLocalUrl = (customForm.baseUrl || '').toLowerCase().includes('localhost') ||
      (customForm.baseUrl || '').toLowerCase().includes('127.0.0.1');
    const newProvider = {
      id: customId,
      name: customForm.name.trim(),
      type: customForm.type || 'openai_compatible',
      category: isLocalUrl ? 'local' : 'api',
      description: `OpenAI-compatible endpoint (${customForm.baseUrl})`,
      credential: customForm.credential.trim(),
      baseUrl: customForm.baseUrl.trim(),
      defaultModel: customForm.defaultModel.trim() || 'gpt-4o',
      enabled: true,
      isCustom: true,
    };

    const updated = {
      ...safeProviders,
      [customId]: newProvider,
    };

    onUpdateSetting?.({
      providers: updated,
      translationProvider: customId,
      activeModel: newProvider.defaultModel,
    });

    setIsAddingCustom(false);
    setCustomForm({
      name: '',
      baseUrl: 'https://api.shopaikey.com/v1',
      credential: '',
      defaultModel: 'gpt-4o',
      type: 'openai_compatible',
    });
  }, [customForm, safeProviders, onUpdateSetting]);

  // Xóa Custom Provider
  const handleDeleteCustomProvider = useCallback(
    (providerId) => {
      const updated = { ...safeProviders };
      delete updated[providerId];

      const patch = { providers: updated };
      if (settings?.translationProvider === providerId) {
        patch.translationProvider = 'gemini';
        patch.activeModel = 'gemini-3.5-flash';
      }

      onUpdateSetting?.(patch);
      setDeleteConfirmId(null);
    },
    [safeProviders, settings, onUpdateSetting]
  );

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Container Modal có CHIỀU CAO CỐ ĐỊNH h-[88vh] max-h-[88vh] cho cả 3 tabs để chống nhảy layout */}
      <div className="max-w-4xl w-full h-[88vh] max-h-[88vh] min-h-[580px] rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden text-on-surface">
        {/* Modal Header (shrink-0) */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-outline-variant/15 bg-surface-container-lowest/80 backdrop-blur-md shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[24px]">hub</span>
              <h2 className="text-lg font-bold text-on-surface tracking-tight">
                Providers
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Koharu Standard
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Quản lý và cấu hình mô hình Local LLM offline & nhà cung cấp Cloud API.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              type="button"
              onClick={() => setIsAddingCustom(true)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:brightness-110 transition-all shadow-xs"
              data-tooltip="Thêm API Relay / Proxy bên ngoài như ShopAIKey, OneAPI, vLLM..."
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>+ Thêm Provider tùy chỉnh</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer p-1.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              aria-label="Đóng dialog"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Navigation Filter Pills (shrink-0) */}
        <div className="px-6 pt-3 pb-2 border-b border-outline-variant/10 bg-surface-container-low/30 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-surface-container-high/60 rounded-xl border border-outline-variant/15">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === 'all'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Tất cả ({localProviders.length + apiProviders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('local')}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeCategory === 'local'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">dns</span>
              <span>Local LLM ({localModels.length})</span>
              {isLocalServerOnline ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" data-tooltip="Local server đang Online" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400" data-tooltip="Local server đang Offline" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('api')}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeCategory === 'api'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">cloud</span>
              <span>Cloud API ({apiProviders.length})</span>
            </button>
          </div>

          {/* Model sync notification pill */}
          {modelSyncNotice && (
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-fadeIn">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              <span>{modelSyncNotice}</span>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body (flex-1 min-h-0 overflow-y-auto) */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Form thêm Custom Provider (Ví dụ: ShopAIKey) */}
          {isAddingCustom && (
            <div className="p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-primary">
                  <span className="material-symbols-outlined text-[18px]">add_moderator</span>
                  <span>Thêm Nhà cung cấp Tùy chỉnh (OpenAI-compatible)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(false)}
                  className="cursor-pointer text-xs text-on-surface-variant hover:text-on-surface"
                >
                  Hủy
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Tên hiển thị (Ví dụ: ShopAIKey)
                  </label>
                  <input
                    type="text"
                    placeholder="ShopAIKey / Proxy AI"
                    value={customForm.name}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Base URL (Endpoint API)
                  </label>
                  <input
                    type="text"
                    placeholder="https://api.shopaikey.com/v1"
                    value={customForm.baseUrl}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    API Key / Credential
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={customForm.credential}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, credential: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Model mặc định
                  </label>
                  <input
                    type="text"
                    placeholder="gpt-4o / claude-3-5-sonnet / deepseek-chat"
                    value={customForm.defaultModel}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, defaultModel: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-on-surface-variant">
                <span>
                  💡 <strong>Gợi ý ShopAIKey:</strong> Base URL: <code>https://api.shopaikey.com/v1</code>, dán Key mua từ ShopAIKey, model: <code>gpt-4o</code> hoặc <code>claude-3-5-sonnet</code>.
                </span>
                <button
                  type="button"
                  onClick={handleAddCustomProvider}
                  disabled={!customForm.name.trim() || !customForm.baseUrl.trim()}
                  className="cursor-pointer px-4 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:brightness-110 disabled:opacity-40 transition-all"
                >
                  Lưu Provider
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              PHÂN KHU 1: MÔ HÌNH LOCAL LLM (100% OFFLINE)
              (HIỂN THỊ KHỚP 100% DANH SÁCH VÀ GIAO DIỆN NHƯ TRONG ẢNH CỦA BẠN)
             ══════════════════════════════════════════════════════════════════════════ */}
          {(activeCategory === 'all' || activeCategory === 'local') && (
            <div className="space-y-4">
              {/* Header Phân Khu Local */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">dns</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Mô hình Local LLM (100% Offline)
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                      isLocalServerOnline
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isLocalServerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{isLocalServerOnline ? '• ONLINE' : '• OFFLINE'}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => fetchLocalEngines()}
                  disabled={scanningLocal}
                  className="cursor-pointer text-[11px] text-primary hover:opacity-80 font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                  data-tooltip="Quét lại các mô hình đã tải trong máy"
                >
                  <span className={`material-symbols-outlined text-[14px] ${scanningLocal ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                  <span>{scanningLocal ? 'Đang quét...' : 'Quét lại model'}</span>
                </button>
              </div>

              {/* KHUNG DANH SÁCH MÔ HÌNH LOCAL (Chỉ model đã tải về trong máy) */}
              <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/30 p-2 space-y-1">
                {localModels.length === 0 ? (
                  <div className="p-6 text-center text-xs text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40 block mx-auto">smart_toy</span>
                    <p className="font-semibold text-on-surface">Chưa phát hiện mô hình LLM nào trong máy</p>
                    <p className="text-[11px] max-w-md mx-auto leading-relaxed">
                      Hãy đảm bảo Ollama / LM Studio đang chạy hoặc tải mô hình bằng Terminal:
                      <code className="block mt-1 font-mono text-primary bg-surface-container-high px-2 py-1 rounded-lg">ollama run qwen2.5:7b</code>
                    </p>
                  </div>
                ) : (
                  localModels.map((m) => {
                    const isSelected = activeModelId === m.id || activeModelId.includes(m.id);

                    return (
                      <div
                        key={m.id}
                        className={`w-full p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 transition-all ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 shadow-xs'
                            : m.isReady
                            ? 'hover:bg-surface-container-high text-on-surface'
                            : 'opacity-50 text-on-surface-variant bg-surface-container/20'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!m.isReady}
                          onClick={() => handleSelectLocalModel(m.id)}
                          className={`flex items-center gap-2 min-w-0 flex-1 text-left ${
                            m.isReady ? 'cursor-pointer' : 'cursor-not-allowed'
                          }`}
                          data-tooltip={
                            !isLocalServerOnline
                              ? 'Server Local đang tắt (Offline)'
                              : `Nhấp để chọn model ${m.name} & đồng bộ ra thanh công cụ ngoài`
                          }
                        >
                          <span className="text-base shrink-0">🤖</span>
                          <span className="truncate font-medium">{m.name}</span>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          {m.badge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-surface-container-high text-on-surface-variant font-medium border border-outline-variant/15">
                              {m.badge}
                            </span>
                          )}
                          {isSelected && (
                            <span className="material-symbols-outlined text-[17px] text-primary font-bold">
                              check
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* KHỐI CẤU HÌNH SERVER LOCAL (Ollama / LM Studio) */}
              <div className="space-y-3 pt-1">
                {localProviders.map((provider) => {
                  const config = safeProviders[provider.id] || {};
                  const baseUrl = config.baseUrl !== undefined ? config.baseUrl : (provider.defaultUrl || '');
                  const testStatus = testStatusMap[provider.id];
                  const isExpanded = !!expandedMap[provider.id];

                  return (
                    <div
                      key={provider.id}
                      className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/20 hover:bg-surface-container-low/40 transition-all overflow-hidden"
                    >
                      {/* Header Server Card (Bấm để expand/collapse) */}
                      <div
                        onClick={() => toggleExpand(provider.id)}
                        className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none group/item"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-[16px]">{provider.icon}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-on-surface truncate group-hover/item:text-primary transition-colors">
                                Cài đặt kết nối: {provider.name}
                              </span>
                              <span className="text-[10px] text-on-surface-variant/70 font-mono truncate">
                                {baseUrl}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {testStatus && (
                            <div className="mr-1">
                              {testStatus.success ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                  <span className="hidden sm:inline">Sẵn sàng</span>
                                </span>
                              ) : testStatus.error ? (
                                <span className="text-error font-semibold text-xs inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px]">error</span>
                                  <span className="hidden sm:inline">Lỗi</span>
                                </span>
                              ) : null}
                            </div>
                          )}

                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface-variant group-hover/item:text-primary transition-all"
                            data-tooltip={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                          >
                            <span
                              className="material-symbols-outlined text-[17px] transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                              keyboard_arrow_down
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content: Chỉnh Base URL và Test server */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-outline-variant/10 space-y-3 animate-in fade-in-0 duration-150">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                                Base URL (Endpoint Server)
                              </label>
                              <input
                                type="text"
                                placeholder={provider.defaultUrl || 'http://localhost:11434/v1'}
                                value={baseUrl}
                                onChange={(e) => handleUpdateProviderField(provider.id, 'baseUrl', e.target.value)}
                                className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 py-1.5 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                              />
                            </div>

                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTestConnection({
                                    id: provider.id,
                                    type: provider.type || 'openai_compatible',
                                    baseUrl,
                                    defaultModel: config.defaultModel || provider.defaultModel || activeModelId,
                                  })
                                }
                                disabled={testStatus?.testing}
                                className="cursor-pointer w-full py-1.5 px-3 rounded-xl border border-outline-variant/30 bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {testStatus?.testing ? 'progress_activity' : 'network_check'}
                                </span>
                                <span>{testStatus?.testing ? 'Đang kiểm tra...' : 'Test kết nối server'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Model mặc định cho Local Server (Gọn gàng bằng SearchableSelect) */}
                          <div className="space-y-1.5 pt-2 border-t border-outline-variant/10">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                                Model mặc định ({provider.name})
                              </label>
                            </div>

                            {(() => {
                              const currentMId = config.defaultModel !== undefined ? config.defaultModel : (provider.defaultModel || '');
                              const guideModels = PROVIDER_MODEL_GUIDES[provider.id]?.models || [];
                              const detectedList = localModels.map((m) => ({
                                value: m.id,
                                label: `${m.name} (${m.id})`,
                                badge: m.badge || 'Đã cài',
                                materialIcon: 'smart_toy',
                              }));
                              const seen = new Set(detectedList.map((m) => m.value));
                              const presetList = guideModels
                                .filter((m) => !seen.has(m.id))
                                .map((m) => ({
                                  value: m.id,
                                  label: `${m.name} (${m.id})`,
                                  badge: m.badge,
                                  materialIcon: m.highlight ? 'star' : 'smart_toy',
                                }));
                              const combinedOptions = detectedList.length > 0 ? detectedList : presetList;

                              if (combinedOptions.length === 0) {
                                return (
                                  <input
                                    type="text"
                                    placeholder={provider.defaultModel || 'Model ID'}
                                    value={currentMId}
                                    onChange={(e) => handleUpdateProviderField(provider.id, 'defaultModel', e.target.value)}
                                    className="w-full h-10 rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                                  />
                                );
                              }

                              const currentInfo = guideModels.find((m) => m.id === currentMId);

                              return (
                                <>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder={provider.defaultModel || 'Nhập mã model (VD: qwen2.5:7b)...'}
                                      value={currentMId}
                                      onChange={(e) => handleUpdateProviderField(provider.id, 'defaultModel', e.target.value)}
                                      className="flex-1 min-w-0 h-10 rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 text-xs font-mono text-on-surface focus:border-primary focus:outline-none transition-colors"
                                    />
                                    <SearchableSelect
                                      value={combinedOptions.some((m) => m.value === currentMId) ? currentMId : ''}
                                      onChange={(val) => {
                                        if (val) {
                                          handleUpdateProviderField(provider.id, 'defaultModel', val);
                                        }
                                      }}
                                      options={combinedOptions}
                                      placeholder="Gợi ý model..."
                                      showPlaceholderOption={false}
                                      className="w-36 sm:w-48 shrink-0"
                                    />
                                  </div>

                                  {currentInfo?.desc ? (
                                    <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-1.5">
                                      <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">info</span>
                                      <span>{currentInfo.desc}</span>
                                    </div>
                                  ) : currentMId && !combinedOptions.some((m) => m.value === currentMId) ? (
                                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-primary flex items-start gap-1.5">
                                      <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">edit</span>
                                      <span>Model tùy chỉnh: <code className="font-mono font-semibold">{currentMId}</code></span>
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>

                          {/* Chi tiết lỗi kết nối server nếu có */}
                          {testStatus?.success === false && testStatus.error && (
                            <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error space-y-1 animate-in fade-in-0 duration-150">
                              <div className="flex items-center gap-1.5 font-bold text-error">
                                <span className="material-symbols-outlined text-[15px]">report_problem</span>
                                <span>Nguyên nhân lỗi kết nối server:</span>
                              </div>
                              <p className="text-[11px] text-on-surface-variant break-words leading-relaxed pl-5 font-mono">
                                {testStatus.error}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              PHÂN KHU 2: NHÀ CUNG CẤP CLOUD API (TRỰC TUYẾN)
              (NẾU LÀ API THÌ KHÔNG HIỂN THỊ NÚT TEST KẾT NỐI Ở DƯỚI ĐÁY)
             ══════════════════════════════════════════════════════════════════════════ */}
          {(activeCategory === 'all' || activeCategory === 'api') && (
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">cloud</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Nhà cung cấp Cloud API (Trực tuyến) ({apiProviders.length})
                  </span>
                  <div className="w-12 h-px bg-outline-variant/15" />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleExpandAll(apiProviders.map((p) => p.id), true)}
                    className="cursor-pointer text-[11px] text-on-surface-variant hover:text-primary font-medium transition-colors"
                  >
                    Mở tất cả
                  </button>
                  <span className="text-outline-variant/40 text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => handleToggleExpandAll(apiProviders.map((p) => p.id), false)}
                    className="cursor-pointer text-[11px] text-on-surface-variant hover:text-primary font-medium transition-colors"
                  >
                    Thu gọn tất cả
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {apiProviders.map((provider) => {
                  const config = safeProviders[provider.id] || {};
                  const credential = getProviderCredential(provider.id);
                  const defaultModel = config.defaultModel || config.model || provider.defaultModel || '';
                  const mergedConfig = { ...config, credential, id: provider.id, defaultModel, model: defaultModel };
                  const baseUrl = config.baseUrl !== undefined ? config.baseUrl : (provider.defaultUrl || '');
                  const isExpanded = !!expandedMap[provider.id];
                  const keyCount = parseKeys(credential).filter(Boolean).length;
                  const isCurrentActive = settings?.translationProvider === provider.id;

                  return (
                    <div
                      key={provider.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isCurrentActive
                          ? 'border-primary/40 bg-primary/5 shadow-xs ring-1 ring-primary/20'
                          : 'border-outline-variant/15 bg-surface-container-low/30 hover:bg-surface-container-low/60'
                      }`}
                    >
                      {/* Header (Bấm để expand/collapse) */}
                      <div
                        onClick={() => toggleExpand(provider.id)}
                        className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none group/item"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover/item:scale-105 ${
                              isCurrentActive
                                ? 'bg-primary text-on-primary font-bold shadow-xs'
                                : 'bg-surface-container-high text-primary'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">{provider.icon}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-on-surface truncate group-hover/item:text-primary transition-colors">
                                {provider.name}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-surface-container-highest text-on-surface-variant border border-outline-variant/15">
                                {provider.badge || 'Cloud'}
                              </span>
                              {keyCount > 0 ? (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[13px]">check</span>
                                  <span>{keyCount} key</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-on-surface-variant/50">
                                  Chưa có key
                                </span>
                              )}
                              {provider.isCustom && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Custom
                                </span>
                              )}
                            </div>
                            {!isExpanded && (
                              <p className="text-[11px] text-on-surface-variant/70 truncate mt-0.5">
                                {provider.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Nút Chọn dùng / Đang chọn */}
                          {isCurrentActive ? (
                            <span className="text-xs font-bold text-on-primary bg-primary border border-primary px-3 py-1.5 rounded-xl shadow-xs inline-flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px]">check_circle</span>
                              <span>Đang chọn</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectCloudProvider(provider.id, defaultModel);
                              }}
                              className="cursor-pointer text-xs font-bold px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary transition-all flex items-center gap-1.5 shadow-2xs active:scale-[0.98]"
                              data-tooltip={`Chọn ${provider.name} làm động cơ dịch chính`}
                              aria-label={`Chọn ${provider.name} làm động cơ dịch chính`}
                            >
                              <span className="material-symbols-outlined text-[15px]">check</span>
                              <span>Chọn dùng</span>
                            </button>
                          )}

                          {provider.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(provider.id);
                              }}
                              className="cursor-pointer p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                              data-tooltip="Xóa provider tùy chỉnh này"
                              aria-label="Xóa provider tùy chỉnh này"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}

                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant group-hover/item:text-primary group-hover/item:bg-surface-container-high transition-all"
                            data-tooltip={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                            aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                          >
                            <span
                              className="material-symbols-outlined text-[18px] transition-transform duration-200"
                              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                              keyboard_arrow_down
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content: Chi tiết API Provider */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-outline-variant/10 flex flex-col md:flex-row md:items-start justify-between gap-4 animate-in fade-in-0 duration-150">
                          {/* Left: Info & Docs link */}
                          <div className="min-w-0 md:w-5/12 space-y-1.5 pt-1">
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {provider.description}
                            </p>

                            {provider.docsUrl && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => api?.openExternal?.(provider.docsUrl)}
                                  className="cursor-pointer text-[11px] text-primary hover:opacity-80 font-semibold inline-flex items-center gap-1"
                                >
                                  <span>Lấy API Key</span>
                                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                </button>
                              </div>
                            )}

                            {/* Cấu hình & Gợi ý Model AI */}
                            {provider.id === 'deepl' ? (
                              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high/40 p-2 text-xs text-on-surface-variant flex items-center gap-2 mt-2">
                                <span className="material-symbols-outlined text-[15px] text-primary shrink-0">translate</span>
                                <span className="text-[11px] leading-relaxed">
                                  Dịch thuật chuyên dụng DeepL (tự động, không cần chọn Model LLM).
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2 pt-2 border-t border-outline-variant/10 mt-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                                    Model AI
                                  </label>
                                  <button
                                    type="button"
                                    disabled={Boolean(isFetchingModelsMap[provider.id])}
                                    onClick={() => handleFetchModels({ ...provider, ...mergedConfig })}
                                    className="cursor-pointer text-[10px] font-semibold text-primary hover:opacity-80 inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    data-tooltip={
                                      !credential.trim() && provider.id !== 'openrouter' && provider.type !== 'local'
                                        ? 'Cần nhập API Key trước khi quét model từ tài khoản'
                                        : 'Quét danh sách model khả dụng từ API'
                                    }
                                    aria-label="Quét model khả dụng"
                                  >
                                    <span className={`material-symbols-outlined text-[13px] ${isFetchingModelsMap[provider.id] ? 'animate-spin' : ''}`}>
                                      {isFetchingModelsMap[provider.id] ? 'progress_activity' : 'sync'}
                                    </span>
                                    <span>{isFetchingModelsMap[provider.id] ? 'Đang quét...' : 'Quét model khả dụng'}</span>
                                  </button>
                                </div>

                                {fetchModelErrorMap[provider.id] && (
                                  <div className="rounded-xl border border-error/20 bg-error/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-error flex items-start gap-1.5">
                                    <span className="material-symbols-outlined text-[14px] text-error shrink-0 mt-0.5">error</span>
                                    <span>{fetchModelErrorMap[provider.id]}</span>
                                  </div>
                                )}

                                {(() => {
                                  const guide = PROVIDER_MODEL_GUIDES[provider.id];
                                  const guideModels = guide?.models || [];
                                  const guideMap = new Map(guideModels.map((g) => [g.id, g]));
                                  const discoveredList = discoveredModelsMap[provider.id] || [];

                                  let baseOptions = [];
                                  if (discoveredList.length > 0) {
                                    baseOptions = discoveredList.map((m) => {
                                      const gInfo = guideMap.get(m.id);
                                      return {
                                        value: m.id,
                                        label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
                                        badge: gInfo?.badge || (m.id.includes('flash') ? 'Flash' : m.id.includes('pro') ? 'Pro' : 'API'),
                                        materialIcon: gInfo?.highlight ? 'star' : 'smart_toy',
                                      };
                                    });
                                  } else if (guideModels.length > 0) {
                                    baseOptions = guideModels.map((m) => ({
                                      value: m.id,
                                      label: `${m.name} (${m.id})`,
                                      badge: m.badge,
                                      materialIcon: m.highlight ? 'star' : 'smart_toy',
                                    }));
                                  }

                                  const existsInOptions = baseOptions.some((m) => m.value === defaultModel);
                                  const finalOptions = [
                                    ...(!existsInOptions && defaultModel
                                      ? [
                                          {
                                            value: defaultModel,
                                            label: `Model: ${defaultModel}`,
                                            badge: 'Tùy chỉnh',
                                            materialIcon: 'edit',
                                          },
                                        ]
                                      : []),
                                    ...baseOptions,
                                  ];

                                  const quickChips = guideModels.length > 0
                                    ? guideModels.slice(0, 2)
                                    : discoveredList.slice(0, 2).map((d) => ({ id: d.id, name: d.name || d.id }));

                                  const isObsoleteModel = Boolean(
                                    defaultModel && (
                                      defaultModel.includes('gemini-1.5') ||
                                      defaultModel.includes('gemini-1.0') ||
                                      defaultModel.includes('gemini-2.0') ||
                                      defaultModel.includes('gemini-2.5') ||
                                      (discoveredList.length > 0 &&
                                        !discoveredList.some((m) => m.id === defaultModel) &&
                                        (defaultModel.startsWith('gemini-1.') || defaultModel.startsWith('gemini-2.') || defaultModel.includes('20240620')))
                                    )
                                  );

                                  const isCustomMode = Boolean(customInputMap[provider.id]);

                                  return (
                                    <div className="space-y-2">
                                      {isCustomMode ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="text"
                                            placeholder={guide?.recommended ? `Ví dụ: ${guide.recommended}` : 'Nhập tên model (VD: gpt-4o)...'}
                                            value={defaultModel}
                                            onChange={(e) => handleUpdateProviderField(provider.id, 'defaultModel', e.target.value)}
                                            className="flex-1 min-w-0 h-9 rounded-xl border border-primary/50 bg-surface-container-lowest px-3 text-xs font-mono text-on-surface focus:border-primary focus:outline-none transition-colors"
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => setCustomInputMap((prev) => ({ ...prev, [provider.id]: false }))}
                                            className="cursor-pointer h-9 px-2.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface flex items-center gap-1 shrink-0 transition-colors"
                                            data-tooltip="Quay lại danh sách chọn model"
                                            aria-label="Quay lại danh sách chọn model"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">check</span>
                                            <span>Xong</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <SearchableSelect
                                          value={finalOptions.some((m) => m.value === defaultModel) ? defaultModel : ''}
                                          onChange={(val) => {
                                            if (val) {
                                              handleUpdateProviderField(provider.id, 'defaultModel', val);
                                            }
                                          }}
                                          options={finalOptions}
                                          placeholder={provider.defaultModel ? `Chọn model (${provider.defaultModel})...` : 'Chọn Model AI...'}
                                          showPlaceholderOption={false}
                                          className="w-full"
                                        />
                                      )}

                                      {/* Quick Preset Chips & Nút tùy chỉnh gọn gàng */}
                                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                        {quickChips.length > 0 && (
                                          <span className="text-[10px] text-on-surface-variant/70 font-medium mr-0.5">
                                            Gợi ý:
                                          </span>
                                        )}
                                        {quickChips.map((chip) => {
                                          const isSelected = !isCustomMode && defaultModel === chip.id;
                                          return (
                                            <button
                                              key={chip.id}
                                              type="button"
                                              onClick={() => {
                                                handleUpdateProviderField(provider.id, 'defaultModel', chip.id);
                                                if (isCustomMode) {
                                                  setCustomInputMap((prev) => ({ ...prev, [provider.id]: false }));
                                                }
                                              }}
                                              className={`cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                                                isSelected
                                                  ? 'bg-primary text-on-primary shadow-xs font-semibold'
                                                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/20 hover:border-primary/30'
                                              }`}
                                              data-tooltip={`Chọn ${chip.id}`}
                                            >
                                              {chip.highlight && (
                                                <span className="material-symbols-outlined text-[11px] text-amber-400">star</span>
                                              )}
                                              <span>{chip.name || chip.id}</span>
                                            </button>
                                          );
                                        })}
                                        <button
                                          type="button"
                                          onClick={() => setCustomInputMap((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                          className={`cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all border ${
                                            isCustomMode
                                              ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                                              : 'border-dashed border-outline-variant/35 hover:border-primary/50 text-on-surface-variant hover:text-primary bg-surface-container/40 hover:bg-surface-container'
                                          }`}
                                          data-tooltip={isCustomMode ? 'Quay lại danh sách chọn model' : 'Tự nhập tên model tùy chỉnh'}
                                        >
                                          <span className="material-symbols-outlined text-[12px]">{isCustomMode ? 'list' : 'edit'}</span>
                                          <span>{isCustomMode ? 'Danh sách' : 'Tùy chỉnh'}</span>
                                        </button>
                                      </div>

                                      {/* Cảnh báo model lỗi thời (Obsolete model warning) */}
                                      {isObsoleteModel && (
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200 flex items-center gap-2">
                                          <span className="material-symbols-outlined text-[16px] text-amber-500 shrink-0">warning</span>
                                          <span>⚠️ Model này không còn khả dụng trên tài khoản của bạn. Vui lòng chọn model mới.</span>
                                        </div>
                                      )}

                                      {/* Model description note */}
                                      {!isObsoleteModel && (() => {
                                        const currentInfo = guideModels.find((m) => m.id === defaultModel);
                                        const discInfo = discoveredList.find((m) => m.id === defaultModel);
                                        const desc = currentInfo?.desc || discInfo?.description;
                                        if (desc) {
                                          return (
                                            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-1.5">
                                              <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">info</span>
                                              <span>{desc}</span>
                                            </div>
                                          );
                                        }
                                        if (defaultModel && !currentInfo && !discInfo) {
                                          return (
                                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-primary flex items-start gap-1.5">
                                              <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">edit</span>
                                              <span>Model tùy chỉnh: <code className="font-mono font-semibold">{defaultModel}</code></span>
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Right: Base URL (nếu có) + Danh sách API Keys với nút test từng key */}
                          <div className="flex-1 min-w-0 space-y-2.5">
                            {/* Base URL (cho các provider hỗ trợ URL tùy chỉnh) */}
                            {provider.hasCustomUrl && (
                              <div>
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                                  Base URL
                                </label>
                                <input
                                  type="text"
                                  placeholder={provider.defaultUrl || 'Endpoint URL'}
                                  value={baseUrl}
                                  onChange={(e) => handleUpdateProviderField(provider.id, 'baseUrl', e.target.value)}
                                  className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 py-1.5 text-xs font-mono text-on-surface focus:border-primary focus:outline-none"
                                />
                              </div>
                            )}

                            {/* Danh sách Multi-key với icon test riêng từng key */}
                            <ProviderKeyList
                              providerId={provider.id}
                              providerConfig={mergedConfig}
                              placeholder={provider.keyHint || 'sk-...'}
                              testStatusMap={testStatusMap}
                              showKeyMap={showKeyMap}
                              onToggleShowKey={handleToggleShowKey}
                              onUpdateKeyAt={handleUpdateKeyAt}
                              onAddKeyRow={handleAddKeyRow}
                              onDeleteKeyRow={handleDeleteKeyRow}
                              onTestKey={handleTestKey}
                            />
                            {/* LƯU Ý: VÌ LÀ API NÊN KHÔNG CẦN NÚT TEST KẾT NỐI Ở DƯỚI ĐÁY THEO YÊU CẦU */}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (shrink-0) */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/15 bg-surface-container-lowest/80 backdrop-blur-md shrink-0">
          <div className="text-xs text-on-surface-variant">
            Mọi thay đổi và lựa chọn model được tự động đồng bộ ra toàn bộ ứng dụng.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer px-5 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:brightness-110 transition-all shadow-xs"
            >
              Hoàn tất & Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Modal xác nhận xoá Custom Provider (Custom React Modal, không dùng window.confirm) */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="max-w-sm w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-error font-bold text-sm">
              <span className="material-symbols-outlined text-[22px]">warning</span>
              <span>Xóa Provider Tùy Chỉnh?</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Bạn có chắc chắn muốn xóa provider này khỏi ứng dụng? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="cursor-pointer px-3.5 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCustomProvider(deleteConfirmId)}
                className="cursor-pointer px-3.5 py-1.5 rounded-xl bg-error text-on-error text-xs font-bold hover:brightness-110 transition-all shadow-xs"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
