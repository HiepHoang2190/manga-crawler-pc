import React, { useCallback, useEffect, useMemo, useState, useRef, Component } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { SearchableSelect } from '../../shared';
import TranslateProvidersModal, { PRESET_PROVIDERS } from './components/TranslateProvidersModal';
import { PROVIDER_MODEL_GUIDES, PREDEFINED_LOCAL_MODEL_META } from './constants/providerModelGuides';

/**
 * TranslateSettingsPanel — Cấu hình Translation Pipeline.
 *
 * Tương tự Koharu Settings: chọn provider, nhập API key, quản lý models.
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

/** Danh sách Model cơ bản đề xuất cho dịch Manga qua Ollama Local */
const RECOMMENDED_LOCAL_MODELS = [
  {
    id: 'qwen2.5:7b',
    name: 'Qwen 2.5 7B',
    tag: 'Recommended', tagKey: 'translate.settings.tagRecommended',
    tagColor: 'text-primary bg-primary/10 border-primary/25',
    descKey: 'translate.settings.descQwen7b',
    desc: 'Perfect balance: natural tone, accurate context for Manga/Manhwa.',
    ram: '8 - 12 GB RAM',
    size: '4.7 GB',
  },
  {
    id: 'qwen2.5:3b',
    name: 'Qwen 2.5 3B',
    tag: 'Super Light', tagKey: 'translate.settings.tagSuperLight',
    tagColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    descKey: 'translate.settings.descQwen15b',
    desc: 'Light and fast, suitable for office laptops without dedicated GPU.',
    ram: '4 - 6 GB RAM',
    size: '1.9 GB',
  },
  {
    id: 'qwen2.5:14b',
    name: 'Qwen 2.5 14B',
    tag: 'High Quality', tagKey: 'translate.settings.tagHighQuality',
    tagColor: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25',
    descKey: 'translate.settings.descQwen14b',
    desc: 'Outstanding prose for complex plots and novels. Requires powerful GPU.',
    ram: '16+ GB RAM / VRAM',
    size: '9.0 GB',
  },
  {
    id: 'gemma4:12b',
    name: 'Gemma 4 12B Instruct',
    tag: 'Koharu GGUF',
    tagKey: 'translate.settings.tagKoharuGguf',
    tagColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    descKey: 'translate.settings.descGemma412b',
    desc: 'Bản tinh chỉnh GGUF chuẩn Koharu, tối ưu ngữ cảnh hội thoại Manga chuyên sâu.',
    ram: '12 - 16 GB RAM',
    size: '7.3 GB',
  },
  {
    id: 'gemma2:9b',
    name: 'Gemma 2 9B',
    tag: 'Google AI',
    tagColor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
    descKey: 'translate.settings.descGemma27b', desc: 'Model from Google, natural wording and strong multilingual abilities.',
    ram: '10 - 12 GB RAM',
    size: '5.5 GB',
  },
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    tag: 'Super Fast', tagKey: 'translate.settings.tagSuperFast',
    tagColor: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25',
    descKey: 'translate.settings.descLlama323b',
    desc: 'Lightweight model from Meta, ultra-fast for short dialogue responses.',
    ram: '4 - 6 GB RAM',
    size: '2.0 GB',
  },
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

/** Modal hướng dẫn cấu hình chi tiết (Ollama, LM Studio, Gemini) */
export function TranslateGuideModal({ isOpen, onClose, initialTab = 'workflow' }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [copiedCmd, setCopiedCmd] = useState('');
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleCopy = (text, label) => {
    navigator.clipboard?.writeText?.(text);
    setCopiedCmd(label);
    setTimeout(() => setCopiedCmd(''), 2000);
  };

  const openUrl = (url) => {
    api?.openExternal?.(url);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-2xl w-full h-[580px] max-h-[90vh] flex flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl overflow-hidden text-on-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 shrink-0 bg-surface-container-low/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">help</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">{t('translate.settings.guideModalTitle')}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            data-tooltip={t('help.closeGuide')}
            aria-label={t('help.closeGuide')}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-5 pt-3 pb-2 border-b border-outline-variant/10 shrink-0 overflow-x-auto no-scrollbar bg-surface-container-lowest">
          {[
            { id: 'workflow', label: '🌿 ' + t('translate.workflow.stepsTitle'), desc: 'Pipeline 4 bước' },
            { id: 'models', label: '📦 ' + (t('translate.settings.guideModelsTab') || 'Model AI'), desc: '3 Model Offline' },
            { id: 'ollama', label: '🦙 Ollama (Local AI)', desc: 'Offline 100%' },
            { id: 'gemini', label: '✨ Google Gemini (Cloud)', desc: 'Free & Light' },
            { id: 'faq', label: '💡 FAQ', desc: 'Help & FAQ' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-low/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-on-surface-variant leading-relaxed">
          {activeTab === 'workflow' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-on-surface">
                <span className="font-bold text-primary block mb-1">
                  Koharu Manga AI Pipeline — Quy trình 4 Bước Toàn diện
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Hệ thống kết hợp các mô hình thị giác máy tính ONNX chạy offline trên máy và các mô hình ngôn ngữ lớn (LLM) để biến các trang truyện scan thành bản dịch tiếng Việt hoàn thiện.
                </p>
              </div>

              <div className="space-y-3">
                {/* Bước 1: Detection */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-500 text-[18px]">crop_free</span>
                        <strong className="font-bold text-xs text-on-surface">
                          {t('translate.workflow.step1Title')} {t('translate.settings.sec2Title')}
                        </strong>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                        Koharu RF-DETR / Comic Text Detector
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {t('translate.workflow.step1Desc')}. Quét toàn bộ trang ảnh truyện tranh, phát hiện chính xác tọa độ polygon của bóng thoại và khung tranh.
                    </p>
                  </div>
                </div>

                {/* Bước 2: OCR */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-emerald-500 text-[18px]">document_scanner</span>
                        <strong className="font-bold text-xs text-on-surface">
                          {t('translate.workflow.step2Title')} {t('translate.settings.ocrTitle')}
                        </strong>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                        PaddleOCR-VL / Manga OCR (ONNX)
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {t('translate.workflow.step2Desc')}. Đọc chữ tiếng Nhật/Hàn/Trung theo chiều dọc hoặc ngang từ ảnh scan, giữ đúng cấu trúc câu truyện tranh.
                    </p>
                  </div>
                </div>

                {/* Bước 3: Dịch thuật */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-[18px]">translate</span>
                        <strong className="font-bold text-xs text-on-surface">
                          {t('translate.workflow.step3Title')} {t('translate.settings.sec1Title')}
                        </strong>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-primary/10 text-primary font-semibold border border-primary/20">
                        Gemini / GPT-4o / Ollama Local
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {t('translate.workflow.step3Desc')}. Đưa văn bản gốc qua LLM dịch sang tiếng Việt tự nhiên, chuẩn văn phong truyện tranh và giữ nguyên đại từ nhân xưng.
                    </p>
                  </div>
                </div>

                {/* Bước 4: Inpainting & Typesetting */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    4
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-amber-500 text-[18px]">auto_fix_high</span>
                        <strong className="font-bold text-xs text-on-surface">
                          {t('translate.workflow.step4Title')} {t('translate.settings.inpaintTitle')} & Dàn trang
                        </strong>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                        LaMa Cleaner ONNX + Canvas Renderer
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {t('translate.workflow.step4Desc')}. LaMa xoá chữ gốc và vẽ lại nền tranh sạch sẽ, sau đó hệ thống tự động ngắt từ tiếng Việt thông minh và chèn font manga chuẩn.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-high/60 border border-outline-variant/20 text-[11px] text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">tips_and_updates</span>
                <span className="leading-relaxed">
                  💡 <strong>Thực thi linh hoạt:</strong> Bấm nút <strong>Chạy Dịch Thuật</strong> trên thanh công cụ để xử lý tự động cả 4 bước, hoặc mở menu xổ xuống để chạy riêng lẻ từng bước khi kiểm tra.
                </span>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/25 text-[11px] text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">download_for_offline</span>
                <div className="leading-relaxed">
                  <strong>Cần cài đặt 3 Model AI trên máy mới:</strong> Bước 1 (Bóc tách khung), Bước 2 (OCR chữ Nhật) và Bước 4 (Tẩy nền LaMa) yêu cầu máy tính đã cài đặt 3 model ONNX tương ứng. Chuyển sang tab <strong>Model AI</strong> ở trên để xem chi tiết cách cài đặt!
                </div>
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-on-surface">
                <span className="font-bold text-primary block mb-1">
                  Cài đặt 3 Model AI Cốt lõi (Offline 100%)
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Để bóc tách khung thoại, nhận diện chữ Nhật và tẩy xoá nền ảnh hoàn toàn ngoại tuyến (không gửi ảnh lên server, không tốn token), ứng dụng sử dụng bộ 3 mô hình ONNX chuyên dụng. Người dùng mới chỉ cần cài đặt đủ 3 mô hình này một lần duy nhất.
                </p>
              </div>

              {/* 3 Core Models */}
              <div className="space-y-3">
                <h4 className="font-bold text-on-surface uppercase tracking-wider text-[11px]">
                  Danh sách 3 Mô hình cần thiết:
                </h4>

                {/* Model 1: Detection */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <strong className="font-bold text-xs text-on-surface">Comic Text Detector (168 MB)</strong>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                        Bóc tách khung (Detection)
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Phát hiện chính xác tọa độ bong bóng hội thoại và vùng văn bản manga. Tự động kích hoạt khi chọn model: <strong>Koharu layout RF-DETR</strong> (mặc định) và <strong>YOLOv5 Manga</strong>.
                    </p>
                  </div>
                </div>

                {/* Model 2: OCR */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <strong className="font-bold text-xs text-on-surface">Manga OCR (117 MB)</strong>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold border border-purple-500/20">
                        Đọc chữ Nhật (OCR)
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Nhận diện ký tự Kanji, Hiragana, Katakana, Furigana (hỗ trợ cả chữ dọc và chữ ngang). Tự động kích hoạt khi chọn model: <strong>PaddleOCR-VL 1.6</strong> (mặc định), <strong>Baberu OCR</strong> và <strong>Hayai OCR</strong>.
                    </p>
                  </div>
                </div>

                {/* Model 3: Inpainting */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <strong className="font-bold text-xs text-on-surface">LaMa Inpainting (208 MB)</strong>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                        Tẩy nền tranh (Inpainting)
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Xóa sạch chữ gốc tiếng Nhật và tự động tái tạo, vẽ lại nét vẽ gốc (artwork) của tác giả mà không để lại vết mờ. Tự động kích hoạt khi chọn: <strong>LaMa Inpainting</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Installation Methods */}
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-on-surface uppercase tracking-wider text-[11px]">
                  3 Cách Cài đặt trên Máy mới:
                </h4>

                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5 text-[11px]">
                  <p>
                    <strong>🌐 Cách 1 (Tải Online tự động):</strong> Mở menu <strong>Cài đặt</strong> → cuộn xuống mục <strong>MODELS (AI)</strong> và bấm nút <strong>"Tải về"</strong> ở từng mô hình (hoặc bấm nút "Tải tất cả model"). Khi trạng thái đạt <code>(3/3) Đã cài đặt</code>, hệ thống đã sẵn sàng 100%.
                  </p>
                  <p>
                    <strong>📁 Cách 2 (Import file Offline):</strong> Nếu bạn đã có sẵn các file <code>.onnx</code> từ máy tính khác hoặc USB, bấm vào biểu tượng <strong>"Import file model từ máy"</strong> (icon trang giấy) ở từng card model để nạp trực tiếp mà không cần mạng.
                  </p>
                  <p>
                    <strong>📂 Cách 3 (Mở thư mục lưu trữ):</strong> Bấm biểu tượng thư mục ở góc trên bên phải mục <strong>MODELS (AI)</strong> để mở trực tiếp thư mục lưu file trên ổ cứng.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-high/60 border border-outline-variant/20 text-[11px] text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">info</span>
                <span className="leading-relaxed">
                  💡 <strong>Bước Dịch nghĩa (Step 3):</strong> 3 mô hình ONNX trên xử lý ảnh hoàn toàn offline. Để dịch nghĩa câu thoại sang tiếng Việt, bạn chỉ cần nhập thêm API Key (như Google Gemini miễn phí, OpenAI, Claude) hoặc dùng mô hình Ollama chạy local.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'ollama' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-on-surface">
                <span className="font-bold text-primary block mb-1">{t('translate.settings.guideOllamaWhyTitle')}</span>
                {t('translate.settings.guideOllamaWhyDesc')}
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-on-surface uppercase tracking-wider text-[11px]">{t('translate.settings.guideQuickSteps')}</h4>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">1</span>
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-on-surface">{t('translate.settings.guideStep1OllamaTitle')}</p>
                    <p>{t('translate.settings.guideStep1OllamaDesc')}</p>
                    <button
                      type="button"
                      onClick={() => openUrl('https://ollama.com/download')}
                      className="cursor-pointer mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-on-primary font-semibold text-[11px] hover:brightness-110 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      {t('translate.settings.guideStep1OllamaBtn')}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">2</span>
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-on-surface">{t('translate.settings.guideStep2OllamaTitle')}</p>
                    <p>{t('translate.settings.guideStep2OllamaDesc')}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">3</span>
                  <div className="space-y-2 flex-1">
                    <p className="font-semibold text-on-surface">{t('translate.settings.guideStep3OllamaTitle')}</p>
                    <p>{t('translate.settings.guideStep3OllamaDesc')}</p>

                    <div className="flex items-center justify-between bg-zinc-900 dark:bg-black/90 text-zinc-100 px-3 py-2.5 rounded-xl border border-zinc-700/50 dark:border-white/10 shadow-xs font-mono text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-zinc-500 select-none font-bold text-xs">$</span>
                        <span className="truncate">
                          <span className="text-sky-400 font-semibold">ollama</span>{' '}
                          <span className="text-zinc-300">run</span>{' '}
                          <span className="text-emerald-400 font-semibold">qwen2.5:7b</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy('ollama run qwen2.5:7b', 'cmd-qwen7b')}
                        className={`cursor-pointer ml-3 px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${copiedCmd === 'cmd-qwen7b'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700/70 hover:border-zinc-500'
                          }`}
                        title={t('translate.settings.copyCommandBtn')}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {copiedCmd === 'cmd-qwen7b' ? 'check' : 'content_copy'}
                        </span>
                        <span>{copiedCmd === 'cmd-qwen7b' ? t('translate.settings.modelCopied') : t('translate.settings.copyCommandBtn')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hardware Requirements Table */}
              <div className="space-y-1.5 pt-1">
                <span className="font-bold text-on-surface block text-[11px] uppercase tracking-wider">{t('translate.settings.guideHardwareSpecs')}</span>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block">qwen2.5:3b</span>
                    <span className="text-[10px] text-on-surface-variant block">4GB - 6GB RAM</span>
                    <span className="text-[10px] text-on-surface-variant/70 block">Office Laptop, no GPU</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 space-y-1">
                    <span className="font-bold text-primary block">qwen2.5:7b (Standard)</span>
                    <span className="text-[10px] text-on-surface-variant block">8GB - 12GB RAM</span>
                    <span className="text-[10px] text-on-surface-variant/70 block">Optimal Quality</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                    <span className="font-bold text-purple-600 dark:text-purple-400 block">qwen2.5:14b</span>
                    <span className="text-[10px] text-on-surface-variant block">16GB+ RAM / VRAM</span>
                    <span className="text-[10px] text-on-surface-variant/70 block">Dedicated RTX GPU</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gemini' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-on-surface">
                <span className="font-bold text-amber-600 dark:text-amber-400 block mb-1">{t('translate.settings.guideGeminiOptTitle')}</span>
                {t('translate.settings.guideGeminiOptDesc')}
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-on-surface uppercase tracking-wider text-[11px]">{t('translate.settings.guideGeminiSteps')}</h4>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">1</span>
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-on-surface">{t('translate.settings.guideStep1GeminiTitle')}</p>
                    <p>{t('translate.settings.guideStep1GeminiDesc')}</p>
                    <button
                      type="button"
                      onClick={() => openUrl('https://aistudio.google.com/app/apikey')}
                      className="cursor-pointer mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-on-primary font-semibold text-[11px] hover:brightness-110 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      {t('translate.settings.guideStep1GeminiBtn')}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">2</span>
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-on-surface">{t('translate.settings.guideStep2GeminiTitle')}</p>
                    <p>{t('translate.settings.guideStep2GeminiDesc')}</p>
                    <p className="text-[11px] text-on-surface-variant/80 mt-1">{t('translate.settings.guideStep2GeminiTip')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
                <span className="font-bold text-on-surface block text-xs">{t('translate.settings.guideFaq1Q')}</span>
                <p className="whitespace-pre-line text-xs text-on-surface-variant leading-relaxed mt-1">{t('translate.settings.guideFaq1A')}</p>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="font-bold text-on-surface block text-xs">{t('translate.settings.guideFaq2Q')}</span>
                <p className="whitespace-pre-line text-xs text-on-surface-variant leading-relaxed mt-1">{t('translate.settings.guideFaq2A')}</p>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="font-bold text-on-surface block text-xs">{t('translate.settings.guideFaq3Q')}</span>
                <p className="whitespace-pre-line text-xs text-on-surface-variant leading-relaxed mt-1">{t('translate.settings.guideFaq3A')}</p>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="font-bold text-on-surface block text-xs">{t('translate.settings.guideFaq4Q')}</span>
                <p className="whitespace-pre-line text-xs text-on-surface-variant leading-relaxed mt-1">{t('translate.settings.guideFaq4A')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline-variant/15 shrink-0 bg-surface-container-low/40">
          <span className="text-[11px] text-on-surface-variant">
            {t('translate.settings.guideRecommendation')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors"
          >
            {t('translate.settings.guideCloseBtn')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Modal xác nhận khôi phục cài đặt về mặc định */
function ResetDefaultsConfirmModal({ isOpen, onClose, onConfirm, busy }) {
  const { t } = useI18n();
  const [keepApiKeys, setKeepApiKeys] = useState(true);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <span className="material-symbols-outlined text-[24px]">restart_alt</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-on-surface">{t('translate.settings.resetModalTitle')}</h3>
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              {t('translate.settings.resetModalDesc')}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={keepApiKeys}
              onChange={(e) => setKeepApiKeys(e.target.checked)}
              disabled={busy}
              className="accent-primary w-4 h-4 rounded cursor-pointer"
            />
            <span className="text-xs font-semibold text-on-surface select-none">
              {t('translate.settings.keepKeysCheckbox')}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
          >
            {t('translate.settings.cancelReset')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(keepApiKeys)}
            disabled={busy}
            className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-xs font-bold text-on-primary transition-all shadow-xs disabled:opacity-40"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>{t('translate.settings.testingConnection')}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                <span>{t('translate.settings.confirmReset')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SettingCard({
  icon,
  title,
  subtitle,
  badge,
  children,
  className = '',
  isOpen: propIsOpen,
  onToggle,
  defaultOpen = true,
  collapsible = true,
  extraHeaderActions,
}) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalOpen;

  const handleToggle = () => {
    if (!collapsible) return;
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-outline-variant/25 bg-surface-container-lowest transition-all duration-200 shadow-2xs ${className} ${isOpen ? 'p-3.5 sm:p-4 space-y-3' : 'p-3 sm:p-3.5'
        }`}
    >
      {(title || icon || badge || subtitle || extraHeaderActions || collapsible) && (
        <div
          onClick={handleToggle}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle();
                }
              }
              : undefined
          }
          className={`flex flex-col gap-1 transition-colors ${isOpen ? 'pb-2.5 border-b border-outline-variant/15' : ''
            } ${collapsible ? 'cursor-pointer select-none group/header' : ''}`}
        >
          {/* Dòng 1: Icon + Title bên trái; Badge + Actions + Mũi tên thu gọn bên phải */}
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {icon && (
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 transition-transform duration-200 group-hover/header:scale-110">
                  {icon}
                </span>
              )}
              {title && (
                <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider group-hover/header:text-primary transition-colors truncate">
                  {title}
                </h4>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {badge && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
                  {badge}
                </div>
              )}
              {extraHeaderActions && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                  {extraHeaderActions}
                </div>
              )}
              {collapsible && (
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface-variant group-hover/header:text-primary group-hover/header:bg-surface-container transition-all"
                  data-tooltip={isOpen ? (t('translate.settings.collapse') || 'Thu gọn') : (t('translate.settings.expand') || 'Mở rộng')}
                  aria-label={isOpen ? (t('translate.settings.collapse') || 'Thu gọn') : (t('translate.settings.expand') || 'Mở rộng')}
                >
                  <span
                    className="material-symbols-outlined text-[18px] transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    keyboard_arrow_down
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dòng 2: Subtitle mô tả chi tiết */}
          {subtitle && (
            <p className={`text-[11px] text-on-surface-variant font-medium leading-relaxed ${icon ? 'pl-[26px]' : ''}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {isOpen && children}
    </div>
  );
}

function ModelCard({
  model,
  onDownload,
  onCancel,
  onDelete,
  onImport,
  onOpenFolder,
  progress,
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [copiedPath, setCopiedPath] = useState(false);

  if (!model) return null;

  const installed = Boolean(model.installed);
  const isDownloading = Boolean(progress);
  const diskSize = typeof model.diskSize === 'number' ? model.diskSize : 0;
  const files = Array.isArray(model.files) ? model.files : [];

  const sizeLabel = diskSize > 0
    ? `${(diskSize / 1e6).toFixed(0)} MB`
    : files.length > 0
      ? `~${(files.reduce((s, f) => s + (f?.sizeBytes || 0), 0) / 1e6).toFixed(0)} MB`
      : '';

  const purposeMeta = {
    detection: {
      icon: 'crop_free',
      label: 'Detection',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
    },
    ocr: {
      icon: 'text_fields',
      label: 'OCR',
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
    },
    inpainting: {
      icon: 'auto_fix_high',
      label: 'Inpainting',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
    },
  }[model.purpose] || {
    icon: 'deployed_code',
    label: 'ONNX',
    color: 'bg-primary/10 text-primary border-primary/25',
  };

  const handleCopy = (text, type) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    if (type === 'path') {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } else {
      setCopiedUrl(type);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${isDownloading
        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
        : 'border-outline-variant/20 bg-surface-container-low hover:border-outline-variant/35'
        }`}
    >
      <div className="p-3 space-y-2">
        {/* Row 1: Header (Icon + Name + Tag + Status + Size) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${purposeMeta.color}`}>
              <span className="material-symbols-outlined text-[16px]">{purposeMeta.icon}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-on-surface font-mono">{model.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${purposeMeta.color}`}>
                  {purposeMeta.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {sizeLabel && (
              <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-lowest px-1.5 py-0.5 rounded border border-outline-variant/15">
                {sizeLabel}
              </span>
            )}
            {installed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg whitespace-nowrap">
                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                <span>{t('translate.settings.modelInstalled')}</span>
              </span>
            ) : isDownloading ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg animate-pulse whitespace-nowrap">
                <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
                <span>{progress.percent != null ? `${progress.percent}%` : '...'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg border border-outline-variant/20 whitespace-nowrap">
                {t('translate.settings.modelNotInstalled') || 'Chưa tải'}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Full-width Description */}
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          {model.description}
        </p>

        {/* Row 3: Downloading Progress Bar */}
        {isDownloading && (
          <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-primary flex items-center gap-1.5 truncate">
                <span className="material-symbols-outlined text-[14px] animate-spin shrink-0">sync</span>
                <span className="truncate">{progress.detail || (progress.file ? `File: ${progress.file}` : t('translate.settings.downloadingBadge'))}</span>
              </span>
              <span className="font-bold font-mono text-on-surface shrink-0 ml-2">
                {progress.percent != null ? `${progress.percent}%` : '...'}
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent ?? 15}%` }}
              />
            </div>
          </div>
        )}

        {/* Row 4: Action Toolbar & File Details Toggle */}
        <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between gap-2 flex-wrap">
          {/* Toggle details */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors py-1 px-1.5 rounded-lg hover:bg-surface-container-high"
          >
            <span
              className="material-symbols-outlined text-[16px] text-primary transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              keyboard_arrow_down
            </span>
            <span>{expanded ? (t('translate.settings.hideOnnxFiles') || 'Ẩn file ONNX') : (t('translate.settings.viewOnnxFiles', { count: files.length }) || `Xem file ONNX (${files.length})`)}</span>
          </button>

          {/* Actions on right */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Open Folder */}
            <button
              type="button"
              onClick={() => onOpenFolder(model.id)}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
              title={t('translate.settings.modelOpenFolderTitle')}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">folder_open</span>
            </button>

            {/* Import file */}
            <button
              type="button"
              onClick={() => onImport(model.id)}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center shrink-0"
              title={t('translate.settings.modelImportTitle')}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">upload_file</span>
            </button>

            {/* Main Action: Download / Cancel / Delete */}
            {installed ? (
              <button
                type="button"
                onClick={() => onDelete(model.id)}
                className="cursor-pointer w-7 h-7 rounded-lg border border-error/20 bg-error/5 hover:bg-error/15 text-error transition-colors flex items-center justify-center shrink-0"
                title={t('translate.settings.modelDeleteTitle')}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
              </button>
            ) : isDownloading ? (
              <button
                type="button"
                onClick={() => onCancel(model.id)}
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 h-7 rounded-lg border border-error/30 bg-error/10 hover:bg-error/20 text-error text-[11px] font-semibold transition-colors"
                title={t('translate.settings.modelCancelDownloadTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">cancel</span>
                <span>{t('translate.settings.cancelPullBtn') || 'Hủy'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDownload(model.id)}
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-primary hover:brightness-110 text-on-primary text-[11px] font-semibold transition-all shadow-2xs"
                title={t('translate.settings.modelAutoDownloadTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                <span>{t('translate.settings.downloadBtn') || 'Tải về'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details: URLs and Storage Path */}
      {expanded && (
        <div className="border-t border-outline-variant/15 px-3.5 py-3 bg-surface-container-lowest/70 space-y-3 rounded-b-xl text-xs animate-fadeIn">
          {/* Storage Directory Path */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-on-surface-variant font-medium text-[11px]">
              <span className="flex items-center gap-1.5 text-on-surface font-semibold">
                <span className="material-symbols-outlined text-[16px] text-primary">folder</span>
                <span>{t('translate.settings.modelStorageLocation')}</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(model.installDir, 'path')}
                  className={`cursor-pointer w-7 h-7 rounded-lg border transition-all flex items-center justify-center shrink-0 ${copiedPath
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                    }`}
                  title={copiedPath ? t('translate.settings.modelCopied') : t('translate.settings.modelCopyPath')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    {copiedPath ? 'check' : 'content_copy'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFolder(model.id)}
                  className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center shrink-0"
                  title={t('translate.settings.modelOpenFolderTitle')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
                </button>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-surface-container-high/40 text-[11px] font-mono text-on-surface-variant break-all select-all border border-outline-variant/15">
              {model.installDir || '--'}
            </div>
          </div>

          {/* Download URLs & Per-file controls */}
          <div className="space-y-2 pt-2 border-t border-outline-variant/10">
            <span className="block text-on-surface-variant font-semibold text-[11px]">
              {t('translate.settings.modelDirectUrls')}
            </span>
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold font-mono text-xs text-on-surface">{f.filename}</span>
                      <span className="text-[10px] font-mono text-on-surface-variant">
                        ({((f.sizeBytes || 0) / 1e6).toFixed(1)} MB)
                      </span>
                      {f.installed ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          <span className="material-symbols-outlined text-[11px]">check</span>
                          <span>{t('translate.settings.modelFilePresent')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                          <span>{t('translate.settings.modelFileMissing')}</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onImport(model.id, f.filename)}
                      className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary hover:bg-primary/10 border border-primary/20 transition-colors"
                      title={t('translate.settings.modelImportTitle')}
                    >
                      <span className="material-symbols-outlined text-[13px]">upload_file</span>
                      <span>{t('translate.settings.modelImportFile')}</span>
                    </button>
                  </div>

                  {/* URL Box with Copy & Open */}
                  <div className="flex items-center gap-1 bg-surface-container-high/40 rounded-md px-2 py-1.5 border border-outline-variant/15">
                    <span
                      className="text-[10px] font-mono text-on-surface-variant select-all truncate flex-1 min-w-0"
                      title={f.url}
                    >
                      {f.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(f.url, f.filename)}
                      className="cursor-pointer p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                      title={t('translate.settings.modelCopyUrl')}
                    >
                      <span className="material-symbols-outlined text-[14px] block">
                        {copiedUrl === f.filename ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const api = typeof window !== 'undefined' ? window.electronAPI : null;
                        api?.openExternal?.(f.url);
                      }}
                      className="cursor-pointer p-1 rounded hover:bg-surface-container-high text-primary transition-colors shrink-0"
                      title={t('translate.settings.modelOpenBrowser')}
                    >
                      <span className="material-symbols-outlined text-[14px] block">open_in_new</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  const [testResult, setTestResult] = useState(null);
  const [testBusy, setTestBusy] = useState(false);

  const [downloadProgressMap, setDownloadProgressMap] = useState({});
  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
  const [diskUsage, setDiskUsage] = useState(null);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [clearCacheResult, setClearCacheResult] = useState(null);
  const [importStatus, setImportStatus] = useState(null);

  // Local Engines & Ollama Pull state
  const [localEngines, setLocalEngines] = useState(propLocalEngines || null);

  useEffect(() => {
    if (propLocalEngines) {
      setLocalEngines(propLocalEngines);
    }
  }, [propLocalEngines]);
  const [isCustomModelInputMode, setIsCustomModelInputMode] = useState(false);
  const [ollamaPullMap, setOllamaPullMap] = useState({});
  const [customPullModel, setCustomPullModel] = useState('');
  const [isRecommendedModelsOpen, setIsRecommendedModelsOpen] = useState(false);

  // Guide & Reset modals
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

    const unsubPull = api.subscribeOllamaPullProgress?.((data) => {
      if (!data?.modelName) return;
      setOllamaPullMap((prev) => ({
        ...prev,
        [data.modelName]: data,
      }));
      if (data.done) {
        setTimeout(() => {
          refreshLocalEngines();
        }, 1200);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
      if (typeof unsubPull === 'function') unsubPull();
    };
  }, [api, loadDiskUsage, refreshLocalEngines]);

  const isModelInstalledLocally = useCallback((modelId) => {
    if (!modelId || !localEngines) return false;
    const cleanId = modelId.toLowerCase().trim();
    return (localEngines.ollama?.models || []).some((m) => {
      const id = (m.id || m.name || '').toLowerCase();
      return id === cleanId || id.startsWith(`${cleanId}:`) || cleanId.startsWith(`${id}:`);
    });
  }, [localEngines]);

  const handlePullOllamaModel = useCallback(async (modelName) => {
    if (!modelName) return;
    const trimmed = modelName.trim();
    setIsRecommendedModelsOpen(true);
    setOllamaPullMap((prev) => ({
      ...prev,
      [trimmed]: { status: t('translate.settings.startDownloadMsg'), percent: 0, done: false },
    }));

    try {
      const res = await api?.translatePullOllamaModel?.({ modelName: trimmed });
      if (!res?.success) {
        setOllamaPullMap((prev) => ({
          ...prev,
          [trimmed]: { status: t('translate.settings.downloadFailedMsg', { error: res?.error || 'Failed' }), percent: 0, done: true, error: true },
        }));
      }
    } catch (err) {
      setOllamaPullMap((prev) => ({
        ...prev,
        [trimmed]: { status: t('translate.settings.downloadFailedMsg', { error: err.message }), percent: 0, done: true, error: true },
      }));
    }
  }, [api]);

  const handleCancelOllamaPull = useCallback(async (modelName) => {
    if (!modelName) return;
    await api?.translateCancelOllamaPull?.({ modelName });
    setOllamaPullMap((prev) => {
      const next = { ...prev };
      delete next[modelName];
      return next;
    });
  }, [api]);

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
  }, [api]);

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
  }, [activeProviderId, isLocalProvider, localEngines, activeGuide, currentProviderConfig, showProvidersModal]);

  const suggestedModels = useMemo(() => {
    return modelSelectOptions.map((o) => o.value);
  }, [modelSelectOptions]);

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

  useEffect(() => {
    setTestResult(null);
  }, [safeSettings.translationProvider]);

  useEffect(() => {
    if (!testResult?.success) return;
    const timer = setTimeout(() => {
      setTestResult(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [testResult]);


  const saveApiKey = useCallback((provider, value, extra = {}) => {
    setSettings((prev) => {
      const current = prev || FALLBACK_SETTINGS;
      const prevKeys = current.apiKeys || {};
      const next = {
        ...current,
        ...extra,
        apiKeys: { ...prevKeys, [provider]: value },
      };
      api?.translateSaveSettings?.(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('translate:settingsUpdated', { detail: next }));
      }
      return next;
    });
    onUpdateSetting?.({
      ...extra,
      apiKeys: { ...(settings?.apiKeys || {}), [provider]: value },
    });
  }, [api, onUpdateSetting, settings?.apiKeys]);

  const handleTest = useCallback(async () => {
    if (!api?.translateTestProvider) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const currentKey = safeSettings.apiKeys?.[safeSettings.translationProvider];
      const result = await api.translateTestProvider({
        provider: safeSettings.translationProvider,
        apiKey: typeof currentKey === 'string' ? currentKey : '',
        endpoint: safeSettings.apiKeys?.openaiCompatible?.endpoint,
        model: safeSettings.apiKeys?.openaiCompatible?.model,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestBusy(false);
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
  }, [api, loadDiskUsage]);

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
  }, [api, loadDiskUsage]);

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
  }, [api, loadDiskUsage]);

  const [showKeyMap, setShowKeyMap] = useState({});

  // Parse keys into initial array
  const parseKeysFromSettings = useCallback((raw) => {
    if (!raw) return [''];
    if (Array.isArray(raw)) return raw.length > 0 ? [...raw] : [''];
    if (typeof raw !== 'string') return [''];
    const parts = raw.split(/[\r\n,;]+/).map((k) => k.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [''];
  }, []);

  const [localKeys, setLocalKeys] = useState(() => {
    return parseKeysFromSettings(safeSettings.apiKeys?.[safeSettings.translationProvider]);
  });

  // Keep localKeys in sync when provider changes or initial settings load
  const prevProviderRef = useRef(safeSettings.translationProvider);
  useEffect(() => {
    if (prevProviderRef.current !== safeSettings.translationProvider) {
      prevProviderRef.current = safeSettings.translationProvider;
      setLocalKeys(parseKeysFromSettings(safeSettings.apiKeys?.[safeSettings.translationProvider]));
    }
  }, [safeSettings.translationProvider, safeSettings.apiKeys, parseKeysFromSettings]);

  // Sync on initial settings load
  const initialSyncRef = useRef(false);
  useEffect(() => {
    if (!initialSyncRef.current && settings?.apiKeys) {
      initialSyncRef.current = true;
      setLocalKeys(parseKeysFromSettings(settings.apiKeys[safeSettings.translationProvider]));
    }
  }, [settings, safeSettings.translationProvider, parseKeysFromSettings]);

  const handleUpdateKeyAt = (index, val) => {
    if (/[\r\n,;]+/.test(val)) {
      const pastedParts = val.split(/[\r\n,;]+/).map((k) => k.trim()).filter(Boolean);
      const next = [...localKeys];
      next.splice(index, 1, ...pastedParts);
      const finalKeys = next.length > 0 ? next : [''];
      setLocalKeys(finalKeys);
      saveApiKey(safeSettings.translationProvider, finalKeys.filter((k) => k.trim()).join('\n'));
      return;
    }
    const next = [...localKeys];
    next[index] = val;
    setLocalKeys(next);
    saveApiKey(safeSettings.translationProvider, next.filter((k) => k.trim()).join('\n'));
  };

  const handleAddKeyRow = () => {
    setLocalKeys((prev) => [...prev, '']);
  };

  const handleDeleteKeyAt = (index) => {
    const next = localKeys.filter((_, i) => i !== index);
    const finalKeys = next.length > 0 ? next : [''];
    setLocalKeys(finalKeys);
    saveApiKey(safeSettings.translationProvider, finalKeys.filter((k) => k.trim()).join('\n'));
  };

  const currentKeys = useMemo(() => {
    return localKeys.map((k) => k.trim()).filter(Boolean);
  }, [localKeys]);

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

      {/* ─── 1. BÓC TÁCH KHUNG & OCR (BƯỚC 1 & 2) ─── */}
      <div className="space-y-3.5">
        {/* Detection Card */}
        <SettingCard
          isOpen={isCardOpen('detection')}
          onToggle={() => toggleCard('detection')}
          icon="frame_inspect"
          title={t('translate.settings.sec2Title')}
          subtitle={t('translate.settings.sec2Sub')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">{t('translate.settings.detectModelLabel')}</label>
              <SearchableSelect
                value={safeSettings.detectionModel || 'koharu-rf-detr'}
                onChange={(val) => save({ detectionModel: val })}
                options={detectionModelOptions}
                placeholder={t('translate.settings.detectModelLabel')}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">{t('translate.settings.detectThresholdLabel')}</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-on-surface-variant block mb-0.5">Text</span>
                  <input
                    type="text"
                    placeholder="Default"
                    value={safeSettings.textThreshold ?? 'Default'}
                    onChange={(e) => save({ textThreshold: e.target.value })}
                    className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block mb-0.5">Bubble</span>
                  <input
                    type="text"
                    placeholder="Default"
                    value={safeSettings.bubbleThreshold ?? 'Default'}
                    onChange={(e) => save({ bubbleThreshold: e.target.value })}
                    className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block mb-0.5">Panel</span>
                  <input
                    type="text"
                    placeholder="Default"
                    value={safeSettings.panelThreshold ?? 'Default'}
                    onChange={(e) => save({ panelThreshold: e.target.value })}
                    className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                  />
                </div>
              </div>
            </div>
          </div>
        </SettingCard>

        {/* OCR Card */}
        <SettingCard
          isOpen={isCardOpen('ocr')}
          onToggle={() => toggleCard('ocr')}
          icon="text_fields"
          title={t('translate.settings.ocrTitle')}
          subtitle={t('translate.settings.ocrSub')}
        >
          <div>
            <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">{t('translate.settings.ocrModelLabel')}</label>
            <SearchableSelect
              value={safeSettings.ocrModel || 'paddleocr-vl-1.6'}
              onChange={(val) => {
                save({
                  ocrModel: val,
                  ocrProvider: val === 'cloud' ? 'cloud' : 'local',
                });
              }}
              options={ocrModelOptions}
              placeholder={t('translate.settings.ocrModelLabel')}
              className="w-full"
            />
          </div>
        </SettingCard>

      </div>

      {/* ─── 2. ĐỘNG CƠ DỊCH THUẬT & API KEY (BƯỚC 3) ─── */}
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

            {/* Row 2: Model selection / input (Tối ưu nhỏ gọn, hướng dẫn & chọn model chi tiết nằm trong Quản lý Provider) */}
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

            {/* DeepL OCR Notice Callout (if DeepL is selected) */}
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

        {/* Card 3: Language Pair */}
        <SettingCard
          isOpen={isCardOpen('langPair')}
          onToggle={() => toggleCard('langPair')}
          icon="language"
          title={t('translate.settings.langPairTitle')}
          subtitle={t('translate.settings.langPairSub')}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {t('translate.settings.sourceLang')}
              </label>
              <SearchableSelect
                value={safeSettings.sourceLanguage || 'auto'}
                onChange={(val) => save({ sourceLanguage: val })}
                options={sourceLanguageOptions}
                placeholder={t('translate.settings.sourceLang')}
                className="w-full"
              />
            </div>

            <div className="h-9 flex items-center justify-center text-primary/70 shrink-0 pb-0.5">
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </div>

            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {t('translate.settings.targetLang')}
              </label>
              <SearchableSelect
                value={safeSettings.targetLanguage || 'vi'}
                onChange={(val) => save({ targetLanguage: val })}
                options={targetLanguageOptions}
                placeholder={t('translate.settings.targetLang')}
                className="w-full"
              />
            </div>
          </div>
        </SettingCard>
      </div>



      {/* ─── 3. TẨY CHỮ & DÀN TRANG (BƯỚC 4) ─── */}
      <div className="space-y-3.5">
        {/* Inpainting Card */}
        <SettingCard
          isOpen={isCardOpen('inpainting')}
          onToggle={() => toggleCard('inpainting')}
          icon="auto_fix_high"
          title={t('translate.settings.inpaintTitle')}
          subtitle={t('translate.settings.inpaintSub')}
        >
          <div>
            <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">{t('translate.settings.inpaintModelLabel')}</label>
            <SearchableSelect
              value={safeSettings.inpaintingModel || 'lama'}
              onChange={(val) => save({ inpaintingModel: val })}
              options={inpaintingModelOptions}
              placeholder={t('translate.settings.inpaintModelLabel')}
              className="w-full"
            />
          </div>
        </SettingCard>

        {/* Typesetting Card */}
        <SettingCard
          isOpen={isCardOpen('typesetting')}
          onToggle={() => toggleCard('typesetting')}
          icon="match_case"
          title="Typesetting (Font Fallback)"
          subtitle={t('translate.settings.typographySub')}
        >
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            {t('translate.settings.typographyDesc')}
          </p>

          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low divide-y divide-outline-variant/15 overflow-hidden">
            {(safeSettings.fontStack || DEFAULT_FONT_STACK).map((fontName, idx) => (
              <div key={idx} className="flex items-center gap-2.5 p-2.5 hover:bg-surface-container-high/40 transition-colors">
                <span className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center font-mono text-[10px] font-bold text-on-surface-variant shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    value={fontName}
                    onChange={(val) => {
                      const next = [...(safeSettings.fontStack || DEFAULT_FONT_STACK)];
                      next[idx] = val;
                      save({ fontStack: next });
                    }}
                    options={allAvailableFontOptions}
                    placeholder="Chọn phông chữ..."
                    className="w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = (safeSettings.fontStack || DEFAULT_FONT_STACK).filter((_, i) => i !== idx);
                    save({ fontStack: next });
                  }}
                  disabled={(safeSettings.fontStack || []).length <= 1}
                  className="cursor-pointer p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
                  data-tooltip={t('translate.settings.deleteFontTitle')}
                  aria-label={t('translate.settings.deleteFontTitle')}
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}

            {/* Add font row */}
            <div className="flex items-center gap-2.5 p-2.5 bg-surface-container-lowest/40">
              <span className="w-6 h-6 rounded-lg border border-dashed border-outline-variant/50 flex items-center justify-center font-mono text-xs font-bold text-on-surface-variant shrink-0">
                +
              </span>
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  value=""
                  onChange={(val) => {
                    if (val) {
                      const next = [...(safeSettings.fontStack || DEFAULT_FONT_STACK), val];
                      save({ fontStack: next });
                    }
                  }}
                  options={unaddedFontOptions}
                  placeholder={t('translate.settings.addFontPlaceholder')}
                  className="w-full"
                  disabled={unaddedFontOptions.length === 0}
                />
              </div>
            </div>
          </div>
        </SettingCard>

      </div>

      {/* ─── 4. MODELS AI OFFLINE ─── */}
      <div className="space-y-3.5">
        <SettingCard
          isOpen={isCardOpen('models')}
          onToggle={() => toggleCard('models')}
          icon="deployed_code"
          title="Models (AI)"
          subtitle={t('translate.settings.offlineModelsDesc')}
          badge={
            models && models.length > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                {models.filter((m) => m.installed).length}/{models.length}
              </span>
            ) : null
          }
          extraHeaderActions={
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRefreshModels}
                className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
                title={t('translate.settings.rescanModels')}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenModelFolder()}
                className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
                title={t('translate.settings.openModelsFolder')}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">folder_open</span>
              </button>
            </div>
          }
        >
          {(models || []).some((m) => !m.installed && !downloadProgressMap[m.id]) && (
            <button
              type="button"
              onClick={handleDownloadAll}
              className="w-full cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-2xs transition-all mb-3"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>{t('translate.settings.downloadAllModels', { count: (models || []).filter((m) => !m.installed).length })}</span>
            </button>
          )}

          {importStatus && (
            <div className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs mb-3 ${importStatus.success
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-error/30 bg-error/10 text-error'
              }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">
                  {importStatus.success ? 'check_circle' : 'error'}
                </span>
                <span>{importStatus.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportStatus(null)}
                className="cursor-pointer p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          <div className="space-y-2">
            {(models || []).map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                onDownload={handleDownloadModel}
                onCancel={handleCancelDownload}
                onDelete={handleDeleteModel}
                onImport={handleImportModelFile}
                onOpenFolder={handleOpenModelFolder}
                progress={downloadProgressMap[m.id]}
              />
            ))}
          </div>
        </SettingCard>
      </div>

      {/* ─── 5. BỘ NHỚ & KHÔI PHỤC CÀI ĐẶT ─── */}
      <div className="space-y-3.5">
        {/* Storage & Cache Card */}
        <SettingCard
          isOpen={isCardOpen('cache')}
          onToggle={() => toggleCard('cache')}
          icon="database"
          title={t('translate.settings.cacheTitle')}
          subtitle={t('translate.settings.cacheSub')}
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">Models</span>
              <p className="text-xs font-bold text-on-surface mt-0.5">
                {diskUsage ? `${((diskUsage.modelBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">Cache</span>
              <p className="text-xs font-bold text-on-surface mt-0.5">
                {diskUsage ? `${((diskUsage.cacheBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
              <span className="text-[10px] text-on-surface-variant block">{t('translate.settings.cacheTotal')}</span>
              <p className="text-xs font-bold text-primary mt-0.5">
                {diskUsage ? `${((diskUsage.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 flex-wrap">
            <span className="text-[11px] text-on-surface-variant">
              {t('translate.settings.cacheDesc')}
            </span>
            <button
              type="button"
              onClick={handleClearCache}
              disabled={clearCacheBusy}
              className="cursor-pointer shrink-0 rounded-xl border border-error/30 bg-error/5 hover:bg-error/15 px-3 py-1.5 text-xs font-medium text-error transition-colors disabled:opacity-40"
            >
              {clearCacheBusy ? t('translate.settings.clearingCache') : t('translate.settings.clearCacheBtn')}
            </button>
          </div>

          {clearCacheResult && (
            <p className={`text-xs ${clearCacheResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-error'}`}>
              {clearCacheResult.message}
            </p>
          )}
        </SettingCard>

        {/* Reset Defaults Card */}
        <SettingCard
          isOpen={isCardOpen('reset')}
          onToggle={() => toggleCard('reset')}
          icon="restart_alt"
          title={t('translate.settings.resetScopeTitle')}
          subtitle={t('translate.settings.resetDesc')}
        >
          <div>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="cursor-pointer rounded-xl border border-error/30 bg-error/5 hover:bg-error/15 px-3 py-1.5 text-xs font-medium text-error transition-colors"
              title={t('translate.settings.resetBtn')}
            >
              {t('translate.settings.resetBtn')}
            </button>
          </div>
        </SettingCard>
      </div>

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
