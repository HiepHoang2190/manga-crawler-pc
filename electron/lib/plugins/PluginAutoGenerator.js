/**
 * PluginAutoGenerator - Heuristic HTML analyzer for auto-generating plugins
 *
 * Fetches a manga page URL, parses HTML with cheerio, and detects page structure
 * (title, cover, chapter list, image selectors) using heuristic pattern matching.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../shared/logger');

class PluginAutoGenerator {
  /**
   * Analyze a manga page URL and detect its structure.
   * @param {string} url - Manga page URL
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeMangaPage(url) {
    // 1. Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { ok: false, error: 'URL không hợp lệ.' };
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return { ok: false, error: 'Chỉ hỗ trợ URL HTTP/HTTPS.' };
    }

    // 2. Fetch HTML
    let html;
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        },
        timeout: 30000,
        maxRedirects: 5,
      });
      html = typeof response.data === 'string' ? response.data : String(response.data);
    } catch (e) {
      return { ok: false, error: `Không tải được trang: ${e.message}` };
    }

    const $ = cheerio.load(html);
    const origin = parsedUrl.origin;
    const hostname = parsedUrl.hostname;

    // 3. Detect title
    const title = this._detectTitle($);

    // 4. Detect cover image
    const coverUrl = this._detectCover($, url);

    // 5. Detect chapter list
    const chapterDetection = this._detectChapters($, url);

    // 6. Extract domains from page (images, CDNs)
    const domains = this._extractDomains($, hostname);

    // 7. Determine site name from domain
    const siteName = this._deriveSiteName(hostname);
    const siteId = this._deriveSiteId(hostname);

    const result = {
      ok: true,
      siteInfo: {
        id: siteId,
        name: siteName,
        baseUrl: origin,
        hostname,
        domains,
      },
      detected: {
        title: title || null,
        titleSelector: this._detectTitleSelector($),
        coverUrl: coverUrl || null,
        coverSelector: this._detectCoverSelector($),
        chapterCount: chapterDetection.chapters.length,
        chapterSelector: chapterDetection.selector,
        chapterSample: chapterDetection.chapters.slice(0, 5),
        chapterFirstUrl: chapterDetection.chapters.length > 0 ? chapterDetection.chapters[0].url : null,
      },
      needsChapterUrl: chapterDetection.chapters.length === 0,
    };

    logger.info(`[PluginAutoGenerator] Analyzed ${url}: title="${title}", chapters=${chapterDetection.chapters.length}, domains=${domains.length}`);
    return result;
  }

  /**
   * Analyze a chapter page to detect image selectors.
   * @param {string} chapterUrl
   * @param {string} baseUrl
   * @returns {Promise<Object>}
   */
  async analyzeChapterPage(chapterUrl, baseUrl) {
    let html;
    try {
      const response = await axios.get(chapterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': baseUrl || chapterUrl,
        },
        timeout: 30000,
      });
      html = typeof response.data === 'string' ? response.data : String(response.data);
    } catch (e) {
      return { ok: false, error: `Không tải được trang chapter: ${e.message}` };
    }

    const $ = cheerio.load(html);
    const imageDetection = this._detectChapterImages($, chapterUrl);

    // Also extract any new domains from chapter images
    const extraDomains = [];
    for (const imgUrl of imageDetection.images) {
      try {
        const h = new URL(imgUrl).hostname;
        extraDomains.push(h);
      } catch { /* ignore */ }
    }

    logger.info(`[PluginAutoGenerator] Analyzed chapter ${chapterUrl}: images=${imageDetection.images.length}`);

    return {
      ok: true,
      imageCount: imageDetection.images.length,
      imageSelector: imageDetection.selector,
      imageSample: imageDetection.images.slice(0, 5),
      imageContainerSelector: imageDetection.containerSelector,
      extraDomains: [...new Set(extraDomains)],
    };
  }

  // ── Title detection ──

  _detectTitle($) {
    // Priority: h1 > og:title > <title>
    const h1 = $('h1').first().text().trim();
    if (h1) return h1;

    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) return ogTitle.trim();

    const titleTag = $('title').text().trim();
    if (titleTag) return titleTag;

    return null;
  }

  _detectTitleSelector($) {
    if ($('h1').first().text().trim()) return 'h1';
    if ($('h2').first().text().trim()) return 'h2';
    if ($('.title').first().text().trim()) return '.title';
    if ($('[class*="title"]').first().text().trim()) {
      const cls = $('[class*="title"]').first().attr('class');
      const match = (cls || '').match(/([\w-]*title[\w-]*)/i);
      if (match) return `.${match[1]}`;
    }
    return 'h1'; // fallback
  }

  // ── Cover detection ──

  _detectCover($, baseUrl) {
    // Priority: og:image > large img in info area
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      try { return new URL(ogImage, baseUrl).href; } catch { /* ignore */ }
    }

    // Look for img near title/info area
    const infoSelectors = ['.info', '.manga-info', '.comic-info', '.detail', '.book-info', '[class*="info"]'];
    for (const sel of infoSelectors) {
      const img = $(sel).find('img').first();
      if (img.length) {
        const src = img.attr('data-src') || img.attr('data-original') || img.attr('src');
        if (src) {
          try { return new URL(src, baseUrl).href; } catch { /* ignore */ }
        }
      }
    }

    return null;
  }

  _detectCoverSelector($) {
    if ($('meta[property="og:image"]').attr('content')) return 'meta[property="og:image"]';

    const infoSelectors = ['.info img', '.manga-info img', '.comic-info img', '.detail img', '[class*="info"] img'];
    for (const sel of infoSelectors) {
      if ($(sel).length > 0) return sel;
    }
    return 'img';
  }

  // ── Chapter list detection ──

  _detectChapters($, baseUrl) {
    // Common chapter URL patterns
    const chapterPatterns = [
      /chapter/i, /chap/i, /chuong/i, /\/c\d/i, /\/ch\d/i, /\/ch-/i, /episode/i
    ];

    // Strategy 1: Find links in known chapter list containers
    const containerSelectors = [
      '#nt_listchapter', '#chapter_list', '.list-chapter',
      '.chapter-list', '.chapters', '[class*="chapter-list"]',
      '.listchapter', '.manga-chapter', '[class*="listchapter"]',
    ];

    for (const containerSel of containerSelectors) {
      const container = $(containerSel);
      if (container.length === 0) continue;

      const links = container.find('a[href]');
      if (links.length < 2) continue;

      const chapters = [];
      const seen = new Set();
      links.each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        try {
          const fullUrl = new URL(href, baseUrl).href;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          const text = $(el).text().trim();
          if (text) chapters.push({ title: text, url: fullUrl });
        } catch { /* ignore */ }
      });

      if (chapters.length >= 2) {
        return { selector: `${containerSel} a[href]`, chapters };
      }
    }

    // Strategy 2: Find all links matching chapter patterns
    const allLinks = $('a[href]');
    const chapterLinks = [];
    const seen = new Set();

    allLinks.each((_, el) => {
      const href = $(el).attr('href') || '';
      const matches = chapterPatterns.some(p => p.test(href));
      if (!matches) return;

      try {
        const fullUrl = new URL(href, baseUrl).href;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        const text = $(el).text().trim();
        if (text && text.length < 200) {
          chapterLinks.push({ title: text, url: fullUrl });
        }
      } catch { /* ignore */ }
    });

    if (chapterLinks.length >= 2) {
      // Determine the best href pattern for CSS selector
      const patternKeywords = ['chapter', 'chap', 'chuong', 'episode'];
      for (const keyword of patternKeywords) {
        const firstHref = chapterLinks[0].url.toLowerCase();
        if (firstHref.includes(keyword)) {
          return { selector: `a[href*="${keyword}"]`, chapters: chapterLinks };
        }
      }
      return { selector: 'a[href*="chapter"]', chapters: chapterLinks };
    }

    return { selector: null, chapters: [] };
  }

  // ── Chapter images detection ──

  _detectChapterImages($, chapterUrl) {
    // Strategy 1: Known reading containers
    const containerSelectors = [
      '.page-chapter', '.reading-detail', '.chapter-content',
      '#chapter-content', '.chapter-images', '#content-chapter',
      '.reading-content', '[class*="reading"]', '[class*="chapter-content"]',
    ];

    for (const containerSel of containerSelectors) {
      const container = $(containerSel);
      if (container.length === 0) continue;

      const imgs = container.find('img');
      if (imgs.length < 3) continue;

      const images = [];
      const seen = new Set();
      imgs.each((_, el) => {
        const src = this._getImgSrc($(el));
        if (!src || src.startsWith('data:')) return;
        try {
          const fullUrl = new URL(src, chapterUrl).href;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          if (this._isLikelyChapterImage(fullUrl)) {
            images.push(fullUrl);
          }
        } catch { /* ignore */ }
      });

      if (images.length >= 3) {
        return { selector: `${containerSel} img`, containerSelector: containerSel, images };
      }
    }

    // Strategy 2: Find largest cluster of images
    const allImgs = $('img');
    const candidates = [];
    const seen = new Set();
    allImgs.each((_, el) => {
      const src = this._getImgSrc($(el));
      if (!src || src.startsWith('data:')) return;
      if (!this._isLikelyChapterImage(src)) return;
      try {
        const fullUrl = new URL(src, chapterUrl).href;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        candidates.push(fullUrl);
      } catch { /* ignore */ }
    });

    if (candidates.length >= 3) {
      return { selector: 'img', containerSelector: null, images: candidates };
    }

    return { selector: null, containerSelector: null, images: [] };
  }

  // ── Helpers ──

  _getImgSrc($el) {
    return $el.attr('data-src') || $el.attr('data-sv1') ||
           $el.attr('data-sv2') || $el.attr('data-original') ||
           $el.attr('data-cdn') || $el.attr('src') || '';
  }

  _isLikelyChapterImage(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    const excludePatterns = [
      '/icon', '/logo', '/avatar', '/template/', 'loading.', 'noavatar',
      'favicon', 'banner', '/ads/', '/ad/', 'advertisement',
    ];
    if (excludePatterns.some(p => lower.includes(p))) return false;

    const hasImageExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some(ext => lower.includes(ext));
    const hasCdnDomain = ['cdn', 'img', 'image', 'static', 'media', 'upload'].some(k => lower.includes(k));

    return hasImageExt || hasCdnDomain;
  }

  _extractDomains($, hostname) {
    const domains = new Set([hostname]);

    $('img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (!src) return;
      try {
        const h = new URL(src).hostname;
        if (h && h !== hostname) domains.add(h);
      } catch { /* ignore */ }
    });

    return [...domains].slice(0, 10);
  }

  _deriveSiteName(hostname) {
    const name = hostname.replace(/^www\./, '').split('.')[0] || hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  _deriveSiteId(hostname) {
    const name = hostname.replace(/^www\./, '').split('.')[0] || 'unknown';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

module.exports = new PluginAutoGenerator();
