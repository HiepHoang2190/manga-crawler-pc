/**
 * Dilib Service - Migrated to HtmlConnectorService
 * Site: dilib.vn
 * 
 * Special connector for Dilib.vn - a digital library for ebooks/audiobooks.
 * Unlike traditional manga sites, Dilib provides direct download links for files
 * (CBZ, PDF, EPUB, etc.) rather than individual chapter images.
 */
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml, USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const { loadOrCreate } = require('../../storage/downloadDb');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');

const DOMAIN = 'https://dilib.vn/';
const LABEL = 'Dilib';
const SITE_ID = 'dilib';

// No CF session needed anymore, handled natively

/**
 * Check if HTML contains Cloudflare challenge.
 */
function isCloudflareChallenge(html) {
  if (!html || typeof html !== 'string') return false;
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('jschl-answer') ||
    html.includes('Checking your browser') ||
    html.includes('DDoS protection by Cloudflare') ||
    (html.includes('cloudflare') && html.includes('challenge'))
  );
}

/**
 * Resolve relative URL to absolute URL.
 */
function resolveAbsoluteUrl(url, baseUrl) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return '';
  }
}

/**
 * Extract manga ID from Dilib URL.
 */
function extractMangaIdFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const m = url.match(/-(\d+)\.html(?:[?#].*)?$/i);
  if (m) return m[1];
  const m2 = url.match(/(\d+)(?:\.html)?(?:[?#].*)?$/i);
  if (m2) return m2[1];
  return '';
}

/**
 * Check if URL is a valid download link.
 */
function isValidDownloadLink(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();

    // Dilib.vn internal download links
    if (hostname.includes('dilib.vn') && (pathname.includes('/download/') || pathname.includes('/audio/'))) {
      return true;
    }

    // Supported domains
    const supportedDomains = [
      'drive.google.com',
      'docs.google.com',
      'mediafire.com',
      'fshare.vn',
      'onedrive.live.com',
      '1drv.ms',
      'dropbox.com',
      'mega.nz'
    ];

    if (supportedDomains.some(domain => hostname.includes(domain))) {
      return true;
    }

    // Supported extensions
    const supportedExtensions = ['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.zip', '.rar', '.cbz', '.cbr'];
    if (supportedExtensions.some(ext => pathname.endsWith(ext))) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Dilib connector service extending HtmlConnectorService.
 * Overrides both load() and downloadChapter() for custom file download logic.
 */
class DiliberService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      selectors: {
        // Basic selectors - will be overridden in custom load()
        chapterLinks: 'a',
        title: 'h1',
        cover: 'img',
      },
      requiresCookie: true,
    });
  }

  /**
   * Custom load implementation for Dilib.vn.
   * Parses ebook/audiobook pages with download links.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched = await fetchHtml(trimmed, {
      siteId: SITE_ID,
      requiresCookie: true,
      ...options
    });
    
    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.error || 'Không tải được trang truyện.',
      };
    }
    const html = fetched.html;

    const { title, coverUrl, chapters } = this.parseDilibPage(html, trimmed);

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    if (chapters.length === 0) {
      return { 
        ok: false, 
        error: 'Không tìm thấy download links.\n\nLưu ý: Dilib.vn chủ yếu là thư viện ebook/audiobook.\n- Tìm link "Tải Truyện CBZ" để tải toàn bộ truyện\n- Hoặc các link download PDF/EPUB cho ebook\n- Chương riêng lẻ có thể chỉ để đọc online' 
      };
    }

    const mangaId = extractMangaIdFromUrl(trimmed);

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId,
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Parse Dilib.vn page for title, cover, and download links.
   */
  parseDilibPage(html, pageUrl) {
    const $ = cheerio.load(html);

    // Parse title
    let title = '';
    const titleSelectors = [
      'h1.book-title',
      'h1[itemprop="name"]',
      'h1.title',
      '.book-info h1',
      '.content-header h1',
      'h1',
      'h2.book-title',
      '.book-name',
      '.title'
    ];

    for (const selector of titleSelectors) {
      const $el = $(selector).first();
      if ($el.length) {
        const text = $el.text().trim();
        if (text && !text.toLowerCase().includes('dilib')) {
          title = text;
          break;
        }
      }
    }

    if (!title) {
      const rawTitle = $('title').first().text().trim();
      title = rawTitle.replace(/\s*[-|].*dilib.*$/i, '').trim();
    }

    // Parse cover URL
    let coverUrl = '';
    const coverSelectors = [
      'img.book-cover',
      '.book-cover img',
      'img.cover',
      '.cover img',
      '.book-image img',
      '.thumbnail img',
      'img[alt*="cover"]',
      'img[alt*="bìa"]'
    ];

    for (const selector of coverSelectors) {
      const $img = $(selector).first();
      if ($img.length) {
        const src = ($img.attr('src') || $img.attr('data-src') || '').trim();
        if (src) {
          coverUrl = resolveAbsoluteUrl(src, pageUrl);
          break;
        }
      }
    }

    if (!coverUrl) {
      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) {
        coverUrl = resolveAbsoluteUrl(ogImage, pageUrl);
      }
    }

    // Parse download links
    const chapters = [];
    const seenUrls = new Set();

    // 1. Find "Tải Truyện CBZ" links for manga
    $('a').each((_, el) => {
      const $a = $(el);
      const text = $a.text().trim().toLowerCase();
      let href = ($a.attr('href') || '').trim();
      
      if (text.includes('tải truyện cbz') || text.includes('tải cbz')) {
        if (href) {
          href = resolveAbsoluteUrl(href, pageUrl);
          if (href && !seenUrls.has(href)) {
            seenUrls.add(href);
            chapters.push({ url: href, title: 'Tải Truyện CBZ' });
          }
        }
      }
    });

    // 2. Find chapter links for manga
    $('a[href*="chap-"]').each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      const text = $a.text().trim();
      
      if (href && text.match(/chap\s*\d+/i)) {
        href = resolveAbsoluteUrl(href, pageUrl);
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          chapters.push({ url: href, title: text });
        }
      }
    });

    // 3. Find other download links
    const downloadSelectors = [
      'a.button2[href*="/download/"]',
      'a[href*="/download/"]',
      'a[href*="/audio/"]',
      '.download-links a',
      '.download-section a',
      '.book-downloads a',
      '.file-downloads a',
      'a[href*="download"]',
      'a[href*=".pdf"]',
      'a[href*=".epub"]',
      'a[href*=".mobi"]',
      'a[href*=".zip"]',
      'a[href*=".cbz"]',
      'a[href*="drive.google.com"]',
      'a[href*="mediafire.com"]',
      'a[href*="fshare.vn"]'
    ];

    for (const selector of downloadSelectors) {
      $(selector).each((_, el) => {
        const $a = $(el);
        let href = ($a.attr('href') || '').trim();
        if (!href) return;

        href = resolveAbsoluteUrl(href, pageUrl);
        if (!href || seenUrls.has(href)) return;

        if (isValidDownloadLink(href)) {
          seenUrls.add(href);
          const linkText = $a.text().trim() || 'Download';
          chapters.push({ url: href, title: linkText });
        }
      });
    }

    return { title, coverUrl, chapters };
  }

  /**
   * Custom downloadChapter implementation for Dilib.vn.
   * Handles file downloads instead of image downloads.
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

    const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
    const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
    const dbChapterTitle = formatChapterTitle(chapterTitle);

    fs.mkdirSync(chapterDir, { recursive: true });

    // Step 1: Download cover
    await downloadCoverIfNeeded(coverUrl, mangaDir, DOMAIN, USER_AGENT, log);

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
      log('File đã tải hoàn chỉnh, bỏ qua.', 'info');
      return { ok: true, skipped: true };
    }

    // Step 4: Download file
    report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: 1 });

    const isDilibInternalLink = chapterUrl.includes('dilib.vn') && (chapterUrl.includes('/download/') || chapterUrl.includes('/audio/'));
    const isChapterLink = chapterUrl.includes('dilib.vn') && chapterUrl.includes('-chap-');
    
    if (isDilibInternalLink) {
      // Handle Dilib internal download links
      log(`Đang resolve redirect: ${chapterUrl}`, 'info');
      const resolvedUrl = await this.resolveDilibRedirect(chapterUrl, log);
      if (!resolvedUrl) {
        return { ok: false, error: 'Không resolve được link tải từ dilib.vn.' };
      }
      log(`Resolved → ${resolvedUrl}`, 'info');
      const downloadResult = await this.downloadBySourceType(resolvedUrl, chapterDir, log, shouldAbort);
      if (!downloadResult.ok) {
        return downloadResult;
      }
    } else if (isChapterLink) {
      // Handle chapter links - try to fetch images
      log(`Đang kiểm tra chương: ${chapterUrl}`, 'info');
      
      try {
        const chapterResult = await this.fetchDilibChapterImages(chapterUrl, chapterDir, log, shouldAbort, report, mangaTitle, chapterTitle);
        if (chapterResult.ok && chapterResult.imageCount > 0) {
          log(`Đã tải ${chapterResult.imageCount} ảnh từ chương`, 'success');
          // Mark as completed and return
          if (!db.record.chapters[dbChapterTitle]) {
            db.record.chapters[dbChapterTitle] = {
              url: chapterUrl,
              status: 'downloading',
              expectedFileCount: chapterResult.imageCount,
              downloadedAt: '',
              pages: [],
            };
          }
          db.markChapterCompleted(dbChapterTitle);
          report({ mangaTitle, chapterTitle, chapterUrl, current: chapterResult.imageCount, total: chapterResult.imageCount });
          return { ok: true, successCount: chapterResult.imageCount, totalPages: chapterResult.imageCount };
        }
      } catch (err) {
        log(`Lỗi khi tải chương: ${err.message}`, 'warn');
      }
      
      // Create info file if no images found
      log(`Chương không chứa ảnh có thể tải. Tạo file hướng dẫn.`, 'warn');
      const linkFilePath = path.join(chapterDir, 'chapter_info.txt');
      const linkContent = `Dilib.vn Chapter Link:\n${chapterUrl}\n\nLưu ý: Chương này không chứa ảnh có thể tải trực tiếp.\nĐể đọc chương này, vui lòng:\n1. Truy cập link trên bằng trình duyệt\n2. Hoặc sử dụng link "Tải Truyện CBZ" để tải toàn bộ truyện\n\nDilib.vn chủ yếu là thư viện ebook/audiobook, không phải site manga truyền thống.`;
      
      try {
        fs.writeFileSync(linkFilePath, linkContent, 'utf8');
        log(`Đã tạo file hướng dẫn: chapter_info.txt`, 'info');
      } catch (err) {
        log(`Lỗi tạo file hướng dẫn: ${err.message}`, 'error');
        return { ok: false, error: `Lỗi tạo file hướng dẫn: ${err.message}` };
      }
    } else {
      // Create link file for external links
      log(`Link bên ngoài, tạo file hướng dẫn: ${chapterUrl}`, 'info');
      const linkFilePath = path.join(chapterDir, 'download_link.txt');
      const linkContent = `Dilib.vn Download Link:\n${chapterUrl}\n\nLưu ý: Đây là link bên ngoài.\nVui lòng truy cập link trên để download thủ công.`;
      
      try {
        fs.writeFileSync(linkFilePath, linkContent, 'utf8');
        log(`Đã tạo file link: download_link.txt`, 'info');
      } catch (err) {
        log(`Lỗi tạo file link: ${err.message}`, 'error');
        return { ok: false, error: `Lỗi tạo file link: ${err.message}` };
      }
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

  /**
   * Not used for Dilib - overridden by custom downloadChapter.
   */
  async fetchChapterImages(chapterUrl, referer) {
    // This method is overridden by the custom downloadChapter implementation
    // but we need to provide it for chapter image fetching in some cases
    return this.fetchDilibChapterImages(chapterUrl, referer);
  }

  /**
   * Follow redirect from dilib.vn internal links to get actual URL.
   */
  async resolveDilibRedirect(url, log) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': DOMAIN,
        },
        redirect: 'follow',
      });

      const finalUrl = res.url || url;
      if (finalUrl && finalUrl !== url) {
        return finalUrl;
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const html = await res.text();
        const gdMatch = html.match(/https:\/\/drive\.google\.com\/[^\s"'<>]+/);
        if (gdMatch) return gdMatch[0].replace(/&amp;/g, '&');
        const dlMatch = html.match(/href="(https?:\/\/[^\s"'<>]+\.(cbz|zip|pdf|epub|rar))[^"']*/i);
        if (dlMatch) return dlMatch[1];
      }

      if (!contentType.includes('text/html')) {
        return finalUrl;
      }

      return null;
    } catch (err) {
      log(`Lỗi resolve redirect: ${err.message}`, 'warn');
      return null;
    }
  }

  /**
   * Download file by detecting source type and using appropriate handler.
   */
  async downloadBySourceType(url, chapterDir, log, shouldAbort) {
    try {
      const u = new URL(url);
      const hostname = u.hostname.toLowerCase();

      if (hostname.includes('google.com')) {
        return await this.downloadGoogleDrive(url, chapterDir, log, shouldAbort);
      }
      if (hostname.includes('mediafire.com')) {
        return await this.downloadMediafire(url, chapterDir, log, shouldAbort);
      }
      if (hostname === 'onedrive.live.com' || hostname === '1drv.ms') {
        return await this.downloadOneDrive(url, chapterDir, log, shouldAbort);
      }
      if (hostname.includes('fshare.vn')) {
        return await this.downloadFshare(url, chapterDir, log, shouldAbort);
      }
      return await this.downloadDirect(url, chapterDir, log, shouldAbort);
    } catch {
      return await this.downloadDirect(url, chapterDir, log, shouldAbort);
    }
  }

  /**
   * Fetch images from Dilib chapter page.
   */
  async fetchDilibChapterImages(chapterUrl, chapterDir, log, shouldAbort, report, mangaTitle, chapterTitle) {
    const fetched = await fetchHtml(chapterUrl, {
      siteId: SITE_ID,
      requiresCookie: true,
    });
    
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang chương' };
    }
    
    const html = fetched.html;

    if (!html) {
      return { ok: false, error: 'Không có nội dung HTML' };
    }

    const $ = cheerio.load(html);
    const imageUrls = [];
    const seenUrls = new Set();

    // Process images with filtering logic
    function processImage($img) {
      const src = ($img.attr('src') || $img.attr('data-src') || '').trim();
      const alt = ($img.attr('alt') || '').trim().toLowerCase();
      const className = ($img.attr('class') || '').trim().toLowerCase();
      
      if (!src || seenUrls.has(src)) return;
      
      const absoluteUrl = resolveAbsoluteUrl(src, chapterUrl);
      if (!absoluteUrl) return;
      
      if (!absoluteUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)) return;
      
      const url = absoluteUrl.toLowerCase();
      
      // Skip non-content images
      const skipUrlPatterns = [
        'cover', 'logo', 'banner', 'header', 'footer', 'sidebar', 'menu',
        'icon', 'avatar', 'profile', 'thumb', 'thumbnail', 'preview',
        'ad', 'ads', 'advertisement', 'promo', 'sponsor',
        'facebook', 'twitter', 'youtube', 'social',
        'qr', 'barcode', 'donate', 'support', 'paypal',
        'button', 'arrow', 'next', 'prev', 'back',
        'loading', 'spinner', 'placeholder'
      ];
      
      if (skipUrlPatterns.some(pattern => url.includes(pattern))) return;
      
      const skipAltPatterns = [
        'logo', 'banner', 'quảng cáo', 'advertisement', 'ad',
        'facebook', 'twitter', 'youtube', 'social',
        'donate', 'ủng hộ', 'support', 'paypal',
        'icon', 'button', 'menu', 'header', 'footer'
      ];
      
      if (skipAltPatterns.some(pattern => alt.includes(pattern))) return;
      
      const skipClassPatterns = [
        'logo', 'banner', 'ad', 'advertisement', 'promo',
        'social', 'icon', 'button', 'menu', 'header', 'footer',
        'sidebar', 'widget', 'thumbnail', 'avatar'
      ];
      
      if (skipClassPatterns.some(pattern => className.includes(pattern))) return;
      
      const width = parseInt($img.attr('width') || '0');
      const height = parseInt($img.attr('height') || '0');
      
      if ((width > 0 && width < 100) || (height > 0 && height < 100)) return;
      
      const $parent = $img.closest('.header, .footer, .sidebar, .menu, .nav, .advertisement, .ad, .social, .widget, .banner');
      if ($parent.length > 0) return;
      
      seenUrls.add(src);
      imageUrls.push(absoluteUrl);
    }

    // Look for images in content areas first
    const contentSelectors = [
      '.content img', '.main img', '.article img', '.post img', 
      '.chapter img', '.page img', '.manga img', '.comic img', 
      '.story img', '.reader img', '.pages img', '.chapter-content img',
      '#content img', '#main img', '#article img', '#chapter img'
    ];

    let foundInContent = false;
    
    for (const selector of contentSelectors) {
      const $imgs = $(selector);
      if ($imgs.length > 0) {
        foundInContent = true;
        $imgs.each((_, el) => {
          processImage($(el));
        });
        break;
      }
    }
    
    if (!foundInContent) {
      $('img').each((_, el) => {
        processImage($(el));
      });
    }

    if (imageUrls.length === 0) {
      return { ok: false, error: 'Không tìm thấy ảnh trong chương' };
    }

    log(`Tìm thấy ${imageUrls.length} ảnh tiềm năng, đang lọc và tải...`, 'info');

    // Report initial progress
    if (typeof report === 'function') {
      report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: imageUrls.length });
    }

    let downloadedCount = 0;
    let pageNumber = 1;
    
    for (let i = 0; i < imageUrls.length; i++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }

      const imageUrl = imageUrls[i];
      log(`Đang kiểm tra ảnh ${i + 1}/${imageUrls.length}: ${imageUrl}`, 'info');

      try {
        const res = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': chapterUrl,
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
          timeout: 30000,
        });

        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          
          if (buf.length < 5000) {
            log(`Bỏ qua ảnh nhỏ: ${(buf.length / 1024).toFixed(1)} KB`, 'info');
            continue;
          }
          
          if (buf.length > 10 * 1024 * 1024) {
            log(`Bỏ qua ảnh quá lớn: ${(buf.length / 1024 / 1024).toFixed(1)} MB`, 'info');
            continue;
          }
          
          const isValidImage = (
            (buf[0] === 0xFF && buf[1] === 0xD8) || // JPEG
            (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) || // PNG
            (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) || // GIF
            (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) // WebP
          );
          
          if (!isValidImage) {
            log(`Bỏ qua file không phải ảnh hợp lệ`, 'info');
            continue;
          }
          
          const filename = `page_${String(pageNumber).padStart(3, '0')}.jpg`;
          const imagePath = path.join(chapterDir, filename);
          
          fs.writeFileSync(imagePath, buf);
          downloadedCount++;
          pageNumber++;
          log(`Đã lưu: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`, 'success');
          
          // Report progress after each successful download
          if (typeof report === 'function') {
            report({ mangaTitle, chapterTitle, chapterUrl, current: downloadedCount, total: imageUrls.length });
          }
        } else {
          log(`HTTP ${res.status} cho ảnh ${i + 1}`, 'warn');
        }
      } catch (err) {
        log(`Lỗi tải ảnh ${i + 1}: ${err.message}`, 'warn');
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    }

    return { ok: downloadedCount > 0, imageCount: downloadedCount };
  }

  // File download handlers
  async downloadGoogleDrive(chapterUrl, chapterDir, log, shouldAbort) {
    let fileId = null;
    const filePathMatch = chapterUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch) fileId = filePathMatch[1];
    if (!fileId) {
      try { fileId = new URL(chapterUrl).searchParams.get('id'); } catch {}
    }
    if (!fileId) {
      const ucMatch = chapterUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (ucMatch) fileId = ucMatch[1];
    }
    if (!fileId) return { ok: false, error: `Không lấy được Google Drive file ID từ: ${chapterUrl}` };

    const isUcontent = chapterUrl.includes('drive.usercontent.google.com');
    const downloadUrl = isUcontent
      ? chapterUrl
      : `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;

    log(`Google Drive: ${downloadUrl}`, 'info');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: DOMAIN,
    };
    
    const result = await this.fetchWithRetry(downloadUrl, headers, log, shouldAbort, 'GDrive');
    if (!result.ok) {
      if (result.error && (result.error.includes('HTTP 500') || result.error.includes('HTTP 403'))) {
        result.error += ' (Lưu ý: Nếu link Google Drive là một "Thư Mục" (Folder), ứng dụng sẽ không thể tải. Vui lòng tải thủ công trên trình duyệt)';
      }
      return result;
    }

    const res = result.response;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await res.text();
      const actionMatch = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]*)"/i);
      const formAction = actionMatch
        ? actionMatch[1].replace(/&amp;/g, '&')
        : 'https://drive.usercontent.google.com/download';

      const params = new URLSearchParams();
      const inputRegex = /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"[^>]*>/gi;
      let m;
      while ((m = inputRegex.exec(html)) !== null) {
        params.set(m[1], m[2]);
      }
      if (!params.has('confirm')) params.set('confirm', 't');

      log(`Virus scan confirm GET: ${formAction}?${params.toString()}`, 'info');

      if (typeof shouldAbort === 'function' && shouldAbort()) return { ok: false, aborted: true };

      const confirmGetUrl = `${formAction}?${params.toString()}`;
      let confirmRes = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          confirmRes = await fetch(confirmGetUrl, {
            method: 'GET',
            headers,
            redirect: 'follow',
          });
          if (confirmRes.ok) break;
          lastErr = `HTTP ${confirmRes.status}`;
          log(`GDrive confirm lần ${attempt}: ${lastErr}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          lastErr = err.message;
          log(`GDrive confirm lần ${attempt}: ${lastErr}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
        }
      }
      if (!confirmRes || !confirmRes.ok) {
        return { ok: false, error: lastErr || 'Không tải được file từ Google Drive.' };
      }
      const confirmContentType = confirmRes.headers.get('content-type') || '';
      if (confirmContentType.includes('text/html')) {
        return {
          ok: false,
          error: 'Google Drive yêu cầu đăng nhập để tải file này (thường do file quá lớn >100MB).\n\nVui lòng:\n1. Mở link trong trình duyệt: ' + downloadUrl + '\n2. Đăng nhập Google và tải thủ công',
        };
      }
      return this.saveResponse(confirmRes, chapterDir, log);
    }

    return this.saveResponse(res, chapterDir, log);
  }

  async downloadDirect(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Direct download: ${chapterUrl}`, 'info');
    const headers = { 'User-Agent': 'Mozilla/5.0', Referer: DOMAIN };
    const result = await this.fetchWithRetry(chapterUrl, headers, log, shouldAbort, 'Direct');
    if (!result.ok) return result;
    return this.saveResponse(result.response, chapterDir, log);
  }

  async downloadMediafire(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Mediafire: ${chapterUrl}`, 'info');
    try {
      const res = await fetch(chapterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      const $ = cheerio.load(html);
      const directLink = ($('a#downloadButton').attr('href') || $('a.dlbutton').attr('href') || '').trim();
      if (!directLink) return { ok: false, error: 'Không lấy được link Mediafire.' };
      const r2 = await this.fetchWithRetry(directLink, { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.mediafire.com/' }, log, shouldAbort, 'Mediafire');
      if (!r2.ok) return r2;
      return this.saveResponse(r2.response, chapterDir, log);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async downloadOneDrive(chapterUrl, chapterDir, log, shouldAbort) {
    log(`OneDrive: ${chapterUrl}`, 'info');
    try {
      let expandedUrl = chapterUrl;
      const u = new URL(chapterUrl);
      if (u.hostname === '1drv.ms') {
        const headRes = await fetch(chapterUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
        expandedUrl = headRes.url || chapterUrl;
      }
      const expanded = new URL(expandedUrl);
      const resid = expanded.searchParams.get('resid');
      const authkey = expanded.searchParams.get('authkey');
      const directLink = resid && authkey
        ? `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(authkey)}`
        : `${expandedUrl.split('?')[0]}?download=1`;
      const result = await this.fetchWithRetry(directLink, { 'User-Agent': 'Mozilla/5.0' }, log, shouldAbort, 'OneDrive');
      if (!result.ok) return result;
      return this.saveResponse(result.response, chapterDir, log);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async downloadFshare(chapterUrl, chapterDir, log, shouldAbort) {
    log(`Fshare: ${chapterUrl}`, 'info');
    try {
      const res = await fetch('https://api.fshare.vn/api/session/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ url: chapterUrl }),
      });
      if (!res.ok) return { ok: false, error: 'Fshare API thất bại.' };
      const json = await res.json();
      if (!json?.location) return { ok: false, error: 'Fshare yêu cầu xác thực.' };
      const result = await this.fetchWithRetry(json.location, { 'User-Agent': 'Mozilla/5.0' }, log, shouldAbort, 'Fshare');
      if (!result.ok) return result;
      return this.saveResponse(result.response, chapterDir, log);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async fetchWithRetry(url, headers, log, shouldAbort, label = '') {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) return { ok: false, aborted: true };
      try {
        const res = await fetch(url, { headers, redirect: 'follow' });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          log(`${label} lần ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        return { ok: true, response: res };
      } catch (err) {
        lastError = err.message;
        log(`${label} lần ${attempt}: ${lastError}`, attempt < 3 ? 'warn' : 'error');
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    return { ok: false, error: lastError || 'Tải thất bại.' };
  }

  sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  }

  resolveFilename(response, finalUrl) {
    const cd = response.headers.get('content-disposition') || '';
    if (cd) {
      const starMatch = cd.match(/filename\*\s*=\s*(?:[a-zA-Z0-9-]+'')?([^;]+)/i);
      if (starMatch) {
        try { const d = decodeURIComponent(starMatch[1].trim()); if (d) return d; } catch {}
      }
      const plainMatch = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
      if (plainMatch) {
        const n = plainMatch[1].trim();
        if (n) {
          try { const r = Buffer.from(n, 'latin1').toString('utf8'); if (!r.includes('\uFFFD')) return r; } catch {}
          return n;
        }
      }
    }
    try {
      const seg = new URL(finalUrl).pathname.split('/').filter(Boolean).pop() || '';
      const s = this.sanitizeFilename(seg);
      if (s) return s;
    } catch {}
    return 'download.cbz';
  }

  async saveResponse(response, chapterDir, log) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return { ok: false, error: 'Server trả về HTML thay vì file. File có thể yêu cầu đăng nhập hoặc quá lớn để tải tự động.' };
    }
    const filename = this.resolveFilename(response, response.url || '');
    const filePath = path.join(chapterDir, filename);
    const buf = Buffer.from(await response.arrayBuffer());
    if (!buf.length) return { ok: false, error: 'File tải về rỗng.' };
    fs.writeFileSync(filePath, buf);
    log(`Đã lưu: ${filename} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
    return { ok: true };
  }
}

// Create singleton instance
const service = new DiliberService();

/**
 * Load manga information from URL.
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  extractMangaIdFromUrl,
  isValidDownloadLink,
  load,
  downloadChapter,
};