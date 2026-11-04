/**
 * Otakusic connector - migrated to HtmlConnectorService
 * 
 * Special characteristics:
 * - Hidden BrowserWindow + Settings cookie to bypass Cloudflare
 * - Uses API endpoints for manga details and chapter images
 * - Requires user cookies for authentication
 * - Custom image fetching via paginated API
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const cookieManager = require('../../cookies/cookieManager');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');

const API_BASE = 'https://otakusic.com/api/v1';
const IMG_REFERER = 'https://otakusic.com/';
const DOMAIN = 'https://otakusic.com/';
const LABEL = 'Otakusic';

/**
 * Otakusic service implementation.
 * Extends HtmlConnectorService but overrides most methods due to special API-based nature.
 */
class OtakusicService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'otakusic',
      imageReferer: IMG_REFERER,
      // Dummy selectors since we override load() completely
      selectors: {
        chapterLinks: 'a',
        title: 'h1',
        cover: 'img',
      },
      requiresCookie: true,
    });
  }



  async fetchApiJson(apiUrl, referer, log) {
    const { fetchRenderedHtml } = require('../../renderedFetch');
    
    // Sử dụng BrowserWindow ẩn thay vì fetch() để bypass triệt để Cloudflare (vì fetch() bị lộ TLS fingerprint của NodeJS)
    let r = { ok: false, html: '' };
    try {
      const html = await fetchRenderedHtml(apiUrl, { timeout: 30000, waitAfterLoad: 1000 });
      r = { ok: true, html };
    } catch (err) {
      r = { ok: false, error: err.message };
    }

    if (typeof log === 'function') {
      log(`[Otakusic] API fetch status: ${r.ok ? 'ok' : r.error} | url: ${apiUrl}`, 'info');
    }

    if (!r.ok) return null;

    const t = (r.html || '').trim();
    if (!t) return null;

    // Chromium may wrap JSON in <html><body><pre>...</pre></body></html>
    // Extract <pre> content before parsing JSON
    let jsonStr = t;
    if (t.startsWith('<')) {
      const preMatch = t.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (preMatch) {
        jsonStr = preMatch[1].trim();
      } else {
        // No <pre> → might be actual Cloudflare challenge page
        process.stderr.write(`[Otakusic] API returned HTML without <pre> (Cloudflare challenge or login redirect)\n`);
        return null;
      }
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  /**
   * Extract manga slug from URL.
   */
  extractMangaSlug(url) {
    const s = String(url || '');
    let m = s.match(/\/chi-tiet\/([^/?#]+)/);
    if (m) return m[1];
    m = s.match(/\/doc-truyen\/([^/?#]+)/);
    if (m) return m[1];
    try {
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i] && !parts[i].startsWith('chuong')) return parts[i];
      }
    } catch { /* */ }
    return null;
  }

  /**
   * Find title from HTML using various selectors.
   */
  findTitle($) {
    let t = $('h1').first().text().trim();
    if (t) return t;
    t = $('h1.font-bold').first().text().trim();
    if (t) return t;
    t = $('title').first().text().replace(/\s*\|.*$/, '').trim();
    return t || '';
  }

  /**
   * Find cover URL from HTML using various selectors.
   */
  findCoverUrl($) {
    // Try common selectors in priority order
    const selectors = [
      'img[src*="img.otakusic.com"][src*="/manga/uploads/manga/"]',
      'img[src*="img.otakusic.com"]',
      '.manga-cover img',
      '.book-cover img',
      '.cover img',
      'img.cover',
      'img[class*="cover"]',
      'img[alt*="cover"]',
    ];
    for (const sel of selectors) {
      const src = $(sel).first().attr('src') || '';
      if (src && !src.includes('logo') && !src.includes('avatar')) return src.trim();
    }
    const og = $('meta[property="og:image"]').attr('content');
    if (og && !og.includes('logo')) return og.trim();
    return '';
  }

  /**
   * Override load() method to use Otakusic's in-page rendered API approach.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const slug = this.extractMangaSlug(trimmed);
    if (!slug) return { ok: false, error: 'Không trích xuất được slug truyện từ URL.' };

    const mangaPageUrl = trimmed.startsWith('http') ? trimmed : `https://otakusic.com/chi-tiet/${slug}`;
    const { fetchAndExecute } = require('../../renderedFetch');

    // Chạy fetch('/api/v1/manga/chapters/' + slug) trực tiếp bên trong trang HTML để bypass Cloudflare challenge
    const script = `
      (async () => {
        let title = '';
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim()) {
          title = h1.textContent.trim();
        }
        if (!title && document.title) {
          title = document.title.replace(/\\s*\\|.*$/, '').trim();
        }

        let coverUrl = '';
        // 1. Kiểm tra hero cover (.otk-hero-cover có thể là img hoặc div background-image)
        const heroEl = document.querySelector('.otk-hero-cover, [class*="hero-cover"]');
        if (heroEl) {
          const imgInside = heroEl.querySelector('img');
          if (imgInside && imgInside.src && !imgInside.src.includes('logo') && !imgInside.src.includes('avatar')) {
            coverUrl = imgInside.src.trim();
          }
          if (!coverUrl) {
            const bg = heroEl.style?.backgroundImage || window.getComputedStyle(heroEl).backgroundImage || '';
            const bgMatch = bg.match(/url\(["']?([^"')]+)["']?\)/i);
            if (bgMatch && bgMatch[1] && bgMatch[1].startsWith('http')) {
              coverUrl = bgMatch[1].trim();
            }
          }
        }

        // 2. Tìm bất kỳ thẻ nào có background-image chứa uploads/manga
        if (!coverUrl) {
          const elWithBg = Array.from(document.querySelectorAll('*')).find(el => {
            const bg = el.style?.backgroundImage || '';
            return bg.includes('img.otakusic.com') && bg.includes('/uploads/manga/');
          });
          if (elWithBg) {
            const bg = elWithBg.style.backgroundImage;
            const bgMatch = bg.match(/url\(["']?([^"')]+)["']?\)/i);
            if (bgMatch && bgMatch[1]) coverUrl = bgMatch[1].trim();
          }
        }

        // 3. Thẻ <img> thông thường
        if (!coverUrl) {
          const coverEl = document.querySelector('img[src*="/uploads/manga/"], img[src*="img.otakusic.com"], .manga-cover img, .book-cover img, .cover img, img.cover');
          if (coverEl && coverEl.src && !coverEl.src.includes('logo') && !coverEl.src.includes('avatar')) {
            coverUrl = coverEl.src.trim();
          }
        }

        // 4. Fallback thẻ meta og:image
        if (!coverUrl) {
          const og = document.querySelector('meta[property="og:image"]');
          if (og && og.content && !og.content.includes('logo')) {
            coverUrl = og.content.trim();
          }
        }

        // 5. Xác thực URL ảnh sống (nếu thumb.jpg bị 404 thì đổi sang cover.jpg hoặc ngược lại)
        if (coverUrl && coverUrl.startsWith('http')) {
          try {
            const testRes = await fetch(coverUrl, { method: 'HEAD' });
            if (!testRes.ok) {
              if (coverUrl.includes('thumb.jpg')) {
                const alt = coverUrl.replace('thumb.jpg', 'cover.jpg');
                const altRes = await fetch(alt, { method: 'HEAD' });
                if (altRes.ok) coverUrl = alt;
              } else if (coverUrl.includes('cover.jpg')) {
                const alt = coverUrl.replace('cover.jpg', 'thumb.jpg');
                const altRes = await fetch(alt, { method: 'HEAD' });
                if (altRes.ok) coverUrl = alt;
              }
            }
          } catch (_) {}
        }

        let chaptersData = [];
        try {
          const res = await fetch('/api/v1/manga/chapters/${encodeURIComponent(slug)}');
          const json = await res.json();
          if (json && json.success && Array.isArray(json.data)) {
            chaptersData = json.data;
          }
        } catch (_) {}

        return { title, coverUrl, chaptersData };
      })()
    `;

    let pageResult = null;
    try {
      pageResult = await fetchAndExecute(mangaPageUrl, script, { timeout: 35000, waitAfterLoad: 1500 });
    } catch (err) {
      process.stderr.write(`[Otakusic] fetchAndExecute error: ${err.message}\n`);
    }

    let title = pageResult?.title || slug;
    let coverUrl = pageResult?.coverUrl || `https://img.otakusic.com/manga/uploads/manga/${slug}/cover.jpg`;
    const chapters = [];

    const rawChapters = pageResult?.chaptersData || [];
    for (const obj of rawChapters) {
      const chapterSlug = obj.chapter_slug;
      const chapterName = obj.chapter_name != null ? String(obj.chapter_name) : '';
      const chapterTitle = obj.chapter_title != null ? String(obj.chapter_title) : '';
      if (!chapterSlug) continue;
      const status = obj.status != null ? String(obj.status) : 'active';
      if (status !== 'active') continue;
      let ct = `Chương ${chapterName}`;
      if (chapterTitle) ct += ` - ${chapterTitle}`;
      if (obj.is_locked === true) ct += ' [Lock]';
      chapters.push({
        url: `https://otakusic.com/doc-truyen/${slug}/${chapterSlug}`,
        title: formatChapterTitle(ct),
      });
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: mangaPageUrl,
        mangaId: '',
        siteId: 'otakusic',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Extract images API URL from chapter URL.
   */
  extractImagesApiUrl(chapterUrl) {
    const m = String(chapterUrl).match(/\/doc-truyen\/([^/?#]+)\/([^/?#]+)/);
    if (!m) return null;
    return `${API_BASE}/manga/${m[1]}/${m[2]}/images`;
  }

  /**
   * Extract image URL from API response element.
   */
  extractImageUrl(el) {
    if (el && typeof el === 'object') {
      for (const k of ['image_url', 'url', 'src']) {
        if (el[k] != null && typeof el[k] === 'string') return el[k];
      }
    }
    if (typeof el === 'string') return el;
    return '';
  }

  /**
   * Get file extension from URL.
   */
  getFileExt(u) {
    try {
      const pathOnly = String(u).split('?')[0];
      const seg = pathOnly.split('.').pop() || '';
      const e = seg.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return e;
    } catch { /* */ }
    return 'webp';
  }

  /**
   * Override fetchChapterImages() to use in-page rendered API image fetching.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const trimmed = String(chapterUrl || '').trim();
    const m = trimmed.match(/\/doc-truyen\/([^/?#]+)\/([^/?#]+)/);
    if (!m) {
      throw new Error('Không suy ra được thông tin chương từ URL.');
    }
    const slug = m[1];
    const chapSlug = m[2];

    const { fetchAndExecute } = require('../../renderedFetch');

    // Chạy fetch ảnh trực tiếp bên trong trang đọc chương để dùng chung session Cloudflare
    const script = `
      (async () => {
        let page = 1;
        let urls = [];
        let isLocked = false;
        while (page <= 50) {
          const res = await fetch('/api/v1/manga/${encodeURIComponent(slug)}/${encodeURIComponent(chapSlug)}/images?page=' + page);
          const json = await res.json();
          if (!json) break;
          if (json.success === false) {
            if (json.message && /đăng nhập/i.test(json.message)) {
              isLocked = true;
            }
            break;
          }
          if (!Array.isArray(json.data) || json.data.length === 0) break;
          for (const item of json.data) {
            const u = typeof item === 'string' ? item : (item.image_url || item.url || item.src || '');
            if (u) urls.push(u);
          }
          if (!json.has_more) break;
          page++;
        }
        return { urls, isLocked };
      })()
    `;

    let execResult = null;
    try {
      execResult = await fetchAndExecute(trimmed, script, { timeout: 35000, waitAfterLoad: 1500 });
    } catch (err) {
      throw new Error(`Không tải được trang chương Otakusic: ${err.message}`);
    }

    if (execResult?.isLocked) {
      throw new Error('Chương này yêu cầu đăng nhập. Hãy cập nhật cookie Otakusic trong sidebar.');
    }

    const rawList = execResult?.urls || [];
    if (!rawList.length) {
      throw new Error('API không trả về ảnh. Cập nhật cookie Otakusic trong sidebar.');
    }

    return rawList.map(imageUrl => ({
      imageUrl,
      ext: this.getFileExt(imageUrl),
    }));
  }

  /**
   * Override getReferer() to use Otakusic's image referer.
   */
  getReferer(payload) {
    return IMG_REFERER;
  }
}

const service = new OtakusicService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};