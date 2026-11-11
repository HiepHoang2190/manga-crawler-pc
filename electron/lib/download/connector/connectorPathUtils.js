/**
 * Path utilities for connector services.
 * 
 * Provides functions for resolving file system paths used in manga downloads:
 * - Manga directory paths
 * - Chapter directory paths
 * - Cover image paths
 * 
 * All functions use `mangaUtils` for safe folder name formatting to prevent
 * path traversal attacks and ensure cross-platform compatibility.
 * 
 * @module connectorPathUtils
 */

const path = require('path');
const {
  formatFolderName,
  formatChapterFolderName,
  isFlatChapterLayout,
  MAX_LENGTH_FOLDER_NAME,
} = require('../../shared/mangaUtils');

/**
 * Resolve the manga directory path.
 * 
 * Creates a safe directory path for storing all chapters of a manga.
 * The manga title is sanitized to remove invalid characters and path separators.
 * 
 * ## Preconditions
 * - `baseSaveDir` is a valid directory path
 * - `mangaTitle` is a non-empty string
 * 
 * ## Postconditions
 * - Returns absolute path to manga directory
 * - Path is safe (no path traversal, no invalid characters)
 * - Folder name length ≤ MAX_LENGTH_FOLDER_NAME (255 bytes)
 * 
 * @param {string} baseSaveDir - Base directory for saving manga
 * @param {string} mangaTitle - Title of the manga
 * 
 * @returns {string} Full path to manga directory
 * 
 * @example
 * const mangaDir = resolveMangaDir('/downloads', 'One Piece');
 * // Returns: '/downloads/One Piece'
 * 
 * @example
 * const mangaDir = resolveMangaDir('/downloads', '../../../etc/passwd');
 * // Returns: '/downloads/etc-passwd' (sanitized, no path traversal)
 * 
 * @example
 * const mangaDir = resolveMangaDir('/downloads', 'Very Long Title'.repeat(50));
 * // Returns: '/downloads/Very Long Title...' (truncated to 255 bytes)
 */
function resolveMangaDir(baseSaveDir, mangaTitle) {
  return path.join(
    baseSaveDir,
    formatFolderName(mangaTitle, MAX_LENGTH_FOLDER_NAME)
  );
}

/**
 * Resolve the chapter directory path.
 * 
 * Creates a safe directory path for storing images of a specific chapter.
 * The chapter title is formatted according to the provided format options
 * (numbered or named) and sanitized for file system safety.
 * 
 * ## Preconditions
 * - `baseSaveDir` is a valid directory path
 * - `mangaTitle` is a non-empty string
 * - `chapterTitle` is a non-empty string
 * - `chapterFolderFormat` is a valid format object (or undefined for defaults)
 * 
 * ## Postconditions
 * - Returns absolute path to chapter directory
 * - Path is safe (no path traversal, no invalid characters)
 * - Chapter folder name follows the specified format
 * 
 * @param {string} baseSaveDir - Base directory for saving manga
 * @param {string} mangaTitle - Title of the manga
 * @param {string} chapterTitle - Title of the chapter
 * @param {object} [chapterFolderFormat] - Chapter folder format options
 * @param {string} [chapterFolderFormat.mode] - Format mode ('numbered' or 'named')
 * @param {string} [chapterFolderFormat.prefix] - Prefix for chapter folders (default: 'Chap')
 * @param {number} [chapterFolderFormat.padDigits] - Number of digits to pad (default: 3)
 * 
 * @returns {string} Full path to chapter directory
 * 
 * @example
 * // Numbered format (default)
 * const chapterDir = resolveChapterDir('/downloads', 'One Piece', 'Chapter 1');
 * // Returns: '/downloads/One Piece/Chap 001'
 * 
 * @example
 * // Named format
 * const chapterDir = resolveChapterDir(
 *   '/downloads',
 *   'One Piece',
 *   'Chapter 1',
 *   { mode: 'named' }
 * );
 * // Returns: '/downloads/One Piece/Chapter 1'
 * 
 * @example
 * // Custom prefix and padding
 * const chapterDir = resolveChapterDir(
 *   '/downloads',
 *   'One Piece',
 *   'Chapter 1',
 *   { mode: 'numbered', prefix: 'Ch', padDigits: 4 }
 * );
 * // Returns: '/downloads/One Piece/Ch 0001'
 */
function resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat, volume) {
  const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
  if (isFlatChapterLayout(chapterFolderFormat)) {
    return mangaDir;
  }
  const chapterFolder = formatChapterFolderName(chapterTitle, chapterFolderFormat);
  const volStr = volume != null ? String(volume).trim() : '';
  if (volStr && volStr.toLowerCase() !== 'none') {
    return path.join(mangaDir, `Vol. ${volStr}`, chapterFolder);
  }
  return path.join(mangaDir, chapterFolder);
}

/**
 * Resolve the cover image path.
 * 
 * Determines the file path for saving a manga's cover image.
 * Extracts the file extension from the cover URL and validates it
 * against a whitelist of safe image formats.
 * 
 * ## Preconditions
 * - `mangaDir` is a valid directory path
 * - `coverUrl` is a string (may be empty or invalid URL)
 * 
 * ## Postconditions
 * - Returns absolute path to cover image file
 * - File extension is one of: .jpg, .jpeg, .png, .webp, .gif
 * - Defaults to .jpg if extension cannot be determined or is invalid
 * 
 * @param {string} mangaDir - Manga directory path
 * @param {string} coverUrl - URL of the cover image
 * 
 * @returns {string} Full path to cover image file
 * 
 * @example
 * const coverPath = resolveCoverPath('/downloads/One Piece', 'https://example.com/cover.jpg');
 * // Returns: '/downloads/One Piece/cover.jpg'
 * 
 * @example
 * const coverPath = resolveCoverPath('/downloads/One Piece', 'https://example.com/cover.png');
 * // Returns: '/downloads/One Piece/cover.png'
 * 
 * @example
 * const coverPath = resolveCoverPath('/downloads/One Piece', 'https://example.com/cover.webp');
 * // Returns: '/downloads/One Piece/cover.webp'
 * 
 * @example
 * const coverPath = resolveCoverPath('/downloads/One Piece', 'invalid-url');
 * // Returns: '/downloads/One Piece/cover.jpg' (default extension)
 * 
 * @example
 * const coverPath = resolveCoverPath('/downloads/One Piece', 'https://example.com/cover.exe');
 * // Returns: '/downloads/One Piece/cover.jpg' (unsafe extension rejected)
 */
function resolveCoverPath(mangaDir, coverUrl) {
  let pathname = '/cover.jpg';
  try {
    pathname = new URL(String(coverUrl).trim()).pathname;
  } catch {
    /* Use default */
  }
  const ext = path.extname(pathname).toLowerCase();
  const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  return path.join(mangaDir, `cover${safe}`);
}

module.exports = {
  resolveMangaDir,
  resolveChapterDir,
  resolveCoverPath,
};
