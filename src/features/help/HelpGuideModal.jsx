import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { helpArticles } from './helpArticles';
import { TAB_HELP_MAP } from './helpTabMapping';

/**
 * Modal hiển thị hướng dẫn ngữ cảnh (contextual help guide) cho một tab/view.
 *
 * Props:
 *  - tabId: string — ID của tab (key trong TAB_HELP_MAP), null/undefined = đóng
 *  - onClose: () => void
 */
export default function HelpGuideModal({ tabId, onClose }) {
  const { t, locale } = useI18n();
  const [lightbox, setLightbox] = useState(null);

  /* ── Lookup articles cho tabId hiện tại ── */
  const articles = helpArticles[locale === 'vi' ? 'vi' : 'en'];
  const articleIds = tabId ? TAB_HELP_MAP[tabId] ?? [] : [];
  const matchedArticles = articleIds
    .map((id) => articles.find((a) => a.id === id))
    .filter(Boolean);

  const open = tabId != null && matchedArticles.length > 0;

  /* ── Escape key ── */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (lightbox) {
          setLightbox(null);
        } else {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, lightbox, onClose]);

  /* Reset lightbox khi đổi tab */
  useEffect(() => {
    setLightbox(null);
  }, [tabId]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose?.();
    },
    [onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('help.contextualGuide')}
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-8"
      onClick={handleBackdropClick}
    >
      {/* Backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden onClick={onClose} />

      {/* Card */}
      <div
        className="relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col rounded-2xl border border-outline-variant/20 bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/15 bg-surface-container-low/60 px-5 py-3.5 shrink-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-on-surface m-0 leading-snug">
            <span className="material-symbols-outlined text-[20px] text-primary leading-none">help</span>
            {t('help.contextualGuide')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            aria-label={t('help.closeGuide')}
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">
          {matchedArticles.map((block) => (
            <section key={block.id} className="space-y-0">
              <h3 className="text-[15px] font-bold text-on-surface mt-0 mb-3 leading-snug">{block.title}</h3>

              {/* Render sections (interleaved text+image) hoặc legacy paragraphs+image */}
              {(block.sections
                ? block.sections
                : [{ paragraphs: block.paragraphs, image: block.image, imageCaption: block.imageCaption, images: block.images }]
              ).map((sec, secIdx) => {
                const imgs = sec.images ?? (sec.image ? [{ src: sec.image, caption: sec.imageCaption }] : []);
                return (
                  <div key={secIdx}>
                    {sec.paragraphs?.length > 0 && (
                      <div className="space-y-2.5 text-sm text-on-surface-variant leading-relaxed">
                        {sec.paragraphs.map((p, i) => (
                          <p key={i} className="m-0">{p}</p>
                        ))}
                      </div>
                    )}
                    {imgs.map((img, imgIdx) => (
                      <figure key={imgIdx} className="mt-4 mb-0 rounded-xl overflow-hidden border border-outline-variant/15 bg-surface-container-low shadow-sm">
                        <button
                          type="button"
                          onClick={() => setLightbox({ src: img.src, caption: img.caption || '' })}
                          data-tooltip={t('help.imageZoomHint')}
                          className="block w-full p-0 border-0 bg-transparent cursor-zoom-in text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                        >
                          <img
                            src={img.src}
                            alt=""
                            className="pointer-events-none block w-full max-h-[min(36vh,340px)] object-contain object-top bg-surface-container/40"
                            loading="lazy"
                            decoding="async"
                          />
                        </button>
                        {img.caption ? (
                          <figcaption className="px-4 py-2.5 text-xs text-on-surface-variant/90 border-t border-outline-variant/10 bg-surface-container/30">
                            {img.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    ))}
                  </div>
                );
              })}

              {/* Separator giữa các article (trừ article cuối) */}
              {matchedArticles.indexOf(block) < matchedArticles.length - 1 && (
                <div className="h-px bg-outline-variant/20 mt-6" />
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Lightbox zoom ảnh */}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('help.imageZoomTitle')}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-zoom-out bg-black/75 backdrop-blur-sm p-4 sm:p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            className="absolute top-3 right-3 z-[10000] flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-highest/95 text-on-surface shadow-lg border border-outline-variant/30 hover:bg-surface-container-high cursor-pointer"
            aria-label={t('help.closeLightbox')}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
          </button>
          <img
            src={lightbox.src}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[min(88vh,88dvh)] w-auto max-w-[min(96vw,1400px)] object-contain rounded-lg shadow-2xl ring-1 ring-black/15 dark:ring-white/10 cursor-default"
          />
          {lightbox.caption ? (
            <p
              onClick={(e) => e.stopPropagation()}
              className="max-w-2xl text-center text-sm text-white/85 px-2"
            >
              {lightbox.caption}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
