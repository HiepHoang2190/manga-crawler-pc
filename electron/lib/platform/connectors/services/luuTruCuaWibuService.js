/**
 * LuuTruCuaWibu service — hỗ trợ luutrucuawibu.blogspot.com (Blogger)
 *
 * Architecture:
 *  - Site là Blogger blog — danh sách chương load động qua Blogger JSON Feeds API.
 *  - Manga index page: chứa `var seriesLabel = "xxx"` trong script — dùng để gọi API.
 *  - Blogger API: /feeds/posts/summary/-/{label}?alt=json&max-results=150&start-index=N
 *    Phân trang: nếu trả về đúng 150 entries thì tiếp tục với start-index tiếp theo.
 *  - Chapter page: ảnh là Google Drive thumbnail
 *    <img src="https://drive.google.com/thumbnail?id=...&sz=w1200" alt="XXX.jpg">
 *  - Cover: Google Drive thumbnail trong thẻ <link rel="image_src"> hoặc og:image.
 */
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');

const LABEL = 'LuuTruCuaWibu';
const DOMAIN = 'https://luutrucuawibu.blogspot.com';
const MAX_PER_REQUEST = 150;

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.9',
};

/**
 * LuuTruCuaWibu connector service using HtmlConnectorService base class.
 * Handles Blogger JSON API for chapter fetching and Google Drive image parsing.
 */
class LuuTruCuaWibuService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'luutrucuawibu',
      imageReferer: 'https://drive.google.com/',
      // No standard selectors since we use custom parsing
      selectors: {},
    });
  }

  /**
   * Override getImageHeaders to use Google Drive referer
   */
  getImageHeaders(referer) {
    return {
      'User-Agent': USER_AGENT,
      Referer: 'https://drive.google.com/',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    };
  }

  /**
   * Override load method to use Blogger JSON API
   */
  async load(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const origin = this.getOrigin(trimmed);

    const fetched = await this.fetchHtml(trimmed);
    if (!fetched.ok) return { ok: false, error: fetched.error };

    const html = fetched.html;
    const title = this.parseTitle(html);
    if (!title) return { ok: false, error: 'Không đọc được tiêu đề truyện.' };

    const coverUrl = this.parseCoverUrl(html);

    const seriesLabel = this.parseSeriesLabel(html);
    if (!seriesLabel) {
      return { ok: false, error: 'Không tìm thấy label truyện trong trang. Hãy dán URL trang index truyện.' };
    }

    const apiResult = await this.fetchAllChapterEntries(origin, seriesLabel);
    if (!apiResult.ok) {
      return { ok: false, error: `Lỗi tải danh sách chương: ${apiResult.error}` };
    }

    const chapters = this.entriesToChapters(apiResult.entries, title);
    if (!chapters.length) {
      return { ok: false, error: 'Không tìm thấy chương nào.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        siteId: 'luutrucuawibu',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override fetchChapterImages to parse Google Drive thumbnails
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await this.fetchHtml(chapterUrl);
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    return this.parseChapterImages(fetched.html);
  }

  // Utility methods moved from module level

  async fetchHtml(url) {
    try {
      const res = await fetch(url, {
        headers: { ...FETCH_HEADERS, Referer: DOMAIN + '/' },
        redirect: 'follow',
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      return { ok: true, html };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async fetchJson(url) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,*/*',
          Referer: DOMAIN + '/',
        },
        redirect: 'follow',
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  /** Lấy origin từ URL người dùng nhập */
  getOrigin(url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return DOMAIN;
    }
  }

  /** Parse tiêu đề truyện từ <h1> hoặc <title> */
  parseTitle(html) {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1) {
      const text = h1[1].replace(/<[^>]+>/g, '').trim();
      if (text) return text;
    }
    const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (t) return t[1].replace(/\s*[-|].*$/, '').trim();
    return '';
  }

  /** Parse cover từ <link rel="image_src"> hoặc og:image */
  parseCoverUrl(html) {
    // Blogger đặt ảnh đại diện bài viết vào <link rel="image_src">
    const imgSrc = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)
      || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i.exec(html);
    if (imgSrc) return imgSrc[1].trim();
    // Fallback: og:image
    const og =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    return og ? og[1].trim() : '';
  }

  /**
   * Parse seriesLabel từ script trong HTML.
   * Dạng: var seriesLabel = "onepunchmanw";
   */
  parseSeriesLabel(html) {
    const m = /var\s+seriesLabel\s*=\s*["']([^"']+)["']/.exec(html);
    return m ? m[1].trim() : '';
  }

  /**
   * Lấy toàn bộ entries từ Blogger JSON Feeds API theo label.
   * Phân trang tự động (max 150/request).
   */
  async fetchAllChapterEntries(origin, label) {
    const entries = [];
    let startIndex = 1;

    while (true) {
      const url = `${origin}/feeds/posts/summary/-/${encodeURIComponent(label)}?alt=json&max-results=${MAX_PER_REQUEST}&start-index=${startIndex}`;
      const result = await this.fetchJson(url);
      if (!result.ok) return { ok: false, error: result.error };

      const batch = result.data?.feed?.entry || [];
      entries.push(...batch);

      if (batch.length < MAX_PER_REQUEST) break;
      startIndex += MAX_PER_REQUEST;
    }

    return { ok: true, entries };
  }

  /**
   * Chuyển entries từ Blogger API thành danh sách chương.
   * Bỏ bài giới thiệu (title === seriesName hoặc chứa "giới thiệu").
   * Sort tăng dần theo số chương.
   */
  entriesToChapters(entries, seriesName) {
    const chapters = [];

    for (const entry of entries) {
      const title = String(entry?.title?.$t || '').trim();
      if (!title) continue;

      // Bỏ bài giới thiệu / index
      if (title === seriesName || /giới thiệu/i.test(title)) continue;

      // Lấy link alternate
      const link = entry.link?.find((l) => l.rel === 'alternate')?.href || '';
      if (!link) continue;

      // Rút gọn title: bỏ prefix seriesName
      let displayTitle = title;
      if (seriesName && displayTitle.startsWith(seriesName)) {
        displayTitle = displayTitle.slice(seriesName.length).replace(/^[\s\-–—]+/, '').trim();
      }
      if (!displayTitle) displayTitle = title;

      // Trích số chương để sort
      const numMatch =
        /chương\s*(\d+(?:[.,]\d+)?)/i.exec(displayTitle) ||
        /chuong[_-]?(\d+(?:[._]\d+)?)/i.exec(link);
      const num = numMatch ? parseFloat(numMatch[1].replace(',', '.').replace('_', '.')) : 0;

      chapters.push({ url: link, title: formatChapterTitle(displayTitle), _num: num });
    }

    // Sort tăng dần
    chapters.sort((a, b) => a._num - b._num);
    return chapters.map(({ url, title }) => ({ url, title }));
  }

  /**
   * Parse ảnh chương từ Google Drive thumbnail.
   * Format: src="https://drive.google.com/thumbnail?id=...&amp;sz=w1200"
   * Cần decode HTML entities (&amp; → &) để URL hoạt động đúng.
   */
  decodeHtmlEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  parseChapterImages(html) {
    const pattern = /<img[^>]+src="(https:\/\/drive\.google\.com\/thumbnail\?[^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi;
    const urls = [];
    const seen = new Set();
    let m;

    while ((m = pattern.exec(html)) !== null) {
      const src = this.decodeHtmlEntities(m[1].trim());
      const alt = (m[2] || '').trim();

      if (seen.has(src)) continue;

      // Bỏ ảnh không phải trang truyện
      if (/icon|logo|favicon|qr|avatar|mon0/i.test(alt)) continue;

      seen.add(src);

      // Lấy ext từ alt (vd: "001.jpg") hoặc mặc định jpg
      let ext = 'jpg';
      if (alt) {
        const extMatch = /\.(\w+)$/.exec(alt);
        if (extMatch) {
          const e = extMatch[1].toLowerCase();
          if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e)) ext = e === 'jpeg' ? 'jpg' : e;
        }
      }

      urls.push({ imageUrl: src, ext });
    }

    return urls;
  }
}

// Create service instance
const service = new LuuTruCuaWibuService();

module.exports = {
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
