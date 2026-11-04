/**
 * Chap.vn Service - Forum-based manga reader
 * Site: chap.vn
 * 
 * Special handling for forum-based manga where chapters are posted as forum threads
 * with images embedded in posts.
 */
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const cheerio = require('cheerio');

const DOMAIN = 'https://chap.vn/';
const LABEL = 'Chap.vn';

const SELECTORS = {
  chapterLinks: 'ol.messageList li.message',
  title: 'h1.title, .titleBar h1',
  cover: 'article img.bbCodeImage, blockquote.messageText img.bbCodeImage',
};

/**
 * Chap.vn connector service extending HtmlConnectorService.
 * 
 * Chap.vn is a forum where manga chapters are posted as threads with images
 * embedded in forum posts. This requires custom parsing logic.
 */
class ChapVnService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'chapvn',
      selectors: SELECTORS,
    });
  }

  /**
   * Load manga information from URL.
   * 
   * Supports two types of URLs:
   * 1. Forum listing (e.g., https://chap.vn/forums/128/) - lists all threads as chapters
   * 2. Thread URL (e.g., https://chap.vn/threads/60321/) - single thread with paginated posts
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

    // Detect URL type
    const isForum = trimmed.includes('/forums/');
    const isThread = trimmed.includes('/threads/');

    if (isForum) {
      return this.loadFromForum(trimmed, options);
    } else if (isThread) {
      return this.loadFromThread(trimmed, options);
    } else {
      return { ok: false, error: 'URL không hợp lệ. Vui lòng dùng URL forum hoặc thread từ chap.vn' };
    }
  }

  /**
   * Load manga list from forum category.
   * Each thread becomes a chapter.
   * 
   * @param {string} url - Forum URL (e.g., https://chap.vn/forums/128/)
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
    let title = $('.titleBar h1').first().text().trim();
    if (!title) {
      title = $('title').text().split('|')[0].trim();
    }
    
    if (!title) {
      title = 'Chap.vn Forum';
    }

    // Extract cover from first thread's first image (if available)
    let coverUrl = '';

    // Build chapter list from threads
    const chapters = [];
    
    $('ol.discussionListItems li.discussionListItem').each((i, el) => {
      const $item = $(el);
      const $link = $item.find('h3.title a').first();
      const chapterUrl = $link.attr('href');
      const chapterTitle = $link.text().trim();
      
      if (chapterUrl && chapterTitle) {
        // Make absolute URL
        const absoluteUrl = chapterUrl.startsWith('http') 
          ? chapterUrl 
          : new URL(chapterUrl, DOMAIN).href;
        
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
    const pageNav = $('.PageNav');
    if (pageNav.length) {
      const lastPageLink = pageNav.find('a').last();
      const lastPageText = lastPageLink.text().trim();
      const lastPageNum = parseInt(lastPageText) || 1;
      
      // Load additional pages
      for (let page = 2; page <= Math.min(lastPageNum, 5); page++) { // Limit to 5 pages for performance
        const pageUrl = url.includes('?') 
          ? `${url}&page=${page}`
          : `${url}page-${page}`;
        
        const pageFetched = await fetchHtml(pageUrl, options);
        if (pageFetched.ok) {
          const $page = cheerio.load(pageFetched.html);
          $page('ol.discussionListItems li.discussionListItem').each((i, el) => {
            const $item = $page(el);
            const $link = $item.find('h3.title a').first();
            const chapterUrl = $link.attr('href');
            const chapterTitle = $link.text().trim();
            
            if (chapterUrl && chapterTitle) {
              const absoluteUrl = chapterUrl.startsWith('http') 
                ? chapterUrl 
                : new URL(chapterUrl, DOMAIN).href;
              
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
   * Each page of the thread becomes a chapter.
   * 
   * @param {string} url - Thread URL (e.g., https://chap.vn/threads/60321/)
   * @param {object} [options] - Load options
   * @returns {Promise<object>} Result with manga info and chapters
   */
  async loadFromThread(url, options = {}) {
    const fetched = await fetchHtml(url, options);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang thread.' };
    }

    const $ = cheerio.load(fetched.html);
    
    // Extract title from thread title
    let title = $('h1.title, .titleBar h1').first().text().trim();
    if (!title) {
      title = $('title').text().split('|')[0].trim();
    }
    
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // Extract cover from first image in first post
    let coverUrl = '';
    const firstImage = $('article img.bbCodeImage, blockquote.messageText img.bbCodeImage').first();
    if (firstImage.length) {
      coverUrl = firstImage.attr('src') || firstImage.attr('data-src') || '';
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = new URL(coverUrl, DOMAIN).href;
      }
    }

    // Build chapter list from thread pages
    const chapters = [];
    
    // Current page as a chapter
    chapters.push({
      url: url,
      title: `Trang 1`,
    });

    // Check for pagination
    const pageNav = $('.PageNav');
    if (pageNav.length) {
      const lastPageLink = pageNav.find('a').last();
      const lastPageText = lastPageLink.text().trim();
      const lastPageNum = parseInt(lastPageText) || 1;
      
      // Add additional pages as chapters
      for (let page = 2; page <= lastPageNum; page++) {
        const pageUrl = url.includes('?') 
          ? `${url}&page=${page}`
          : `${url}page-${page}`;
        chapters.push({
          url: pageUrl,
          title: `Trang ${page}`,
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

    // Extract images from all posts on the page
    $('article img.bbCodeImage, blockquote.messageText img.bbCodeImage').each((i, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || '';
      
      if (!src) return;
      
      // Skip small icons and avatars
      const width = $(el).attr('width');
      const height = $(el).attr('height');
      if (width && height && parseInt(width) < 100 && parseInt(height) < 100) {
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

    return images;
  }
}

// Create singleton instance
const service = new ChapVnService();

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
};
