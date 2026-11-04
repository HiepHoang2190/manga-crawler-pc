import { useState, useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';

/**
 * MangaDex Cover Selector Component
 * Allows users to view and select alternative cover images for a manga
 * 
 * @param {object} props
 * @param {string} props.mangaUrl - MangaDex manga URL
 * @param {string} props.currentCoverUrl - Currently selected cover URL
 * @param {function} props.onCoverSelect - Callback when user selects a cover
 * @param {function} props.onClose - Callback to close the selector
 */
export default function MangadexCoverSelector({ 
  mangaUrl, 
  currentCoverUrl, 
  onCoverSelect, 
  onClose 
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [covers, setCovers] = useState([]);
  const [selectedCover, setSelectedCover] = useState(null);

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
  }

  function handleConfirm() {
    if (selectedCover && onCoverSelect) {
      onCoverSelect(selectedCover);
    }
  }

  if (!mangaUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('mangadex.selectCover', 'Chọn ảnh bìa')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {!loading && !error && covers.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {t('mangadex.noCoversFound', 'Không tìm thấy ảnh bìa nào')}
            </div>
          )}

          {!loading && covers.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {covers.map((cover) => (
                <div
                  key={cover.id}
                  className={`
                    relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                    ${selectedCover?.id === cover.id 
                      ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }
                  `}
                  onClick={() => handleSelect(cover)}
                >
                  {/* Cover Image */}
                  <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-900">
                    <img
                      src={cover.url256}
                      alt={cover.description || `Volume ${cover.volume || '?'}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = cover.url512;
                      }}
                    />
                  </div>

                  {/* Cover Info */}
                  <div className="p-2 bg-white dark:bg-gray-800">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {cover.volume ? `Vol ${cover.volume}` : t('mangadex.noCoverVolume', 'Không có số tập')}
                    </div>
                    {cover.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {cover.description}
                      </div>
                    )}
                  </div>

                  {/* Selected Indicator */}
                  {selectedCover?.id === cover.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <span className="material-symbols-outlined text-sm">check</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {covers.length > 0 && (
              <>
                {t('mangadex.totalCovers', 'Tổng số ảnh bìa')}: {covers.length}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              {t('common.cancel', 'Hủy')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedCover}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.confirm', 'Xác nhận')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
