import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../../context/I18nContext';

export function ReaderPageImage({
  mangaTitle,
  chapterTitle,
  savePath,
  fileName,
  seamless,
  folderBasename,
  offlineMangaDirAbsolute,
  volume,
  fileIndex,
  translatedSrc,
  onPreviewRequest,
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setSrc(null);
    setErr(false);
    if (fileName == null || fileName === '') {
      return undefined;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.readLocalChapterImage) {
      setErr(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.readLocalChapterImage(
          savePath,
          mangaTitle,
          chapterTitle,
          fileName,
          folderBasename,
          offlineMangaDirAbsolute,
          volume
        );
        if (cancelled) return;
        if (r?.ok && r.dataUrl) setSrc(r.dataUrl);
        else setErr(true);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mangaTitle, chapterTitle, savePath, fileName, folderBasename, offlineMangaDirAbsolute, volume]);

  const imgClass = seamless
    ? 'block h-auto w-full max-w-full align-top object-contain object-top'
    : 'block h-auto w-full max-w-full bg-surface-container/40 object-contain object-top';

  const frameClass = seamless
    ? 'm-0 block overflow-hidden border-0 bg-transparent p-0 shadow-none'
    : 'overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-low shadow-sm';

  const displaySrc = translatedSrc || src;

  return (
    <figure data-file-index={fileIndex} className={frameClass}>
      {err ? (
        <figcaption className="flex min-h-[120px] items-center justify-center px-3 py-4 text-center text-xs text-red-400">
          {t('reader.loadError')}
        </figcaption>
      ) : null}
      {displaySrc ? (
        <button
          type="button"
          className="relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
          data-tooltip={t('help.imageZoomHint')}
          aria-label={t('help.imageZoomHint')}
          onClick={() => onPreviewRequest?.(fileIndex, displaySrc)}
        >
          <img src={displaySrc} alt="" className={`pointer-events-none ${imgClass}`} decoding="async" />
          {translatedSrc ? (
            <span className="absolute top-2 right-2 rounded-md bg-primary/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-primary shadow-sm pointer-events-none">
              AI DỊCH
            </span>
          ) : null}
        </button>
      ) : !err ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 bg-surface-container-highest/50">
          <div
            className={
              seamless
                ? 'h-32 w-full animate-pulse bg-surface-container-highest/80'
                : 'h-32 w-full max-w-md animate-pulse rounded-lg bg-surface-container-highest/80'
            }
          />
          {fileName == null ? (
            <span className="text-[11px] tabular-nums text-on-surface-variant/50 select-none">
              {fileIndex + 1}
            </span>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}

export default ReaderPageImage;

