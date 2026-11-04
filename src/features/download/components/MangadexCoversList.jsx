import { useState, useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';

/**
 * MangaDex Covers List Component (for ChaptersDrawer tab)
 * Displays covers in a scrollable list instead of modal
 * Supports grid/list view toggle and add covers to download queue
 */
export default function MangadexCoversList({ 
  manga,
  currentCoverUrl, 
  onCoverSelect,
  onAddToQueue,
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [covers, setCovers] = useState([]);
  const [selectedCover, setSelectedCover] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedForDownload, setSelectedForDownload] = useState(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  const mangaUrl = manga?.mangaUrl || '';
  const mangaTitle = manga?.title || 'manga';

  useEffect(() => {
    loadCovers();
  }, [mangaUrl]);

  async function loadCovers() {
    if (!mangaUrl) return;

    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.fetchMangadexCovers(mangaUrl);
      
      if (result.ok) {
        setCovers(result.covers || []);
        
        // Auto-select current cover if it matches
        const current = result.covers.find(c => 
          currentCoverUrl && (
            currentCoverUrl.includes(c.fileName) ||
            currentCoverUrl === c.url512 ||
            currentCoverUrl === c.url256 ||
            currentCoverUrl === c.urlOriginal
          )
        );
        if (current) {
          setSelectedCover(current);
        }
      } else {
        setError(result.error || 'Failed to load covers');
      }
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(cover) {
    setSelectedCover(cover);
    if (onCoverSelect) {
      onCoverSelect(cover);
    }
  }

  function toggleSelectForDownload(coverId) {
    setSelectedForDownload(prev => {
      const next = new Set(prev);
      if (next.has(coverId)) {
        next.delete(coverId);
      } else {
        next.add(coverId);
      }
      return next;
    });
  }

  function selectAllForDownload() {
    setSelectedForDownload(new Set(covers.map(c => c.id)));
  }

  function clearSelection() {
    setSelectedForDownload(new Set());
  }

  function addSelectedToQueue() {
    if (selectedForDownload.size === 0) return;
    
    if (!onAddToQueue) {
      console.error('[MangadexCoversList] onAddToQueue callback not provided');
      return;
    }

    setDownloading(true);
    setDownloadProgress({ current: 0, total: selectedForDownload.size });

    const selectedCovers = covers.filter(c => selectedForDownload.has(c.id));
    
    // Call parent callback to download covers
    onAddToQueue(selectedCovers);
    
    // Simulate progress (since actual download happens in parent/backend)
    let current = 0;
    const interval = setInterval(() => {
      current++;
      setDownloadProgress({ current, total: selectedForDownload.size });
      
      if (current >= selectedForDownload.size) {
        clearInterval(interval);
        setTimeout(() => {
          setDownloading(false);
          setDownloadProgress({ current: 0, total: 0 });
          clearSelection();
        }, 500);
      }
    }, 300);
  }

  if (!mangaUrl) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-on-surface-variant">
          {t('mangadex.noMangaLoaded', 'Chưa load truyện')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header with controls */}
      <div className="shrink-0 px-4 py-3 border-b border-outline-variant/10 bg-surface-container-low/30 space-y-3">
        <p className="text-xs text-on-surface-variant">
          {t('mangadex.coversHelp', 'Chọn ảnh bìa để thay đổi cover hiển thị')}
        </p>

        {/* View toggle and actions */}
        {!loading && covers.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            {/* View mode toggle */}
            <div className="flex gap-1 bg-surface-container-highest/60 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                data-tooltip={t('mangadex.gridView', 'Grid view')}
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                data-tooltip={t('mangadex.listView', 'List view')}
              >
                <span className="material-symbols-outlined text-sm">view_list</span>
              </button>
            </div>

            {/* Download button */}
            <button
              type="button"
              onClick={addSelectedToQueue}
              disabled={selectedForDownload.size === 0 || downloading}
              className="px-3 py-1.5 text-xs font-medium text-on-primary bg-primary rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {downloading 
                ? t('mangadex.downloading', 'Đang tải...') 
                : t('mangadex.addToQueue', 'Tải về ({count})').replace('{count}', selectedForDownload.size)}
            </button>
          </div>
        )}

        {/* Download progress */}
        {downloading && downloadProgress.total > 0 && (
          <div className="px-4 py-2 bg-surface-container-low/50">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-on-surface-variant">
                {t('mangadex.downloadingProgress', 'Đang tải...')}
              </span>
              <span className="text-on-surface font-medium tabular-nums">
                {downloadProgress.current} / {downloadProgress.total}
              </span>
            </div>
            <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300 ease-out"
                style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-12" data-testid="covers-loading">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="text-sm text-on-surface-variant">
              {t('common.loading', 'Đang tải...')}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-error-container/10 border border-error/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-error shrink-0">error</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-error mb-1">
                  {t('common.error', 'Lỗi')}
                </p>
                <p className="text-xs text-on-error-container">{error}</p>
              </div>
            </div>
            <button
              onClick={loadCovers}
              className="mt-3 w-full px-3 py-2 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/15 transition-colors"
            >
              {t('common.retry', 'Thử lại')}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && covers.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <span className="material-symbols-outlined text-on-surface-variant/50 text-5xl mb-3 block">
              image_not_supported
            </span>
            <p className="text-sm text-on-surface-variant">
              {t('mangadex.noCoversFound', 'Không tìm thấy ảnh bìa nào')}
            </p>
          </div>
        </div>
      )}

      {/* Covers grid/list */}
      {!loading && covers.length > 0 && (
        <div className="flex-1 overflow-y-auto p-4" data-testid="covers-container">
          {viewMode === 'grid' ? (
            /* Grid View */
            <div className="space-y-3">
              {/* Select all checkbox - aligned with grid items */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start pt-2 pl-2">
                  <input
                    type="checkbox"
                    checked={selectedForDownload.size === covers.length && covers.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllForDownload();
                      } else {
                        clearSelection();
                      }
                    }}
                    disabled={downloading}
                    className="w-5 h-5 rounded border-2 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
              {covers.map((cover) => (
                <div
                  key={cover.id}
                  className={`
                    relative rounded-lg overflow-hidden border-2 transition-all
                    ${selectedCover?.id === cover.id 
                      ? 'border-primary ring-2 ring-primary/30 shadow-lg' 
                      : 'border-outline-variant/20 hover:border-primary/40 hover:shadow-md'
                    }
                  `}
                >
                  {/* Checkbox for download selection */}
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedForDownload.has(cover.id)}
                      onChange={() => toggleSelectForDownload(cover.id)}
                      className="w-5 h-5 rounded border-2 border-white bg-black/40 backdrop-blur-sm cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Cover Image - clickable for selection */}
                  <button
                    type="button"
                    onClick={() => toggleSelectForDownload(cover.id)}
                    className="w-full text-left"
                  >
                    <div className="aspect-[2/3] bg-surface-container-highest">
                      <img
                        src={cover.url256}
                        alt={cover.description || `Volume ${cover.volume || '?'}`}
                        className="w-full h-full object-cover"
                        data-testid="cover-img"
                        loading="lazy"
                        onError={(e) => {
                          e.target.src = cover.url512;
                        }}
                      />
                    </div>

                    {/* Cover Info */}
                    <div className="p-2 bg-surface-container-low">
                      <div className="text-xs font-semibold text-on-surface truncate">
                        {cover.volume ? `Volume ${cover.volume}` : t('mangadex.noCoverVolume', 'Không có số tập')}
                      </div>
                      {cover.description && (
                        <div className="text-[10px] text-on-surface-variant truncate mt-0.5">
                          {cover.description}
                        </div>
                      )}
                    </div>

                    {/* Current Cover Badge */}
                    {currentCoverUrl && (
                      currentCoverUrl.includes(cover.fileName) ||
                      currentCoverUrl === cover.url512 ||
                      currentCoverUrl === cover.url256 ||
                      currentCoverUrl === cover.urlOriginal
                    ) && (
                      <div className="absolute bottom-12 left-2 bg-tertiary/90 text-on-tertiary text-[10px] font-medium px-2 py-1 rounded-full backdrop-blur-sm">
                        {t('mangadex.currentCover', 'Đang dùng')}
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {/* Select all checkbox - aligned with list items */}
              <div className="flex items-center gap-3 pl-3">
                <input
                  type="checkbox"
                  checked={selectedForDownload.size === covers.length && covers.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAllForDownload();
                    } else {
                      clearSelection();
                    }
                  }}
                  disabled={downloading}
                  className="w-5 h-5 rounded border-2 cursor-pointer shrink-0"
                />
              </div>

              <div className="space-y-2">
              {covers.map((cover) => (
                <div
                  key={cover.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border transition-all
                    ${selectedCover?.id === cover.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-outline-variant/20 hover:border-primary/40 hover:bg-surface-container-highest/40'
                    }
                  `}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedForDownload.has(cover.id)}
                    onChange={() => toggleSelectForDownload(cover.id)}
                    className="w-5 h-5 rounded border-2 cursor-pointer shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />

                  {/* Thumbnail */}
                  <img
                    src={cover.url256}
                    alt=""
                    className="w-16 h-24 object-cover rounded shrink-0"
                    loading="lazy"
                    onError={(e) => {
                      e.target.src = cover.url512;
                    }}
                  />

                  {/* Info - clickable for selection */}
                  <button
                    type="button"
                    onClick={() => toggleSelectForDownload(cover.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-semibold text-on-surface">
                      {cover.volume ? `Volume ${cover.volume}` : t('mangadex.noCoverVolume', 'Không có số tập')}
                    </div>
                    {cover.description && (
                      <div className="text-xs text-on-surface-variant line-clamp-2 mt-1">
                        {cover.description}
                      </div>
                    )}
                    {currentCoverUrl && (
                      currentCoverUrl.includes(cover.fileName) ||
                      currentCoverUrl === cover.url512 ||
                      currentCoverUrl === cover.url256 ||
                      currentCoverUrl === cover.urlOriginal
                    ) && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-medium text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">
                          {t('mangadex.currentCover', 'Đang dùng')}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
            </div>
          )}

          {/* Total count */}
          <div className="mt-4 text-center">
            <p className="text-xs text-on-surface-variant">
              {t('mangadex.totalCovers', 'Tổng số ảnh bìa')}: <span className="font-semibold tabular-nums">{covers.length}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
