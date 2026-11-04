import { useEffect, useState } from 'react';

/** Ảnh bìa nhỏ trong bảng hàng đợi — khớp CORS với MangaInfo (fetchRemoteImageAsDataUrl). */
export default function QueueCoverThumb({
  coverUrl,
  onFetch,
  fetchTitle,
  frameClassName,
  /** Kích thước icon placeholder khi không có ảnh (vd. `text-5xl` cho bìa lớn). */
  placeholderIconClassName,
}) {
  const [coverSrc, setCoverSrc] = useState('');

  useEffect(() => {
    if (!coverUrl) {
      setCoverSrc('');
      return undefined;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    const fetchFn = api?.fetchRemoteImageAsDataUrl;
    if (!fetchFn) {
      setCoverSrc(coverUrl);
      return undefined;
    }
    let cancelled = false;
    setCoverSrc('');
    fetchFn(coverUrl)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setCoverSrc(dataUrl);
        else setCoverSrc(coverUrl);
      })
      .catch(() => {
        if (!cancelled) setCoverSrc(coverUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  const frameClass =
    frameClassName ||
    'w-9 h-12 shrink-0 bg-surface-container-highest rounded overflow-hidden border border-outline-variant/20 flex items-center justify-center';

  const inner = coverSrc ? (
    <img src={coverSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
  ) : (
    <span
      className={`material-symbols-outlined text-on-surface-variant/40 ${placeholderIconClassName || 'text-[18px]'}`}
    >
      menu_book
    </span>
  );

  if (onFetch) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFetch();
        }}
        data-tooltip={fetchTitle}
        className={`${frameClass} cursor-pointer p-0 hover:ring-2 hover:ring-primary/45 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-shadow`}
      >
        {inner}
      </button>
    );
  }

  return <div className={frameClass}>{inner}</div>;
}
