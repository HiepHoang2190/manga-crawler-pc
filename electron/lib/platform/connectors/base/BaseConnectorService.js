const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const { loadOrCreate } = require('../../storage/downloadDb');
const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
const { formatChapterTitle, formatChapterPageFileName } = require('../../../shared/mangaUtils');
const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
const { downloadCoverIfNeeded, downloadImageToFile } = require('../../../download/connector/connectorDownloadUtils');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');

/**
 * Base class for all connector services.
 * 
 * Implements the Template Method pattern for chapter downloading, providing a complete
 * download orchestration flow while allowing subclasses to customize specific steps.
 * 
 * ## Architecture
 * 
 * This class provides:
 * - **Template Method**: `downloadChapter()` orchestrates the complete download flow
 * - **Abstract Methods**: `load()` and `fetchChapterImages()` must be implemented by subclasses
 * - **Hook Methods**: `getReferer()`, `getUserAgent()`, `getImageHeaders()` can be overridden for customization
 * - **Common Logic**: Path setup, cover download, DB operations, retry logic, progress tracking
 * 
 * ## Usage Example
 * 
 * ```javascript
 * class MyConnectorService extends BaseConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://example.com/',
 *       label: 'Example Site',
 *       siteId: 'example',
 *     });
 *   }
 * 
 *   async load(url, options) {
 *     // Fetch and parse manga information
 *     return {
 *       ok: true,
 *       manga: { title, coverUrl, mangaUrl, ... },
 *       chapters: [{ url, title }, ...]
 *     };
 *   }
 * 
 *   async fetchChapterImages(chapterUrl, referer) {
 *     // Fetch and parse chapter images
 *     return [
 *       { imageUrl: 'https://...', ext: 'jpg' },
 *       ...
 *     ];
 *   }
 * }
 * ```
 * 
 * ## Download Flow
 * 
 * The `downloadChapter()` method follows this sequence:
 * 1. Setup paths and logging
 * 2. Create directories
 * 3. Download cover image (if needed)
 * 4. Check abort signal
 * 5. Load/initialize download database
 * 6. Load/initialize download database
 * 7. Fetch chapter images (calls abstract method)
 * 8. Build page info array
 * 9. Initialize chapter in DB (if new)
 * 10. Resume logic — skip only if fetched count still matches a complete record
 * 11. Parallel download with retry (1-5 threads)
 * 12. Check abort signal after download
 * 13. Mark chapter complete/incomplete
 * 14. Return result
 * 
 * @abstract
 */
class BaseConnectorService {
  /**
   * Create a new connector service instance.
   * 
   * @param {object} config - Connector configuration
   * @param {string} config.domain - Base domain URL (e.g., 'https://example.com/')
   * @param {string} config.label - Human-readable connector label (e.g., 'Example Site')
   * @param {string} config.siteId - Unique site identifier (e.g., 'example')
   * @param {string} [config.imageReferer] - Custom referer for image requests (defaults to domain)
   * 
   * @throws {Error} If config is missing or lacks required properties
   * 
   * @example
   * const service = new MyConnectorService({
   *   domain: 'https://example.com/',
   *   label: 'Example Site',
   *   siteId: 'example',
   *   imageReferer: 'https://cdn.example.com/'
   * });
   */
  constructor(config) {
    if (!config || !config.domain || !config.label || !config.siteId) {
      throw new Error('BaseConnectorService requires config with domain, label, and siteId');
    }
    this.config = config;
  }

  /**
   * Load manga information from URL.
   * 
   * **Abstract method - must be implemented by subclasses.**
   * 
   * This method should fetch the manga page, parse it, and extract:
   * - Manga metadata (title, cover URL, manga URL)
   * - List of available chapters
   * 
   * ## Preconditions
   * - `url` parameter is provided (may be empty or invalid)
   * 
   * ## Postconditions
   * - Returns object with `ok` boolean property
   * - If `ok === true`: includes `manga` object and `chapters` array
   * - If `ok === false`: includes `error` string describing the failure
   * - No side effects on input parameters
   * - No network requests if URL is empty
   * 
   * @param {string} url - Manga URL to load
   * @param {object} [options] - Load options (implementation-specific)
   * @param {string} [options.userAgent] - Custom user agent for requests
   * 
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   * 
   * @returns {Promise<object>} Result object
   * @returns {boolean} result.ok - Whether the operation succeeded
   * @returns {object} [result.manga] - Manga metadata (if ok === true)
   * @returns {string} result.manga.title - Manga title
   * @returns {string} result.manga.coverUrl - Cover image URL
   * @returns {string} result.manga.mangaUrl - Canonical manga URL
   * @returns {string} result.manga.mangaId - Manga ID (may be empty)
   * @returns {string} result.manga.siteId - Site identifier
   * @returns {string} result.manga.sourceLabel - Source label
   * @returns {Array<{url: string, title: string}>} [result.chapters] - Chapter list (if ok === true)
   * @returns {string} [result.error] - Error message (if ok === false)
   * 
   * @throws {Error} Always throws - subclasses must implement this method
   * 
   * @example
   * // In subclass:
   * async load(url, options = {}) {
   *   const html = await fetchHtml(url);
   *   const title = parseTitle(html);
   *   const chapters = parseChapters(html);
   *   return {
   *     ok: true,
   *     manga: { title, coverUrl, mangaUrl: url, ... },
   *     chapters
   *   };
   * }
   */
  async load(url, options) {
    throw new Error('load() must be implemented by subclass');
  }

  /**
   * Fetch chapter images from chapter URL.
   * 
   * **Abstract method - must be implemented by subclasses.**
   * 
   * This method should fetch the chapter page and extract all image URLs with their file extensions.
   * 
   * ## Preconditions
   * - `chapterUrl` is a valid URL string
   * - `referer` is a non-empty string
   * 
   * ## Postconditions
   * - Returns array of image objects
   * - Each object has `imageUrl` (valid URL) and `ext` (file extension without dot)
   * - Array may be empty if no images found
   * - Throws error if chapter page cannot be fetched
   * 
   * @param {string} chapterUrl - Chapter URL to fetch images from
   * @param {string} referer - Referer header value for requests
   * 
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>} Array of image objects
   * 
   * @throws {Error} Always throws in base class - subclasses must implement
   * @throws {Error} May throw if chapter page cannot be fetched (implementation-specific)
   * 
   * @example
   * // In subclass:
   * async fetchChapterImages(chapterUrl, referer) {
   *   const html = await fetchHtml(chapterUrl, { referer });
   *   const images = parseImages(html);
   *   return images.map(url => ({
   *     imageUrl: url,
   *     ext: getExtension(url) // 'jpg', 'png', etc.
   *   }));
   * }
   */
  async fetchChapterImages(chapterUrl, referer) {
    throw new Error('fetchChapterImages() must be implemented by subclass');
  }

  /**
   * Get referer header value for requests.
   * 
   * **Hook method - can be overridden by subclasses.**
   * 
   * ## When to Override
   * 
   * Override this method when:
   * - The site requires a specific referer for image CDN access
   * - The referer must be different from the domain or manga URL
   * - The referer needs to be computed dynamically based on payload
   * 
   * ## Default Behavior
   * 
   * Returns the first non-empty value from:
   * 1. `config.imageReferer` (if set in constructor)
   * 2. `config.domain`
   * 3. `payload.mangaUrl`
   * 4. `payload.chapterUrl`
   * 
   * @param {object} payload - Download payload containing URLs
   * @param {string} payload.mangaUrl - Manga URL
   * @param {string} payload.chapterUrl - Chapter URL
   * 
   * @returns {string} Referer header value
   * 
   * @example
   * // Override for custom referer logic:
   * getReferer(payload) {
   *   // Some CDNs require the chapter URL as referer
   *   return payload.chapterUrl;
   * }
   * 
   * @example
   * // Override for static CDN referer:
   * getReferer(payload) {
   *   return 'https://cdn.example.com/';
   * }
   */
  getReferer(payload) {
    return this.config.imageReferer || this.config.domain || payload.mangaUrl || payload.chapterUrl;
  }

  /**
   * Get user agent for requests.
   * 
   * **Hook method - can be overridden by subclasses.**
   * 
   * ## When to Override
   * 
   * Override this method when:
   * - The site blocks requests from the default user agent
   * - The site requires a mobile user agent
   * - The site requires a specific browser version
   * - You need to rotate user agents for rate limiting
   * 
   * ## Default Behavior
   * 
   * Returns the standard user agent from `htmlConnectorUtils.USER_AGENT`:
   * `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...`
   * 
   * @returns {string} User-Agent header value
   * 
   * @example
   * // Override for mobile user agent:
   * getUserAgent() {
   *   return 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) ...';
   * }
   * 
   * @example
   * // Override for site-specific user agent:
   * getUserAgent() {
   *   return 'MyApp/1.0 (compatible; MSIE 10.0)';
   * }
   */
  getUserAgent() {
    return USER_AGENT;
  }

  /**
   * Get headers for image download requests.
   * 
   * **Hook method - can be overridden by subclasses.**
   * 
   * ## When to Override
   * 
   * Override this method when:
   * - The site requires additional headers (e.g., Authorization, Cookie)
   * - The site requires specific Accept headers
   * - You need to add custom headers for CDN access
   * - The default headers cause 403 Forbidden errors
   * 
   * ## Default Behavior
   * 
   * Returns headers with:
   * - `Referer`: from `getReferer()`
   * - `User-Agent`: from `getUserAgent()`
   * - `Accept`: image format preferences (avif, webp, apng, etc.)
   * 
   * @param {string} referer - Referer header value
   * 
   * @returns {object} HTTP headers object
   * 
   * @example
   * // Override to add authorization:
   * getImageHeaders(referer) {
   *   return {
   *     ...super.getImageHeaders(referer),
   *     'Authorization': 'Bearer token123'
   *   };
   * }
   * 
   * @example
   * // Override to add cookies:
   * getImageHeaders(referer) {
   *   return {
   *     ...super.getImageHeaders(referer),
   *     'Cookie': 'session=abc123'
   *   };
   * }
   * 
   * @example
   * // Override to change Accept header:
   * getImageHeaders(referer) {
   *   return {
   *     'Referer': referer,
   *     'User-Agent': this.getUserAgent(),
   *     'Accept': 'image/jpeg,image/png'
   *   };
   * }
   */
  getImageHeaders(referer) {
    return {
      Referer: referer,
      'User-Agent': this.getUserAgent(),
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
  }

  /**
   * Download a single image with retry logic.
   * 
   * **Hook method - can be overridden by subclasses.**
   * 
   * ## When to Override
   * 
   * Override this method when:
   * - The site requires custom download logic (e.g., token refresh, signed URLs)
   * - You need to decrypt or process images after download
   * - You need custom retry logic (different delays, exponential backoff)
   * - Images require multi-step fetching (e.g., get token, then download)
   * 
   * ## Default Behavior
   * 
   * Delegates to `downloadImageToFile()` utility (single attempt, no retry).
   * The retry logic is handled by the `downloadChapter()` template method.
   * 
   * @param {string} imageUrl - Image URL to download
   * @param {string} filePath - Target file path
   * @param {object} headers - HTTP headers
   * @param {number} maxAttempts - Maximum retry attempts (handled by caller)
   * @param {object} imageInfo - Additional image info from fetchChapterImages()
   * 
   * @returns {Promise<{ok: boolean, fileSize?: number}>} Download result
   * 
   * @example
   * // Override for custom download with decryption:
   * async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo) {
   *   const result = await downloadImageToFile(imageUrl, filePath, headers);
   *   if (result.ok && imageInfo.encrypted) {
   *     const decrypted = await decryptImage(filePath, imageInfo.key);
   *     fs.writeFileSync(filePath, decrypted);
   *   }
   *   return result;
   * }
   * 
   * @example
   * // Override for signed URL fetching:
   * async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo) {
   *   const signedUrl = await getSignedUrl(imageUrl);
   *   return downloadImageToFile(signedUrl, filePath, headers);
   * }
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}, shouldAbort) {
    const IMAGE_FETCH_TIMEOUT_MS = 30_000;
    const ac = new AbortController();

    const timer = setTimeout(() => ac.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let pollInterval;
    if (typeof shouldAbort === 'function') {
      pollInterval = setInterval(() => { if (shouldAbort()) ac.abort(); }, 300);
    }

    try {
      return await downloadImageToFile(imageUrl, filePath, headers, ac.signal);
    } finally {
      clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    }
  }

  /**
   * Template method for downloading a chapter.
   * 
   * **Do not override this method.** Override hook methods or abstract methods instead.
   * 
   * Orchestrates the complete download flow with:
   * - Path setup and directory creation
   * - Cover image download
   * - Download database management
   * - Resume capability for interrupted downloads
   * - Parallel download with configurable threads (1-5)
   * - Automatic retry (3 attempts per page with 1-second delays)
   * - Progress tracking and reporting
   * - Abort signal handling
   * 
   * ## Preconditions
   * 
   * - `payload` is non-null object
   * - `payload.mangaTitle` is non-empty string
   * - `payload.chapterUrl` is valid URL string
   * - `payload.chapterTitle` is non-empty string
   * - `payload.baseSaveDir` is valid directory path
   * - `payload.numberOfThreads` is integer between 1 and 5 (inclusive)
   * - `this.fetchChapterImages()` is implemented by subclass
   * 
   * ## Postconditions
   * 
   * - Returns object with `ok` boolean property
   * - If `ok === true`: chapter images downloaded to disk, DB updated
   * - If `ok === false`: error message provided or `aborted === true`
   * - All downloaded files exist on disk with size > 0
   * - Download DB accurately reflects completion status
   * - Progress callbacks invoked for each downloaded page
   * 
   * ## Loop Invariants
   * 
   * During parallel download loop:
   * - All completed pages marked in DB before progress increment
   * - Progress counter monotonically increases: 0 ≤ current ≤ total
   * - Failed pages tracked in `failedPageIndices` array
   * - Maximum 3 retry attempts per page
   * 
   * @param {object} payload - Download configuration
   * @param {string} payload.mangaTitle - Manga title
   * @param {string} payload.mangaUrl - Manga URL
   * @param {string} payload.chapterUrl - Chapter URL
   * @param {string} payload.chapterTitle - Chapter title
   * @param {string} payload.baseSaveDir - Base save directory
   * @param {number} [payload.numberOfThreads=5] - Number of concurrent downloads (1-5)
   * @param {string} [payload.coverUrl] - Cover image URL
   * @param {object} [payload.chapterFolderFormat] - Chapter folder format options
   * @param {Function} [payload.onLog] - Logging callback (message, level)
   * @param {Function} [payload.onProgress] - Progress callback (progressPayload)
   * @param {Function} [payload.shouldAbort] - Abort check function
   * @param {string} [connectorLabel] - Connector label override
   * 
   * @returns {Promise<object>} Download result
   * @returns {boolean} result.ok - Whether all pages downloaded successfully
   * @returns {number} [result.successCount] - Number of successfully downloaded pages
   * @returns {number} [result.totalPages] - Total number of pages
   * @returns {Array<number>} [result.failedPageIndices] - Indices of failed pages (if any)
   * @returns {boolean} [result.skipped] - True if chapter was already complete
   * @returns {boolean} [result.aborted] - True if download was aborted by user
   * @returns {string} [result.error] - Error message (if ok === false)
   * 
   * @example
   * const result = await service.downloadChapter({
   *   mangaTitle: 'One Piece',
   *   mangaUrl: 'https://example.com/manga/one-piece',
   *   chapterUrl: 'https://example.com/chapter/1',
   *   chapterTitle: 'Chapter 1',
   *   baseSaveDir: '/path/to/downloads',
   *   numberOfThreads: 3,
   *   coverUrl: 'https://example.com/cover.jpg',
   *   onLog: (msg, level) => console.log(`[${level}] ${msg}`),
   *   onProgress: (p) => console.log(`${p.current}/${p.total}`),
   *   shouldAbort: () => userClickedCancel
   * });
   * 
   * if (result.ok) {
   *   console.log(`Downloaded ${result.successCount} pages`);
   * } else if (result.aborted) {
   *   console.log('Download cancelled by user');
   * } else {
   *   console.log(`Download failed: ${result.error}`);
   * }
   */
  async downloadChapter(payload, connectorLabel) {
    const {
      mangaTitle,
      mangaUrl,
      chapterUrl,
      chapterTitle,
      baseSaveDir,
      numberOfThreads = 5,
      coverUrl,
      chapterFolderFormat,
      onLog,
      onProgress,
      shouldAbort,
    } = payload;

    const connector = connectorLabel || this.config.label;

    // Step 1: Setup paths and logging
    const log = (msg, level = 'info') => {
      if (typeof onLog === 'function') onLog(msg, level);
    };
    const report = (progressPayload) => {
      if (typeof onProgress === 'function') onProgress(progressPayload);
    };

    const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
    const dbChapterTitle = formatChapterTitle(chapterTitle);
    const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
    const referer = this.getReferer(payload);

    // Step 2: Create directories
    try {
      fs.mkdirSync(chapterDir, { recursive: true });
    } catch (err) {
      const code = err && err.code ? String(err.code) : '';
      const detail = String(err?.message || err);
      log(`Không tạo được thư mục chương: ${detail}`, 'error');
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        const volMatch = /^\/Volumes\/([^/]+)/.exec(baseSaveDir);
        if (volMatch && !fs.existsSync(`/Volumes/${volMatch[1]}`)) {
          return {
            ok: false,
            error: `Ổ đĩa ngoài "/Volumes/${volMatch[1]}" chưa được kết nối hoặc đã bị ngắt kết nối. Vui lòng cắm lại ổ đĩa hoặc chọn thư mục lưu khác. Đường dẫn: ${chapterDir}`,
          };
        }
        return {
          ok: false,
          error:
            `Không có quyền ghi thư mục lưu (${code}). Kiểm tra ổ đĩa có cho phép ghi (NTFS trên macOS chỉ đọc nếu không có driver ghi, hoặc cần cấp quyền truy cập Removable Volumes/Full Disk Access), rồi thử lại. Đường dẫn: ${chapterDir}`,
        };
      }
      if (code === 'EINVAL' || code === 'ENAMETOOLONG') {
        return {
          ok: false,
          error: `Tên thư mục không hợp lệ trên ổ đĩa này (${code}): ${chapterDir}`,
        };
      }
      return { ok: false, error: `Không tạo được thư mục lưu chương — ${detail}` };
    }

    const cleanup_empty_chapter_dir = () => {
      if (removeEmptyChapterDir(chapterDir)) {
        log('Removed empty chapter folder after failed download.', 'info');
      }
    };

    // Step 3: Download cover
    await downloadCoverIfNeeded(coverUrl, mangaDir, referer, this.getUserAgent(), log);

    // Step 4: Check abort
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 5: Load/init download database
    const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector);
    if (!db.record.mangaTitle) {
      db.record.mangaTitle = mangaTitle;
      db.record.mangaUrl = mangaUrl;
      db.record.connector = connector;
      db.save();
    }

    // Step 6: Fetch chapter images before skip. A record marked complete with
    // fewer pages than the site (IMGX truncated grants) must be allowed to repair.
    let rawList;
    try {
      rawList = await this.fetchChapterImages(chapterUrl, referer);
    } catch (err) {
      log(`Lỗi khi fetch images: ${err.message}`, 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: `Failed to fetch images — ${String(err?.message || err)}` };
    }

    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    if (!rawList || !rawList.length) {
      log('Không tìm thấy ảnh trong trang chương.', 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'Không tìm thấy ảnh trong trang chương.' };
    }

    log(`Found ${rawList.length} images`, 'info');

    // Step 8: Build page info array
    const pageInfos = rawList.map((item, i) => {
      const idx = i + 1;
      const fileName = formatChapterPageFileName(chapterTitle, idx, item.ext, chapterFolderFormat);
      const filePath = path.join(chapterDir, fileName);
      return {
        index: idx,
        imageUrl: item.imageUrl,
        filePath,
        fileName,
        imageInfo: item, // Pass the full item for custom implementations
      };
    });

    const fullChapterPageCount = rawList.length;
    if (typeof payload.onChapterTotal === 'function') {
      payload.onChapterTotal(fullChapterPageCount);
    }

    // Step 9: Init chapter in DB if not exists
    if (!db.hasChapter(dbChapterTitle)) {
      const allPages = pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: pi.imageUrl,
        status: 'pending',
      }));
      db.initChapter(dbChapterTitle, chapterUrl, allPages.length, allPages);
    }

    // Step 10: Resume logic - filter missing pages
    if (db.hasChapter(dbChapterTitle)) {
      const chapter_record = db.record?.chapters?.[dbChapterTitle];
      const chapter_pages = Array.isArray(chapter_record?.pages) ? chapter_record.pages : [];
      const current_urls = pageInfos.map((pi) => String(pi.imageUrl || '').trim());
      const stored_urls = chapter_pages.map((p) => String(p?.sourceUrl || '').trim());
      const count_changed =
        Number(chapter_record?.expectedFileCount || 0) !== fullChapterPageCount ||
        chapter_pages.length !== fullChapterPageCount;
      const edge_changed =
        chapter_pages.length > 0 &&
        current_urls.length > 0 &&
        (stored_urls[0] !== current_urls[0] ||
          stored_urls[stored_urls.length - 1] !== current_urls[current_urls.length - 1]);
      const empty_page_manifest = !db.hasDownloadablePages(dbChapterTitle);

      if (empty_page_manifest || count_changed || edge_changed) {
        const all_pages = pageInfos.map((pi) => ({
          index: pi.index,
          fileName: pi.fileName,
          sourceUrl: pi.imageUrl,
          status: 'pending',
        }));
        db.initChapter(dbChapterTitle, chapterUrl, all_pages.length, all_pages, {
          // Rebuild a false "completed" record when the live list is longer/shorter
          force: empty_page_manifest || count_changed || chapter_record?.status !== 'completed',
        });
      }

      // Keep resume effective and recover from missing download.json:
      // always preserve completed files by checking physical files on disk,
      // except when the live page count changed — filenames no longer map 1:1.
      const refreshed_record = db.record?.chapters?.[dbChapterTitle];
      if (!count_changed && refreshed_record && Array.isArray(refreshed_record.pages)) {
        for (const page_record of refreshed_record.pages) {
          if (page_record.status !== 'completed') {
            const file_path = path.join(chapterDir, page_record.fileName);
            if (fs.existsSync(file_path) && fs.statSync(file_path).size > 0) {
              page_record.status = 'completed';
              page_record.fileSize = fs.statSync(file_path).size;
            }
          }
        }
        db.save();
      }

      const missingPages = db.getMissingPages(dbChapterTitle, chapterDir);
      if (
        missingPages.length === 0 &&
        db.hasDownloadablePages(dbChapterTitle)
      ) {
        db.markChapterCompleted(dbChapterTitle);
        if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
          log('Chapter already complete (verified), skipping.', 'info');
          return { ok: true, skipped: true };
        }
        db.markChapterIncomplete(dbChapterTitle);
      }

      const missingIndices = new Set(
        db.getMissingPages(dbChapterTitle, chapterDir).map((p) => p.index)
      );
      const filtered = pageInfos.filter((pi) => missingIndices.has(pi.index));
      if (filtered.length === 0) {
        db.markChapterIncomplete(dbChapterTitle);
        cleanup_empty_chapter_dir();
        return {
          ok: false,
          error: 'Không có trang hợp lệ để tải.',
          successCount: 0,
          totalPages: 0,
        };
      }
      log(`Resuming: ${filtered.length} pages to download.`, 'info');
      pageInfos.splice(0, pageInfos.length, ...filtered);
    }

    // Step 11: Parallel download with retry
    const threads = Math.max(1, Math.min(Number(numberOfThreads) || 5, 5));
    const limit = pLimit(threads);
    const totalPages = pageInfos.length;
    const downloadResults = [];
    const failedPageIndices = [];
    const progress = new Int32Array(new SharedArrayBuffer(4));

    report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: totalPages });

    await Promise.all(
      pageInfos.map((pi) =>
        limit(async () => {
          if (typeof shouldAbort === 'function' && shouldAbort()) {
            downloadResults.push(false);
            return;
          }

          let success = false;
          for (let attempt = 1; attempt <= 3 && !success; attempt++) {
            if (typeof shouldAbort === 'function' && shouldAbort()) break;

            const headers = this.getImageHeaders(referer);
            const dl = await this.downloadImageWithRetry(pi.imageUrl, pi.filePath, headers, 3, pi.imageInfo, shouldAbort);

            if (dl && dl.ok && fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
              success = true;
              const n = Atomics.add(progress, 0, 1) + 1;
              log(` [${n}/${totalPages}] ${path.basename(pi.filePath)} done`, 'info');
              report({
                mangaTitle,
                chapterTitle,
                chapterUrl,
                current: n,
                total: totalPages,
              });
              db.markPageCompleted(dbChapterTitle, pi.index, fs.statSync(pi.filePath).size);
              if (typeof payload.onPageDownloaded === 'function') {
                payload.onPageDownloaded(path.basename(pi.filePath), pi.index, fullChapterPageCount);
              }
            }

            if (!success && attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          downloadResults.push(success);
          if (!success) {
            db.markPageFailed(dbChapterTitle, pi.index);
            failedPageIndices.push(pi.index);
          }

          await new Promise((r) => setTimeout(r, 150));
        })
      )
    );

    // Step 12: Check abort after download
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      db.markChapterIncomplete(dbChapterTitle);
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 13: Mark chapter status
    const allSuccess =
      downloadResults.length > 0 && downloadResults.every(Boolean);
    if (allSuccess) {
      db.markChapterCompleted(dbChapterTitle);
      log(`Chapter done: ${totalPages} pages.`, 'success');
    } else {
      db.markChapterIncomplete(dbChapterTitle);
      log('Chapter incomplete.', 'warn');
      cleanup_empty_chapter_dir();
    }

    return {
      ok: allSuccess,
      successCount: downloadResults.filter(Boolean).length,
      totalPages,
      failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
    };
  }
}

module.exports = { BaseConnectorService };
