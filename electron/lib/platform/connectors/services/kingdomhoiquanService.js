/**
 * Kingdom Hội Quán Service using ApiConnectorService
 * Site: kingdomhoiquan.com
 */
const cheerio = require('cheerio');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const kingdomHoiQuanApiClient = require('./kingdomHoiQuanApiClient');
const { fetchHtml, resolveUrl, USER_AGENT_JSOUP } = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://kingdomhoiquan.com/';
const LABEL = 'Kingdom Hội Quán';
const SITE_ID = 'kingdomhoiquan';

class KingdomHoiQuanService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      apiClient: kingdomHoiQuanApiClient,
      imageReferer: DOMAIN,
    });
  }
}

const service = new KingdomHoiQuanService();

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: SITE_ID, page: 1, totalPages: 1, items: [] };
  }
  const htmlFetch = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;

  let fetched;
  try {
    fetched = await htmlFetch(DOMAIN, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: DOMAIN,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: SITE_ID, page: 1, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: SITE_ID, page: 1, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: fetched?.error || 'Không tải được trang Kingdom Hội Quán.' };
  }

  const $ = cheerio.load(String(fetched.html || ''));
  const title = ($('h1.t').first().text() || $('h1').first().text() || 'Kingdom').trim();

  let coverUrl = '';
  const coverDataSrc = $('.cover img').attr('data-src') || $('.cover img').attr('src') || '';
  if (coverDataSrc && !coverDataSrc.startsWith('data:')) {
    coverUrl = resolveUrl(DOMAIN, coverDataSrc);
  }
  if (!coverUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    if (ogImage) coverUrl = resolveUrl(DOMAIN, ogImage);
  }

  let latestChapterLabel = '';
  const gridDataSrc = $('#grid').attr('data-src') || '';
  const listJsonUrl = gridDataSrc ? resolveUrl(DOMAIN, gridDataSrc) : `${DOMAIN}wp-content/uploads/khq/list.json`;
  const jsonFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;

  if (typeof jsonFetch === 'function') {
    try {
      const jsonRes = await jsonFetch(listJsonUrl, {
        headers: {
          'User-Agent': options.userAgent || USER_AGENT_JSOUP,
          Referer: DOMAIN,
        },
        ...(signal ? { signal } : {}),
      });
      if (jsonRes?.ok) {
        const data = await jsonRes.json();
        const list = Array.isArray(data?.c) ? data.c : [];
        if (list.length > 0) {
          let maxKey = -Infinity;
          for (const entry of list) {
            const k = Number(Array.isArray(entry) ? entry[0] : entry);
            if (Number.isFinite(k) && k > maxKey) maxKey = k;
          }
          if (Number.isFinite(maxKey)) {
            const label = maxKey % 10 ? (maxKey / 10).toFixed(1) : String(Math.floor(maxKey / 10));
            latestChapterLabel = `Chap ${label}`;
          }
        }
      }
    } catch {
      /* fallback to static links below */
    }
  }

  if (!latestChapterLabel) {
    const lastCh = $('#grid a.ch, .grid a.ch, a[href*="/chap/"]').first();
    latestChapterLabel = (lastCh.find('b').text() || lastCh.text() || '').trim().replace(/\s+/g, ' ');
  }

  return {
    ok: true,
    siteId: SITE_ID,
    page: 1,
    totalPages: 1,
    items: title ? [{ title, mangaUrl: DOMAIN, coverUrl, latestChapterLabel }] : [],
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  SITE_ID,
  KingdomHoiQuanService,
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
};
