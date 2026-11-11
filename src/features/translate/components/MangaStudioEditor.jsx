import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect } from '../../../shared';
import TranslateSettingsPanel, { TranslateGuideModal } from '../TranslateSettingsPanel';
import { PREDEFINED_LOCAL_MODEL_META } from '../constants/providerModelGuides';

/**
 * MangaStudioEditor — Bộ biên tập Layer Manga & Typesetting chuyên nghiệp
 * Thiết kế Full Màn hình (Full App Screen Portal) chuẩn phong cách Koharu:
 * - Header thanh menu Window: Logo 🌸, Menu (File, Edit, Process, View, Help), Breadcrumb trang, Model Pill, Nút Run.
 * - Cột bên trái: Danh sách Pages với thẻ thumbnail, số lượng layer, độ phân giải và bộ lọc Filter pages.
 * - Khung Canvas giữa: Bảng công cụ nổi 7 icon (Pointer, Text, Brush, Frame, Pipette, Magic AI, Hand), Zoom slider, Kích thước thật.
 * - Cột bên phải: Tabs Properties & Agent. Bảng Type Inspector (Font, Color Swatch, Size, Weight, Alignment 3 nút hồng, Border Stroke, Textarea) và bảng Layers (Opacity, Eye toggle, Lock artwork).
 */

import {
  DEFAULT_STUDIO_FONT,
  FONT_OPTIONS,
  FONT_SIZE_NUMBERS,
  BASE_FONT_SIZE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  FONT_STYLE_OPTIONS,
  TEXT_DIRECTION_OPTIONS,
  resolveFontOptionValue,
  QUICK_COLORS,
  EMPTY_INITIAL_PAGES,
} from './studio/mangaStudioConstants';
import {
  calculateOptimalFontSize,
  computeOptimalTextBox,
  normalizePages,
  loadPageImageData,
  renderPageToDataUrl,
} from './studio/mangaStudioCanvasRender';
import {
  MangaStudioProjectsModal,
  MangaStudioAutoModal,
  MangaStudioComparisonModal,
  MangaStudioExportConfirmModal,
  MangaStudioCompletionModal,
  MangaStudioPagesSidebar,
  MangaStudioToolbar,
  MangaStudioRightSidebar,
  MangaStudioProgressHud,
  MangaStudioResidualBanner,
  MangaStudioToolPalette,
  MangaStudioZoomBar,
  MangaStudioCanvasLayers,
  useMangaStudioProjects,
  useMangaStudioAutoPipeline,
  useMangaStudioExport,
  useMangaStudioCanvasInteractions,
  useMangaStudioPipelineRunner,
} from './studio';

export {
  calculateOptimalFontSize,
  computeOptimalTextBox,
  normalizePages,
  loadPageImageData,
  renderPageToDataUrl,
  DEFAULT_STUDIO_FONT,
  FONT_OPTIONS,
  QUICK_COLORS,
};

function MangaStudioEditor({
  initialPages = EMPTY_INITIAL_PAGES,
  chapterTitle = 'Manga Chapter',
  onClose,
  onUpdatePages,
  onSavePage,
  onSaveChapter,
  settings: propSettings,
  onUpdateSetting,
  localEngines,
  isLocalEngineOnline = false,
  activeEngineLabel = 'Ollama (port 11434)',
  onRunTranslate,
  onImportSource,
  isStandaloneView = false,
  selectedDir: propSelectedDir = '',
  onRunningChange,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // Local settings state (tự động fetch hoặc đồng bộ từ prop)
  const [localSettings, setLocalSettings] = useState(propSettings || null);
  const settings = propSettings || localSettings;

  useEffect(() => {
    if (!api) return;
    const syncSettings = () => {
      api.translateGetSettings?.()?.then((s) => {
        if (s) setLocalSettings(s);
      });
    };
    if (!propSettings) syncSettings();

    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setLocalSettings((prev) => ({ ...(prev || {}), ...e.detail }));
      }
    };
    window.addEventListener('translate:settingsUpdated', handleSettingsUpdated);
    return () => window.removeEventListener('translate:settingsUpdated', handleSettingsUpdated);
  }, [api, propSettings]);

  // Settings updater helper (đồng bộ local + lưu IPC + notify parent)
  const handleUpdateSetting = useCallback((partial) => {
    setLocalSettings((prev) => {
      const next = { ...(prev || {}), ...partial };
      api?.translateSaveSettings?.(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('translate:settingsUpdated', { detail: next }));
      }
      return next;
    });
    onUpdateSetting?.(partial);
  }, [api, onUpdateSetting]);

  // Live execution logs
  const [logs, setLogs] = useState([]);
  const addLog = useCallback((step, detail, type = 'info', extra = {}) => {
    if (!detail) return;
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].detail === detail) return prev;
      return [...prev.slice(-199), { id: `${Date.now()}-${Math.random()}`, time: timeStr, step: step || 'info', detail, type, ...extra }];
    });
  }, []);

  // Local LLM engine auto-discovery
  const [detectedEngines, setDetectedEngines] = useState(localEngines || null);

  useEffect(() => {
    if (localEngines) setDetectedEngines(localEngines);
  }, [localEngines]);

  const refreshLocalEngines = useCallback(() => {
    if (!api?.translateDetectLocalEngines) return;
    api.translateDetectLocalEngines().then((res) => {
      if (res) setDetectedEngines(res);
    });
  }, [api]);

  useEffect(() => {
    refreshLocalEngines();
  }, [refreshLocalEngines]);

  // Provider & Model resolution (hỗ trợ DeepL, Gemini, OpenAI & Local Models)
  const rawProvider = settings?.translationProvider || 'gemini';
  const activeProvider = rawProvider === 'google' ? 'gemini' : rawProvider;
  const currentModelId = settings?.activeModel || settings?.apiKeys?.openaiCompatible?.model || 'qwen2.5:7b';

  // Check if a model is installed locally in Ollama / LM Studio / Koharu Cache
  const isModelInstalled = useCallback((modelId) => {
    if (!modelId) return false;
    const engines = detectedEngines || localEngines;
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
  }, [detectedEngines, localEngines]);

  const displayLocalModelName = useMemo(() => {
    if (!currentModelId) return 'Local AI';
    if (currentModelId.includes('qwen2.5:7b')) return 'Qwen 2.5 7B Instruct';
    if (currentModelId.includes('qwen2.5:1.5b')) return 'Qwen 2.5 1.5B Instruct';
    if (currentModelId.includes('qwen') && currentModelId.includes('14b')) return 'Qwen 2.5 14B';
    if (currentModelId.includes('gemma4') || currentModelId.includes('gemma-4')) return 'Gemma 4 12B Instruct';
    if (currentModelId.includes('gemma2') || currentModelId.includes('gemma-2')) return 'Gemma 2 9B Instruct';
    return currentModelId;
  }, [currentModelId]);

  const isLocalOnline = Boolean(
    isLocalEngineOnline ||
    localEngines?.ollama?.online ||
    detectedEngines?.ollama?.online ||
    localEngines?.lmstudio?.online ||
    detectedEngines?.lmstudio?.online
  );

  const activeProviderInfo = useMemo(() => {
    const pConfig = settings?.providers?.[activeProvider];
    const pCred = pConfig?.credential?.trim() || settings?.apiKeys?.[activeProvider]?.trim() || '';
    const hasKey = Boolean(pCred);

    switch (activeProvider) {
      case 'deepl': {
        const deeplKey = pCred || settings?.apiKeys?.deepl?.trim() || '';
        const hasDeeplKey = Boolean(deeplKey);
        return {
          id: 'deepl',
          name: 'DeepL Translation',
          shortName: 'DeepL API',
          icon: '🌐',
          badge: hasDeeplKey ? 'DeepL' : t('translate.studio.badgeMissingKey'),
          status: hasDeeplKey ? 'online' : 'warning',
          statusText: hasDeeplKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasDeeplKey,
          isLocal: false,
        };
      }
      case 'openai': {
        return {
          id: 'openai',
          name: 'OpenAI (GPT-4o / 4o-mini)',
          shortName: 'OpenAI GPT-4o',
          icon: '⚡',
          badge: hasKey ? 'OpenAI' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'claude': {
        return {
          id: 'claude',
          name: 'Anthropic Claude (3.5 Sonnet)',
          shortName: 'Claude 3.5',
          icon: '🧠',
          badge: hasKey ? 'Claude' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'deepseek': {
        return {
          id: 'deepseek',
          name: 'DeepSeek (V3 / R1)',
          shortName: 'DeepSeek',
          icon: '🐳',
          badge: hasKey ? 'DeepSeek' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'openrouter': {
        return {
          id: 'openrouter',
          name: 'OpenRouter AI',
          shortName: 'OpenRouter',
          icon: '🔀',
          badge: hasKey ? 'Router' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'ollama':
      case 'lmstudio':
      case 'openai_compatible': {
        const isInstalled = isModelInstalled(currentModelId);
        const isReady = isLocalOnline && isInstalled;
        let status = 'offline';
        let statusText = 'Offline';
        if (isLocalOnline) {
          if (isInstalled) {
            status = 'online';
            statusText = t('translate.studio.statusReady');
          } else {
            status = 'warning';
            statusText = t('translate.studio.statusNotDownloaded');
          }
        }
        return {
          id: activeProvider,
          name: displayLocalModelName,
          shortName: displayLocalModelName.split(' ')[0] + ' ' + (displayLocalModelName.split(' ')[1] || ''),
          icon: '🤖',
          badge: isReady ? 'Local AI' : (isLocalOnline ? t('translate.studio.statusNotDownloaded') : t('translate.studio.statusOffline')),
          status,
          statusText,
          isReady,
          isLocal: true,
        };
      }
      case 'gemini': {
        const geminiKey = pCred || settings?.apiKeys?.gemini?.trim() || '';
        const hasGeminiKey = Boolean(geminiKey);
        return {
          id: 'gemini',
          name: 'Google Gemini',
          shortName: 'Gemini',
          icon: '✨',
          badge: hasGeminiKey ? t('translate.studio.badgeRecommended') : t('translate.studio.badgeMissingKey'),
          status: hasGeminiKey ? 'online' : 'warning',
          statusText: hasGeminiKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasGeminiKey,
          isLocal: false,
        };
      }
      default: {
        if (pConfig) {
          const isLocal = pConfig.type === 'local' || pConfig.category === 'local' || Boolean(pConfig.baseUrl && (pConfig.baseUrl.includes('localhost') || pConfig.baseUrl.includes('127.0.0.1')));
          const isReady = isLocal ? (isLocalOnline || Boolean(pConfig.baseUrl)) : hasKey;
          return {
            id: activeProvider,
            name: pConfig.name || activeProvider,
            shortName: (pConfig.name || activeProvider).split(' ')[0],
            icon: isLocal ? '🤖' : '🌐',
            badge: pConfig.badge || (isLocal ? 'Local AI' : (hasKey ? 'Cloud' : t('translate.studio.badgeMissingKey'))),
            status: isReady ? 'online' : 'warning',
            statusText: isReady ? t('translate.studio.statusReady') : (isLocal ? t('translate.studio.statusOffline') : t('translate.studio.statusNeedKey')),
            isReady,
            isLocal,
          };
        }
        const geminiKey = pCred || settings?.apiKeys?.gemini?.trim() || '';
        const hasGeminiKey = Boolean(geminiKey);
        return {
          id: 'gemini',
          name: 'Google Gemini',
          shortName: 'Gemini',
          icon: '✨',
          badge: hasGeminiKey ? t('translate.studio.badgeRecommended') : t('translate.studio.badgeMissingKey'),
          status: hasGeminiKey ? 'online' : 'warning',
          statusText: hasGeminiKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasGeminiKey,
          isLocal: false,
        };
      }
    }
  }, [activeProvider, settings?.providers, settings?.apiKeys, isLocalOnline, displayLocalModelName, isModelInstalled, currentModelId, t]);

  // Danh sách Cloud Providers kèm trạng thái có Key / Sẵn sàng
  const cloudProviders = useMemo(() => {
    const list = [
      {
        id: 'gemini',
        name: 'Google Gemini (Free tier)',
        icon: '✨',
        badge: t('translate.studio.badgeRecommended'),
        defaultModel: 'gemini-3.5-flash',
      },
      {
        id: 'openai',
        name: 'OpenAI (GPT-4o / 4o-mini)',
        icon: '⚡',
        badge: 'Cloud',
        defaultModel: 'gpt-4o',
      },
      {
        id: 'claude',
        name: 'Anthropic Claude (3.5 Sonnet)',
        icon: '🧠',
        badge: 'Cloud',
        defaultModel: 'claude-3-5-sonnet-20240620',
      },
      {
        id: 'deepseek',
        name: 'DeepSeek (V3 / R1)',
        icon: '🐳',
        badge: 'Cloud',
        defaultModel: 'deepseek-chat',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter (Multi-model)',
        icon: '🔀',
        badge: 'Router',
        defaultModel: 'google/gemini-2.0-flash-exp:free',
      },
      {
        id: 'deepl',
        name: 'DeepL Translation API',
        icon: '🌐',
        badge: t('translate.studio.badgeHighQuality'),
        defaultModel: '',
      },
    ];

    // Thêm các custom provider (nếu không phải local)
    if (settings?.providers) {
      for (const [id, cfg] of Object.entries(settings.providers)) {
        if (!cfg || cfg.isCustom !== true) continue;
        const isLocal = cfg.type === 'local' || cfg.category === 'local' || (cfg.baseUrl && (cfg.baseUrl.includes('localhost') || cfg.baseUrl.includes('127.0.0.1')));
        if (isLocal) continue;
        list.push({
          id,
          name: cfg.name || id,
          icon: '🌐',
          badge: 'Custom',
          defaultModel: cfg.defaultModel || '',
        });
      }
    }

    return list.map((p) => {
      const cred = settings?.providers?.[p.id]?.credential || settings?.apiKeys?.[p.id] || '';
      const hasKey = Boolean(cred.trim());
      return {
        ...p,
        isReady: hasKey,
        hasKey,
        statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.badgeMissingKey'),
      };
    });
  }, [settings?.providers, settings?.apiKeys, t]);

  // Danh sách Local Models kèm trạng thái đã cài / server online (chỉ hiển thị model THỰC SỰ ĐÃ TẢI trong máy)
  const localModels = useMemo(() => {
    const predefinedMeta = PREDEFINED_LOCAL_MODEL_META;

    const engines = detectedEngines || localEngines;
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
      const meta = predefinedMeta[mid] || {};
      modelMap.set(mid, {
        id: mid,
        name: meta.name || m.name || mid,
        badge: meta.badge || m.size || m.engine || 'Local',
        isInstalled: true,
        isReady: isLocalOnline,
        statusText: isLocalOnline ? t('translate.studio.statusReady') : 'Offline',
      });
    });

    if (currentModelId && !modelMap.has(currentModelId) && isModelInstalled(currentModelId)) {
      modelMap.set(currentModelId, {
        id: currentModelId,
        name: currentModelId,
        badge: 'Custom',
        isInstalled: true,
        isReady: isLocalOnline,
        statusText: isLocalOnline ? t('translate.studio.statusReady') : 'Offline',
      });
    }

    return Array.from(modelMap.values());
  }, [isLocalOnline, isModelInstalled, detectedEngines, localEngines, currentModelId, t]);

  const displayModelName = activeProviderInfo.name;
  const loadingPathsRef = useRef(new Set());

  // Normalized pages state with layer data
  const [pages, setPages] = useState(() => normalizePages(initialPages));

  // Đồng bộ lại pages khi initialPages cập nhật từ kết quả dịch bên ngoài (nếu có)
  useEffect(() => {
    if (!initialPages || initialPages.length === 0) return;

    setPages((prev) => {
      const normalized = normalizePages(initialPages);
      // Tránh ghi đè nếu danh sách đã đồng bộ hoàn toàn
      if (
        prev.length === normalized.length &&
        prev.every((p, idx) => p.imagePath === normalized[idx]?.imagePath && p.savedPath === normalized[idx]?.savedPath)
      ) {
        return prev;
      }
      return normalized.map((norm, idx) => {
        const existing = prev.find((p) => p.imagePath === norm.imagePath || p.index === idx) || prev[idx];
        if (existing) {
          const realWidth = (existing.width && existing.width > 100)
            ? existing.width
            : (norm.width && norm.width > 100 ? norm.width : 0);
          const realHeight = (existing.height && existing.height > 100)
            ? existing.height
            : (norm.height && norm.height > 100 ? norm.height : 0);

          return {
            ...norm,
            id: existing.id || `page-${idx}`,
            index: idx,
            dataUrl: existing.originalDataUrl || existing.dataUrl || norm.originalDataUrl || norm.dataUrl || null,
            originalDataUrl: existing.originalDataUrl || norm.originalDataUrl || existing.dataUrl || norm.dataUrl || null,
            width: realWidth,
            height: realHeight,
            layers: (Array.isArray(existing.layers) && existing.layers.length > 0) ? existing.layers : norm.layers,
            savedPath: norm.savedPath || existing.savedPath,
            translatedImageDataUrl: norm.translatedImageDataUrl || existing.translatedImageDataUrl,
          };
        }
        return {
          ...norm,
          id: norm.id || `page-${idx}`,
          index: idx,
        };
      });
    });
  }, [initialPages]);

  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [expandedLayerId, setExpandedLayerId] = useState(null);
  const [isTextGroupCollapsed, setIsTextGroupCollapsed] = useState(false);
  const [pageToDelete, setPageToDelete] = useState(null); // null | page object | 'all'
  const [activeTool, setActiveTool] = useState('select'); // 'select' | 'text' | 'brush' | 'box' | 'pipette' | 'magic' | 'hand'

  // Toggle thu gọn / mở rộng trực tiếp khi click vào title của text layer
  const toggleLayerCollapse = useCallback((layerId) => {
    setExpandedLayerId((prev) => (prev === layerId ? null : layerId));
    setSelectedLayerId(layerId);
  }, []);

  // Reset expanded layer khi chuyển trang
  useEffect(() => {
    setExpandedLayerId(null);
  }, [activePageIndex]);

  // Tự động điều chỉnh activePageIndex nếu danh sách trang thay đổi
  useEffect(() => {
    if (pages.length > 0 && activePageIndex >= pages.length) {
      setActivePageIndex(pages.length - 1);
    }
  }, [pages.length, activePageIndex]);

  // Left sidebar (Pages list) visibility
  const SHOW_LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_show_left_sidebar_v1';
  const [showLeftSidebar, setShowLeftSidebar] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_LEFT_SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return true;
  });

  const toggleLeftSidebar = useCallback((forceState) => {
    setShowLeftSidebar((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      try {
        localStorage.setItem(SHOW_LEFT_SIDEBAR_STORAGE_KEY, String(next));
      } catch { }
      return next;
    });
  }, []);

  // Right sidebar visibility & tabs (Workflow vs Settings)
  const SHOW_RIGHT_SIDEBAR_STORAGE_KEY = 'manga_studio_show_right_sidebar_v1';
  const [showRightSidebar, setShowRightSidebar] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return true;
  });

  const toggleRightSidebar = useCallback((forceState) => {
    setShowRightSidebar((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      try {
        localStorage.setItem(SHOW_RIGHT_SIDEBAR_STORAGE_KEY, String(next));
      } catch { }
      return next;
    });
  }, []);

  const [activeRightTab, setActiveRightTab] = useState('properties'); // 'properties' | 'settings'

  // Right sidebar width & resizing (đồng bộ chiều rộng Quy trình & Cài đặt)
  const RIGHT_SIDEBAR_STORAGE_KEY = 'manga_studio_sidebar_width_v1';
  const clampRightSidebarWidth = useCallback((w) => {
    const min = 360;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(760, Math.floor(window.innerWidth * 0.65))) : 760;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 360 && num <= 800) {
          return num;
        }
      }
    } catch { }
    return 460;
  });

  const rightSidebarWidthRef = useRef(rightSidebarWidth);
  useEffect(() => {
    rightSidebarWidthRef.current = rightSidebarWidth;
  }, [rightSidebarWidth]);

  const handleRightSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      // Thanh bên nằm bên phải màn hình: Kéo chuột sang trái (startX - ev.clientX > 0) -> tăng width
      const delta = startX - ev.clientX;
      const next = clampRightSidebarWidth(startW + delta);
      lastW = next;
      setRightSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(RIGHT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampRightSidebarWidth]);

  // Left sidebar (Pages list) width & resizing
  const LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_left_sidebar_width_v1';
  const clampLeftSidebarWidth = useCallback((w) => {
    const min = 180;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(500, Math.floor(window.innerWidth * 0.45))) : 500;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 180 && num <= 600) {
          return num;
        }
      }
    } catch { }
    return 240;
  });

  const leftSidebarWidthRef = useRef(leftSidebarWidth);
  useEffect(() => {
    leftSidebarWidthRef.current = leftSidebarWidth;
  }, [leftSidebarWidth]);

  const handleLeftSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      // Thanh bên nằm bên trái màn hình: Kéo chuột sang phải (ev.clientX - startX > 0) -> tăng width
      const delta = ev.clientX - startX;
      const next = clampLeftSidebarWidth(startW + delta);
      lastW = next;
      setLeftSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampLeftSidebarWidth]);

  // Dropdown states: Model, Run, Export, Add Page
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRunDropdown, setShowRunDropdown] = useState(false);
  const [draggedRunActionId, setDraggedRunActionId] = useState(null);
  const [dragOverRunActionId, setDragOverRunActionId] = useState(null);
  const isRunActionDraggingRef = useRef(false);

  const RUN_ACTIONS_STORAGE_KEY = 'manga_studio_run_actions_order_v2';
  const DEFAULT_RUN_ACTION_ORDER = ['all', 'current', 'untranslated'];

  const [runActionOrder, setRunActionOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(RUN_ACTIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((id) => DEFAULT_RUN_ACTION_ORDER.includes(id));
          DEFAULT_RUN_ACTION_ORDER.forEach((id) => {
            if (!valid.includes(id)) valid.push(id);
          });
          return valid;
        }
      }
    } catch { }
    return DEFAULT_RUN_ACTION_ORDER;
  });

  const handleReorderRunAction = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setRunActionOrder((prev) => {
      const next = [...prev];
      const sourceIdx = next.indexOf(sourceId);
      const targetIdx = next.indexOf(targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, sourceId);
      try {
        localStorage.setItem(RUN_ACTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch { }
      return next;
    });
  }, []);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokeColorPicker, setShowStrokeColorPicker] = useState(false);
  const modelPickerRef = useRef(null);
  const runDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Layer inspector textarea ref
  const layerTextareaRef = useRef(null);

  // Global overlay toggles (chuẩn Koharu: bật sẵn cleanup layer để hiển thị ảnh đã tẩy chữ sạch viền khung gốc)
  const [showCleanupLayer, setShowCleanupLayer] = useState(true);
  const [showArtworkLayer, setShowArtworkLayer] = useState(true);

  // Export & Agent status
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: 'info' });
  const [agentPrompt, setAgentPrompt] = useState('');
  const [errorModal, setErrorModal] = useState(null);
  const [isRetryingResidual, setIsRetryingResidual] = useState(false);
  const [retryingSingleLayerId, setRetryingSingleLayerId] = useState(null);

  // --- Multi-Project & Session Persistence State (Quản lý đa dự án) ---
  const [showProjectModal, setShowProjectModal] = useState(false);
  const {
    projectsList,
    setProjectsList,
    currentProject,
    setCurrentProject,
    isSavingSession,
    loadProjectsList,
    handleCreateProject,
    handleSwitchProject,
    handleRenameProject,
    handleDeleteProject,
    serializePagesForSession,
    clearSaveSessionTimer,
  } = useMangaStudioProjects({
    api,
    pages,
    setPages,
    activePageIndex,
    setActivePageIndex,
    isTranslating,
    initialPages,
    onUpdatePages,
    setSelectedLayerId,
    setExpandedLayerId,
    setLogs,
    setTranslateProgress,
    loadingPathsRef,
    setShowProjectModal,
    setStatusMessage,
    t,
  });

  // Bảng đối chiếu dịch thuật & Live Terminal Console
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showLogConsole, setShowLogConsole] = useState(true);
  const [isProgressHudCollapsed, setIsProgressHudCollapsed] = useState(false);
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState('all'); // 'all' | 'clean' | 'residual'
  const [comparisonScope, setComparisonScope] = useState('current'); // 'current' | 'all'
  const [showComparisonPreview, setShowComparisonPreview] = useState(false);
  const [comparisonHoveredLayerId, setComparisonHoveredLayerId] = useState(null);
  const logConsoleRef = useRef(null);



  // Modal khôi phục tiến trình dịch dở dang (Smart Resume Checkpoint)
  const [resumePromptModal, setResumePromptModal] = useState(null);

  // Modal thông báo hoàn tất tiến trình Dịch / Xuất file / Auto-Processing
  const [completionModal, setCompletionModal] = useState(null);

  // Điều hướng phím mũi tên Trái / Phải khi mở Bảng đối chiếu
  useEffect(() => {
    if (!showComparisonModal) return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActivePageIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActivePageIndex((prev) => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showComparisonModal, pages.length]);

  // Tự động cuộn terminal log xuống dòng mới nhất
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs, showLogConsole]);

  // Tự động đóng HUD sau 25s khi đã hoàn thành (nếu user không bấm xem bảng đối chiếu hoặc xem log)
  useEffect(() => {
    if (translateProgress?.isFinished) {
      const timer = setTimeout(() => {
        setTranslateProgress(null);
      }, 25000);
      return () => clearTimeout(timer);
    }
  }, [translateProgress?.isFinished]);

  // Tự động ẩn toast thông báo sau 3.5 giây (tránh chiếm giữ màn hình)
  useEffect(() => {
    if (statusMessage?.text) {
      const timer = setTimeout(() => {
        setStatusMessage({ text: '', type: 'info' });
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage?.text]);

  // Regex phát hiện chữ Nhật (Hiragana, Katakana, Kanji, Halfwidth Katakana)
  const JAPANESE_CHAR_REGEX = useMemo(() => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/, []);

  useEffect(() => {
    onRunningChange?.(isTranslating);
  }, [isTranslating, onRunningChange]);

  // Process & integrate imported file paths into Studio state (lọc chống import trùng, hỗ trợ subfolder, hỗ trợ replaceExisting)
  const processImportedFiles = useCallback(
    async (filePaths, isFolder = false, sourceDir = '', fileDetails = null, replaceExisting = false) => {
      if (!filePaths || !filePaths.length) return;

      const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();

      // 1. Lọc trùng nội bộ trong danh sách input
      const seenInputSet = new Set();
      const uniqueInputPaths = [];
      for (const fp of filePaths) {
        const norm = normalizePath(fp);
        if (norm && !seenInputSet.has(norm)) {
          seenInputSet.add(norm);
          uniqueInputPaths.push(fp);
        }
      }

      // 2. Kiểm tra trùng lặp với danh sách trang hiện tại của dự án (nếu không thay thế toàn bộ)
      let pathsToAdd = uniqueInputPaths;
      let duplicateCount = 0;
      let singleDuplicatePath = null;

      if (!replaceExisting && pages.length > 0) {
        const existingPathSet = new Set(
          pages.map((p) => normalizePath(p.imagePath)).filter(Boolean)
        );

        pathsToAdd = [];
        for (const fp of uniqueInputPaths) {
          const norm = normalizePath(fp);
          if (existingPathSet.has(norm)) {
            duplicateCount++;
            singleDuplicatePath = fp;
          } else {
            pathsToAdd.push(fp);
          }
        }

        // Nếu toàn bộ file được chọn đều đã tồn tại trong Studio
        if (pathsToAdd.length === 0) {
          if (duplicateCount === 1 && singleDuplicatePath) {
            const dupFilename = singleDuplicatePath.split(/[/\\]/).filter(Boolean).pop();
            const existingIdx = pages.findIndex(
              (p) => normalizePath(p.imagePath) === normalizePath(singleDuplicatePath)
            );
            if (existingIdx >= 0) {
              setActivePageIndex(existingIdx);
            }
            setStatusMessage({
              text: t('translate.studio.toastFileAlreadyInList', { filename: dupFilename, page: existingIdx >= 0 ? existingIdx + 1 : 1 }),
              type: 'info',
            });
          } else {
            setStatusMessage({
              text: isFolder
                ? t('translate.studio.toastAllFolderImagesInList', { count: duplicateCount })
                : t('translate.studio.toastAllSelectedImagesInList', { count: duplicateCount }),
              type: 'info',
            });
          }
          return;
        }
      }

      const sortedPaths = fileDetails
        ? pathsToAdd
        : [...pathsToAdd].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );

      const detailMap = new Map();
      if (Array.isArray(fileDetails)) {
        for (const d of fileDetails) {
          detailMap.set(normalizePath(d.absPath), { relPath: d.relPath || '', subfolder: d.subfolder || '' });
        }
      }

      const basePages = replaceExisting ? [] : pages;
      const startIndex = basePages.length;

      setStatusMessage({
        text: t('translate.studio.toastLoadingPages', { count: sortedPaths.length }),
        type: 'info',
      });

      const newItems = sortedPaths.map((fp, idx) => {
        const detail = detailMap.get(normalizePath(fp));
        const parts = fp.split(/[/\\]/).filter(Boolean);
        const baseName = parts.pop() || `page-${startIndex + idx + 1}`;
        const subfolder = detail?.subfolder || (detail?.relPath ? detail.relPath.substring(0, detail.relPath.lastIndexOf('/')) : '');
        const filename = detail?.relPath || (subfolder ? `${subfolder}/${baseName}` : baseName);

        return {
          id: `page-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          index: startIndex + idx,
          imagePath: fp,
          savedPath: '',
          filename,
          relPath: detail?.relPath || (subfolder ? `${subfolder}/${baseName}` : ''),
          subfolder,
          dataUrl: null,
          originalDataUrl: null,
          translatedImageDataUrl: null,
          width: 0,
          height: 0,
          layers: [],
        };
      });

      try {
        const firstImg = await loadPageImageData(sortedPaths[0], api);
        if (firstImg?.dataUrl && newItems[0]) {
          newItems[0].dataUrl = firstImg.dataUrl;
          newItems[0].originalDataUrl = firstImg.dataUrl;
          newItems[0].width = firstImg.width || 800;
          newItems[0].height = firstImg.height || 1200;
        }
      } catch (e) {
        console.warn('[MangaStudioEditor] Failed to load first image:', e);
      }

      const finalPages = basePages.length === 0
        ? newItems
        : [...basePages, ...newItems].map((p, idx) => ({ ...p, index: idx, id: p.id || `page-${idx}` }));

      setPages(finalPages);
      if (basePages.length === 0) {
        setActivePageIndex(0);
        setSelectedLayerId(null);
      } else {
        setActivePageIndex(startIndex);
      }
      onUpdatePages?.(finalPages);

      const targetDir = sourceDir || (sortedPaths[0] ? sortedPaths[0].substring(0, sortedPaths[0].lastIndexOf('/')) : '');
      onImportSource?.({ dir: targetDir, files: sortedPaths, isFolder });

      const folderName = targetDir ? targetDir.split(/[/\\]/).filter(Boolean).pop() : '';
      const subCount = detailMap.size > 0 ? new Set([...detailMap.values()].map((d) => d.subfolder).filter(Boolean)).size : 0;
      setStatusMessage({
        text: isFolder
          ? (duplicateCount > 0
            ? t('translate.studio.toastFolderLoadedWithSub', { folder: folderName, count: sortedPaths.length, dup: duplicateCount, sub: subCount })
            : t('translate.studio.toastFolderLoaded', { folder: folderName, count: sortedPaths.length }))
          : (duplicateCount > 0
            ? t('translate.studio.toastFilesLoaded', { count: sortedPaths.length, dup: duplicateCount })
            : t('translate.studio.toastFilesLoadedSuccess', { count: sortedPaths.length })),
        type: 'success',
      });
    },
    [pages, api, onUpdatePages, onImportSource]
  );

  const activePage = pages[activePageIndex] || pages[0] || null;
  const layers = Array.isArray(activePage?.layers) ? activePage.layers : [];
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  // --- Export Actions Hook ---
  const {
    isExporting,
    setIsExporting,
    showExportDropdown,
    setShowExportDropdown,
    exportDropdownRef,
    autoOpenExportFolder,
    setAutoOpenExportFolder,
    exportConfirmModal,
    setExportConfirmModal,
    handleExportCurrentPage,
    handleExportAllChapter,
    handleExportCbz,
    currentDirectory,
  } = useMangaStudioExport({
    api,
    pages,
    setPages,
    activePageIndex,
    activePage,
    showCleanupLayer,
    chapterTitle,
    propSelectedDir,
    onSavePage,
    onSaveChapter,
    setStatusMessage,
    t,
  });

  // --- Guide Modal State ---
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideInitialTab, setGuideInitialTab] = useState('workflow');

  // --- Auto-Processing Mode Hook ---
  const {
    showAutoModal,
    setShowAutoModal,
    autoInputDir,
    setAutoInputDir,
    autoOutputDir,
    setAutoOutputDir,
    autoSkipExisting,
    setAutoSkipExisting,
    autoScannedCount,
    autoScannedData,
    syncFolderModal,
    setSyncFolderModal,
    isScanningAuto,
    isAutoProcessing,
    autoProgress,
    detectedProjectDir,
    defaultOutputDir,
    activeInputDir,
    activeOutputDir,
    isAutoModeEnabled,
    toggleAutoMode,
    handleAutoExportPages,
    handleSelectAutoInputDir,
    handleTriggerSyncFromAuto,
    handleSelectAutoOutputDir,
    handleStartAuto,
    handleCancelAuto,
    isFolderSyncedToStudio,
  } = useMangaStudioAutoPipeline({
    api,
    settings,
    handleUpdateSetting,
    pages,
    setPages,
    propSelectedDir,
    currentProject,
    autoOpenExportFolder,
    onSaveChapter,
    addLog,
    setStatusMessage,
    setErrorModal,
    setCompletionModal,
    setTranslateProgress,
    setIsExporting,
    processImportedFiles,
    t,
  });

  const fontOptions = useMemo(() => {
    const base = FONT_OPTIONS.map((f) => ({
      value: f.value,
      label: f.i18nKey ? t(f.i18nKey) : f.label,
      icon: 'font_download',
    }));
    const cur = resolveFontOptionValue(selectedLayer?.fontFamily);
    if (cur && !base.some((b) => b.value === cur)) {
      return [{ value: cur, label: cur, icon: 'font_download' }, ...base];
    }
    return base;
  }, [t, selectedLayer?.fontFamily]);

  const fontSizeOptions = useMemo(() => {
    const cur = selectedLayer?.fontSize ? String(selectedLayer.fontSize) : 'auto';
    if (cur !== 'auto' && !BASE_FONT_SIZE_OPTIONS.some((o) => o.value === cur)) {
      return [
        BASE_FONT_SIZE_OPTIONS[0],
        { value: cur, label: `${cur}px` },
        ...BASE_FONT_SIZE_OPTIONS.slice(1),
      ];
    }
    return BASE_FONT_SIZE_OPTIONS;
  }, [selectedLayer?.fontSize]);

  const fontWeightOptions = useMemo(() => {
    const cur = selectedLayer?.fontWeight ? String(selectedLayer.fontWeight) : '400';
    if (!FONT_WEIGHT_OPTIONS.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur }, ...FONT_WEIGHT_OPTIONS];
    }
    return FONT_WEIGHT_OPTIONS;
  }, [selectedLayer?.fontWeight]);


  // Update a property of the selected layer
  const updateSelectedLayer = useCallback((updates) => {
    if (!selectedLayerId) return;
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.map((l) => {
            if (l.id !== selectedLayerId) return l;
            const updated = { ...l, ...updates };
            if (typeof updates.text === 'string') {
              updated.hasResidualJapanese = JAPANESE_CHAR_REGEX.test(updates.text);
              updated.isTranslated = true;
            }
            return updated;
          }),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [selectedLayerId, activePageIndex, onUpdatePages, JAPANESE_CHAR_REGEX]);

  // Canvas Viewport & Mouse Interactions Hook (Zoom, Pan, Layer Drag, 8 Handles Resize, Viewport Fit)
  const {
    zoom,
    setZoom,
    pan,
    setPan,
    isPanning,
    isSpacePressed,
    setIsSpacePressed,
    spacePressedRef,
    interaction,
    containerW,
    containerH,
    canvasRef,
    imageContainerRef,
    imageRef,
    clampPan,
    handleFitToScreen,
    handleImageLoaded,
    handleZoomChange,
    handleResetZoom,
    handleMouseDownOnLayer,
    handleDoubleClickOnLayer,
    handleMouseDownOnHandle,
    handleMouseMove,
    handleMouseUp,
    handleCanvasMouseDown,
  } = useMangaStudioCanvasInteractions({
    activePage,
    activePageIndex,
    pages,
    setPages,
    selectedLayerId,
    setSelectedLayerId,
    setExpandedLayerId,
    setIsTextGroupCollapsed,
    setActiveRightTab,
    setShowRightSidebar,
    updateSelectedLayer,
    onUpdatePages,
    activeTool,
    layerTextareaRef,
  });

  // Kiểm tra một layer có thực sự bị sót chữ Nhật / lỗi dịch hay không
  const isLayerResidual = useCallback((l) => {
    if (!l) return false;
    // 1. Đã được đánh dấu tường minh là sót chữ Nhật
    if (l.hasResidualJapanese) return true;
    // 2. Chữ dịch hiển thị có chứa ký tự tiếng Nhật
    if (l.text && JAPANESE_CHAR_REGEX.test(l.text)) return true;
    // 3. Chỉ tính là lỗi dịch nếu layer ĐÃ CÓ chữ gốc (sourceText) nhưng translation bị đánh dấu thất bại
    if (Boolean(l.sourceText && l.sourceText.trim()) && l.isTranslated === false) return true;
    return false;
  }, [JAPANESE_CHAR_REGEX]);

  // Danh sách các layer còn sót chữ tiếng Nhật hoặc chưa dịch xong trên trang hiện tại
  const residualLayers = useMemo(() => {
    return layers.filter(isLayerResidual);
  }, [layers, isLayerResidual]);

  // Danh sách toàn bộ layers của cả Chapter kèm thông tin trang
  const allChapterLayersWithMeta = useMemo(() => {
    const list = [];
    pages.forEach((page, pageIdx) => {
      (page.layers || []).forEach((layer, layerIdx) => {
        list.push({
          layer,
          pageIndex: pageIdx,
          pageFilename: page.filename || t('translate.compare.pageBtn', { page: pageIdx + 1 }),
          pageDataUrl: page.dataUrl || page.originalDataUrl,
          layerIndexOnPage: layerIdx,
          id: `${pageIdx}-${layer.id || layerIdx}`,
        });
      });
    });
    return list;
  }, [pages]);

  // Danh sách và tổng số khung sót chữ tiếng Nhật trên toàn bộ Chapter
  const allChapterResidualLayers = useMemo(() => {
    return allChapterLayersWithMeta.filter(({ layer }) => isLayerResidual(layer));
  }, [allChapterLayersWithMeta, isLayerResidual]);

  // Number of untranslated pages (for batch options)
  const untranslatedCount = useMemo(() => {
    return pages.filter((p) => !p.layers || p.layers.length === 0).length;
  }, [pages]);

  // Subscribe to translation progress for live on-canvas feedback (Koharu style)
  useEffect(() => {
    if (!api) return;
    const unsubSingle = api.subscribeTranslateProgress?.((p) => {
      setTranslateProgress(p);
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }

      // Step 1: Detect -> Áp dụng ngay viền xanh bao quanh các bóng thoại trực tiếp lên canvas
      if (p?.step === 'detect' && Array.isArray(p.detections) && p.detections.length > 0) {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            const liveLayers = p.detections.map((d, dIdx) => {
              const bbox = d.bbox || [0, 0, 100, 100];
              const hasBubble = d.hasBubble !== false;
              const textBbox = computeOptimalTextBox(bbox, d.textBbox, hasBubble);
              return {
                id: `layer-${activePageIndex}-${dIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: '',
                text: '',
                bbox,
                textBbox,
                fontFamily: DEFAULT_STUDIO_FONT,
                fontSize: 'auto',
                fontWeight: '700',
                fontStyle: 'normal',
                color: '#000000',
                strokeColor: '#ffffff',
                strokeWidth: 1.5,
                align: 'center',
                direction: 'auto',
                textTransform: 'uppercase',
                hasBubble,
                fillBackground: false, // Do not fill background to see bubble position on original artwork
                visible: true,
                opacity: 1,
                isTranslated: false,
              };
            });
            return { ...page, layers: liveLayers };
          })
        );
      }

      // Step 2: Inpaint -> Lưu ảnh đã tẩy chữ vào cleanDataUrl (để user toggle sau).
      // GIỮ NGUYÊN fillBackground = true cho layers — vì Preview luôn hiển ảnh gốc.
      if (p?.step === 'inpaint') {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            return {
              ...page,
              cleanDataUrl: p.cleanDataUrl || page.cleanDataUrl,
              // Không thay đổi fillBackground — giữ nguyên giá trị hiện tại của từng layer
            };
          })
        );
      }

      // Step 3 & 4: Translate & Verify -> Trực tiếp điền các câu thoại dịch vào đúng từng khung trên canvas
      // Luôn xây dựng lại toàn bộ layers từ translations để tránh layer cũ bị đè lận
      if ((p?.step === 'translate' || p?.step === 'verify') && Array.isArray(p.translations) && p.translations.length > 0) {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            // Lấy các thuộc tính hiện có của layer (font, màu sắc, v.v.) để preserve
            const existingLayerMap = new Map((page.layers || []).map((l, i) => [i, l]));
            const newLayers = p.translations.map((trans, tIdx) => {
              // Kế thừa các thuộc tính tự do nếu có layer cũ tương ứng
              const existing = existingLayerMap.get(tIdx) || {};
              const rawText = trans.text || trans.translatedText || existing.text || '';
              const hasResidual = Boolean(trans.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(rawText));
              const bbox = trans.bbox || existing.bbox || [100, 100, 200, 150];
              const hasBubble = trans.hasBubble !== false;
              const textBbox = computeOptimalTextBox(bbox, trans.textBbox || existing.textBbox, hasBubble, existing.isCustomTextBox);
              return {
                id: existing.id || `layer-${activePageIndex}-${tIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: trans.sourceText || trans.originalText || existing.sourceText || '',
                text: rawText,
                bbox,
                textBbox,
                fontFamily: existing.fontFamily || DEFAULT_STUDIO_FONT,
                fontSize: existing.fontSize || 'auto',
                fontWeight: existing.fontWeight || '700',
                fontStyle: existing.fontStyle || 'normal',
                color: existing.color || '#000000',
                strokeColor: existing.strokeColor || '#ffffff',
                strokeWidth: typeof existing.strokeWidth === 'number' ? existing.strokeWidth : 1.5,
                align: existing.align || 'center',
                direction: existing.direction || 'auto',
                textTransform: existing.textTransform || 'uppercase',
                hasBubble,
                // Chuẩn Koharu: text layer không tô đè hộp trắng lên viền khung gốc
                fillBackground: Boolean(existing.fillBackground === true),
                visible: existing.visible !== false,
                opacity: existing.opacity ?? 1,
                isTranslated: trans.isTranslated !== false && !hasResidual,
                hasResidualJapanese: hasResidual,
              };
            });
            return { ...page, layers: newLayers };
          })
        );
      }
      if (p?.logItem) {
        addLog(p.logItem.step || p.step, p.logItem.text, p.logItem.type || 'info', p.logItem);
      } else if (p?.detail) {
        addLog(p.step, p.detail, p.isQuota || p.warning ? 'warn' : 'info');
      }
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }
    });

    const unsubChapter = api.subscribeTranslateChapterProgress?.((p) => {
      setTranslateProgress(p);
      if (p?.logItem) {
        addLog(p.logItem.step || p.step, p.logItem.text, p.logItem.type || 'info', p.logItem);
      } else if (p?.detail) {
        addLog(p.step, p.detail, p.isQuota || p.warning ? 'warn' : 'info');
      }
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }
    });

    // Lắng nghe Streaming Checkpoint từng trang hoàn tất để cập nhật Canvas theo thời gian thực
    const unsubPageDone = api.subscribeTranslateChapterPageDone?.((pagePayload) => {
      if (!pagePayload?.imagePath) return;
      setPages((prevPages) => {
        return prevPages.map((p) => {
          if (p.imagePath !== pagePayload.imagePath && p.index !== pagePayload.index) return p;
          const rawTranslations = Array.isArray(pagePayload.translations) ? pagePayload.translations : [];
          const newLayers = rawTranslations.map((t, lIdx) => {
            const sourceText = t.sourceText || t.originalText || t.rawText || '';
            const text = t.text || t.translatedText || '';
            return {
              id: `layer-${p.index}-${lIdx}-${Date.now()}`,
              type: 'dialogue',
              sourceText,
              text,
              bbox: Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150],
              fontFamily: t.fontFamily || DEFAULT_STUDIO_FONT,
              fontSize: t.fontSize || 'auto',
              fontWeight: t.fontWeight || '700',
              fontStyle: t.fontStyle || 'normal',
              color: t.color || '#000000',
              strokeColor: t.strokeColor || '#ffffff',
              strokeWidth: typeof t.strokeWidth === 'number' ? t.strokeWidth : 1.5,
              align: t.align || 'center',
              direction: t.direction || 'auto',
              textTransform: t.textTransform || 'uppercase',
              hasBubble: t.hasBubble !== false,
              fillBackground: false,
              visible: t.visible !== false,
              opacity: t.opacity ?? 1,
              isTranslated: t.isTranslated !== false,
            };
          });

          return {
            ...p,
            cleanDataUrl: pagePayload.cleanDataUrl || p.cleanDataUrl || null,
            layers: newLayers.length > 0 ? newLayers : p.layers,
          };
        });
      });
    });

    // Lắng nghe Intermediate Step Checkpoint (Detection / OCR / Translate hoàn tất cho từng trang)
    const unsubStepDone = api.subscribeTranslateChapterStepDone?.((stepPayload) => {
      if (!stepPayload?.path) return;
      setPages((prevPages) => {
        return prevPages.map((p) => {
          if (p.imagePath !== stepPayload.path && p.index !== stepPayload.pageIndex) return p;

          // Nếu vừa xong Detection: tạo layers mới nếu chưa có
          if (stepPayload.step === 'detect' && Array.isArray(stepPayload.detections)) {
            const rawDets = stepPayload.detections;
            if (!Array.isArray(p.layers) || p.layers.length === 0) {
              const newLayers = rawDets.map((d, lIdx) => ({
                id: `layer-${p.index}-${lIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: '',
                text: '',
                bbox: Array.isArray(d.bbox) ? [...d.bbox] : [100, 100, 200, 150],
                fontFamily: DEFAULT_STUDIO_FONT,
                fontSize: 'auto',
                fontWeight: '700',
                fontStyle: 'normal',
                color: '#000000',
                strokeColor: '#ffffff',
                strokeWidth: 1.5,
                align: 'center',
                direction: 'auto',
                textTransform: 'uppercase',
                hasBubble: d.hasBubble !== false,
                fillBackground: false,
                visible: true,
                opacity: 1,
                isTranslated: null,
                hasResidualJapanese: false,
              }));
              return { ...p, layers: newLayers };
            }
          }

          // Nếu vừa xong OCR: cập nhật sourceText vào layers
          if (stepPayload.step === 'ocr' && Array.isArray(stepPayload.ocrResults) && Array.isArray(p.layers)) {
            const ocrMap = new Map();
            stepPayload.ocrResults.forEach((r, idx) => {
              ocrMap.set(idx, r.text);
              if (r.id !== undefined) ocrMap.set(r.id, r.text);
              if (r.index !== undefined) ocrMap.set(r.index, r.text);
            });
            const updated = p.layers.map((l, idx) => ({
              ...l,
              sourceText: ocrMap.get(idx) ?? ocrMap.get(l.id) ?? l.sourceText ?? '',
            }));
            return { ...p, layers: updated };
          }

          // Nếu vừa xong Translation: cập nhật text tiếng Việt
          if (stepPayload.step === 'translate' && Array.isArray(stepPayload.translations) && Array.isArray(p.layers)) {
            const transMap = new Map();
            stepPayload.translations.forEach((t, idx) => {
              transMap.set(idx, t);
              if (t.id !== undefined) transMap.set(t.id, t);
              if (t.index !== undefined) transMap.set(t.index, t);
            });
            const updated = p.layers.map((l, idx) => {
              const t = transMap.get(idx) ?? transMap.get(l.id);
              if (!t) return l;
              const transText = t.translatedText || t.text || l.text || '';
              return {
                ...l,
                text: transText,
                translatedText: transText,
                sourceText: t.sourceText || l.sourceText || '',
                isTranslated: t.isTranslated !== false,
                hasResidualJapanese: Boolean(t.hasResidualJapanese),
              };
            });
            return { ...p, layers: updated };
          }

          return p;
        });
      });
    });

    return () => {
      if (typeof unsubSingle === 'function') unsubSingle();
      if (typeof unsubChapter === 'function') unsubChapter();
      if (typeof unsubPageDone === 'function') unsubPageDone();
      if (typeof unsubStepDone === 'function') unsubStepDone();
    };
  }, [api, activePageIndex]);

  // Click outside to dismiss menus
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (runDropdownRef.current && !runDropdownRef.current.contains(e.target)) {
        setShowRunDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-load dataUrl and dimensions for any pages missing dataUrl in background
  useEffect(() => {
    if (!api?.translateReadImageDataUrl || !pages.length) return;

    // Find pages missing dataUrl or dimensions that are not currently fetching
    const missingPages = pages.filter(
      (p) => (!p.dataUrl || !p.width || p.width <= 100) && p.imagePath && !loadingPathsRef.current.has(p.imagePath)
    );
    if (!missingPages.length) return;

    // Prioritize active page first, then by distance to active page
    const sorted = [...missingPages].sort((a, b) => {
      const distA = Math.abs(a.index - activePageIndex);
      const distB = Math.abs(b.index - activePageIndex);
      return distA - distB;
    });

    // Process in batches of up to 6 items to prevent UI/memory stalls
    const batch = sorted.slice(0, 6);

    batch.forEach((p) => {
      loadingPathsRef.current.add(p.imagePath);
      loadPageImageData(p.imagePath, api).then((res) => {
        loadingPathsRef.current.delete(p.imagePath);
        if (res.dataUrl) {
          setPages((prev) =>
            prev.map((item) =>
              item.imagePath === p.imagePath
                ? {
                  ...item,
                  dataUrl: res.dataUrl,
                  originalDataUrl: res.dataUrl,
                  width: (item.width && item.width > 100) ? item.width : res.width,
                  height: (item.height && item.height > 100) ? item.height : res.height,
                }
                : item
            )
          );
        }
      }).catch(() => {
        loadingPathsRef.current.delete(p.imagePath);
      });
    });
  }, [pages, activePageIndex, api]);

  // Đổi font chữ: nếu có layer chọn -> đổi layer đó; nếu chưa chọn -> đổi toàn bộ layer trên trang
  const handleFontChange = useCallback((newFontValue) => {
    if (selectedLayerId) {
      updateSelectedLayer({ fontFamily: newFontValue });
    } else {
      setPages((prev) => {
        const next = prev.map((p, pIdx) => {
          if (pIdx !== activePageIndex) return p;
          const pageLayers = Array.isArray(p.layers) ? p.layers : [];
          return {
            ...p,
            layers: pageLayers.map((l) => ({ ...l, fontFamily: newFontValue })),
          };
        });
        onUpdatePages?.(next);
        return next;
      });
      setStatusMessage({
        text: t('translate.studio.fontAppliedAllToast', { defaultValue: 'Đã cập nhật phông chữ cho toàn bộ khung thoại trên trang' }),
        type: 'success',
      });
    }
  }, [selectedLayerId, activePageIndex, updateSelectedLayer, onUpdatePages, t]);

  // Toggle visibility of a specific layer
  const toggleLayerVisibility = useCallback((layerId) => {
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.map((l) =>
            l.id === layerId ? { ...l, visible: l.visible === false } : l
          ),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [activePageIndex, onUpdatePages]);

  // Toggle visibility của toàn bộ text layers trên trang hiện tại
  const toggleAllTextLayersVisibility = useCallback(() => {
    setPages((prev) => {
      const currentPage = prev[activePageIndex];
      const pageLayers = Array.isArray(currentPage?.layers) ? currentPage.layers : [];
      if (pageLayers.length === 0) return prev;

      const allVisible = pageLayers.every((l) => l.visible !== false);
      const nextVisible = !allVisible;

      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          layers: (Array.isArray(p.layers) ? p.layers : []).map((l) => ({
            ...l,
            visible: nextVisible,
          })),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [activePageIndex, onUpdatePages]);

  // Delete selected layer
  const deleteLayer = useCallback((idToDelete) => {
    const targetId = idToDelete || selectedLayerId;
    if (!targetId) return;
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.filter((l) => l.id !== targetId),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
    setExpandedLayerId((prev) => (prev === targetId ? null : prev));
    if (targetId === selectedLayerId) setSelectedLayerId(null);
  }, [selectedLayerId, activePageIndex, onUpdatePages]);

  // Xóa một trang khỏi danh sách Pages
  const handleRemovePage = useCallback((targetPageOrIndex) => {
    const targetIdx = typeof targetPageOrIndex === 'number'
      ? targetPageOrIndex
      : pages.findIndex((p) => p.id === targetPageOrIndex?.id || p.index === targetPageOrIndex?.index);
    if (targetIdx < 0 || targetIdx >= pages.length) return;

    const pageToRemove = pages[targetIdx];
    const nextPages = pages
      .filter((_, idx) => idx !== targetIdx)
      .map((p, newIdx) => ({
        ...p,
        index: newIdx,
        id: `page-${newIdx}`,
      }));

    setActivePageIndex((prevIdx) => {
      if (nextPages.length === 0) return 0;
      if (prevIdx === targetIdx) {
        return Math.min(targetIdx, nextPages.length - 1);
      }
      if (prevIdx > targetIdx) {
        return prevIdx - 1;
      }
      return prevIdx;
    });

    setSelectedLayerId(null);
    setPages(nextPages);
    onUpdatePages?.(nextPages);

    if (pageToRemove?.imagePath) {
      loadingPathsRef.current.delete(pageToRemove.imagePath);
    }

    // Xóa blob files & pipeline cache của ảnh này trên đĩa
    api?.translateDeletePageBlobs?.(pageToRemove, nextPages, currentProject?.id).catch(() => { });

    // Cập nhật session trên đĩa ngay lập tức (không chờ 3s debounce để tránh mất đồng bộ nếu user đóng app)
    clearSaveSessionTimer();
    if (nextPages.length === 0) {
      api?.translateClearSession?.(currentProject?.id).catch(() => { });
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: 0, coverThumb: null } : p))
      );
    } else {
      const serializablePages = serializePagesForSession(nextPages);
      api?.translateSaveSession?.({
        projectId: currentProject?.id,
        pages: serializablePages,
        activePageIndex: Math.min(targetIdx, nextPages.length - 1),
        name: currentProject?.name,
      }).catch(() => { });
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: nextPages.length } : p))
      );
    }

    setStatusMessage({
      type: 'info',
      text: t('translate.studio.toastPageDeleted', { name: pageToRemove?.filename || targetIdx + 1 }),
    });
  }, [pages, onUpdatePages, api, serializePagesForSession, currentProject]);

  // Xóa tất cả các trang khỏi Studio
  const handleRemoveAllPages = useCallback(async () => {
    clearSaveSessionTimer();
    try {
      await api?.translateClearSession?.(currentProject?.id);
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: 0, coverThumb: null } : p))
      );
    } catch (_) { }
    setPages([]);
    setActivePageIndex(0);
    setSelectedLayerId(null);
    onUpdatePages?.([]);
    loadingPathsRef.current.clear();
    setStatusMessage({
      type: 'info',
      text: t('translate.studio.toastAllPagesDeleted'),
    });
  }, [api, onUpdatePages, currentProject]);

  // Kích hoạt xác nhận xóa trang (nếu có layer thì hỏi xác nhận, nếu rỗng hoặc giữ Shift thì xóa ngay)
  const handlePromptRemovePage = useCallback((targetPage, e) => {
    if (e) e.stopPropagation();
    if (!targetPage) return;
    if (e?.shiftKey || !targetPage.layers || targetPage.layers.length === 0) {
      handleRemovePage(targetPage);
    } else {
      setPageToDelete(targetPage);
    }
  }, [handleRemovePage]);

  // Duplicate layer
  const handleDuplicateLayer = useCallback(() => {
    if (!selectedLayer || !activePage) return;
    const [x, y, w, h] = selectedLayer.bbox;
    const [tx, ty, tw, th] = selectedLayer.textBbox || [x, y, w, h];
    const duplicated = {
      ...selectedLayer,
      id: `layer-${activePageIndex}-${Date.now()}`,
      bbox: [x + 20, y + 20, w, h],
      textBbox: [tx + 20, ty + 20, tw, th],
    };
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return { ...p, layers: [...p.layers, duplicated] };
      });
      onUpdatePages?.(next);
      return next;
    });
    setSelectedLayerId(duplicated.id);
  }, [selectedLayer, activePage, activePageIndex, onUpdatePages]);

  // Add new blank text layer
  const handleAddTextLayer = useCallback(() => {
    if (!activePage) return;
    const w = Math.round((activePage.width || 800) * 0.25);
    const h = Math.round((activePage.height || 1200) * 0.15);
    const x = Math.round(((activePage.width || 800) - w) / 2);
    const y = Math.round(((activePage.height || 1200) - h) / 2);

    const newLayer = {
      id: `layer-${activePageIndex}-${Date.now()}`,
      type: 'dialogue',
      sourceText: '',
      text: t('translate.studio.defaultDialogueText'),
      bbox: [x, y, w, h],
      textBbox: computeOptimalTextBox([x, y, w, h], null, true),
      fontFamily: DEFAULT_STUDIO_FONT,
      fontSize: 'auto',
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#000000',
      strokeColor: '#ffffff',
      strokeWidth: 1.5,
      align: 'center',
      direction: 'auto',
      textTransform: 'uppercase',
      fillBackground: false,
      visible: true,
      opacity: 1,
      isTranslated: true,
    };

    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return pIdx === activePageIndex ? { ...p, layers: [...pageLayers, newLayer] } : p;
      });
      onUpdatePages?.(next);
      return next;
    });
    setSelectedLayerId(newLayer.id);
    setExpandedLayerId(newLayer.id);
    setActiveTool('select');
    setActiveRightTab('properties');
    setShowRightSidebar(true);
    setTimeout(() => {
      layerTextareaRef.current?.focus();
      layerTextareaRef.current?.select();
    }, 50);
  }, [activePage, activePageIndex, onUpdatePages]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Spacebar hold for temporary hand pan tool (Photoshop/Figma standard)
      if (e.code === 'Space' && !spacePressedRef.current) {
        e.preventDefault();
        spacePressedRef.current = true;
        setIsSpacePressed(true);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
          deleteLayer(selectedLayerId);
        }
      } else if (e.key === 'Escape') {
        if (selectedLayerId) {
          setSelectedLayerId(null);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 't' || e.key === 'T') {
        handleAddTextLayer();
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool((prev) => (prev === 'hand' ? 'select' : 'hand'));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleFitToScreen();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleResetZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (e.shiftKey) {
          toggleLeftSidebar();
        } else {
          toggleRightSidebar();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedLayerId, deleteLayer, handleFitToScreen, handleAddTextLayer, onClose, toggleRightSidebar, toggleLeftSidebar]);

  // Import image files (multi-file selection)
  const handleImportFiles = async () => {
    try {
      if (api?.selectImageFiles) {
        const filePaths = await api.selectImageFiles();
        if (filePaths && filePaths.length > 0) {
          processImportedFiles(filePaths, false);
        }
      } else if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleImportFiles error:', err);
      setErrorModal({
        title: t('translate.studio.selectImageError'),
        message: err.message || t('translate.studio.errorUnknown'),
      });
    }
  };

  // Import entire image directory (folder selection) — hỗ trợ đệ quy (sub-folders)
  const handleImportFolder = async () => {
    try {
      if (api?.selectDirectory) {
        const dir = await api.selectDirectory();
        if (!dir) return;
        // Ưu tiên quét đệ quy; fallback về shallow nếu API chưa có
        const res = api.translateListImagesInDirRecursive
          ? await api.translateListImagesInDirRecursive(dir)
          : await api.translateListImagesInDir?.(dir);
        if (!res?.ok || !Array.isArray(res.files) || res.files.length === 0) {
          setErrorModal({
            title: t('translate.studio.noImageInFolder'),
            message: res?.error || t('translate.studio.noImageInFolderDescDetailed', { dir }),
          });
          return;
        }
        const subCount = res.subfolderCount || 0;
        if (subCount > 0) {
          console.log(`[MangaStudioEditor] Scanned recursively ${subCount} subfolders, total ${res.files.length} images.`);
        }
        processImportedFiles(res.files, true, dir, res.fileDetails || null);
      } else if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleImportFolder error:', err);
      setErrorModal({
        title: t('translate.studio.selectFolderErrorTitle'),
        message: err.message || t('translate.studio.selectFolderErrorDesc'),
      });
    }
  };



  // HTML Web Fallback for file selection (lọc chống trùng theo đường dẫn)
  const handleHtmlFileInputChange = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (!rawFiles.length) return;

    const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
    const existingSet = new Set(
      pages.map((p) => normalizePath(p.imagePath || p.relPath || p.filename)).filter(Boolean)
    );
    const files = rawFiles.filter((f) => {
      const p = normalizePath(f.webkitRelativePath || f.path || f.name);
      return !existingSet.has(p);
    });

    if (files.length === 0) {
      setStatusMessage({
        text: t('translate.studio.toastAllSelectedImagesInList', { count: sorted.length }),
        type: 'info',
      });
      e.target.value = '';
      return;
    }
    const duplicateCount = rawFiles.length - files.length;

    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    const startIndex = pages.length;
    const loadedPages = await Promise.all(
      sorted.map(async (file, idx) => {
        const url = URL.createObjectURL(file);
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
          img.onerror = () => resolve({ width: 800, height: 1200 });
          img.src = url;
        });
        return {
          id: `page-${Date.now()}-${idx}`,
          index: startIndex + idx,
          imagePath: file.path || file.name,
          filename: file.name,
          dataUrl: url,
          originalDataUrl: url,
          translatedImageDataUrl: null,
          width: dims.width,
          height: dims.height,
          layers: [],
        };
      })
    );
    const nextPages = pages.length === 0 ? loadedPages : [...pages, ...loadedPages].map((p, i) => ({ ...p, index: i }));
    setPages(nextPages);
    if (pages.length === 0) setActivePageIndex(0);
    else setActivePageIndex(startIndex);
    onUpdatePages?.(nextPages);
    setStatusMessage({
      text: duplicateCount > 0
        ? t('translate.studio.toastFilesLoaded', { count: sorted.length, dup: duplicateCount })
        : t('translate.studio.toastFilesLoadedSuccess', { count: sorted.length }),
      type: 'success',
    });
    e.target.value = '';
  };

  // HTML Web Fallback for folder selection
  const handleHtmlFolderInputChange = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
    );
    if (!files.length) {
      setErrorModal({
        title: t('translate.studio.noImageInFolder'),
        message: t('translate.studio.noImageInFolderDesc'),
      });
      return;
    }
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    const loadedPages = await Promise.all(
      sorted.map(async (file, idx) => {
        const url = URL.createObjectURL(file);
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
          img.onerror = () => resolve({ width: 800, height: 1200 });
          img.src = url;
        });
        return {
          id: `page-${Date.now()}-${idx}`,
          index: idx,
          imagePath: file.path || file.name,
          filename: file.name,
          dataUrl: url,
          originalDataUrl: url,
          translatedImageDataUrl: null,
          width: dims.width,
          height: dims.height,
          layers: [],
        };
      })
    );
    setPages(loadedPages);
    setActivePageIndex(0);
    setSelectedLayerId(null);
    onUpdatePages?.(loadedPages);
    setStatusMessage({ text: t('translate.studio.toastFolderLoaded', { folder: '', count: sorted.length }), type: 'success' });
    e.target.value = '';
  };

  // Drag & drop files onto Studio canvas
  const handleCanvasDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    const imageFiles = files.filter((f) => /\.(jpe?g|png|webp|gif|bmp|avif|tiff)$/i.test(f.name || ''));
    if (!imageFiles.length) return;
    const filePaths = imageFiles.map((f) => f.path).filter(Boolean);
    if (filePaths.length > 0 && api?.translateReadImageDataUrl) {
      processImportedFiles(filePaths, false);
    } else {
      handleHtmlFileInputChange({ target: { files: imageFiles } });
    }
  }, [api, processImportedFiles]);

  const handleOpenFolder = () => {
    if (!activePage) return;
    const targetPath = activePage.savedPath || activePage.imagePath;
    if (targetPath && api?.openPath) {
      const folder = targetPath.substring(0, targetPath.lastIndexOf('/'));
      api.openPath(folder);
    }
  };

  // AI Translation & Inpainting Pipeline Runner Hook
  const {
    handleRunTranslateCurrent,
    handleRunDetection,
    handleRunOCR,
    handleRunTranslation,
    handleRunInpainting,
    handleUpdateComparisonText,
    handleRetrySingleLayerInComparison,
    handleRetryResidualBubbles,
    handleRunTranslateAll,
    handleCancelTranslate,
  } = useMangaStudioPipelineRunner({
    api,
    pages,
    setPages,
    activePage,
    activePageIndex,
    currentProject,
    settings,
    isTranslating,
    setIsTranslating,
    setTranslateProgress,
    isRetryingResidual,
    setIsRetryingResidual,
    setRetryingSingleLayerId,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    setResumePromptModal,
    setSelectedLayerId,
    setExpandedLayerId,
    setIsTextGroupCollapsed,
    setShowCleanupLayer,
    onUpdatePages,
    onSavePage,
    onSaveChapter,
    onRunTranslate,
    isAutoModeEnabled,
    activeOutputDir,
    handleAutoExportPages,
    isLocalOnline,
    isModelInstalled,
    currentModelId,
    displayModelName,
    residualLayers,
    allChapterLayersWithMeta,
    isLayerResidual,
    t,
  });

  // Run actions definitions & ordering
  const allRunActions = useMemo(() => ({
    current: {
      id: 'current',
      title: t('translate.studio.actionCurrentPage'),
      subtitle: activePage?.filename || t('translate.studio.actionCurrentPageSub'),
      icon: 'play_arrow',
      iconColor: 'text-primary',
      buttonLabel: 'Run',
      buttonTitle: `${t('translate.studio.actionCurrentPage')}: ${activePage?.filename || ''}`,
      run: handleRunTranslateCurrent,
    },
    all: {
      id: 'all',
      title: t('translate.studio.actionAllChapter'),
      subtitle: t('translate.studio.actionAllChapterSub', { count: pages.length }),
      icon: 'bolt',
      iconColor: 'text-amber-500',
      buttonLabel: t('translate.studio.run'),
      buttonTitle: `${t('translate.studio.actionAllChapter')} (${pages.length})`,
      run: () => handleRunTranslateAll(false),
    },
    untranslated: {
      id: 'untranslated',
      title: t('translate.studio.actionUntranslated'),
      subtitle: t('translate.studio.actionUntranslatedSub', { count: untranslatedCount }),
      icon: 'filter_alt',
      iconColor: 'text-emerald-500',
      buttonLabel: t('translate.studio.run'),
      buttonTitle: `${t('translate.studio.actionUntranslated')} (${untranslatedCount})`,
      run: () => handleRunTranslateAll(true),
    },
  }), [t, activePage?.filename, pages.length, untranslatedCount, handleRunTranslateCurrent, handleRunTranslateAll]);

  const orderedRunActions = useMemo(() => {
    return runActionOrder.map((id) => allRunActions[id]).filter(Boolean);
  }, [runActionOrder, allRunActions]);

  const defaultRunAction = orderedRunActions[0] || allRunActions.current;

  return (
    <div
      className={
        isStandaloneView
          ? "relative flex flex-col w-full h-full min-h-0 bg-surface text-on-surface select-none overflow-hidden font-sans"
          : "fixed inset-0 z-[9990] flex flex-col bg-surface text-on-surface select-none overflow-hidden font-sans"
      }
      style={{ WebkitAppRegion: 'no-drag' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ─── 1. Top Window Header Bar ─── */}
      <MangaStudioToolbar
        leftToggleBtn={
          <button
            type="button"
            onClick={() => toggleLeftSidebar()}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0 ${showLeftSidebar
              ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 shadow-2xs'
              : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            data-tooltip={showLeftSidebar ? t('translate.studio.sidebarToggleHide') : t('translate.studio.sidebarToggleShow')}
          >
            <span className={`material-symbols-outlined text-[17px] ${!showLeftSidebar ? 'scale-x-[-1]' : ''}`}>
              {showLeftSidebar ? 'dock_to_left' : 'view_sidebar'}
            </span>
          </button>
        }
        currentProject={currentProject}
        loadProjectsList={loadProjectsList}
        setShowProjectModal={setShowProjectModal}
        isTranslating={isTranslating}
        pagesCount={pages.length}
        isSavingSession={isSavingSession}
        modelPickerRef={modelPickerRef}
        showModelDropdown={showModelDropdown}
        setShowModelDropdown={setShowModelDropdown}
        refreshLocalEngines={refreshLocalEngines}
        activeProviderInfo={activeProviderInfo}
        displayModelName={displayModelName}
        cloudProviders={cloudProviders}
        activeProvider={activeProvider}
        settings={settings}
        handleUpdateSetting={handleUpdateSetting}
        setActiveRightTab={setActiveRightTab}
        isLocalOnline={isLocalOnline}
        localModels={localModels}
        currentModelId={currentModelId}
        translateProgress={translateProgress}
        handleCancelTranslate={handleCancelTranslate}
        runDropdownRef={runDropdownRef}
        defaultRunAction={defaultRunAction}
        isAutoModeEnabled={isAutoModeEnabled}
        activeOutputDir={activeOutputDir}
        showRunDropdown={showRunDropdown}
        setShowRunDropdown={setShowRunDropdown}
        orderedRunActions={orderedRunActions}
        draggedRunActionId={draggedRunActionId}
        setDraggedRunActionId={setDraggedRunActionId}
        dragOverRunActionId={dragOverRunActionId}
        setDragOverRunActionId={setDragOverRunActionId}
        isRunActionDraggingRef={isRunActionDraggingRef}
        handleReorderRunAction={handleReorderRunAction}
        handleRunDetection={handleRunDetection}
        handleRunOCR={handleRunOCR}
        handleRunTranslation={handleRunTranslation}
        handleRunInpainting={handleRunInpainting}
        toggleAutoMode={toggleAutoMode}
        isAutoProcessing={isAutoProcessing}
        autoProgress={autoProgress}
        setShowAutoModal={setShowAutoModal}
        setShowComparisonModal={setShowComparisonModal}
        residualLayersCount={residualLayers.length}
        layersCount={layers.length}
        exportDropdownRef={exportDropdownRef}
        isExporting={isExporting}
        activePage={activePage}
        handleExportCurrentPage={handleExportCurrentPage}
        showExportDropdown={showExportDropdown}
        setShowExportDropdown={setShowExportDropdown}
        handleExportAllChapter={handleExportAllChapter}
        handleExportCbz={handleExportCbz}
        handleOpenFolder={handleOpenFolder}
        autoOpenExportFolder={autoOpenExportFolder}
        setAutoOpenExportFolder={setAutoOpenExportFolder}
        showRightSidebar={showRightSidebar}
        activeRightTab={activeRightTab}
        toggleRightSidebar={toggleRightSidebar}
        setGuideInitialTab={setGuideInitialTab}
        setShowGuideModal={setShowGuideModal}
        isStandaloneView={isStandaloneView}
        onClose={onClose}
      />

      {/* ─── 3-Column Studio Workspace ─── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── 2. Left Rail: Pages List ── */}
        {showLeftSidebar && (
          <div
            style={{ width: `${leftSidebarWidth}px` }}
            className="shrink-0 border-r border-outline-variant/20 bg-surface-container-low flex flex-col select-none relative"
          >
            {/* Draggable Resize Handle on the right border */}
            <ResizeSplitter
              variant="overlay"
              side="right"
              onPointerDown={handleLeftSidebarResizeStart}
              data-tooltip={t('translate.studio.resizePageList')}
            />

            <MangaStudioPagesSidebar
              pages={pages}
              activePageIndex={activePageIndex}
              onSelectPage={(index) => {
                setActivePageIndex(index);
                setSelectedLayerId(null);
                setPan({ x: 0, y: 0 });
              }}
              onImportFiles={handleImportFiles}
              onImportFolder={handleImportFolder}
              onPromptRemoveAll={() => setPageToDelete('all')}
              onPromptRemovePage={handlePromptRemovePage}
            />
          </div>
        )}

        {/* ── 3. Center Canvas & Floating Tools Palette ── */}
        <div className="flex-1 min-w-0 bg-surface text-on-surface relative flex flex-col overflow-hidden">
          {/* Enhanced Pipeline Execution Progress HUD with Collapse / Expand */}
          <MangaStudioProgressHud
            isTranslating={isTranslating}
            translateProgress={translateProgress}
            isProgressHudCollapsed={isProgressHudCollapsed}
            setIsProgressHudCollapsed={setIsProgressHudCollapsed}
            displayModelName={displayModelName}
            showLogConsole={showLogConsole}
            setShowLogConsole={setShowLogConsole}
            logs={logs}
            setLogs={setLogs}
            logConsoleRef={logConsoleRef}
            setShowComparisonModal={setShowComparisonModal}
            handleCancelTranslate={handleCancelTranslate}
            setTranslateProgress={setTranslateProgress}
            statusMessage={statusMessage}
            setStatusMessage={setStatusMessage}
            handleRetryResidualBubbles={handleRetryResidualBubbles}
            isRetryingResidual={isRetryingResidual}
          />

          {/* Persistent Residual Japanese Warning & Quick Action Banner */}
          <MangaStudioResidualBanner
            isTranslating={isTranslating}
            residualLayers={residualLayers}
            handleRetryResidualBubbles={handleRetryResidualBubbles}
            isRetryingResidual={isRetryingResidual}
          />

          {/* Floating Vertical Tool Palette (Docked on Left of Canvas) */}
          <MangaStudioToolPalette
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            handleAddTextLayer={handleAddTextLayer}
          />

          {/* Canvas Scroll & Viewport Area */}
          <div
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={handleCanvasDrop}
            className={`flex-1 overflow-hidden flex items-center justify-center p-8 relative bg-surface-container-low/40 ${activeTool === 'hand' || isSpacePressed || isPanning
              ? (isPanning ? 'cursor-grabbing' : 'cursor-grab')
              : 'cursor-default'
              }`}
          >
            {(activePage?.dataUrl || activePage?.originalDataUrl || activePage?.translatedImageDataUrl) ? (
              <div
                ref={imageContainerRef}
                style={{
                  width: `${containerW * (zoom / 100)}px`,
                  height: `${containerH * (zoom / 100)}px`,
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transition: isPanning ? 'none' : 'transform 0.05s ease-out',
                }}
                className="relative shadow-2xl bg-white select-none shrink-0 ring-1 ring-black/5 dark:ring-white/10"
              >
                {/* Layer 0: Original Manga Artwork (Hiện ảnh clean khi bật Cleanup, hoặc ảnh gốc khi tắt) */}
                {showArtworkLayer && (
                  <img
                    ref={imageRef}
                    src={
                      showCleanupLayer && activePage.cleanDataUrl
                        ? activePage.cleanDataUrl
                        : (activePage.originalDataUrl || activePage.dataUrl || activePage.translatedImageDataUrl)
                    }
                    alt={activePage.filename}
                    onLoad={handleImageLoaded}
                    draggable={false}
                    className="w-full h-full object-contain pointer-events-none block"
                  />
                )}

                {/* Layer Overlays: Speech Bubble & Text Box chuẩn Koharu */}
                <MangaStudioCanvasLayers
                  layers={layers}
                  zoom={zoom}
                  selectedLayerId={selectedLayerId}
                  activeTool={activeTool}
                  isSpacePressed={isSpacePressed}
                  isTranslating={isTranslating}
                  isLayerResidual={isLayerResidual}
                  handleMouseDownOnLayer={handleMouseDownOnLayer}
                  handleDoubleClickOnLayer={handleDoubleClickOnLayer}
                  handleMouseDownOnHandle={handleMouseDownOnHandle}
                />
              </div>
            ) : pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto select-none animate-fadeIn">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-3.5 text-primary shadow-2xs">
                  <span className="material-symbols-outlined text-[24px] text-primary">translate</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">
                  {t('translate.studio.emptyTitle')}
                </h3>
                <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">
                  {t('translate.studio.emptyDesc')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleImportFiles}
                    className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
                    <span>{t('translate.studio.importFilesBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleImportFolder}
                    className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px] text-primary">folder_open</span>
                    <span>{t('translate.studio.importFolderBtn')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-on-surface-variant gap-3">
                <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                <p className="text-xs font-medium">{t('translate.studio.loadingPage', { filename: activePage?.filename || '' })}</p>
              </div>
            )}
          </div>

          {/* Bottom Zoom & Dimension Bar (Koharu Style) */}
          <MangaStudioZoomBar
            zoom={zoom}
            handleZoomChange={handleZoomChange}
            containerW={containerW}
            containerH={containerH}
            handleResetZoom={handleResetZoom}
            handleFitToScreen={handleFitToScreen}
          />
        </div>

        {/* ── 4. Right Sidebar: Workflow / Settings ── */}
        {showRightSidebar && (
          <div
            style={{ width: `${rightSidebarWidth}px` }}
            className="shrink-0 border-l border-outline-variant/20 bg-surface-container-low text-on-surface flex flex-col relative select-text min-h-0"
          >
            {/* Draggable Resize Handle on the left border */}
            <ResizeSplitter
              variant="overlay"
              side="left"
              onPointerDown={handleRightSidebarResizeStart}
              data-tooltip={t('translate.studio.resizeSidebar')}
            />

            <MangaStudioRightSidebar
              activeRightTab={activeRightTab}
              selectedLayer={selectedLayer}
              updateSelectedLayer={updateSelectedLayer}
              fontOptions={fontOptions}
              handleFontChange={handleFontChange}
              showColorPicker={showColorPicker}
              setShowColorPicker={setShowColorPicker}
              fontSizeOptions={fontSizeOptions}
              fontWeightOptions={fontWeightOptions}
              showStrokeColorPicker={showStrokeColorPicker}
              setShowStrokeColorPicker={setShowStrokeColorPicker}
              layers={layers}
              isTextGroupCollapsed={isTextGroupCollapsed}
              setIsTextGroupCollapsed={setIsTextGroupCollapsed}
              toggleAllTextLayersVisibility={toggleAllTextLayersVisibility}
              residualLayers={residualLayers}
              handleRetryResidualBubbles={handleRetryResidualBubbles}
              isTranslating={isTranslating}
              isRetryingResidual={isRetryingResidual}
              selectedLayerId={selectedLayerId}
              setSelectedLayerId={setSelectedLayerId}
              expandedLayerId={expandedLayerId}
              toggleLayerCollapse={toggleLayerCollapse}
              isLayerResidual={isLayerResidual}
              retryingSingleLayerId={retryingSingleLayerId}
              handleRetrySingleLayerInComparison={handleRetrySingleLayerInComparison}
              activePageIndex={activePageIndex}
              toggleLayerVisibility={toggleLayerVisibility}
              deleteLayer={deleteLayer}
              layerTextareaRef={layerTextareaRef}
              showCleanupLayer={showCleanupLayer}
              setShowCleanupLayer={setShowCleanupLayer}
              settings={settings}
              handleUpdateSetting={handleUpdateSetting}
              detectedEngines={detectedEngines}
              localEngines={localEngines}
            />
          </div>
        )}
      </div>

      {/* Translate Guide Modal (Hướng dẫn & Quy trình 4 Bước) */}
      <TranslateGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialTab={guideInitialTab}
      />

      {/* Custom React Modal for Errors & Offline Warnings */}
      {errorModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setErrorModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center text-error shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{errorModal.title}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{errorModal.message}</p>
                {errorModal.suggestion && (
                  <p className="text-xs text-on-surface mt-2.5 bg-surface-container p-2.5 rounded-xl border border-outline-variant/25 leading-relaxed">
                    💡 {errorModal.suggestion}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.studio.closeModal')}
              </button>
              {errorModal.openSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveRightTab('settings');
                    setErrorModal(null);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">tune</span>
                  <span>{t('translate.studio.openSettings')}</span>
                </button>
              )}
              {errorModal.canSwitchToCloud && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSetting?.({ translationProvider: 'gemini' });
                    setErrorModal(null);
                    setTimeout(() => handleRunTranslateCurrent(), 100);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">cloud_sync</span>
                  <span>{t('translate.studio.switchToGeminiCloud')}</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom React Modal: Smart Resume - Dịch tiếp hay Dịch lại toàn bộ */}
      {resumePromptModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResumePromptModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-2xl">history</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{t('translate.studio.resumePromptTitle')}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {t('translate.studio.resumePromptDesc', { translated: resumePromptModal.translatedCount, untranslated: resumePromptModal.untranslatedCount, total: resumePromptModal.totalCount })}
                </p>
                <p className="text-xs text-on-surface-variant/80 mt-2 bg-surface-container p-2.5 rounded-xl border border-outline-variant/20 leading-relaxed">
                  {t('translate.studio.resumePromptTip')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setResumePromptModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = resumePromptModal.onReTranslateAll;
                  setResumePromptModal(null);
                  cb?.();
                }}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.studio.resumePromptReAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = resumePromptModal.onResume;
                  setResumePromptModal(null);
                  cb?.();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">fast_forward</span>
                <span>{t('translate.studio.resumePromptContinue', { count: resumePromptModal.untranslatedCount })}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom React Modal: Xác nhận xóa trang khỏi Studio */}
      {pageToDelete && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPageToDelete(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center text-error shrink-0">
                <span className="material-symbols-outlined text-2xl">
                  {pageToDelete === 'all' ? 'delete_sweep' : 'delete_forever'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">
                  {pageToDelete === 'all' ? t('translate.studio.deleteConfirmAllTitle') : t('translate.studio.deleteConfirmSingleTitle')}
                </h3>
                {pageToDelete === 'all' ? (
                  <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                    {t('translate.studio.deleteConfirmAllDesc', { count: pages.length })}
                  </p>
                ) : (
                  <div className="space-y-2 mt-1.5">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {t('translate.studio.deleteConfirmSingleDesc', { filename: pageToDelete.filename })}
                    </p>
                    {pageToDelete.layers?.length > 0 && (
                      <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/25 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] shrink-0 text-amber-500">warning</span>
                        <span>{t('translate.studio.deleteConfirmLayersWarning', { count: pageToDelete.layers.length })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setPageToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pageToDelete === 'all') {
                    handleRemoveAllPages();
                  } else {
                    handleRemovePage(pageToDelete);
                  }
                  setPageToDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>{pageToDelete === 'all' ? t('translate.studio.deleteAllBtn') : t('translate.studio.deletePageBtn')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom React Modal: Quản Lý & Chuyển Đổi Dự Án Đang Làm ── */}
      <MangaStudioProjectsModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        projectsList={projectsList}
        currentProject={currentProject}
        pagesCount={pages.length}
        onCreateProject={handleCreateProject}
        onSwitchProject={handleSwitchProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* ── Custom React Modal: Chế Độ Dịch Tự Động (Auto-Processing Mode) ── */}
      <MangaStudioAutoModal
        isOpen={showAutoModal}
        onClose={() => setShowAutoModal(false)}
        isAutoProcessing={isAutoProcessing}
        autoInputDir={autoInputDir}
        setAutoInputDir={setAutoInputDir}
        detectedProjectDir={detectedProjectDir}
        activeInputDir={activeInputDir}
        handleSelectAutoInputDir={handleSelectAutoInputDir}
        isScanningAuto={isScanningAuto}
        isFolderSyncedToStudio={isFolderSyncedToStudio}
        pagesCount={pages.length}
        autoScannedCount={autoScannedCount}
        handleTriggerSyncFromAuto={handleTriggerSyncFromAuto}
        autoOutputDir={autoOutputDir}
        setAutoOutputDir={setAutoOutputDir}
        defaultOutputDir={defaultOutputDir}
        activeOutputDir={activeOutputDir}
        handleSelectAutoOutputDir={handleSelectAutoOutputDir}
        isAutoModeEnabled={isAutoModeEnabled}
        toggleAutoMode={toggleAutoMode}
        autoSkipExisting={autoSkipExisting}
        setAutoSkipExisting={setAutoSkipExisting}
        autoProgress={autoProgress}
        handleCancelAuto={handleCancelAuto}
        isTranslating={isTranslating}
        handleRunTranslateAll={handleRunTranslateAll}
      />

      {/* Custom React Modal: Xác nhận đồng bộ thư mục vào Manga Studio */}
      {syncFolderModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSyncFolderModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <span className="material-symbols-outlined text-2xl">sync</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{t('translate.sync.title')}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {t('translate.sync.desc', { name: syncFolderModal.folderBaseName, count: syncFolderModal.count })}
                </p>
                <div className="text-xs text-on-surface-variant/90 mt-2.5 bg-surface-container p-3 rounded-xl border border-outline-variant/20 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-on-surface">{t('translate.sync.currentStudio')}</p>
                  <p className="text-[11px] text-on-surface-variant">
                    {t('translate.sync.currentProject', { name: syncFolderModal.currentProjectName, count: syncFolderModal.currentPageCount })}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {t('translate.sync.askAction')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20 flex-wrap">
              <button
                type="button"
                onClick={() => setSyncFolderModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.sync.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { files, folderPath, fileDetails } = syncFolderModal;
                  setSyncFolderModal(null);
                  await processImportedFiles(files, true, folderPath, fileDetails, false);
                }}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">add_photo_alternate</span>
                <span>{t('translate.sync.appendToCurrent')}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { files, folderPath, fileDetails } = syncFolderModal;
                  setSyncFolderModal(null);
                  await processImportedFiles(files, true, folderPath, fileDetails, true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">folder_open</span>
                <span>{t('translate.sync.openAsNew')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom React Modal: Bảng Đối Chiếu Dịch Thuật & Soát Lỗi Toàn Diện ── */}
      <MangaStudioComparisonModal
        isOpen={showComparisonModal}
        onClose={() => setShowComparisonModal(false)}
        comparisonScope={comparisonScope}
        setComparisonScope={setComparisonScope}
        comparisonFilter={comparisonFilter}
        setComparisonFilter={setComparisonFilter}
        comparisonSearchQuery={comparisonSearchQuery}
        setComparisonSearchQuery={setComparisonSearchQuery}
        showComparisonPreview={showComparisonPreview}
        setShowComparisonPreview={setShowComparisonPreview}
        comparisonHoveredLayerId={comparisonHoveredLayerId}
        setComparisonHoveredLayerId={setComparisonHoveredLayerId}
        allChapterLayersWithMeta={allChapterLayersWithMeta}
        layers={layers}
        allChapterResidualLayers={allChapterResidualLayers}
        residualLayers={residualLayers}
        activePageIndex={activePageIndex}
        setActivePageIndex={setActivePageIndex}
        activePage={activePage}
        pages={pages}
        isLayerResidual={isLayerResidual}
        handleUpdateComparisonText={handleUpdateComparisonText}
        handleRetrySingleLayerInComparison={handleRetrySingleLayerInComparison}
        retryingSingleLayerId={retryingSingleLayerId}
        handleRetryResidualBubbles={handleRetryResidualBubbles}
        isRetryingResidual={isRetryingResidual}
        onViewLayerOnCanvas={(pIdx, layerId) => {
          setActivePageIndex(pIdx);
          setSelectedLayerId(layerId);
          setShowComparisonModal(false);
          setActiveRightTab('properties');
          setShowRightSidebar(true);
        }}
      />

      {/* Hidden inputs for web file/folder selection fallback */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/jpg"
        style={{ display: 'none' }}
        onChange={handleHtmlFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
        onChange={handleHtmlFolderInputChange}
      />

      {/* ── Custom React Modal: Xác nhận xuất trang chưa dịch (Smart Verification Gate) ── */}
      <MangaStudioExportConfirmModal
        modal={exportConfirmModal}
        onClose={() => setExportConfirmModal(null)}
      />

      {/* ── Floating Toast Notification (với Action Button nếu có) ── */}
      {statusMessage?.text && typeof document !== 'undefined' && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[11000] flex items-center gap-2.5 px-4 py-2 rounded-2xl border shadow-xl backdrop-blur-md bg-surface-container-lowest/95 border-outline-variant/30 text-on-surface text-xs font-semibold animate-fadeIn max-w-xl pointer-events-auto select-none"
        >
          <span className={`material-symbols-outlined text-[18px] shrink-0 ${statusMessage.type === 'success'
            ? 'text-emerald-500'
            : statusMessage.type === 'error'
              ? 'text-error'
              : statusMessage.type === 'warn'
                ? 'text-amber-500'
                : 'text-primary'
            }`}>
            {statusMessage.type === 'success'
              ? 'check_circle'
              : statusMessage.type === 'error'
                ? 'error'
                : statusMessage.type === 'warn'
                  ? 'warning'
                  : 'info'}
          </span>
          <span className="truncate max-w-[340px]">{statusMessage.text}</span>
          {statusMessage.action && (
            <button
              type="button"
              onClick={() => {
                statusMessage.action.onClick?.();
                setStatusMessage({ text: '', type: 'info' });
              }}
              className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-[11px] font-bold cursor-pointer transition-colors shrink-0 shadow-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[13px]">folder_open</span>
              <span>{statusMessage.action.label || t('translate.studio.toastOpenAction')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setStatusMessage({ text: '', type: 'info' })}
            className="w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0 ml-1"
            data-tooltip={t('translate.studio.toastCloseTitle')}
          >
            <span className="material-symbols-outlined text-[13px]">close</span>
          </button>
        </div>,
        document.body
      )}

      {/* Completion Modal */}
      <MangaStudioCompletionModal
        modal={completionModal}
        onClose={() => setCompletionModal(null)}
        onOpenFolder={(folderPath) => {
          if (api?.translateOpenFolder) api.translateOpenFolder(folderPath);
          else if (window.electronAPI?.openPath) window.electronAPI.openPath(folderPath);
        }}
      />
    </div>
  );
}

class StudioErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[MangaStudioEditor] Studio render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const t = this.props.t || ((k) => k);
      return (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 text-on-surface">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl space-y-4 text-center text-on-surface">
            <span className="material-symbols-outlined text-4xl text-error">warning</span>
            <h3 className="text-base font-bold text-on-surface">{t('translate.studio.errorBoundaryTitle')}</h3>
            <p className="text-xs text-on-surface-variant">
              {t('translate.studio.errorBoundaryDesc')}
            </p>
            <p className="text-xs text-error font-mono bg-surface-container p-3 rounded-xl text-left overflow-auto max-h-32 border border-outline-variant/20">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="cursor-pointer px-4 py-2 rounded-xl bg-primary text-xs font-bold text-on-primary hover:brightness-110 transition-all shadow-xs"
              >
                {t('translate.studio.errorBoundaryRetry')}
              </button>
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="cursor-pointer px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors"
                >
                  {t('translate.studio.errorBoundaryBack')}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MangaStudioEditorWithBoundary(props) {
  const { t } = useI18n();
  if (typeof document === 'undefined') return null;
  if (props.isStandaloneView) {
    return (
      <StudioErrorBoundary onClose={props.onClose} t={t}>
        <MangaStudioEditor {...props} />
      </StudioErrorBoundary>
    );
  }
  return createPortal(
    <StudioErrorBoundary onClose={props.onClose} t={t}>
      <MangaStudioEditor {...props} />
    </StudioErrorBoundary>,
    document.body
  );
}
