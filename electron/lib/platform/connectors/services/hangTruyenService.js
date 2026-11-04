const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const cheerio = require('cheerio');

/**
 * HangTruyen.online connector service
 */
class HangTruyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: 'https://www.hangtruyen.online/',
      label: 'HangTruyen',
      siteId: 'hangtruyen',
      selectors: {
        chapterLinks: 'div.l-chapter a.ll-chap',
        title: 'h1.title-detail a, h1.title',
        cover: 'img[src*="thumb"]',
      },
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const fetched = await fetchHtml(trimmed);
    if (!fetched.ok) return { ok: false, error: fetched.error };

    const $ = cheerio.load(fetched.html);
    const titleEl = $('h1.title-detail a').length ? $('h1.title-detail a') : $('h1.title');
    const title = titleEl.text().trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    const coverUrl = $('img[src*="thumb"]').first().attr('src') || '';
    const description = $('.line-clamp').text().trim();

    const chapters = [];
    $('div.l-chapter a.ll-chap').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const chapTitle = $el.attr('title') || $el.text().trim();
      if (href) {
        chapters.push({ url: href, title: chapTitle });
      }
    });

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
        description,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) throw new Error(`Không tải được trang chương: ${fetched.error}`);

    const $ = cheerio.load(fetched.html);
    const images = [];
    $('.reading-img').each((i, el) => {
      const $el = $(el);
      let src = $el.attr('data-original') || $el.attr('data-src') || $el.attr('src');
      if (src && src.startsWith('data:')) {
        src = $el.attr('data-original') || $el.attr('data-src');
      }
      if (src && !src.startsWith('data:')) {
        // Resolve absolute URL
        try {
          src = new URL(src, referer || chapterUrl).href;
          images.push({ imageUrl: src, ext: 'jpg' });
        } catch {
          // ignore
        }
      }
    });

    return images;
  }
}

module.exports = new HangTruyenService();
