/**
 * MangaVN Service - Forumotion-based manga forum
 * Site: mangavn.forumotion.net
 * 
 * Special handling for Forumotion forum where manga chapters are posted as forum threads
 * with images embedded in posts.
 */
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const cheerio = require('cheerio');

const DOMAIN = 'https://mangavn.forumotion.net/';
const LABEL = 'MangaVN';

// Alternative domains that redirect to main domain
const ALT_DOMAINS = [
  'http://www.mangavn.net/',
  'https://www.mangavn.net/',
  'http://mangavn.net/',
  'https://mangavn.net/',
];

const SELECTORS = {
  chapterLinks: '.post',
  title: '.maintitle, .page-title, h1',
  cover: '.postbody img',
};

/**
 * MangaVN connector service extending HtmlConnectorService.
 * 
 * MangaVN is a Forumotion forum where manga chapters are posted as threads with images
 * embedded in forum posts. This requires custom parsing logic.
 * 
 * Note: MangaVN uses multiple domains:
 * - mangavn.forumotion.net (main forum)
 * - www.mangavn.net (redirect/alias)
 * All URLs are normalized to mangavn.forumotion.net
 */
class MangaVnService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'mangavn',
      selectors: SELECTORS,
    });
  }

  /**
   * Normalize URL to use main domain (mangavn.forumotion.net).
   * Converts www.mangavn.net URLs to mangavn.forumotion.net.
   * 
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    if (!url) return url;
    
    let normalized = url;
    
    // Replace alternative domains with main domain
    for (const altDomain of ALT_DOMAINS) {
      if (normalized.includes(altDomain)) {
        normalized = normalized.replace(altDomain, DOMAIN);
        break;
      }
      // Try without trailing slash
      const altDomainNoSlash = altDomain.replace(/\/$/, '');
      if (normalized.includes(altDomainNoSlash)) {
        normalized = normalized.replace(altDomainNoSlash, DOMAIN.replace(/\/$/, ''));
        break;
      }
    }
    
    return normalized;
  }

  /**
   * Load manga information from URL.
   * 
   * Supports two types of URLs:
   * 1. Forum listing (e.g., https://mangavn.forumotion.net/f5-manga) - lists all threads as chapters
   * 2. Thread URL (e.g., https://mangavn.forumotion.net/t15203-sekirei-chap-1) - single thread with paginated posts
   * 
   * @param {string} url - Forum or thread URL
   * @param {object} [options] - Load options
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    // Normalize URL to main domain
    const normalizedUrl = this.normalizeUrl(trimmed);

    // Detect URL type
    const isForum = /\/f\d+/.test(normalizedUrl);
    const isThread = /\/t\d+/.test(normalizedUrl);

    if (isForum) {
      return this.loadFromForum(normalizedUrl, options);
    } else if (isThread) {
      return this.loadFromThread(normalizedUrl, options);
    } else {
      return { ok: false, error: 'URL không hợp lệ. Vui lòng dùng URL forum hoặc thread từ mangavn.forumotion.net' };
    }
  }

  /**
   * Load manga list from forum category.
   * Each thread becomes a chapter.
   * 
   * @param {string} url - Forum URL (e.g., https://mangavn.forumotion.net/f5-manga)
   * @param {object} [options] - Load options
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async loadFromForum(url, options = {}) {
    const fetched = await fetchHtml(url, options);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang forum.' };
    }

    const $ = cheerio.load(fetched.html);
    
    // Extract title from page title or breadcrumb
    let title = $('.maintitle, .page-title').first().text().trim();
    if (!title) {
      title = $('h1').first().text().trim();
    }
    if (!title) {
      title = $('title').text().split('::')[0].split('-')[0].trim();
    }
    
    if (!title) {
      title = 'MangaVN Forum';
    }

    // Extract cover from first thread's first image (if available)
    let coverUrl = '';

    // Build chapter list from threads
    const chapters = [];
    
    // Forumotion uses .topictitle for thread links
    $('.topictitle').each((i, el) => {
      const $link = $(el);
      const chapterUrl = $link.attr('href');
      const chapterTitle = $link.text().trim();
      
      if (chapterUrl && chapterTitle) {
        // Make absolute URL
        let absoluteUrl = chapterUrl.startsWith('http') 
          ? chapterUrl 
          : new URL(chapterUrl, DOMAIN).href;
        
        // Normalize to main domain
        absoluteUrl = this.normalizeUrl(absoluteUrl);
        
        chapters.push({
          url: absoluteUrl,
          title: chapterTitle,
        });
      }
    });

    if (chapters.length === 0) {
      return { ok: false, error: 'Không tìm thấy chapter nào trong forum này.' };
    }

    // Check for pagination
    const paginationLinks = $('.pagination a, .gen a');
    const pageNumbers = [];
    paginationLinks.each((i, el) => {
      const text = $(el).text().trim();
      const num = parseInt(text);
      if (!isNaN(num)) {
        pageNumbers.push(num);
      }
    });
    
    if (pageNumbers.length > 0) {
      const lastPageNum = Math.max(...pageNumbers);
      
      // Load additional pages (limit to 5 pages for performance)
      for (let page = 2; page <= Math.min(lastPageNum, 5); page++) {
        // Forumotion pagination format: ?start=15, ?start=30, etc.
        const pageUrl = url.includes('?') 
          ? `${url}&start=${(page - 1) * 15}`
          : `${url}?start=${(page - 1) * 15}`;
        
        const pageFetched = await fetchHtml(pageUrl, options);
        if (pageFetched.ok) {
          const $page = cheerio.load(pageFetched.html);
          $page('.topictitle').each((i, el) => {
            const $link = $page(el);
            const chapterUrl = $link.attr('href');
            const chapterTitle = $link.text().trim();
            
            if (chapterUrl && chapterTitle) {
              let absoluteUrl = chapterUrl.startsWith('http') 
                ? chapterUrl 
                : new URL(chapterUrl, DOMAIN).href;
              
              // Normalize to main domain
              absoluteUrl = this.normalizeUrl(absoluteUrl);
              
              chapters.push({
                url: absoluteUrl,
                title: chapterTitle,
              });
            }
          });
        }
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: url,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters,
    };
  }

  /**
   * Load manga from single thread.
   * 
   * MangaVN has two types of thread pages:
   * 1. Manga info page with chapter list table (e.g., /t15202-sekirei)
   * 2. Individual chapter page with images (e.g., /t15203-sekirei-chap-1)
   * 
   * @param {string} url - Thread URL
   * @param {object} [options] - Load options
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async loadFromThread(url, options = {}) {
    const fetched = await fetchHtml(url, options);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang thread.' };
    }

    const $ = cheerio.load(fetched.html);
    
    // Extract title - try multiple selectors
    let title = '';
    
    // Try manga info page title (h2.topic_x_show a.ten_t)
    const mangaTitleEl = $('h2.topic_x_show a.ten_t').first();
    if (mangaTitleEl.length) {
      title = mangaTitleEl.text().trim();
    }
    
    // Fallback to <title> tag
    if (!title) {
      title = $('title').text().trim();
    }
    
    // Fallback to h1
    if (!title || title.includes('MangaVN.net')) {
      const h1Text = $('h1').first().text().trim();
      if (h1Text && !h1Text.includes('MangaVN.net')) {
        title = h1Text;
      }
    }
    
    if (!title || title.includes('MangaVN.net')) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // Extract cover from manga info page
    let coverUrl = '';
    const coverImg = $('.img_truyen img').first();
    if (coverImg.length) {
      coverUrl = coverImg.attr('src') || coverImg.attr('data-src') || '';
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = new URL(coverUrl, DOMAIN).href;
      }
    }

    // Check if this is a manga info page with chapter list
    const chapterTable = $('table.listing');
    if (chapterTable.length > 0) {
      // This is a manga info page - extract chapter list from table
      return this.loadChaptersFromTable($, title, coverUrl, url);
    } else {
      // This is a single chapter page - treat as single chapter
      return this.loadSingleChapterPage($, title, coverUrl, url);
    }
  }

  /**
   * Load chapters from manga info page table.
   * 
   * @param {object} $ - Cheerio instance
   * @param {string} title - Manga title
   * @param {string} coverUrl - Cover image URL
   * @param {string} url - Page URL
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async loadChaptersFromTable($, title, coverUrl, url) {
    const chapters = [];
    
    // Extract chapters from table rows
    $('table.listing tr').each((i, el) => {
      const $row = $(el);
      const $link = $row.find('td a[href*="/t"]').first();
      
      if ($link.length) {
        const chapterUrl = $link.attr('href');
        const chapterTitle = $link.text().trim();
        
        if (chapterUrl && chapterTitle) {
          // Make absolute URL
          let absoluteUrl = chapterUrl.startsWith('http') 
            ? chapterUrl 
            : new URL(chapterUrl, DOMAIN).href;
          
          // Normalize to main domain
          absoluteUrl = this.normalizeUrl(absoluteUrl);
          
          chapters.push({
            url: absoluteUrl,
            title: chapterTitle,
          });
        }
      }
    });

    if (chapters.length === 0) {
      return { ok: false, error: 'Không tìm thấy chapter nào.' };
    }

    // Check for pagination in chapter list
    let maxOffset = 0;
    let baseThreadId = '';
    let threadSlug = '';
    
    $('p.paging a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/t(\d+)p(\d+)-(.*)/);
      if (match) {
        baseThreadId = match[1];
        const offset = parseInt(match[2], 10);
        if (offset > maxOffset) maxOffset = offset;
        threadSlug = match[3];
      }
    });
    
    if (!baseThreadId) {
      const match = url.match(/\/t(\d+)-(.*)/);
      if (match) {
        baseThreadId = match[1];
        threadSlug = match[2];
      }
    }
    
    if (baseThreadId && threadSlug && maxOffset > 0) {
      for (let offset = 50; offset <= maxOffset; offset += 50) {
        const pageUrl = `${DOMAIN}t${baseThreadId}p${offset}-${threadSlug}`;
        const pageFetched = await fetchHtml(pageUrl);
        if (pageFetched.ok) {
          const $page = cheerio.load(pageFetched.html);
          $page('table.listing tr').each((i, el) => {
            const $row = $page(el);
            const $link = $row.find('td a[href*="/t"]').first();
            
            if ($link.length) {
              const chapterUrl = $link.attr('href');
              const chapterTitle = $link.text().trim();
              
              if (chapterUrl && chapterTitle) {
                let absoluteUrl = chapterUrl.startsWith('http') 
                  ? chapterUrl 
                  : new URL(chapterUrl, DOMAIN).href;
                absoluteUrl = this.normalizeUrl(absoluteUrl);
                chapters.push({ url: absoluteUrl, title: chapterTitle });
              }
            }
          });
        }
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: url,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters,
    };
  }

  /**
   * Load single chapter page (fallback for individual chapter URLs).
   * 
   * @param {object} $ - Cheerio instance
   * @param {string} title - Chapter title
   * @param {string} coverUrl - Cover image URL
   * @param {string} url - Page URL
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async loadSingleChapterPage($, title, coverUrl, url) {
    const chapters = [];
    
    // Current page as a chapter
    chapters.push({
      url: url,
      title: title,
    });

    // Check for pagination within the chapter
    const paginationLinks = $('.pagination a, .gen a');
    const pageNumbers = [];
    paginationLinks.each((i, el) => {
      const text = $(el).text().trim();
      const num = parseInt(text);
      if (!isNaN(num)) {
        pageNumbers.push(num);
      }
    });
    
    if (pageNumbers.length > 0) {
      const lastPageNum = Math.max(...pageNumbers);
      
      // Add additional pages as separate chapters
      for (let page = 2; page <= lastPageNum; page++) {
        const pageUrl = url.includes('?') 
          ? `${url}&start=${(page - 1) * 15}`
          : `${url}?start=${(page - 1) * 15}`;
        chapters.push({
          url: pageUrl,
          title: `${title} - Trang ${page}`,
        });
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: url,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters,
    };
  }

  /**
   * Fetch chapter images from thread page.
   * 
   * Extracts all images from forum posts on the page.
   * 
   * @param {string} chapterUrl - Thread page URL
   * @param {string} referer - Referer header
   * @returns {Promise<Array>} Array of image objects
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const $ = cheerio.load(fetched.html);
    const images = [];

    // Extract images from chapter content
    // MangaVN uses .img_truyen for chapter images
    const selectors = [
      '.img_truyen img',           // Main chapter images container
      '#main-content img',         // Fallback: all images in main content
      '.main.paged img',           // Alternative container
    ];
    
    let foundImages = false;
    for (const selector of selectors) {
      const $images = $(selector);
      if ($images.length > 0) {
        $images.each((i, el) => {
          let src = $(el).attr('src') || $(el).attr('data-src') || '';
          
          if (!src) return;
          
          // Skip small icons, avatars, and navigation buttons
          const width = $(el).attr('width');
          const height = $(el).attr('height');
          if (width && height && parseInt(width) < 100 && parseInt(height) < 100) {
            return;
          }

          // Skip common icon/button patterns
          if (src.includes('/smilies/') || 
              src.includes('/icon/') || 
              src.includes('avatar') ||
              src.includes('previo') ||
              src.includes('next') ||
              src.includes('user-s')) {
            return;
          }

          // Make absolute URL
          if (!src.startsWith('http')) {
            src = new URL(src, DOMAIN).href;
          }

          // Determine extension
          let ext = 'jpg';
          try {
            const urlPath = new URL(src).pathname;
            const match = urlPath.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (match) {
              ext = match[1].toLowerCase();
            }
          } catch {
            // Keep default
          }

          images.push({
            imageUrl: src,
            ext,
          });
        });
        
        if (images.length > 0) {
          foundImages = true;
          break; // Stop after finding images with first working selector
        }
      }
    }

    return images;
  }
}

// Create singleton instance
const service = new MangaVnService();

/**
 * Load manga information from URL.
 * @param {string} url - Thread URL
 * @param {object} [options] - Load options
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 * @param {object} payload - Download configuration
 * @param {string} [connector] - Connector label override
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array, skipped?: boolean, aborted?: boolean, error?: string}>}
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  normalizeUrl: (url) => service.normalizeUrl(url),
};
