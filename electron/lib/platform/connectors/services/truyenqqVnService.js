/**
 * TruyenQQ.com.vn service — site có Cloudflare protection, ảnh lazy-load từ cdn3t.com
 *
 * CDN ảnh: s*.cdn3t.com (ví dụ: s11.cdn3t.com)
 * Referer khi tải ảnh: https://truyenqq.com.vn/
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  resolveUrl,
  getImageSrcFromEl,
  isValidImgSrc,
  getFileExt,
  fetchHtml,
} = require('../../../download/connector/htmlConnectorUtils');
const { isNavShortcutChapter } = require('../../../shared/mangaUtils');
const cookieManager = require('../../cookies/cookieManager');

const DOMAIN = 'https://truyenqq.com.vn/';
const LABEL = 'TruyenQQ.vn';

const SELECTORS = {
  chapterLinks: '.reading-list a.chapter-name, .reading-list a, .chapter-list a.chapter-name, a[href*="/chapter-"]',
  title: 'h1',
  cover: 'img[src*="/media/book/"]',
};

function isCloudflareBlockedHtml(html) {
  const text = String(html || '');
  if (!text) return false;
  return (
    text.length < 30000 &&
    /cf-browser-verification|cf_chl_|Just a moment|Performing security verification|Enable JavaScript and cookies to continue/i.test(
      text,
    )
  );
}

function isLoginRequiredHtml(html) {
  const text = String(html || '');
  if (!text) return false;
  return (
    text.includes('login-required-box') ||
    text.includes('Truyện này yêu cầu đăng nhập') ||
    /yêu cầu đăng nhập.*Google/i.test(text)
  );
}

function isTruyenqqVnAdImageUrl(urlString) {
  if (!urlString) return false;
  try {
    const parsed_url = new URL(String(urlString).trim());
    const host_name = parsed_url.hostname.toLowerCase();
    const path_name = parsed_url.pathname.toLowerCase();
    return host_name.endsWith('truyenqq.com.vn') && path_name.startsWith('/media/images/');
  } catch {
    return false;
  }
}

class TruyenqqVnService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'truyenqqvn',
      selectors: SELECTORS,
      requiresCookie: true,
    });
  }

  _resolveCookie(options = {}) {
    const fromOptions = options && options.cookie && String(options.cookie).trim();
    if (fromOptions) return fromOptions;
    return cookieManager.getEffectiveCookie('truyenqqvn') || '';
  }

  async _fetchPageHtml(url, options = {}) {
    const cookie = this._resolveCookie(options);
    const fetchOpts = {
      ...(cookie ? { cookie } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
      referer: (options && options.referer) || DOMAIN,
    };

    let fetched;
    try {
      fetched = await fetchHtml(url, fetchOpts);
    } catch (err) {
      fetched = { ok: false, error: err?.message || 'Lỗi mạng khi tải trang.' };
    }

    const isBlocked =
      (!fetched.ok && (
        String(fetched.error).includes('403') ||
        String(fetched.error).includes('503')
      )) ||
      isCloudflareBlockedHtml(fetched?.html);

    if (isBlocked) {
      try {
        const { fetchRenderedHtml } = require('../../renderedFetch');
        if (typeof fetchRenderedHtml === 'function') {
          const renderedHtml = await fetchRenderedHtml(url, { timeout: 35000, waitAfterLoad: 1500 });
          if (renderedHtml && !isCloudflareBlockedHtml(renderedHtml)) {
            return { ok: true, html: renderedHtml };
          }
        }
      } catch {
        // Fallback không khả dụng (ví dụ môi trường test hoặc lỗi BrowserWindow)
      }

      return {
        ok: false,
        error: 'HTTP 403: Bị Cloudflare chặn. Hãy nhấn biểu tượng Cookie ở thanh bên (Sidebar) để trích xuất cookie cho TruyenQQ.vn.',
      };
    }

    return fetched;
  }

  /**
   * Override load() — fetch HTML with Settings cookie, parse title/cover/chapters.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched = await this._fetchPageHtml(trimmed, options);

    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.error || 'Không tải được trang truyện.',
      };
    }

    const html = fetched.html;
    const { title, coverUrl, chapters } = this._parseMangaPage(html, trimmed);

    if (!title) {
      return {
        ok: false,
        error: 'Không đọc được tên truyện.',
      };
    }

    if (!chapters || chapters.length === 0) {
      return { ok: false, error: 'Không tìm thấy chương nào. Có thể selector đã thay đổi.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'truyenqqvn',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Parse trang truyện: title, cover, danh sách chương.
   */
  _parseMangaPage(html, pageUrl) {
    const $ = cheerio.load(html);

    // Title
    let title = $('h1').first().text().trim();
    if (!title) {
      const fullTitle = $('title').first().text().trim();
      title = fullTitle.replace(/\s*\[.*?\]\s*$/, '').trim();
    }

    // Cover
    let coverUrl = '';
    const $coverImg = $('img[src*="/media/book/"]').first();
    if ($coverImg.length) {
      coverUrl = resolveUrl(pageUrl, getImageSrcFromEl($coverImg));
    }
    if (!coverUrl) {
      for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        const content = $(sel).attr('content') || '';
        if (content.includes('/media/book/')) {
          coverUrl = resolveUrl(pageUrl, content);
          break;
        }
      }
    }

    // Chapters
    const chapters = [];
    const seen = new Set();
    // Prioritize dedicated chapter list container, falling back to all chapter links
    const $chapterLinks =
      $('.reading-list a.chapter-name, .reading-list a, .chapter-list a.chapter-name').length > 0
        ? $('.reading-list a.chapter-name, .reading-list a, .chapter-list a.chapter-name')
        : $('a[href*="/chapter-"]');

    $chapterLinks.each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      const text = $a.text().trim();
      if (!href) return;
      // Skip navigation buttons like "Đọc từ đầu", "Đọc mới nhất" before deduplicating
      if (isNavShortcutChapter($a) || isNavShortcutChapter(text)) return;
      if (seen.has(href)) return;
      seen.add(href);
      href = resolveUrl(pageUrl, href);
      chapters.push({ url: href, title: text || href });
    });

    return { title, coverUrl, chapters };
  }

  /**
   * Override fetchChapterImages() — parse data-src and script tags.
   */
  async fetchChapterImages(chapterUrl, referer, options = {}) {
    const fetched = await this._fetchPageHtml(chapterUrl, {
      referer: referer || chapterUrl,
      ...(options || {}),
    });

    if (!fetched.ok) {
      throw new Error(fetched.error || 'Không tải được trang chương.');
    }

    const html = fetched.html;

    if (isLoginRequiredHtml(html)) {
      throw new Error(
        'Chương này yêu cầu đăng nhập (Google) trên TruyenQQ.vn. Vui lòng vào Cài đặt → Cookie để đăng nhập hoặc cập nhật cookie cho TruyenQQ.vn.'
      );
    }

    const images = this._collectImages(html, referer);

    if (!images.length) {
      throw new Error(
        'Không tìm thấy ảnh nào.'
      );
    }

    return images;
  }

  /**
   * Thu thập URL ảnh từ HTML đã render.
   *
   * Chiến lược (theo thứ tự ưu tiên):
   * 1. Script tags — chứa toàn bộ danh sách ảnh dạng array hoặc URL trực tiếp
   * 2. img[data-src] / img[data-original] — lazy load chưa trigger
   * 3. img[src] — ảnh đã được render (thường chỉ ảnh đầu tiên)
   */
  _collectImages(html, refererBase) {
    const $ = cheerio.load(html);
    const out = [];
    const seen = new Set();

    const addUrl = (url) => {
      if (!url || seen.has(url)) return;
      if (!isValidImgSrc(url)) return;
      if (url.includes('/icon') || url.includes('/logo') || url.includes('loading.')) return;
      // TruyenQQ.vn injects ad banners from /media/images/ into chapter HTML.
      if (isTruyenqqVnAdImageUrl(url)) return;
      const ext = getFileExt(url);
      if (!ext) return;
      seen.add(url);
      out.push({ imageUrl: url, ext });
    };

    // 1. Script tags
    $('script').each((_, el) => {
      const script = $(el).html() || '';

      // Array variables: var images = [...], var chapter_path = [...], etc.
      const arrayPatterns = [
        /(?:var|let|const)\s+(?:images|chapter_images|pages|listImage|chapter_path|imgList)\s*=\s*(\[[\s\S]*?\]);/,
        /window\.(?:images|chapter_images|pages|listImage|chapter_path|imgList)\s*=\s*(\[[\s\S]*?\]);/,
      ];
      for (const pattern of arrayPatterns) {
        const m = script.match(pattern);
        if (!m) continue;
        try {
          const arr = JSON.parse(m[1]);
          if (Array.isArray(arr)) {
            arr.forEach((item) => {
              const raw = typeof item === 'string' ? item : (item.url || item.src || item.path || '');
              if (raw) addUrl(resolveUrl(refererBase, raw));
            });
          }
        } catch {
          // ignore
        }
      }

      // URL ảnh trực tiếp trong script (cdn3t.com, v.v.)
      const urlRe = /"(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/g;
      let m;
      while ((m = urlRe.exec(script)) !== null) {
        addUrl(m[1]);
      }
    });

    // 2. img tags — ưu tiên data-src / data-original (lazy load)
    $('img').each((_, el) => {
      const $el = $(el);

      // Lấy URL thật từ data attributes (lazy load chưa trigger)
      let src =
        ($el.attr('data-src') || '').trim() ||
        ($el.attr('data-original') || '').trim() ||
        ($el.attr('data-lazy-src') || '').trim() ||
        ($el.attr('data-cdn') || '').trim();

      // Fallback: src thông thường (ảnh đã render)
      if (!src) src = ($el.attr('src') || '').trim();

      // Bỏ qua data URI và loading placeholder
      if (!src || /^data:/i.test(src) || src.includes('loading.svg')) return;

      addUrl(resolveUrl(refererBase, src));
    });

    return out;
  }
}

const service = new TruyenqqVnService();

function parseTruyenqqVnListingHtml(html, pageUrl, { isSearch = false } = {}) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  if (isSearch && $('.listing .item').length > 0) {
    $('.listing .item').each((_, el) => {
      const $item = $(el);
      const $titleLink = $item.find('.info h3 a, h3 a').first();
      const $coverLink = $item.find('.cover a, a').first();
      const href = ($titleLink.attr('href') || $coverLink.attr('href') || '').trim();
      const mangaUrl = resolveUrl(pageUrl, href);
      if (!mangaUrl || seen.has(mangaUrl)) return;
      seen.add(mangaUrl);

      const $img = $item.find('.cover img, img').first();
      const rawCover = $img.length ? getImageSrcFromEl($img) : '';
      const coverUrl = rawCover && !/^data:/i.test(rawCover) ? resolveUrl(pageUrl, rawCover) : '';
      const title = ($titleLink.text() || $titleLink.attr('title') || $img.attr('alt') || '').trim();
      if (!title) return;

      const latestChapterLabel = $item.find('.caption p, .chapter a, .info p a').first().text().trim();
      items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
    });
    return items;
  }

  $('a[href]').each((_, el) => {
    const $a = $(el);
    if ($a.closest('.owl-carousel, .slide').length) return;
    const $img = $a.find('img[src*="/media/book/"], img[data-src*="/media/book/"]').first();
    if (!$img.length) return;

    const href = ($a.attr('href') || '').trim();
    const mangaUrl = resolveUrl(pageUrl, href);
    if (!mangaUrl || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const rawCover = getImageSrcFromEl($img);
    const coverUrl = rawCover && !/^data:/i.test(rawCover) ? resolveUrl(pageUrl, rawCover) : '';

    const title = ($a.find('.caption h3, h3').first().text() || $a.attr('title') || $img.attr('alt') || '').trim();
    if (!title) return;

    const latestChapterLabel = $a.find('.caption p, p').first().text().trim();
    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'truyenqqvn', page: 1, totalPages: 1, items: [] };
  }
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const listingUrl = searchQuery
    ? `${DOMAIN}tim-kiem?s=${encodeURIComponent(searchQuery)}`
    : `${DOMAIN}truyen-moi-cap-nhat`;

  let fetched;
  try {
    if (typeof options.fetchHtmlImpl === 'function') {
      fetched = await options.fetchHtmlImpl(listingUrl, {
        referer: DOMAIN,
        ...(signal ? { signal } : {}),
      });
    } else {
      fetched = await service._fetchPageHtml(listingUrl, { ...options, referer: DOMAIN });
    }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'truyenqqvn', page: 1, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'truyenqqvn', page: 1, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: fetched?.error || 'Không tải được danh sách TruyenQQ.vn.' };
  }

  return {
    ok: true,
    siteId: 'truyenqqvn',
    page: 1,
    totalPages: 1,
    items: parseTruyenqqVnListingHtml(fetched.html, DOMAIN, { isSearch: Boolean(searchQuery) }),
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  isCloudflareBlockedHtml,
  isLoginRequiredHtml,
  _parseMangaPage: (html, pageUrl) => service._parseMangaPage(html, pageUrl),
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
};
