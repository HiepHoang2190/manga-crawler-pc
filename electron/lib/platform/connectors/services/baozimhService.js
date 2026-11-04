/**
 * Baozimh (包子漫畫) — www.baozimh.com, mirror www.twmanga.com
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { downloadImageToFile } = require('../../../download/connector/connectorDownloadUtils');
const htmlConnectorUtils = require('../../../download/connector/htmlConnectorUtils');
const {
  USER_AGENT_JSOUP,
  resolveUrl,
  isValidImgSrc,
  getFileExt,
  getImageSrcFromEl,
} = htmlConnectorUtils;

const LABEL = 'Baozimh';
const SITE_ID = 'baozimh';
const IMAGE_REFERER = 'https://www.baozimh.com/';

/** Hosts that currently serve /scomic/ pages from VN/Cloudflare (bzcdn.net is often TCP-blocked). */
const BAOZIMH_PREFERRED_IMAGE_HOSTS = [
  's1.baozimh.com',
  's2.baozimh.com',
  'as.baozimh.com',
  'static-tw.baozimh.com',
];

/** Same Anycast IP as s1.bzcdn.net — TCP 443 frequently fails in VN. */
const BAOZIMH_BLOCKED_IMAGE_HOST_RE = /(?:^|\.)(?:bzcdn\.net|baozicdn\.com)$/i;

function rewriteBaozimhComicImageUrl(imageUrl) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (!parsed.pathname.toLowerCase().includes('/scomic/')) return parsed.href;
  if (!BAOZIMH_BLOCKED_IMAGE_HOST_RE.test(parsed.hostname)) return parsed.href;
  parsed.hostname = BAOZIMH_PREFERRED_IMAGE_HOSTS[0];
  return parsed.href;
}

function baozimhImageUrlCandidates(imageUrl) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return [];
  let pathnameWithQuery;
  try {
    const parsed = new URL(raw);
    pathnameWithQuery = `${parsed.pathname}${parsed.search}`;
    if (!parsed.pathname.toLowerCase().includes('/scomic/')) return [raw];
  } catch {
    return [raw];
  }
  const candidates = [];
  const seen = new Set();
  const add = (url) => {
    if (!url || seen.has(url)) return;
    try {
      const host = new URL(url).hostname;
      if (BAOZIMH_BLOCKED_IMAGE_HOST_RE.test(host)) return;
    } catch {
      return;
    }
    seen.add(url);
    candidates.push(url);
  };
  add(rewriteBaozimhComicImageUrl(raw));
  for (const host of BAOZIMH_PREFERRED_IMAGE_HOSTS) {
    add(`https://${host}${pathnameWithQuery}`);
  }
  return candidates.length ? candidates : [raw];
}

function hostnameOfBaozimhUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Prefer the host that already succeeded in this process so later pages skip dead mirrors. */
function orderBaozimhImageUrlCandidates(imageUrl, preferredHost) {
  const candidates = baozimhImageUrlCandidates(imageUrl);
  const wanted = String(preferredHost || '').trim();
  if (!wanted) return candidates;
  const preferred = [];
  const rest = [];
  for (const url of candidates) {
    if (hostnameOfBaozimhUrl(url) === wanted) preferred.push(url);
    else rest.push(url);
  }
  return preferred.concat(rest);
}

function parseBaozimhChapterImages(html, chapterUrl) {
  const $ = cheerio.load(html);
  const rows = [];
  $('amp-img.comic-contain__item').each((i, el) => {
    const $el = $(el);
    let src = getImageSrcFromEl($el);
    if (!src || !isValidImgSrc(src)) return;
    src = resolveUrl(chapterUrl, src);
    const ext = getFileExt(src) || 'jpg';
    const lower = src.toLowerCase();
    if (!lower.includes('bzcdn.net') && !lower.includes('/scomic/')) return;

    let sort = i;
    const fnMatch = /\/(\d+)\.(jpg|jpeg|png|webp)(\?|$)/i.exec(src);
    if (fnMatch) {
      sort = parseInt(fnMatch[1], 10);
    } else {
      const idAttr = ($el.attr('id') || '').trim();
      const idMatch = /^chapter-img-(\d+)-(\d+)$/i.exec(idAttr);
      if (idMatch) {
        sort = parseInt(idMatch[1], 10) * 1000 + parseInt(idMatch[2], 10);
      }
    }
    rows.push({ sort, imageUrl: rewriteBaozimhComicImageUrl(src), ext });
  });
  rows.sort((a, b) => a.sort - b.sort);
  const deduped = [];
  const seenUrl = new Set();
  for (const row of rows) {
    if (seenUrl.has(row.imageUrl)) continue;
    seenUrl.add(row.imageUrl);
    deduped.push({ imageUrl: row.imageUrl, ext: row.ext });
  }
  return deduped;
}

function isBaozimhComicDetailPath(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  return parts[0] === 'comic' && parts.length >= 2 && parts[1] !== 'chapter';
}

function pageDirectToChapterUrl(pageOrigin, href) {
  const trimmed = String(href || '').trim();
  if (!trimmed.includes('page_direct')) return '';
  let abs;
  try {
    abs = new URL(trimmed.replace(/&amp;/g, '&'), pageOrigin);
  } catch {
    return '';
  }
  const comicId = abs.searchParams.get('comic_id');
  const section = abs.searchParams.get('section_slot');
  const slot = abs.searchParams.get('chapter_slot');
  if (!comicId || section === null || section === '' || slot === null || slot === '') return '';
  const { origin } = abs;
  return `${origin}/comic/chapter/${comicId}/${section}_${slot}.html`;
}

function parseChapterSlotFromChapterUrl(urlString) {
  try {
    const u = new URL(String(urlString || '').trim());
    const m = /\/comic\/chapter\/[^/]+\/(\d+)_(\d+)\.html$/i.exec(u.pathname);
    if (!m) return Number.NaN;
    return parseInt(m[2], 10);
  } catch {
    return Number.NaN;
  }
}

function isAllowedBaozimhHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.includes('baozimh') || h.includes('twmanga');
}

/** HTML mirror hosts for Baozimh pages (baozimh.com is often gatekeeper/Cloudflare-blocked). */
const BAOZIMH_HTML_HOSTS = [
  'www.twmanga.com',
  'www.baozimh.com',
];

function isGatekeeperBlockedHtml(html) {
  const text = String(html || '');
  if (!text) return false;
  return (
    text.length < 50000 &&
    /gatekeeper_challenge|gatekeeperChallenge|challenge_required|正在验证浏览器|浏览器访问验证/i.test(
      text,
    )
  );
}

function baozimhHtmlUrlCandidates(urlString, preferredHost) {
  const raw = String(urlString || '').trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return [raw];
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes('baozimh') && !host.includes('twmanga')) {
    return [raw];
  }

  const pathnameWithQuery = `${parsed.pathname}${parsed.search}`;
  const candidates = [];
  const seen = new Set();

  const add = (h) => {
    if (!h) return;
    const candidate = `https://${h}${pathnameWithQuery}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  };

  const wanted = String(preferredHost || '').trim();
  if (wanted) {
    add(wanted);
  }
  add(parsed.hostname);
  for (const h of BAOZIMH_HTML_HOSTS) {
    add(h);
  }

  return candidates.length ? candidates : [raw];
}

class BaozimhService extends HtmlConnectorService {
  constructor() {
    super({
      domain: 'https://www.baozimh.com/',
      label: LABEL,
      siteId: SITE_ID,
      imageReferer: IMAGE_REFERER,
      selectors: {
        chapterLinks: 'a.comics-chapters__item',
        title: 'h1.comics-detail__title',
        cover: 'meta[property="og:image"]',
      },
    });
    this._workingImageHost = BAOZIMH_PREFERRED_IMAGE_HOSTS[0];
    this._workingHtmlHost = BAOZIMH_HTML_HOSTS[0];
  }

  async fetchBaozimhHtml(url, options = {}) {
    const candidates = baozimhHtmlUrlCandidates(url, this._workingHtmlHost);
    let lastResult = { ok: false, error: 'Không tải được trang.' };

    for (const candidate of candidates) {
      let candidateOrigin = '';
      try {
        candidateOrigin = new URL(candidate).origin;
      } catch {
        /* ignore */
      }
      const fetchOpts = {
        ...options,
        referer: options.referer || (candidateOrigin ? `${candidateOrigin}/` : undefined),
      };

      let fetched;
      try {
        fetched = await htmlConnectorUtils.fetchHtml(candidate, fetchOpts);
      } catch (err) {
        fetched = { ok: false, error: err?.message || 'Lỗi mạng khi tải trang.' };
      }

      const isBlocked =
        (!fetched.ok &&
          (String(fetched.error).includes('403') || String(fetched.error).includes('503'))) ||
        isGatekeeperBlockedHtml(fetched?.html);

      if (fetched.ok && !isBlocked) {
        try {
          const h = new URL(candidate).hostname;
          if (h) this._workingHtmlHost = h;
        } catch {
          /* ignore */
        }
        return { ...fetched, resolvedUrl: candidate };
      }

      lastResult = fetched;
    }

    try {
      const { fetchRenderedHtml } = require('../../renderedFetch');
      if (typeof fetchRenderedHtml === 'function') {
        const renderedHtml = await fetchRenderedHtml(url, { timeout: 35000, waitAfterLoad: 1500 });
        if (renderedHtml && !isGatekeeperBlockedHtml(renderedHtml)) {
          return { ok: true, html: renderedHtml, resolvedUrl: url };
        }
      }
    } catch {
      // renderedFetch unavailable
    }

    return lastResult;
  }

  extractCoverUrl($, pageUrl) {
    const og = ($('meta[property="og:image"]').attr('content') || '').trim();
    if (og && isValidImgSrc(og)) return resolveUrl(pageUrl, og);
    const $amp = $('.comics-detail amp-img').first();
    if ($amp.length) {
      const u = getImageSrcFromEl($amp);
      if (u && isValidImgSrc(u)) return resolveUrl(pageUrl, u);
    }
    return '';
  }

  parseChapters($, pageUrl) {
    let pageOrigin;
    try {
      pageOrigin = new URL(pageUrl).origin;
    } catch {
      return [];
    }
    const seen = new Map();
    $('a.comics-chapters__item[href*="page_direct"]').each((_, el) => {
      const $a = $(el);
      const href = ($a.attr('href') || '').trim().replace(/&amp;/g, '&');
      const title = $a.text().replace(/\s+/g, ' ').trim();
      const chapterUrl = pageDirectToChapterUrl(pageOrigin, href);
      if (!chapterUrl || seen.has(chapterUrl)) return;
      seen.set(chapterUrl, { url: chapterUrl, title: title || chapterUrl });
    });
    const arr = [...seen.values()];
    arr.sort((a, b) => {
      const sa = parseChapterSlotFromChapterUrl(a.url);
      const sb = parseChapterSlotFromChapterUrl(b.url);
      if (!Number.isNaN(sa) && !Number.isNaN(sb) && sa !== sb) return sa - sb;
      return 0;
    });
    return arr;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    let pageUrl;
    try {
      pageUrl = new URL(trimmed);
    } catch {
      return { ok: false, error: 'URL không hợp lệ.' };
    }
    if (!isAllowedBaozimhHost(pageUrl.hostname)) {
      return { ok: false, error: 'Chỉ hỗ trợ baozimh.com / twmanga.com.' };
    }
    if (!isBaozimhComicDetailPath(pageUrl.pathname)) {
      return {
        ok: false,
        error: 'Dán URL trang truyện (vd. …/comic/slug), không phải URL đọc chương.',
      };
    }

    const fetched = await this.fetchBaozimhHtml(trimmed, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const resolvedUrl = fetched.resolvedUrl || trimmed;
    const $ = cheerio.load(fetched.html);
    const title =
      $('h1.comics-detail__title').first().text().trim() ||
      ($('meta[property="og:novel:book_name"]').attr('content') || '').trim() ||
      '';

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const coverUrl = this.extractCoverUrl($, resolvedUrl);
    const chapters = this.parseChapters($, resolvedUrl);

    if (!chapters.length) {
      return { ok: false, error: 'Không tìm thấy danh sách chương.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await this.fetchBaozimhHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }
    const resolvedUrl = fetched.resolvedUrl || chapterUrl;
    const deduped = parseBaozimhChapterImages(fetched.html, resolvedUrl);
    if (!deduped.length) {
      throw new Error('Không tìm thấy ảnh trong chương.');
    }
    return deduped;
  }

  /**
   * Try CDN fallbacks with a short per-host timeout. downloadChapter already
   * retries the page 3 times — do not nest the 30s base fetch here.
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, _maxAttempts = 3, _imageInfo = {}, shouldAbort) {
    const IMAGE_CANDIDATE_TIMEOUT_MS = 8_000;
    const candidates = orderBaozimhImageUrlCandidates(imageUrl, this._workingImageHost);
    let last = { ok: false };
    for (const candidate of candidates) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return last;
      }
      const abort_controller = new AbortController();
      const timer = setTimeout(() => abort_controller.abort(), IMAGE_CANDIDATE_TIMEOUT_MS);
      let poll_interval;
      if (typeof shouldAbort === 'function') {
        poll_interval = setInterval(() => {
          if (shouldAbort()) abort_controller.abort();
        }, 300);
      }
      try {
        last = await downloadImageToFile(candidate, filePath, headers, abort_controller.signal);
      } finally {
        clearTimeout(timer);
        if (poll_interval) clearInterval(poll_interval);
      }
      if (last && last.ok) {
        const working_host = hostnameOfBaozimhUrl(candidate);
        if (working_host) this._workingImageHost = working_host;
        return last;
      }
    }
    return last;
  }
}

const service = new BaozimhService();

function load(url, options) {
  return service.load(url, options);
}

function downloadChapter(payload, connectorLabel) {
  return service.downloadChapter(payload, connectorLabel || LABEL);
}

module.exports = {
  LABEL,
  BaozimhService,
  load,
  downloadChapter,
  rewriteBaozimhComicImageUrl,
  baozimhImageUrlCandidates,
  orderBaozimhImageUrlCandidates,
  baozimhHtmlUrlCandidates,
  parseBaozimhChapterImages,
};
