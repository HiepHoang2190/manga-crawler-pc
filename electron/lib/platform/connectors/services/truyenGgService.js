/**
 * TruyenGG Service — truyenggvn.com (TruyenQQ template / HTML crawler).
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  collectTruyenQQChapterImages,
} = require('../../../download/connector/htmlConnectorUtils');
const connectorDomainManager = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://truyenggvn.com/';
const LABEL = 'TruyenGG';
const SITE_ID = 'truyengg';

const SELECTORS = {
  chapterLinks: 'div.list_chapter div.works-chapter-item a',
  title: 'h1[itemprop="name"]',
  cover: 'div.book_avatar img',
};

function normalizeOriginBase(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

function getActiveDomain() {
  try {
    return connectorDomainManager.getDomain(SITE_ID, DOMAIN);
  } catch {
    return DOMAIN;
  }
}

function extractSlug(url) {
  if (!url) return '';
  const m = String(url).match(/\/truyen-tranh\/([^/?#]+)/i);
  return m ? m[1].replace(/\.html$/i, '') : '';
}

function buildLatestUpdatesListUrl(originBase, page) {
  const clean = normalizeOriginBase(originBase || getActiveDomain());
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p <= 1) return `${clean}/truyen-moi-cap-nhat.html`;
  return `${clean}/truyen-moi-cap-nhat/trang-${p}.html`;
}

function parseTruyenGgLatestPagerMaxPageFromHtml(html) {
  const $ = cheerio.load(html);
  let max_page = 1;
  $('div.page_redirect a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').trim();
    if (!href || href.startsWith('javascript:')) return;
    let m = href.match(/\/trang-(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max_page) max_page = n;
      return;
    }
    m = href.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max_page) max_page = n;
    }
  });
  return max_page;
}

function getImageSrcLikeJava($img) {
  const src = $img.attr('src') || '';
  const dataSrc = $img.attr('data-src') || $img.attr('data-original') || '';
  return src.length > 0 ? src.trim() : dataSrc.trim();
}

function parseTruyenGgLatestListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('ul.list_grid.grid > li').each((_, li) => {
    const $li = $(li);
    const $title_a = $li.find('div.book_name h3 a').first();
    let href = String($title_a.attr('href') || '').trim();
    if (!href) {
      href = String($li.find('div.book_avatar a').first().attr('href') || '').trim();
    }
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    const title =
      String($title_a.attr('title') || '').trim() ||
      $title_a.text().trim().replace(/\s+/g, ' ') ||
      mangaUrl;
    let coverUrl = '';
    const $img = $li.find('div.book_avatar img').first();
    if ($img.length) {
      const raw = getImageSrcLikeJava($img);
      coverUrl = raw ? resolveUrl(pageUrl, raw) : '';
    }
    const $ch = $li.find('div.last_chapter a').first();
    const latestChapterLabel =
      $ch.text().trim().replace(/\s+/g, ' ') ||
      String($ch.attr('title') || '').trim() ||
      '';
    items.push({
      title: title || mangaUrl,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });
  return items;
}

function parseTruyenGgPostSearchListingHtml(html, originForRelative) {
  const base_for_resolve = String(originForRelative || getActiveDomain()).trim() || DOMAIN;
  const wrapped = `<ul id="truyengg-search-root">${String(html || '').trim()}</ul>`;
  const $ = cheerio.load(wrapped);
  const items = [];
  $('#truyengg-search-root > li').each((_, li) => {
    const $li = $(li);
    if ($li.find('.no_result').length) return;
    const $a = $li.find('a[href*="truyen-tranh"]').first();
    const href = String($a.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = /^https?:\/\//i.test(href) ? href : resolveUrl(base_for_resolve, href);
    const title =
      $li.find('p.name').first().text().trim().replace(/\s+/g, ' ') || mangaUrl;
    let coverUrl = '';
    const $img = $li.find('div.search_avatar img').first();
    if ($img.length) {
      const raw = getImageSrcLikeJava($img);
      coverUrl = raw ? resolveUrl(mangaUrl, raw) : '';
    }
    const latestChapterLabel = $li
      .find('div.search_info p')
      .filter((__, p) => !$(p).hasClass('name') && !$(p).hasClass('name_other'))
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ');
    items.push({
      title: title || mangaUrl,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });
  return items;
}

function extractCover(html, pageUrl) {
  const $ = cheerio.load(html);
  const $img = $('div.book_avatar img').first();
  if ($img.length) {
    const raw = getImageSrcLikeJava($img);
    if (raw) return resolveUrl(pageUrl, raw);
  }
  for (const sel of ['meta[property="og:image"]', 'meta[itemprop="image"]', 'meta[name="twitter:image"]']) {
    const content = $(sel).attr('content');
    if (content && !content.includes('logo') && !content.includes('favicon')) {
      return resolveUrl(pageUrl, content.trim().split(/\s+/)[0]);
    }
  }
  return '';
}

class TruyenGgService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const activeDomain = getActiveDomain();
    const fetched = await fetchHtml(trimmed, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: activeDomain,
    });
    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.error || 'Không tải được trang truyện.',
      };
    }

    const html = fetched.html;
    const finalUrl = fetched.finalUrl || trimmed;
    const { title, chapters, description } = this.parseMangaPage(html, finalUrl);

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện (selector trang có thể đổi).' };
    }

    const coverUrl = extractCover(html, finalUrl);
    const slug = extractSlug(finalUrl) || extractSlug(trimmed);

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: finalUrl,
        mangaId: slug,
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  parseMangaPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const title =
      $(SELECTORS.title).first().text().trim() ||
      $('h1').first().text().trim() ||
      $('title').first().text().trim().replace(/\s*[-–|].*$/, '') ||
      '';

    const chapters = [];
    const seen = new Set();
    const chapterEls = $(SELECTORS.chapterLinks);
    const collectFromLink = ($a) => {
      let href = ($a.attr('href') || '').trim();
      if (!href) return;
      href = resolveUrl(pageUrl, href);
      if (seen.has(href)) return;
      seen.add(href);
      const text = $a.text().trim();
      chapters.push({ url: href, title: text || href });
    };

    if (chapterEls.length) {
      chapterEls.each((_, el) => collectFromLink($(el)));
    } else {
      $('a[href*="-chap-"]').each((_, el) => collectFromLink($(el)));
    }

    let description = '';
    const $desc = $('[itemprop="description"]:not(meta), .detail-content').first();
    if ($desc.length) {
      description = $desc.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
    }

    return { title, chapters, description };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const activeDomain = getActiveDomain();
    const fetched = await fetchHtml(chapterUrl, {
      referer: referer || activeDomain,
      userAgent: USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }
    const finalRef = referer || fetched.finalUrl || chapterUrl;
    return collectTruyenQQChapterImages(fetched.html, finalRef);
  }
}

const service = new TruyenGgService();

async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const ua = options.userAgent || USER_AGENT_JSOUP;
  const cookie = options.cookie;
  const cleanOrigin = normalizeOriginBase(getActiveDomain());

  if (search_query) {
    const search_url = `${cleanOrigin}/frontend/search/search`;
    const referer = `${cleanOrigin}/`;
    const fetched = await fetchHtml(search_url, {
      method: 'POST',
      body: `search=${encodeURIComponent(search_query)}`,
      contentType: 'application/x-www-form-urlencoded',
      accept: 'text/html,*/*',
      userAgent: ua,
      referer,
      cookie,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: cleanOrigin,
      },
    });
    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.error || 'Không tải được kết quả tìm TruyenGG.',
      };
    }
    const items = parseTruyenGgPostSearchListingHtml(fetched.html, referer);
    return {
      ok: true,
      siteId: SITE_ID,
      page: 1,
      totalPages: 1,
      items,
    };
  }

  const listingUrl = buildLatestUpdatesListUrl(cleanOrigin, page);
  const fetched = await fetchHtml(listingUrl, {
    accept: 'text/html,application/xhtml+xml',
    userAgent: ua,
    referer: `${cleanOrigin}/`,
    cookie,
  });
  if (!fetched.ok) {
    return {
      ok: false,
      error: fetched.error || 'Không tải được danh sách TruyenGG.',
    };
  }
  const items = parseTruyenGgLatestListingHtml(fetched.html, listingUrl);
  const totalPages = Math.max(1, parseTruyenGgLatestPagerMaxPageFromHtml(fetched.html));
  return {
    ok: true,
    siteId: SITE_ID,
    page,
    totalPages,
    items,
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  SITE_ID,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  extractSlug,
  parseTruyenGgLatestListingHtml,
  parseTruyenGgPostSearchListingHtml,
  parseTruyenGgLatestPagerMaxPageFromHtml,
  buildLatestUpdatesListUrl,
};
