/**
 * ViviComic Service - HTML Connector
 * Site: vivicomic.com
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  getImageSrcFromEl,
  resolveUrl,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://vivicomic.com/';
const ORIGIN_BASE = DOMAIN.replace(/\/$/, '');
const LABEL = 'ViviComic';

const SELECTORS = {
  chapterLinks: '.chapter-list .chapter-item',
  title: '.comic-info h1, .comic-title',
  cover: '.comic-cover img, .thumbnail img',
};

function parseViviComicMangaPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const title =
    $(SELECTORS.title).first().text().trim() ||
    $('h1').first().text().trim() ||
    $('title').first().text().split('-')[0].trim() ||
    '';
  
  let coverUrl = '';
  const $img = $(SELECTORS.cover).first();
  if (!$img.length) {
    const $ogImg = $('meta[property="og:image"]').first();
    if ($ogImg.length) {
      coverUrl = String($ogImg.attr('content') || '').trim();
    }
  } else {
    const raw = getImageSrcFromEl($img);
    if (raw) coverUrl = resolveUrl(pageUrl, raw);
  }
  
  const chapters = [];
  $(SELECTORS.chapterLinks).each((_, el) => {
    const $a = $(el);
    let href = String($a.attr('href') || '').trim();
    const text = $a.text().trim().replace(/\s+/g, ' ');
    if (!href) return;
    href = resolveUrl(pageUrl, href);
    chapters.push({ url: href, title: text || href });
  });
  
  const description = $('.comic-description, .summary').first().text().trim().replace(/\s+/g, ' ').slice(0, 1000);
  
  return { title, coverUrl, chapters, description };
}

/**
 * ViviComic connector service extending HtmlConnectorService.
 */
class ViviComicService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'vivicomic',
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    let fetched;
    try {
      fetched = await fetchHtml(trimmed, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const { title, coverUrl, chapters, description } = parseViviComicMangaPage(
      fetched.html,
      trimmed,
    );
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'vivicomic',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const url = String(chapterUrl || '').trim();
    if (!url) return [];

    let fetched;
    try {
      fetched = await fetchHtml(url, {
        userAgent: USER_AGENT_JSOUP,
        referer: referer || DOMAIN,
      });
    } catch (err) {
      throw new Error(`Không tải được chapter: ${String(err?.message || err)}`);
    }
    if (!fetched.ok) {
      throw new Error(fetched.error || 'Không tải được trang chapter.');
    }

    const $ = cheerio.load(fetched.html);
    const images = [];
    const seen = new Set();
    
    // Try reader-content images
    $('.reader-content .reader-page img, .reader-content img').each((_, el) => {
      const $img = $(el);
      const raw = getImageSrcFromEl($img);
      if (raw) {
        const resolved = resolveUrl(url, raw);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          const ext = raw.split('?')[0].split('.').pop().toLowerCase();
          images.push({ imageUrl: resolved, ext: ext || 'jpg' });
        }
      }
    });

    return images;
  }
}

const service = new ViviComicService();

function load(url, options) {
  return service.load(url, options);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  parseViviComicMangaPage,
};
