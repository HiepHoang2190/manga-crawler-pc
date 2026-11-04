/**
 * Nhất Truyện connector service — https://nhattruyenqq.com/
 * Details and chapters parsed from HTML + ChapterList API; chapter images from HTML.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT_JSOUP,
} = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://nhattruyenqq.com/';
const LABEL = 'Nhất Truyện';
const SITE_ID = 'nhattruyen';
const IMG_REFERER = DOMAIN;

function getActiveDomain(url) {
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol && u.host) {
        return `${u.protocol}//${u.host}/`;
      }
    } catch {
      /* ignore invalid url */
    }
  }
  try {
    return connectorDomainManager.getDomain(SITE_ID, DOMAIN);
  } catch {
    return DOMAIN;
  }
}

const SELECTORS = {
  title: 'h1.title-detail, h1',
  cover: '.col-image img, .detail-info img.image-thumb',
  chapterLinks: '.list-chapter li a, #chapter_list li a',
};

function extractSlug(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const m = raw.match(/\/truyen-tranh\/([^/?#]+)/i);
    return m ? m[1].replace(/\.html$/i, '') : '';
  } catch {
    return '';
  }
}

function parseChapterListResponse(body, baseOrigin, slug) {
  let trimmed = String(body || '').trim();
  if (!trimmed) return [];

  const stringWrapMatch = /<string[^>]*>([\s\S]*?)<\/string>/i.exec(trimmed);
  if (stringWrapMatch) trimmed = stringWrapMatch[1].trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const items = Array.isArray(data)
        ? data
        : data.data || data.chapters || data.ChapterList || data.chapter || [];
      return items
        .map((item) => {
          const id = String(item.chapter_id || item.ChapterID || item.chapterId || item.id || '');
          const rawTitle =
            item.chapter_name ||
            item.ChapterTitle ||
            item.chapterTitle ||
            item.title ||
            item.name ||
            '';
          const num =
            item.chapter_num != null
              ? String(item.chapter_num)
              : (() => {
                  const nm = /(\d+(?:\.\d+)?)/.exec(rawTitle || id);
                  return nm ? nm[1] : id;
                })();
          const title = rawTitle || `Chương ${num}`;
          const url = `${baseOrigin.replace(/\/$/, '')}/truyen-tranh/${slug}/chuong-${num}`;
          return { chapterId: id, title: formatChapterTitle(title), url };
        })
        .filter((c) => c.chapterId || c.url);
    } catch {
      /* fallback */
    }
  }
  return [];
}

function parseNhattruyenChapterImagesFromHtml(html, chapterUrl) {
  const $ = cheerio.load(html);
  const urls = [];
  const seen = new Set();

  function addUrl(raw) {
    if (!raw) return;
    let clean = String(raw).trim();
    if (!clean || clean.startsWith('data:') || clean.includes('thumb-default.jpg')) return;
    if (clean.startsWith('//')) clean = `https:${clean}`;
    const full = resolveUrl(chapterUrl, clean);
    if (!/^https?:\/\//i.test(full)) return;
    if (seen.has(full)) return;
    seen.add(full);
    urls.push(full);
  }

  // Check JS variables if present
  const jsArrMatch = /(?:var\s+)?(?:lstImages|listImages|imageList|arrImages)\s*=\s*(\[[\s\S]*?\])/i.exec(html);
  if (jsArrMatch) {
    try {
      const arr = JSON.parse(jsArrMatch[1]);
      for (const item of arr) {
        const src = typeof item === 'string' ? item : (item?.url || item?.src || item?.image);
        addUrl(src);
      }
    } catch {
      /* ignore */
    }
  }

  if (urls.length) return urls;

  // DOM selectors
  const selectors = [
    '.page-chapter img',
    '.reading-detail img',
    '.reading-content img',
    '#chapter-content img',
    '.chapter-content img',
  ];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $img = $(el);
      const src =
        $img.attr('data-sv1') ||
        $img.attr('data-sv2') ||
        $img.attr('data-src') ||
        $img.attr('data-original') ||
        $img.attr('src');
      addUrl(src);
    });
    if (urls.length) break;
  }

  return urls;
}

function parseNhattruyenListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('.item figure').each((_, fig) => {
    const $fig = $(fig);
    const $titleA = $fig.find('figcaption h3 a').first();
    let href = ($titleA.attr('href') || '').trim();
    if (!href) {
      href = ($fig.find('.image a').first().attr('href') || '').trim();
    }
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    if (seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    let title = $titleA.text().trim().replace(/\s+/g, ' ');
    if (!title) {
      title = ($fig.find('.image a').attr('title') || '').trim();
    }
    if (!title) title = mangaUrl;

    const $img = $fig.find('.image img').first();
    let coverUrl = '';
    if ($img.length) {
      let raw =
        ($img.attr('data-original') ||
          $img.attr('data-retries') ||
          $img.attr('data-src') ||
          $img.attr('src') ||
          '').trim();
      if (raw.includes('thumb-default.jpg')) {
        raw = ($img.attr('data-original') || $img.attr('data-retries') || '').trim();
      }
      if (raw) coverUrl = resolveUrl(pageUrl, raw);
    }

    const $lastChap = $fig.find('ul.comic-item li.chapter a').first();
    const latestChapterLabel = $lastChap.text().trim().replace(/\s+/g, ' ') || null;

    items.push({
      title,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });
  return items;
}

function parseNhattruyenListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $('.pagination a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const m = /[?&]page=(\d+)/i.exec(href);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > maxPage) maxPage = p;
    }
    const t = parseInt($(el).text().trim(), 10);
    if (Number.isFinite(t) && t > maxPage) maxPage = t;
  });
  return maxPage;
}

class NhattruyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      imageReferer: IMG_REFERER,
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const activeDomain = getActiveDomain(trimmed);
    const slug = extractSlug(trimmed);
    if (!slug) return { ok: false, error: 'Không đọc được slug từ URL truyện.' };

    const targetUrl = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : resolveUrl(activeDomain, trimmed);

    const fetched = await fetchHtml(targetUrl, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: activeDomain,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const html = fetched.html;
    const finalUrl = fetched.finalUrl || targetUrl;
    const $ = cheerio.load(html);

    let title =
      $('h1.title-detail').first().text().trim() ||
      $('h1').first().text().trim() ||
      ($('meta[property="og:title"]').attr('content') || '').trim();
    title = title.replace(/\s*[-–|].*$/, '').trim();
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    let coverUrl = '';
    const $coverImg = $('.col-image img, .detail-info img.image-thumb').first();
    if ($coverImg.length) {
      let raw =
        ($coverImg.attr('data-original') ||
          $coverImg.attr('data-retries') ||
          $coverImg.attr('data-src') ||
          $coverImg.attr('src') ||
          '').trim();
      if (raw.includes('thumb-default.jpg')) {
        raw = ($coverImg.attr('data-original') || $coverImg.attr('data-retries') || '').trim();
      }
      if (raw) coverUrl = resolveUrl(finalUrl, raw);
    }
    if (!coverUrl) {
      const ogImg = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImg) coverUrl = resolveUrl(finalUrl, ogImg);
    }

    let author = $('.author .col-xs-8').first().text().trim().replace(/\s+/g, ' ');
    let status = $('.status .col-xs-8').first().text().trim().replace(/\s+/g, ' ');

    const genres = [];
    $('.kind .col-xs-8 a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const description =
      $('.detail-content .shortened').text().trim() ||
      $('.detail-content').text().trim() ||
      ($('meta[name="description"]').attr('content') || '').trim();

    // Fetch chapters via ComicService API
    const baseOrigin = activeDomain.replace(/\/$/, '');
    const apiUrl = `${baseOrigin}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(slug)}`;
    let chapters = [];
    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: finalUrl,
          'User-Agent': USER_AGENT_JSOUP,
        },
      });
      if (apiRes.ok) {
        chapters = parseChapterListResponse(await apiRes.text(), baseOrigin, slug);
      }
    } catch {
      /* fallback to HTML */
    }

    if (!chapters.length) {
      const seenUrls = new Set();
      const selectors = [
        '.list-chapter li a',
        '#chapter_list li a',
        '#nt_listchapter li a',
        'div.list-chapter div.chapter a',
      ];
      for (const sel of selectors) {
        $(sel).each((_, el) => {
          const $a = $(el);
          let href = ($a.attr('href') || '').trim();
          if (!href || !href.includes('/chuong-')) return;
          href = resolveUrl(finalUrl, href);
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          let rawTitle = $a.text().replace(/\s+/g, ' ').trim();
          if (!rawTitle) rawTitle = href;
          chapters.push({
            url: href,
            title: formatChapterTitle(rawTitle),
          });
        });
        if (chapters.length) break;
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        author: author || undefined,
        status: status || undefined,
        genres: genres.length ? genres : undefined,
        description: description || '',
        mangaUrl: finalUrl,
        mangaId: slug,
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const activeDomain = getActiveDomain(chapterUrl);
    const fetched = await fetchHtml(chapterUrl, {
      referer: referer || activeDomain,
      userAgent: USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const imageUrls = parseNhattruyenChapterImagesFromHtml(fetched.html, chapterUrl);
    if (!imageUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return imageUrls.map((imageUrl) => ({
      imageUrl,
      filename: `${imageUrls.indexOf(imageUrl) + 1}${getFileExt(imageUrl)}`,
    }));
  }

  async fetchLatestUpdates(options = {}) {
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const query = String(options.query || '').trim();
    const activeDomain = getActiveDomain();

    let listingUrl;
    if (query) {
      listingUrl = `${activeDomain}tim-truyen?keyword=${encodeURIComponent(query)}&page=${page}`;
    } else {
      listingUrl = page <= 1 ? activeDomain : `${activeDomain}?page=${page}`;
    }

    let fetched;
    try {
      fetched = await fetchHtml(listingUrl, {
        referer: activeDomain,
        userAgent: USER_AGENT_JSOUP,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được danh sách Nhất Truyện.' };
    }

    const items = parseNhattruyenListingHtml(fetched.html, listingUrl);
    const totalPages = Math.max(page, parseNhattruyenListingMaxPage(fetched.html));

    return {
      ok: true,
      siteId: SITE_ID,
      page,
      totalPages,
      items,
    };
  }
}

const serviceInstance = new NhattruyenService();

module.exports = serviceInstance;
module.exports.DOMAIN = DOMAIN;
module.exports.LABEL = LABEL;
module.exports.SITE_ID = SITE_ID;
module.exports.siteId = SITE_ID;
module.exports.domain = DOMAIN;
module.exports.NhattruyenService = NhattruyenService;
module.exports.parseNhattruyenListingHtml = parseNhattruyenListingHtml;
module.exports.parseNhattruyenListingMaxPage = parseNhattruyenListingMaxPage;
module.exports.parseChapterListResponse = parseChapterListResponse;
module.exports.parseNhattruyenChapterImagesFromHtml = parseNhattruyenChapterImagesFromHtml;

