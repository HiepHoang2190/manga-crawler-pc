/**
 * RawKuma Service — rawkuma.net (API-based)
 */

const cheerio = require('cheerio');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const { RawkumaApiClient, IMG_REFERER, extractSlug } = require('./rawkumaApiClient');
const { fetchHtml, resolveUrl, getImageSrcFromEl, USER_AGENT_JSOUP } = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://rawkuma.net/';
const LABEL = 'RawKuma';
const SITE_ID = 'rawkuma';
const RAWKUMA_MAX_PAGES = 500;

function findRawkumaCardRoot($, $imgLink) {
  let $curr = $imgLink.parent();
  let steps = 0;
  while ($curr.length && steps < 8) {
    const $parent = $curr.parent();
    if (!$parent.length || $parent.is('body')) break;
    const slugs = new Set();
    $parent.find('a[href*="/manga/"]').each((_, a) => {
      const s = extractSlug($(a).attr('href'));
      if (s) slugs.add(s);
    });
    if (slugs.size > 1) break;
    $curr = $parent;
    steps += 1;
  }
  return $curr;
}

function parseRawkumaLatestHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const seen = new Set();
  const items = [];

  $('a[href*="/manga/"]').each((_, el) => {
    const $a = $(el);
    if (!$a.find('img').length) return;
    if ($a.closest('.swiper, .swiper-wrapper').length) return;

    const href = ($a.attr('href') || '').trim();
    const slug = extractSlug(href);
    if (!slug) return;
    const mangaUrl = resolveUrl(pageUrl, `/manga/${slug}/`);
    if (!mangaUrl || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const $card = findRawkumaCardRoot($, $a);
    const $img = $a.find('img').first();
    const rawCover = getImageSrcFromEl($img);
    const coverUrl = rawCover && !/^data:/i.test(rawCover) ? resolveUrl(pageUrl, rawCover) : '';

    const title = (
      $card.find('h1, h4, h3').first().text() ||
      $a.attr('title') ||
      $img.attr('alt') ||
      ''
    ).trim();
    if (!title) return;

    let latestChapterLabel = '';
    $card.find(`a[href*="/manga/${slug}/"]`).each((__, chEl) => {
      if (latestChapterLabel) return;
      const chHref = String($(chEl).attr('href') || '').trim();
      const tail = chHref.split(`/manga/${slug}/`)[1] || '';
      if (!tail || tail === '/') return;
      const $p = $(chEl).find('p').first();
      if ($p.length) {
        latestChapterLabel = $p.text().trim();
      } else {
        const $clone = $(chEl).clone();
        $clone.find('time, span').remove();
        latestChapterLabel = $clone.text().trim();
      }
    });

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  let totalPages = 1;
  $('a[href*="the_page="]').each((_, el) => {
    const m = String($(el).attr('href') || '').match(/[?&]the_page=(\d+)/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (Number.isFinite(p) && p > totalPages) totalPages = p;
    }
  });

  return {
    items,
    totalPages: Math.min(RAWKUMA_MAX_PAGES, Math.max(1, totalPages)),
  };
}

class RawkumaService extends ApiConnectorService {
  constructor() {
    const apiClient = new RawkumaApiClient();
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      apiClient,
      imageReferer: IMG_REFERER,
    });
  }

  async fetchLatestUpdates(options = {}) {
    const signal = options.signal || null;
    if (signal?.aborted) {
      return { ok: false, aborted: true, siteId: SITE_ID, page: 1, totalPages: 1, items: [] };
    }
    const page = Math.min(RAWKUMA_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
    const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;
    const listingUrl = `${DOMAIN}latest-update/?the_page=${page}`;

    let fetched;
    try {
      fetched = await fetchImpl(listingUrl, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: DOMAIN,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') {
        return { ok: false, aborted: true, siteId: SITE_ID, page, totalPages: 1, items: [] };
      }
      return { ok: false, error: String(err?.message || err) };
    }
    if (signal?.aborted || fetched?.aborted) {
      return { ok: false, aborted: true, siteId: SITE_ID, page, totalPages: 1, items: [] };
    }
    if (!fetched?.ok) {
      return { ok: false, error: fetched?.error || 'Không tải được danh sách RawKuma.' };
    }

    const parsed = parseRawkumaLatestHtml(fetched.html, listingUrl);
    return {
      ok: true,
      siteId: SITE_ID,
      page,
      totalPages: Math.max(page, parsed.totalPages),
      items: parsed.items,
    };
  }
}

const instance = new RawkumaService();

module.exports = instance;
