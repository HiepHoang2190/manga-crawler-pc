import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

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
      role="dialog"
      aria-modal="true"
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
                        data-tooltip={t('translate.settings.copyCommandBtn')}
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

export default TranslateGuideModal;

