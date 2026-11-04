/**
 * NetTruyenViet Service - Migrated to HtmlConnectorService
 * Site: nettruyenviet*.com (Cloudflare-protected)
 *
 * Chapter list fetched via API endpoint. Cloudflare via Settings cookie.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT,
  resolveUrl,
  getFileExt,
  isValidImgSrc,
  getImageSrcFromEl,
  fetchHtml,
} = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');

const DOMAIN = 'https://nettruyenviet10.com/';
const LABEL = 'NetTruyenViet';

// ─── URL helpers ─────────────────────────────────────────────────────────────────

function getOrigin(urlString) {
  try {
    const u = new URL(String(urlString).trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    const str = String(urlString || '').toLowerCase();
    if (str.includes('nettruyen.work')) return 'https://nettruyen.work';
    if (str.includes('nettruyenviet')) {
      const match = str.match(/nettruyenviet(\d+)/);
      if (match) return `https://nettruyenviet${match[1]}.com`;
      return 'https://nettruyenviet10.com';
    }
    return 'https://nettruyen.work';
  }
}

function extractSlug(urlString) {
  try {
    const parts = new URL(String(urlString).trim()).pathname
      .replace(/^\/truyen-tranh\//, '')
      .split('/');
    return parts[0] || '';
  } catch {
    return '';
  }
}

// ─── Chapter list API parser ─────────────────────────────────────────────────────

function parseChapterListResponse(text, baseOrigin, slug) {
  let trimmed = (text || '').trim();

  // Extract JSON if the API wraps it in <pre>
  const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(trimmed);
  if (preMatch) trimmed = preMatch[1].trim();

  // Unwrap CDATA
  const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(trimmed);
  if (cdataMatch) trimmed = cdataMatch[1].trim();

  // Unwrap <string> SOAP wrapper
  const stringWrapMatch = /<string[^>]*>([\s\S]*?)<\/string>/i.exec(trimmed);
  if (stringWrapMatch) trimmed = stringWrapMatch[1].trim();

  // Parse JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const items = Array.isArray(data)
        ? data
        : data.data || data.chapters || data.ChapterList || data.chapter || [];
      return items
        .map((item) => {
          const id = String(item.chapter_id || item.ChapterID || item.chapterId || item.id || '');
          const rawTitle = item.chapter_name || item.ChapterTitle || item.chapterTitle || item.title || item.name || '';
          const num =
            item.chapter_num != null
              ? String(item.chapter_num)
              : (() => {
                  const nm = /(\d+(?:\.\d+)?)/.exec(rawTitle || id);
                  return nm ? nm[1] : id;
                })();
          const title = rawTitle || `Chương ${num}`;
          const url = `${baseOrigin}/truyen-tranh/${slug}/chuong-${num}`;
          return { chapterId: id, title: formatChapterTitle(title), url };
        })
        .filter((c) => c.chapterId || c.url);
    } catch {
      /* fall through to XML */
    }
  }

  // Parse XML fallback
  const chapters = [];
  const blockRe = /<[Cc]hapter>([\s\S]*?)<\/[Cc]hapter>/g;
  let m;
  while ((m = blockRe.exec(trimmed)) !== null) {
    const block = m[1];
    const idMatch = /<[Cc]hapter[Ii][Dd][^>]*>([\s\S]*?)<\/[Cc]hapter[Ii][Dd]>/i.exec(block);
    const titleMatch = /<[Cc]hapter[Tt]itle[^>]*>([\s\S]*?)<\/[Cc]hapter[Tt]itle>/i.exec(block);
    const numMatch2 = /<[Cc]hapter[Nn]um[^>]*>([\s\S]*?)<\/[Cc]hapter[Nn]um>/i.exec(block);
    const id = idMatch ? idMatch[1].trim() : '';
    const rawTitle = titleMatch ? titleMatch[1].trim() : '';
    const numStr = numMatch2 ? numMatch2[1].trim() : '';
    const numForUrl =
      numStr ||
      (() => {
        const nm = /(\d+(?:\.\d+)?)/.exec(rawTitle || id);
        return nm ? nm[1] : id;
      })();
    if (!numForUrl) continue;
    const title = rawTitle || `Chương ${numForUrl}`;
    const url = `${baseOrigin}/truyen-tranh/${slug}/chuong-${numForUrl}`;
    chapters.push({ chapterId: id || numForUrl, title: formatChapterTitle(title), url });
  }
  return chapters;
}

// ─── Chapter image parser ────────────────────────────────────────────────────────

function parseChapterImagesFromHtml(html, chapterUrl) {
  const $ = cheerio.load(html);
  const urls = [];

  // 1. Extract from JS array: var lstImages = [...] or listImages = [...]
  const jsArrMatch = /(?:var\s+)?(?:lstImages|listImages|imageList|arrImages)\s*=\s*(\[[\s\S]*?\])/i.exec(html);
  if (jsArrMatch) {
    try {
      const arr = JSON.parse(jsArrMatch[1]);
      for (const item of arr) {
        const src = typeof item === 'string' ? item.trim() : (item?.url || item?.src || '').trim();
        if (src && /^https?:\/\//i.test(src)) urls.push(src);
      }
    } catch {
      /* ignore */
    }
  }
  if (urls.length) return urls;

  // 2. Standard HTML selectors
  const selectors = [
    '#chapter-content img',
    '.reading-content img',
    '.chapter-content img',
    '#content img',
    '.page-chapter img',
    '.vung_doc img',
    'article img',
  ];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      let src = getImageSrcFromEl($el) || ($el.attr('data-original') || '').trim();
      if (!src) return;
      src = resolveUrl(chapterUrl, src);
      if (src && isValidImgSrc(src)) urls.push(src);
    });
    if (urls.length) break;
  }

  // 3. Ultimate Fallback: collect all valid images, ignoring UI icons
  if (!urls.length) {
    $('img').each((_, el) => {
      const $el = $(el);
      let src = getImageSrcFromEl($el) || ($el.attr('data-original') || '').trim();
      if (!src) return;
      src = resolveUrl(chapterUrl, src);
      if (src && isValidImgSrc(src)) {
        const lowerSrc = src.toLowerCase();
        // Ignore common UI elements
        if (lowerSrc.includes('/logo') || lowerSrc.includes('/user') || lowerSrc.includes('avatar') || lowerSrc.includes('banner')) return;
        urls.push(src);
      }
    });
  }

  return urls;
}

// ─── NetTruyenVietService class ──────────────────────────────────────────────────

class NetTruyenVietService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'nettruyenviet',
      selectors: {}, // Not used - custom load() implementation
      requiresCookie: true,
    });
  }


  async load(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const origin = getOrigin(trimmed);
    const slug = extractSlug(trimmed);
    if (!slug) return { ok: false, error: 'Không đọc được slug từ URL.' };

    // Fetch manga page
    const fetched = await fetchHtml(trimmed, {
      siteId: 'nettruyenviet',
      requiresCookie: true
    });
    if (!fetched.ok) return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };

    const $ = cheerio.load(fetched.html);

    // Title
    let title =
      $('h1.title-manga, h1.manga-title, h1.comic-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    title = title.replace(/\s*[-–|].*$/, '').trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Cover
    let coverUrl = '';
    const $coverImg = $('.detail-info img.image-thumb, .detail-info .col-image img').first();
    if ($coverImg.length) {
      const src = ($coverImg.attr('src') || $coverImg.attr('data-src') || '').trim();
      if (src && !/^data:/i.test(src)) coverUrl = resolveUrl(trimmed, src);
    }
    if (!coverUrl) {
      coverUrl = ($('meta[property="og:image"]').attr('content') || '').trim();
    }
    if (!coverUrl) {
      const coverSelectors = [
        '.book_avatar img',
        '.manga-info-pic img',
        '.manga-cover img',
        '.comic-cover img',
        '.book-cover img',
        '.info-cover img',
        '.story-cover img',
        'figure.cover img',
      ];
      for (const sel of coverSelectors) {
        const $img = $(sel).first();
        if ($img.length) {
          const src = ($img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || '').trim();
          if (src && !/^data:/i.test(src)) {
            coverUrl = resolveUrl(trimmed, src);
            break;
          }
        }
      }
    }

    // Fetch chapter list via API
    const apiUrl = `${origin}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(slug)}`;
    const apiRes = await fetchHtml(apiUrl, {
      siteId: 'nettruyenviet',
      requiresCookie: true
    });

    let chapters = [];
    if (apiRes.ok && apiRes.html) {
      chapters = parseChapterListResponse(apiRes.html, origin, slug);
    }

    // Fallback: parse HTML chapter list
    if (!chapters.length) {
      const chapterSels = [
        '#nt_listchapter li a',
        '#chapter_list li a',
        '.list-chapter li a',
        'div[class*="overflow-y-auto"] a[href*="/chuong-"]'
      ];
      for (const sel of chapterSels) {
        $(sel).each((_, el) => {
          const $a = $(el);
          let href = ($a.attr('href') || '').trim();
          if (!href) return;
          href = resolveUrl(trimmed, href);
          if (!href.includes('/truyen-tranh/')) return;

          let rawTitle = '';
          const $titleDiv = $a.find('div[class*="text-sm"], .chapter-name, .name');
          if ($titleDiv.length) {
            rawTitle = $titleDiv.first().text().trim();
          } else {
            rawTitle = $a.text().trim();
          }

          chapters.push({ url: href, title: formatChapterTitle(rawTitle || href) });
        });
        if (chapters.length) break;
      }
    }

    // Ultimate fallback if selectors fail
    if (!chapters.length) {
      const seen = new Set();
      // Only get chapters for THIS specific manga slug
      $(`a[href*="/${slug}/chuong-"], a[href*="/chuong-"]`).each((_, el) => {
        const $a = $(el);
        let href = ($a.attr('href') || '').trim();
        if (!href) return;
        
        // Skip links that don't belong to this manga's slug
        if (!href.includes(`/${slug}/chuong-`)) return;

        href = resolveUrl(trimmed, href);
        if (!href.includes('/truyen-tranh/')) return;
        
        if (seen.has(href)) return;
        seen.add(href);

        let rawTitle = '';
        const $titleDiv = $a.find('div[class*="text-sm"], .chapter-name, .name');
        if ($titleDiv.length) {
          rawTitle = $titleDiv.first().text().trim();
        } else {
          // Attempt to strip dates if it's lumped text
          rawTitle = $a.text().replace(/\d+\s+ngày trước.*$/i, '').trim();
        }
        
        if (!rawTitle || rawTitle.includes('Đọc từ đầu') || rawTitle.includes('Đọc mới nhất') || rawTitle.includes('Đọc tiếp')) return;
        
        chapters.push({ url: href, title: formatChapterTitle(rawTitle || href) });
      });
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: slug,
        siteId: 'nettruyenviet',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const origin = getOrigin(chapterUrl);

    let imageUrls = [];
    const fetched = await fetchHtml(chapterUrl, {
      siteId: 'nettruyenviet',
      requiresCookie: true
    });
    
    if (fetched.ok) {
      imageUrls = parseChapterImagesFromHtml(fetched.html, chapterUrl);
    }

    if (!imageUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return imageUrls.map((imageUrl) => ({
      imageUrl,
      ext: getFileExt(imageUrl) || 'jpg',
    }));
  }
}

// Create singleton instance
const service = new NetTruyenVietService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  extractSlug,
  parseChapterListResponse,
  parseChapterImagesFromHtml,
};
