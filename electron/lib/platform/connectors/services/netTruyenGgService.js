/**
 * NetTruyenGG Service
 * Site: nettruyen.gg (NetTruyen platform, direct fetch — no Cloudflare)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getFileExt,
} = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const {
  extractSlug,
  parseChapterListResponse,
  parseChapterImagesFromHtml,
} = require('./netTruyenVietService');

const DOMAIN = 'https://nettruyen.gg/';
const LABEL = 'NetTruyenGG';

function getOrigin(urlString) {
  try {
    const u = new URL(String(urlString).trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://nettruyen.gg';
  }
}

class NetTruyenGgService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'nettruyengg',
      selectors: {},
    });
  }

  async load(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const origin = getOrigin(trimmed);
    const slug = extractSlug(trimmed);
    if (!slug) return { ok: false, error: 'Không đọc được slug từ URL.' };

    const fetched = await fetchHtml(trimmed, {
      userAgent: USER_AGENT_JSOUP,
      referer: DOMAIN,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    let title =
      $('h1.title-detail, h1.title-manga, h1.manga-title, h1.comic-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    title = title.replace(/\s*[-–|].*$/, '').trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    let coverUrl = ($('meta[property="og:image"]').attr('content') || '').trim();
    if (!coverUrl) {
      const $coverImg = $('.detail-info img.image-thumb, .detail-info .col-image img').first();
      if ($coverImg.length) {
        const src = ($coverImg.attr('src') || $coverImg.attr('data-src') || '').trim();
        if (src && !/^data:/i.test(src)) coverUrl = resolveUrl(trimmed, src);
      }
    }

    const apiUrl = `${origin}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(slug)}`;
    let chapters = [];
    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: trimmed,
          'User-Agent': USER_AGENT_JSOUP,
        },
      });
      if (apiRes.ok) {
        chapters = parseChapterListResponse(await apiRes.text(), origin, slug);
      }
    } catch {
      /* fallback to HTML */
    }

    if (!chapters.length) {
      const chapterSels = [
        '.list-chapter li a',
        '#nt_listchapter li a',
        '#chapter_list li a',
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

    if (!chapters.length) {
      const seen = new Set();
      $(`a[href*="/${slug}/chuong-"], a[href*="/chuong-"]`).each((_, el) => {
        const $a = $(el);
        let href = ($a.attr('href') || '').trim();
        if (!href) return;
        
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
        siteId: 'nettruyengg',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, {
      referer: referer || DOMAIN,
      userAgent: USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const imageUrls = parseChapterImagesFromHtml(fetched.html, chapterUrl);
    if (!imageUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return imageUrls.map((imageUrl) => ({
      imageUrl,
      ext: getFileExt(imageUrl) || 'jpg',
    }));
  }

  getImageHeaders(referer) {
    return {
      ...super.getImageHeaders(referer || DOMAIN),
      Referer: referer || DOMAIN,
    };
  }
}

const service = new NetTruyenGgService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  extractSlug,
  getOrigin,
};
