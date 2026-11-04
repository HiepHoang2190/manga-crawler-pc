/**
 * DTV Ebook Service — migrated to use HtmlConnectorService.
 * 
 * This service is unique because it downloads complete files (ZIP, EPUB, PDF, etc.)
 * rather than individual images, so it extends HtmlConnectorService
 * and overrides both load() and downloadChapter() methods.
 */

const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml, USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { loadOrCreate } = require('../../storage/downloadDb');
const {
  formatFolderName,
  formatChapterTitle,
  formatChapterFolderName,
  isFlatChapterLayout,
  MAX_LENGTH_FOLDER_NAME,
} = require('../../../shared/mangaUtils');

// Constants
const DOMAIN = 'https://dtv-ebook.com.vn/';
const LABEL = 'DTV Ebook';
const SITE_ID = 'dtvebook';

/** Hostnames được phép thu thập làm download link */
const ALLOWED_HOSTNAMES = new Set([
  'drive.google.com',
  'docs.google.com',
  'www.mediafire.com',
  'mediafire.com',
  'fshare.vn',
  'onedrive.live.com',
  '1drv.ms',
  'app.box.com',
  'archive.org',
]);

/** Extensions file hợp lệ cho direct download link */
const ALLOWED_EXTENSIONS = new Set(['.zip', '.epub', '.pdf', '.mobi', '.azw3']);

// Cloudflare session management handled by HtmlConnectorService natively

/**
 * DTV Ebook Service class extending HtmlConnectorService.
 * Handles file-based downloads (ZIP, EPUB, PDF, etc.) from various cloud storage providers.
 */
class DtveBookService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      selectors: {
        chapterLinks: 'div#download a',
        title: 'h1.book-title, h1[itemprop="name"], h1:not(.the1h)',
        cover: 'img.book-cover, div.book-cover img, img.hinhdaidien',
      },
      requiresCookie: true,
    });
  }

  /**
   * Load manga information from dtv-ebook.com.vn URL.
   * Overrides the base class method with custom HTML parsing.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    // Clean hash fragment from URL (e.g. #gsc.tab=0)
    const cleanUrl = trimmed.split('#')[0];

    const userCookie = options.cookie || this._effectiveUserCookie();
    const fetchOpts = {
      siteId: SITE_ID,
      requiresCookie: true,
      preferChromiumNet: true,
      headers: {
        Referer: DOMAIN,
      },
      ...(userCookie ? { cookie: userCookie } : {}),
      ...options,
    };

    let fetched;
    try {
      fetched = await fetchHtml(cleanUrl, fetchOpts);
    } catch (err) {
      fetched = { ok: false, error: err?.message || 'Lỗi mạng khi tải trang.' };
    }

    let html = fetched?.html;
    const isBlocked =
      (!fetched.ok && (
        String(fetched.error).includes('403') ||
        String(fetched.error).includes('503') ||
        String(fetched.error).includes('fetch failed') ||
        String(fetched.error).includes('SocketError') ||
        String(fetched.error).includes('other side closed') ||
        String(fetched.error).includes('Lỗi mạng')
      )) ||
      this.isCloudflareChallenge(html);

    if (isBlocked) {
      try {
        const { fetchRenderedHtml } = require('../../renderedFetch');
        if (typeof fetchRenderedHtml === 'function') {
          const renderedHtml = await fetchRenderedHtml(cleanUrl, {
            timeout: 35000,
            waitAfterLoad: 1500,
            cookie: userCookie,
          });
          if (renderedHtml && !this.isCloudflareChallenge(renderedHtml)) {
            html = renderedHtml;
          }
        }
      } catch {
        // Fallback renderedFetch không khả dụng (môi trường test hoặc không có Electron)
      }
    }

    if (!html) {
      if (isBlocked) {
        return {
          ok: false,
          error: 'HTTP 403: Bị Cloudflare chặn. Hãy nhấn biểu tượng Cookie ở thanh bên (Sidebar) để trích xuất cookie cho DTV Ebook.',
        };
      }
      return {
        ok: false,
        error: fetched?.error || 'Không tải được trang truyện.',
      };
    }

    if (this.isCloudflareChallenge(html)) {
      return {
        ok: false,
        error: 'HTTP 403: Bị Cloudflare chặn. Hãy nhấn biểu tượng Cookie ở thanh bên (Sidebar) để trích xuất cookie cho DTV Ebook.',
      };
    }

    const { title, coverUrl, chapters } = this.parseDtvEbookPage(html, cleanUrl);

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const mangaId = this.extractMangaIdFromUrl(cleanUrl);

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: cleanUrl,
        mangaId,
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * This method is required by HtmlConnectorService but not used by dtveBookService
   * since it downloads files directly rather than fetching individual images.
   */
  async fetchChapterImages(chapterUrl, referer) {
    // Not used - dtveBookService downloads complete files
    throw new Error('fetchChapterImages not applicable for file-based downloads');
  }

  /**
   * Download chapter - overrides HtmlConnectorService template method.
   * Handles file downloads from various cloud storage providers.
   */
  async downloadChapter(payload, connectorLabel) {
    const {
      mangaTitle,
      mangaUrl,
      chapterUrl,
      chapterTitle,
      baseSaveDir,
      coverUrl,
      chapterFolderFormat,
      onLog,
      onProgress,
      shouldAbort,
    } = payload;

    const connector = connectorLabel || LABEL;

    const log = (msg, level = 'info') => {
      if (typeof onLog === 'function') onLog(msg, level);
    };
    const report = (progressPayload) => {
      if (typeof onProgress === 'function') onProgress(progressPayload);
    };

    const mangaDir = this.resolveMangaDir(baseSaveDir, mangaTitle);
    const chapterDir = this.resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
    const dbChapterTitle = formatChapterTitle(chapterTitle);

    fs.mkdirSync(chapterDir, { recursive: true });

    // Step 1: Download cover
    await this.downloadCoverIfNeeded(coverUrl, mangaDir, log);

    // Step 2: Check abort
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      return { ok: false, aborted: true };
    }

    // Step 3: Check DownloadDB
    const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector);
    if (!db.record.mangaTitle) {
      db.record.mangaTitle = mangaTitle;
      db.record.mangaUrl = mangaUrl;
      db.record.connector = connector;
      db.save();
    }

    const chapterStatus = db.record.chapters[dbChapterTitle];
    if (chapterStatus && chapterStatus.status === 'completed') {
      log('Chapter đã tải hoàn chỉnh, bỏ qua.', 'info');
      return { ok: true, skipped: true };
    }

    // Step 4: Detect source type and dispatch to appropriate handler
    report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: 1 });

    const sourceType = this.detectSourceType(chapterUrl);
    let handlerResult;

    switch (sourceType) {
      case 'google-drive':
        handlerResult = await this.downloadGoogleDrive(chapterUrl, chapterDir, log, shouldAbort);
        break;
      case 'direct':
        handlerResult = await this.downloadDirect(chapterUrl, chapterDir, log, shouldAbort);
        break;
      case 'mediafire':
        handlerResult = await this.downloadMediafire(chapterUrl, chapterDir, log, shouldAbort);
        break;
      case 'onedrive':
        handlerResult = await this.downloadOneDrive(chapterUrl, chapterDir, log, shouldAbort);
        break;
      case 'fshare':
        handlerResult = await this.downloadFshare(chapterUrl, chapterDir, log, shouldAbort);
        break;
      default:
        log(`Nguồn download không được hỗ trợ: ${chapterUrl}`, 'error');
        return { ok: false, error: `Nguồn download không được hỗ trợ: ${chapterUrl}` };
    }

    // Propagate abort/error from handler
    if (!handlerResult.ok) {
      return handlerResult;
    }

    // Step 5: Mark chapter completed in DB
    if (!db.record.chapters[dbChapterTitle]) {
      db.record.chapters[dbChapterTitle] = {
        url: chapterUrl,
        status: 'downloading',
        expectedFileCount: 1,
        downloadedAt: '',
        pages: [],
      };
    }
    db.markChapterCompleted(dbChapterTitle);

    report({ mangaTitle, chapterTitle, chapterUrl, current: 1, total: 1 });
    return { ok: true };
  }

  // Helper methods (extracted from original service)

  /**
   * Check if HTML contains Cloudflare challenge.
   */
  isCloudflareChallenge(html) {
    if (!html || typeof html !== 'string') return false;
    return (
      html.includes('cf-browser-verification') ||
      html.includes('cf_chl_') ||
      html.includes('jschl-answer') ||
      html.includes('Checking your browser') ||
      html.includes('DDoS protection by Cloudflare') ||
      html.includes('challenges.cloudflare.com') ||
      html.includes('Just a moment...') ||
      html.includes('Enable JavaScript and cookies to continue') ||
      /cf-mitigated:\s*challenge/i.test(html) ||
      (html.includes('cloudflare') && html.includes('challenge'))
    );
  }

  /**
   * Extract manga ID from dtv-ebook.com.vn URL.
   */
  extractMangaIdFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    // Match trailing numeric ID before .html: _12345.html or -12345.html
    const m = url.match(/[_-](\d+)\.html(?:[?#].*)?$/i);
    if (m) return m[1];
    // Fallback: any trailing number segment
    const m2 = url.match(/(\d+)(?:\.html)?(?:[?#].*)?$/i);
    if (m2) return m2[1];
    return '';
  }

  /**
   * Parse dtv-ebook.com.vn page to extract title, cover, and chapters.
   */
  parseDtvEbookPage(html, pageUrl) {
    const $ = cheerio.load(html);

    // Extract title
    let title = '';
    const $h1BookTitle = $('h1.book-title').first();
    if ($h1BookTitle.length) {
      title = $h1BookTitle.text().trim();
    }

    if (!title) {
      const $h1Itemprop = $('h1[itemprop="name"]').first();
      if ($h1Itemprop.length) title = $h1Itemprop.text().trim();
    }

    if (!title) {
      // Find h1 that is NOT the site-wide header (class "the1h")
      $('h1').each((_, el) => {
        if (title) return false; // break
        const $el = $(el);
        if ($el.hasClass('the1h')) return; // skip site header
        const text = $el.text().trim();
        if (text) title = text;
      });
    }

    if (!title) {
      // Fallback: h2.ten_san_pham (old layout)
      title = $('h2.ten_san_pham').first().text().trim();
    }

    if (!title) {
      // Last resort: <title> tag, strip site suffix
      const rawTitle = $('title').first().text().trim();
      // Strip " | DTV Ebook ..." suffix
      title = rawTitle.replace(/\s*\|.*$/, '').trim();
    }

    // Extract cover URL
    let coverUrl = '';
    const $bookCoverImg = $('img.book-cover').first();
    if ($bookCoverImg.length) {
      const raw = ($bookCoverImg.attr('src') || $bookCoverImg.attr('data-src') || '').trim();
      if (raw) coverUrl = this.resolveAbsoluteUrl(raw, pageUrl);
    }

    if (!coverUrl) {
      const $divBookCoverImg = $('div.book-cover img').first();
      if ($divBookCoverImg.length) {
        const raw = ($divBookCoverImg.attr('src') || $divBookCoverImg.attr('data-src') || '').trim();
        if (raw) coverUrl = this.resolveAbsoluteUrl(raw, pageUrl);
      }
    }

    if (!coverUrl) {
      // img.hinhdaidien — the actual cover image class used by dtv-ebook.com.vn
      const $hinhdaidien = $('img.hinhdaidien').first();
      if ($hinhdaidien.length) {
        const raw = ($hinhdaidien.attr('src') || $hinhdaidien.attr('data-src') || '').trim();
        if (raw) coverUrl = this.resolveAbsoluteUrl(raw, pageUrl);
      }
    }

    if (!coverUrl) {
      // meta og:image fallback
      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) {
        // Fix doubled domain: "https://dtv-ebook.com.vn/https://dtv-ebook.com.vn/images/..."
        const fixed = ogImage.replace(/^https?:\/\/[^/]+\/(https?:\/\/)/, '$1');
        coverUrl = this.resolveAbsoluteUrl(fixed, pageUrl);
      }
    }

    // Extract chapters
    const chapters = [];
    const seenElements = new WeakSet();

    const $container = $('div#download');
    if ($container.length) {
      const hasTdLayout = $container.find('td strong').length > 0;

      if (hasTdLayout) {
        // Parse từng <td>: lấy format label từ <strong>, ghép với link text
        $container.find('td').each((_, td) => {
          const $td = $(td);
          const formatLabel = $td.find('strong').first().text().replace(/:\s*$/, '').trim().toUpperCase();

          $td.find('a').each((_, el) => {
            if (seenElements.has(el)) return;
            seenElements.add(el);

            const $a = $(el);
            let href = ($a.attr('href') || '').trim();
            if (!href) return;
            href = this.resolveAbsoluteUrl(href, pageUrl);
            if (!href || !this.isAllowedDownloadLink(href)) return;

            const linkText = $a.text().trim().toUpperCase();
            const chapterTitle = formatLabel && linkText
              ? `${formatLabel} - ${linkText}`
              : formatLabel || linkText || href;

            chapters.push({ url: href, title: chapterTitle });
          });
        });
      } else {
        // Fallback: collect tất cả <a> trong container
        $container.find('a').each((_, el) => {
          if (seenElements.has(el)) return;
          seenElements.add(el);

          const $a = $(el);
          let href = ($a.attr('href') || '').trim();
          if (!href) return;
          href = this.resolveAbsoluteUrl(href, pageUrl);
          if (!href || !this.isAllowedDownloadLink(href)) return;

          const text = $a.text().replace(/^tải\s*/i, '').trim() || href;
          chapters.push({ url: href, title: text });
        });
      }
    }

    return { title, coverUrl, chapters };
  }

  /**
   * Resolve relative URL to absolute URL.
   */
  resolveAbsoluteUrl(url, baseUrl) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    // Already absolute
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Protocol-relative
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    // Relative — resolve against baseUrl
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return '';
    }
  }

  /**
   * Check if href is an allowed download link.
   */
  isAllowedDownloadLink(href) {
    try {
      const u = new URL(href);
      if (ALLOWED_HOSTNAMES.has(u.hostname.toLowerCase())) return true;
      const ext = path.extname(u.pathname).toLowerCase();
      return ALLOWED_EXTENSIONS.has(ext);
    } catch {
      return false;
    }
  }

  /**
   * Detect source type from URL.
   */
  detectSourceType(url) {
    try {
      const u = new URL(url);
      const hostname = u.hostname.toLowerCase();

      if (hostname.includes('google.com')) return 'google-drive';
      if (hostname.includes('mediafire.com')) return 'mediafire';
      if (hostname.includes('fshare.vn')) return 'fshare';
      if (hostname === 'onedrive.live.com' || hostname === '1drv.ms') return 'onedrive';

      const ext = path.extname(u.pathname).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) return 'direct';

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Path utilities
   */
  resolveMangaDir(baseSaveDir, mangaTitle) {
    const safe = formatFolderName(mangaTitle, MAX_LENGTH_FOLDER_NAME);
    return path.join(baseSaveDir, safe);
  }

  resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, fmt) {
    const mangaDir = this.resolveMangaDir(baseSaveDir, mangaTitle);
    if (isFlatChapterLayout(fmt)) {
      return mangaDir;
    }
    const chapterFolder = formatChapterFolderName(chapterTitle, fmt);
    return path.join(mangaDir, chapterFolder);
  }

  resolveCoverPath(mangaDir, coverUrl) {
    let pathname = '/cover.jpg';
    try {
      pathname = new URL(String(coverUrl).trim()).pathname;
    } catch {
      return path.join(mangaDir, 'cover.jpg');
    }
    const ext = path.extname(pathname).toLowerCase();
    const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    return path.join(mangaDir, `cover${safe}`);
  }

  /**
   * Download cover if needed.
   */
  async downloadCoverIfNeeded(coverUrl, mangaDir, log) {
    if (!coverUrl || !String(coverUrl).trim()) return;
    const url = String(coverUrl).trim();
    if (!/^https?:\/\//i.test(url)) return;

    fs.mkdirSync(mangaDir, { recursive: true });
    const coverPath = this.resolveCoverPath(mangaDir, url);

    if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 0) {
      log(`Cover đã có: ${path.basename(coverPath)}`, 'info');
      return;
    }

    // Try with site cookies if available
    try {
      const cookieManager = require('../../cookies/cookieManager');
      const siteCookies = cookieManager.getEffectiveCookie('dtvebook');
      if (siteCookies) {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': DOMAIN,
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Cookie': siteCookies,
          },
          redirect: 'follow',
          timeout: 30000,
        });
        
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0) {
            fs.writeFileSync(coverPath, buf);
            log(`Đã lưu cover: ${path.basename(coverPath)} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
            return;
          }
        }
      }
    } catch (err) {
      // Silent fallback
    }

    // Fallback: try normal headers
    try {
      const res = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': DOMAIN,
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
        timeout: 30000,
      });
      
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) {
          fs.writeFileSync(coverPath, buf);
          log(`Đã lưu cover: ${path.basename(coverPath)} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
          return;
        }
      }
    } catch (err) {
      // Silent fail
    }

    log('Tải cover thất bại.', 'warn');
  }

  // Download handler methods

  /**
   * Extract Google Drive file ID from URL.
   */
  extractGoogleDriveFileId(url) {
    if (!url || typeof url !== 'string') return null;

    // Pattern 1: /file/d/{fileId}/...
    const filePathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch) return filePathMatch[1];

    // Pattern 2: uc?id={fileId}
    try {
      const u = new URL(url);
      const id = u.searchParams.get('id');
      if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
    } catch {
      const ucMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (ucMatch) return ucMatch[1];
    }

    return null;
  }

  /**
   * Build Google Drive download URL from file ID.
   */
  buildGoogleDriveDownloadUrl(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Extract filename from Content-Disposition header.
   */
  extractFilenameFromContentDisposition(header) {
    if (!header || typeof header !== 'string') return 'chapter_01.zip';

    // filename*=UTF-8''encoded-name (RFC 5987)
    const starMatch = header.match(/filename\*\s*=\s*(?:[a-zA-Z0-9-]+'')?([^;]+)/i);
    if (starMatch) {
      try {
        const decoded = decodeURIComponent(starMatch[1].trim());
        if (decoded) return decoded;
      } catch {
        // fallthrough
      }
    }

    // filename="name" or filename=name
    const plainMatch = header.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (plainMatch) {
      const name = plainMatch[1].trim();
      if (name) {
        try {
          const reencoded = Buffer.from(name, 'latin1').toString('utf8');
          if (!reencoded.includes('\uFFFD')) return reencoded;
        } catch {
          // fallthrough
        }
        return name;
      }
    }

    return 'chapter_01.zip';
  }

  /**
   * Check if HTML is Google Drive virus scan page.
   */
  isGoogleDriveVirusScanPage(html) {
    if (!html || typeof html !== 'string') return false;
    return (
      html.includes('drive.google.com') &&
      (html.includes('confirm=') || html.includes('id="uc-download-link"')) &&
      (html.includes('virus scan') ||
        html.includes('Google Drive can') ||
        html.includes('download anyway') ||
        html.includes('uc-download-link') ||
        html.includes('confirm&amp;id=') ||
        html.includes('&confirm='))
    );
  }

  /**
   * Extract virus scan confirm URL from Google Drive HTML.
   */
  extractVirusScanConfirmUrl(html, fileId) {
    if (!html || typeof html !== 'string') return null;

    const hrefMatch = html.match(
      /href="(\/uc\?[^"]*export=download[^"]*confirm=[^"]+)"/i
    );
    if (hrefMatch) {
      const relative = hrefMatch[1].replace(/&amp;/g, '&');
      return `https://drive.google.com${relative}`;
    }

    const actionMatch = html.match(
      /action="(https:\/\/drive\.google\.com\/uc[^"]*)"[^>]*>/i
    );
    if (actionMatch) {
      const url = actionMatch[1].replace(/&amp;/g, '&');
      if (url.includes('confirm=')) return url;
    }

    const tokenMatch = html.match(/[?&]confirm=([a-zA-Z0-9_-]+)/);
    if (tokenMatch) {
      return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${tokenMatch[1]}`;
    }

    return null;
  }

  /**
   * Resolve filename from response headers or URL.
   */
  resolveFilename(response, finalUrl) {
    const cd = response.headers.get('content-disposition') || '';
    if (cd) return this.extractFilenameFromContentDisposition(cd);

    try {
      const pathname = new URL(finalUrl).pathname;
      let name = pathname.split('/').filter(Boolean).pop() || '';
      name = this.sanitizeFilename(name);
      if (!name) return 'chapter_01.zip';
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) name += '.zip';
      return name;
    } catch {
      return 'chapter_01.zip';
    }
  }

  /**
   * Sanitize filename for filesystem.
   */
  sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  }

  /**
   * Download from Google Drive.
   */
  async downloadGoogleDrive(chapterUrl, chapterDir, log, shouldAbort) {
    const fileId = this.extractGoogleDriveFileId(chapterUrl);
    if (!fileId) {
      const msg = `Không lấy được Google Drive file ID từ: ${chapterUrl}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    const downloadUrl = this.buildGoogleDriveDownloadUrl(fileId);
    log(`Đang tải: ${downloadUrl}`, 'info');

    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      try {
        const res = await fetch(downloadUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: DOMAIN },
          redirect: 'follow',
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const html = await res.text();
          if (this.isGoogleDriveVirusScanPage(html)) {
            log('Phát hiện trang xác nhận virus scan, đang follow...', 'info');
            const confirmUrl = this.extractVirusScanConfirmUrl(html, fileId);
            if (!confirmUrl) {
              lastError = 'Không lấy được URL confirm từ trang virus scan.';
              log(lastError, 'error');
              break;
            }
            if (typeof shouldAbort === 'function' && shouldAbort()) {
              return { ok: false, aborted: true };
            }
            const confirmRes = await fetch(confirmUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0', Referer: DOMAIN },
              redirect: 'follow',
            });
            if (!confirmRes.ok) {
              lastError = `HTTP ${confirmRes.status} (confirm)`;
              log(`Lần thử ${attempt} (confirm): ${lastError}`, attempt < 3 ? 'warn' : 'error');
              if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            response = confirmRes;
            break;
          }
          lastError = 'Nhận được HTML thay vì file.';
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (err) {
        lastError = err.message;
        log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!response) {
      if (lastError && (lastError.includes('HTTP 500') || lastError.includes('HTTP 403'))) {
        lastError += ' (Lưu ý: Nếu link Google Drive là một "Thư Mục" (Folder), ứng dụng sẽ không thể tải. Vui lòng tải thủ công trên trình duyệt)';
      }
      return { ok: false, error: lastError || 'Tải file thất bại.' };
    }

    const filename = this.resolveFilename(response, response.url || chapterUrl);
    const filePath = path.join(chapterDir, filename);
    try {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) {
        const msg = 'File tải về rỗng.';
        log(msg, 'error');
        return { ok: false, error: msg };
      }
      fs.writeFileSync(filePath, buf);
      log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
      const msg = `Lỗi lưu file: ${err.message}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    return { ok: true };
  }

  /**
   * Download from direct link.
   */
  async downloadDirect(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Đang tải direct: ${chapterUrl}`, 'info');

    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      try {
        const siteCookies = this._effectiveUserCookie();
        const headers = { 'User-Agent': 'Mozilla/5.0', Referer: DOMAIN };
        if (siteCookies && chapterUrl.includes('dtv-ebook.com.vn')) {
          headers.Cookie = siteCookies;
        }
        const res = await fetch(chapterUrl, {
          headers,
          redirect: 'follow',
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (err) {
        lastError = err.message;
        log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!response) {
      return { ok: false, error: lastError || 'Tải file thất bại.' };
    }

    const filename = this.resolveFilename(response, response.url || chapterUrl);
    const filePath = path.join(chapterDir, filename);
    try {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) {
        const msg = 'File tải về rỗng.';
        log(msg, 'error');
        return { ok: false, error: msg };
      }
      fs.writeFileSync(filePath, buf);
      log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
      const msg = `Lỗi lưu file: ${err.message}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    return { ok: true };
  }

  /**
   * Resolve Mediafire direct download link.
   */
  async resolveMediafireDirectLink(url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: DOMAIN },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Priority 1: a#downloadButton
      const $btn = $('a#downloadButton').first();
      if ($btn.length) {
        const href = ($btn.attr('href') || '').trim();
        if (href) return href;
      }

      // Priority 2: a.dlbutton
      const $dlbtn = $('a.dlbutton').first();
      if ($dlbtn.length) {
        const href = ($dlbtn.attr('href') || '').trim();
        if (href) return href;
      }

      // Priority 3: div.dl-btn-row a[href^="https://download"]
      let found = null;
      $('div.dl-btn-row a').each((_, el) => {
        if (found) return false;
        const href = ($(el).attr('href') || '').trim();
        if (href.startsWith('https://download')) found = href;
      });
      if (found) return found;

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download from Mediafire.
   */
  async downloadMediafire(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Đang lấy link Mediafire: ${chapterUrl}`, 'info');

    const directLink = await this.resolveMediafireDirectLink(chapterUrl);
    if (!directLink) {
      const msg = 'Không lấy được link tải từ Mediafire.';
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    log(`Đang tải: ${directLink}`, 'info');

    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      try {
        const res = await fetch(directLink, {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.mediafire.com/' },
          redirect: 'follow',
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (err) {
        lastError = err.message;
        log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!response) {
      return { ok: false, error: lastError || 'Tải file thất bại.' };
    }

    const filename = this.resolveFilename(response, response.url || directLink);
    const filePath = path.join(chapterDir, filename);
    try {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) {
        const msg = 'File tải về rỗng.';
        log(msg, 'error');
        return { ok: false, error: msg };
      }
      fs.writeFileSync(filePath, buf);
      log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
      const msg = `Lỗi lưu file: ${err.message}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    return { ok: true };
  }

  /**
   * Resolve OneDrive direct download link.
   */
  async resolveOneDriveDirectLink(url) {
    try {
      let expandedUrl = url;

      // If 1drv.ms short link → HEAD request to get expanded URL
      const u = new URL(url);
      if (u.hostname === '1drv.ms') {
        const headRes = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'follow',
        });
        expandedUrl = headRes.url || url;
      }

      const expanded = new URL(expandedUrl);

      // Has resid= and authkey= → build download URL
      const resid = expanded.searchParams.get('resid');
      const authkey = expanded.searchParams.get('authkey');
      if (resid && authkey) {
        return `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(authkey)}`;
      }

      // Path /s/... → append ?download=1
      if (expanded.pathname.startsWith('/s/') || expanded.pathname.startsWith('/s%2F')) {
        const base = expandedUrl.split('?')[0];
        return `${base}?download=1`;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download from OneDrive.
   */
  async downloadOneDrive(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Đang lấy link OneDrive: ${chapterUrl}`, 'info');

    const directLink = await this.resolveOneDriveDirectLink(chapterUrl);
    if (!directLink) {
      const msg = 'Không lấy được link tải từ OneDrive.';
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    log(`Đang tải: ${directLink}`, 'info');

    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      try {
        const res = await fetch(directLink, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'follow',
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (err) {
        lastError = err.message;
        log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!response) {
      return { ok: false, error: lastError || 'Tải file thất bại.' };
    }

    const filename = this.resolveFilename(response, response.url || directLink);
    const filePath = path.join(chapterDir, filename);
    try {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) {
        const msg = 'File tải về rỗng.';
        log(msg, 'error');
        return { ok: false, error: msg };
      }
      fs.writeFileSync(filePath, buf);
      log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
      const msg = `Lỗi lưu file: ${err.message}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    return { ok: true };
  }

  /**
   * Resolve Fshare direct download link.
   */
  async resolveFshareDirectLink(url) {
    try {
      const res = await fetch('https://api.fshare.vn/api/session/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json && typeof json.location === 'string' && json.location) {
        return json.location;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download from Fshare.
   */
  async downloadFshare(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Đang lấy link Fshare: ${chapterUrl}`, 'info');

    const directLink = await this.resolveFshareDirectLink(chapterUrl);
    if (!directLink) {
      const msg = 'Fshare yêu cầu xác thực hoặc không hỗ trợ tải trực tiếp.';
      log(msg, 'warn');
      return { ok: false, error: msg };
    }

    log(`Đang tải: ${directLink}`, 'info');

    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      try {
        const res = await fetch(directLink, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          redirect: 'follow',
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        response = res;
        break;
      } catch (err) {
        lastError = err.message;
        log(`Lần thử ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!response) {
      return { ok: false, error: lastError || 'Tải file thất bại.' };
    }

    const filename = this.resolveFilename(response, response.url || directLink);
    const filePath = path.join(chapterDir, filename);
    try {
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) {
        const msg = 'File tải về rỗng.';
        log(msg, 'error');
        return { ok: false, error: msg };
      }
      fs.writeFileSync(filePath, buf);
      log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
      const msg = `Lỗi lưu file: ${err.message}`;
      log(msg, 'error');
      return { ok: false, error: msg };
    }

    return { ok: true };
  }
}

// Create service instance
const service = new DtveBookService();

// Export the same API as the original service
module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  
  // Export additional functions for compatibility (if needed by other modules)
  ALLOWED_HOSTNAMES,
  ALLOWED_EXTENSIONS,
  detectSourceType: (url) => service.detectSourceType(url),
  isAllowedDownloadLink: (href) => service.isAllowedDownloadLink(href),
  extractGoogleDriveFileId: (url) => service.extractGoogleDriveFileId(url),
  buildGoogleDriveDownloadUrl: (fileId) => service.buildGoogleDriveDownloadUrl(fileId),
  extractFilenameFromContentDisposition: (header) => service.extractFilenameFromContentDisposition(header),
  isGoogleDriveVirusScanPage: (html) => service.isGoogleDriveVirusScanPage(html),
  extractVirusScanConfirmUrl: (html, fileId) => service.extractVirusScanConfirmUrl(html, fileId),
  parseDtvEbookPage: (html, pageUrl) => service.parseDtvEbookPage(html, pageUrl),
  extractMangaIdFromUrl: (url) => service.extractMangaIdFromUrl(url),
  downloadCoverIfNeeded: (coverUrl, mangaDir, log) => service.downloadCoverIfNeeded(coverUrl, mangaDir, log),
  resolveMangaDir: (baseSaveDir, mangaTitle) => service.resolveMangaDir(baseSaveDir, mangaTitle),
  resolveChapterDir: (baseSaveDir, mangaTitle, chapterTitle, fmt) => service.resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, fmt),
  sanitizeFilename: (name) => service.sanitizeFilename(name),
  resolveMediafireDirectLink: (url) => service.resolveMediafireDirectLink(url),
  resolveOneDriveDirectLink: (url) => service.resolveOneDriveDirectLink(url),
  resolveFshareDirectLink: (url) => service.resolveFshareDirectLink(url),
  isCloudflareChallenge: (html) => service.isCloudflareChallenge(html),
  getDtvEbookImageFetchHeaders: () => {
    const cookie = service._effectiveUserCookie();
    return {
      Referer: DOMAIN,
      ...(cookie ? { Cookie: cookie } : {}),
    };
  },
};