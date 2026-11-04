/**
 * FanFox service.
 * Manga page: /manga/{slug}/
 * Chapter page: /manga/{slug}/c001/1.html or /manga/{slug}/v01/c001/1.html
 * Images: chapterfun.ashx returns a packed script with CDN urls.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getFileExt,
} = require('../../../download/connector/htmlConnectorUtils');
const {
  extractGuidKey,
  parseInlineChapterImageUrls,
  parseChapterFunImageUrls,
  buildChapterFunPageNumbers,
} = require('./fanfoxPacker');

const DOMAIN = 'https://fanfox.net/';
const LABEL = 'FanFox';

function resolveMangaPageUrl(raw_url) {
  let parsed_url;
  try {
    parsed_url = new URL(String(raw_url || '').trim());
  } catch {
    return '';
  }
  const path_parts = parsed_url.pathname.split('/').filter(Boolean);
  if (path_parts[0] !== 'manga' || !path_parts[1]) return parsed_url.href;
  parsed_url.pathname = `/manga/${path_parts[1]}/`;
  parsed_url.search = '';
  parsed_url.hash = '';
  return parsed_url.href;
}

function extractChapterMeta(chapter_html) {
  const chapter_match = String(chapter_html || '').match(/var\s+chapterid\s*=\s*(\d+)/);
  const count_match = String(chapter_html || '').match(/var\s+imagecount\s*=\s*(\d+)/);
  const guid_key = extractGuidKey(chapter_html);
  if (!chapter_match || !count_match || !guid_key) return null;
  return {
    chapter_id: chapter_match[1],
    image_count: Number(count_match[1]),
    guid_key,
  };
}

function buildChapterFunUrl(chapter_url, chapter_meta, page_number) {
  const fun_url = new URL('chapterfun.ashx', chapter_url);
  fun_url.searchParams.set('cid', chapter_meta.chapter_id);
  fun_url.searchParams.set('page', String(page_number));
  fun_url.searchParams.set('key', chapter_meta.guid_key);
  return fun_url.href;
}

function imageFileKey(image_url) {
  try {
    const file_name = new URL(image_url).pathname.split('/').pop();
    return file_name || image_url;
  } catch {
    return String(image_url).split('?')[0];
  }
}

class FanfoxService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'fanfox',
      imageReferer: DOMAIN,
      selectors: {
        title: 'span.detail-info-right-title-font',
        cover: 'img.detail-info-cover-img',
        chapterLinks: '#chapterlist a',
      },
    });
  }

  async load(url) {
    const trimmed_url = String(url || '').trim();
    if (!trimmed_url) return { ok: false, error: 'URL trống.' };

    const manga_url = resolveMangaPageUrl(trimmed_url);
    const fetched = await fetchHtml(manga_url, {
      userAgent: USER_AGENT_JSOUP,
      referer: DOMAIN,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);
    const manga_title = $('span.detail-info-right-title-font').first().text().trim();
    if (!manga_title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    let cover_url = '';
    const cover_src = ($('img.detail-info-cover-img').first().attr('src') || '').trim();
    if (cover_src) {
      cover_url = /^https?:\/\//i.test(cover_src) ? cover_src : resolveUrl(manga_url, cover_src);
    }

    const chapter_list = [];
    const seen_urls = new Set();
    $('#chapterlist a').each((_, element) => {
      const href = ($(element).attr('href') || '').trim();
      if (!href) return;
      const absolute_url = /^https?:\/\//i.test(href) ? href : resolveUrl(manga_url, href);
      if (!absolute_url || seen_urls.has(absolute_url)) return;
      try {
        const path_parts = new URL(absolute_url).pathname.split('/').filter(Boolean);
        if (path_parts.length <= 2) return;
      } catch {
        return;
      }
      seen_urls.add(absolute_url);
      const chapter_title =
        $(element).find('p.title3').first().text().trim() ||
        ($(element).attr('title') || '').trim() ||
        $(element).text().trim();
      chapter_list.push({ url: absolute_url, title: chapter_title || absolute_url });
    });

    return {
      ok: true,
      manga: {
        title: manga_title,
        coverUrl: cover_url,
        mangaUrl: manga_url,
        mangaId: '',
        siteId: 'fanfox',
        sourceLabel: LABEL,
      },
      chapters: chapter_list,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, {
      userAgent: USER_AGENT_JSOUP,
      referer: referer || DOMAIN,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const inline_urls = parseInlineChapterImageUrls(fetched.html);
    if (inline_urls.length) {
      return inline_urls.map((image_url) => ({
        imageUrl: image_url,
        ext: getFileExt(image_url) || 'jpg',
      }));
    }

    const chapter_meta = extractChapterMeta(fetched.html);
    if (!chapter_meta) {
      throw new Error('Không đọc được dữ liệu chương FanFox.');
    }

    const image_list = [];
    const seen_names = new Set();
    const page_numbers = buildChapterFunPageNumbers(chapter_meta.image_count);

    for (const page_number of page_numbers) {
      const fun_url = buildChapterFunUrl(chapterUrl, chapter_meta, page_number);
      const fun_fetched = await fetchHtml(fun_url, {
        userAgent: USER_AGENT_JSOUP,
        referer: chapterUrl,
      });
      if (!fun_fetched.ok) {
        throw new Error(`Không tải được ảnh chương: ${fun_fetched.error}`);
      }

      for (const image_url of parseChapterFunImageUrls(fun_fetched.html)) {
        const file_key = imageFileKey(image_url);
        if (!image_url || seen_names.has(file_key)) continue;
        seen_names.add(file_key);
        image_list.push({
          imageUrl: image_url,
          ext: getFileExt(image_url) || 'jpg',
        });
      }
    }

    if (!image_list.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }
    return image_list;
  }
}

const service = new FanfoxService();

function load(url) {
  return service.load(url);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

function fetchChapterImages(chapterUrl, referer) {
  return service.fetchChapterImages(chapterUrl, referer);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchChapterImages,
  resolveMangaPageUrl,
};
