/**
 * Example usage of MangadexCoverSelector component
 * 
 * This file demonstrates how to integrate the cover selector into your manga loading flow.
 */

import { useState } from 'react';
import MangadexCoverSelector from './MangadexCoverSelector.jsx';

export default function MangaInfoExample() {
  const [manga, setManga] = useState(null);
  const [showCoverSelector, setShowCoverSelector] = useState(false);

  // Example: Load manga from MangaDex
  async function loadManga(url) {
    const result = await window.electronAPI.loadManga('mangadex', url, {
      mangadexLanguage: 'vi',
    });

    if (result.ok) {
      setManga(result.manga);
    }
  }

  // Handle cover selection
  function handleCoverSelect(cover) {
    console.log('User selected cover:', cover);
    
    // Update manga object with new cover URL
    setManga(prev => ({
      ...prev,
      coverUrl: cover.url512, // Use 512px version for display
      selectedCover: cover, // Store full cover info
    }));

    // Close the selector
    setShowCoverSelector(false);

    // Optional: You can also trigger a re-download of the cover image here
    // if you want to replace the saved cover file
  }

  return (
    <div className="p-4">
      {/* Manga Info Display */}
      {manga && (
        <div className="flex gap-4">
          {/* Cover Image with Change Button */}
          <div className="relative">
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-48 h-72 object-cover rounded-lg"
            />
            
            {/* Change Cover Button (only for MangaDex) */}
            {manga.siteId === 'mangadex' && (
              <button
                onClick={() => setShowCoverSelector(true)}
                className="absolute bottom-2 right-2 bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 transition-colors shadow-lg"
                data-tooltip="Chọn ảnh bìa khác"
              >
                <span className="material-symbols-outlined text-sm">image</span>
              </button>
            )}
          </div>

          {/* Manga Details */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">{manga.title}</h1>
            <p className="text-gray-600 dark:text-gray-400">{manga.description}</p>
            
            {manga.selectedCover && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  📚 Đang dùng ảnh bìa: {manga.selectedCover.volume 
                    ? `Volume ${manga.selectedCover.volume}` 
                    : 'Mặc định'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cover Selector Modal */}
      {showCoverSelector && manga && (
        <MangadexCoverSelector
          mangaUrl={manga.mangaUrl}
          currentCoverUrl={manga.coverUrl}
          onCoverSelect={handleCoverSelect}
          onClose={() => setShowCoverSelector(false)}
        />
      )}
    </div>
  );
}

/**
 * Alternative: Add cover selector button to chapter list header
 */
export function MangaHeaderWithCoverSelector({ manga, onMangaUpdate }) {
  const [showCoverSelector, setShowCoverSelector] = useState(false);

  function handleCoverSelect(cover) {
    // Update parent component's manga state
    onMangaUpdate({
      ...manga,
      coverUrl: cover.url512,
      selectedCover: cover,
    });
    setShowCoverSelector(false);
  }

  return (
    <div className="relative">
      {/* Header with cover and title */}
      <div className="flex items-start gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg">
        <img
          src={manga.coverUrl}
          alt={manga.title}
          className="w-24 h-36 object-cover rounded"
        />
        <div className="flex-1">
          <h2 className="text-xl font-bold">{manga.title}</h2>
          
          {/* Change cover button for MangaDex */}
          {manga.siteId === 'mangadex' && (
            <button
              onClick={() => setShowCoverSelector(true)}
              className="mt-2 text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">image</span>
              Chọn ảnh bìa khác
            </button>
          )}
        </div>
      </div>

      {/* Cover selector */}
      {showCoverSelector && (
        <MangadexCoverSelector
          mangaUrl={manga.mangaUrl}
          currentCoverUrl={manga.coverUrl}
          onCoverSelect={handleCoverSelect}
          onClose={() => setShowCoverSelector(false)}
        />
      )}
    </div>
  );
}

/**
 * Alternative: Inline cover selector (no modal)
 */
export function InlineCoverSelector({ mangaUrl, onCoverSelect }) {
  const [loading, setLoading] = useState(false);
  const [covers, setCovers] = useState([]);

  async function loadCovers() {
    setLoading(true);
    const result = await window.electronAPI.fetchMangadexCovers(mangaUrl);
    if (result.ok) {
      setCovers(result.covers || []);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={loadCovers}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Đang tải...' : 'Xem các ảnh bìa khác'}
      </button>

      {covers.length > 0 && (
        <div className="grid grid-cols-6 gap-2">
          {covers.map(cover => (
            <button
              key={cover.id}
              onClick={() => onCoverSelect(cover)}
              className="aspect-[2/3] overflow-hidden rounded border-2 border-transparent hover:border-blue-500 transition-colors"
            >
              <img
                src={cover.url256}
                alt={`Volume ${cover.volume || '?'}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
