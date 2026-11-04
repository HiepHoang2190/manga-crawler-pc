/**
 * NetTruyenAR — nettruyenar.com (NetTruyen mirror, Vietnamese).
 * Parsing aligned with mobile assets/plugins/nettruyenar.js: chapter links, CDN images.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getFileExt,
  isValidImgSrc,
  getImageSrcFromEl,
} = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { NETTRUYENAR_IMAGE_REFERER } = require('../../../download/connector/connectorReferer');

const DOMAIN = 'https://nettruyenar.com/';
const LABEL = 'NetTruyenAR';

/** Placeholders — load() / fetchChapterImages() are fully overridden. */
const UNUSED_SELECTORS = {
  chapterLinks: 'a',
  title: 'h1',
  cover: 'img',
};

function getMangaOrigin(urlString) {
  try {
    const u = new URL(String(urlString).trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://nettruyenar.com';
  }
}

/** Referer like browser: manga detail path without /chapter-…/id (helps some CF / edge rules). */
function deriveMangaRefererFromChapterUrl(chapterUrlString) {
  try {
    const u = new URL(String(chapterUrlString).trim());
    const pathname = u.pathname.replace(/\/+$/, '');
    const chapter_suffix = /\/chapter-[^/]+\/[^/]+$/i.exec(pathname);
    if (!chapter_suffix) return '';
    const manga_path = pathname.slice(0, -chapter_suffix[0].length);
    if (!manga_path.startsWith('/truyen-tranh/')) return '';
    return `${u.origin}${manga_path}`;
  } catch {
    return '';
  }
}

function extractMangaSlug(urlString) {
  try {
    const parts = new URL(String(urlString).trim()).pathname
      .replace(/^\/truyen-tranh\//, '')
      .split('/');
    return parts[0] || '';
  } catch {
    return '';
  }
}

/** Manga page uses slug-id; chapter URLs often use slug without trailing numeric id. */
function buildChapterPathSlugCandidates(slug) {
  const candidates = [slug];
  const stripped_slug = String(slug || '').replace(/-\d+$/, '');
  if (stripped_slug && stripped_slug !== slug) candidates.push(stripped_slug);
  return candidates;
}

function chapterHrefMatchesSlugCandidates(absoluteHref, origin, slug_candidates) {
  try {
    const u = new URL(absoluteHref);
    if (`${u.protocol}//${u.host}` !== origin || !u.pathname.includes('/chapter-')) return false;
    return slug_candidates.some((s) => u.pathname.startsWith(`/truyen-tranh/${s}/`));
  } catch {
    return false;
  }
}

/** Same href as Ch.1 / latest chapter but label is a reader shortcut — must skip (DOM order would steal dedupe). */
function isChapterNavShortcutLink($el) {
  const combined = `${$el.text() || ''} ${$el.attr('title') || ''}`;
  return (
    /đọc\s*từ\s*đầu/i.test(combined) ||
    /đọc\s*mới\s*nhất/i.test(combined) ||
    /doc\s*tu\s*dau/i.test(combined) ||
    /doc\s*moi\s*nhat/i.test(combined)
  );
}

const CHAPTER_LIST_LINK_SELECTORS = [
  '#nt_listchapter a[href*="/chapter-"]',
  '#chapter_list a[href*="/chapter-"]',
  '.list-chapter a[href*="/chapter-"]',
];

/** Values injected next to chapter reader — used for ComicService ChapterList API. */
function extractComicListApiParamsFromHtml(htmlString) {
  const h = String(htmlString || '');
  const comic_id_match = /gOpts\.comicId\s*=\s*['"]?(\d+)['"]?/i.exec(h);
  const api_slug_match = /gOpts\.comicSlug\s*=\s*['"]([^'"]+)['"]/i.exec(h);
  if (!comic_id_match || !api_slug_match) return null;
  return { comicId: comic_id_match[1], apiSlug: api_slug_match[1] };
}

/**
 * Parse ChapterList JSON: { data: [{ chapter_id, chapter_slug, chapter_name, chapter_num }, ...] }.
 * Reader URLs: /truyen-tranh/{apiSlug}/chapter-{n}/{chapter_id}
 */
function parseChapterListApiJson(jsonText, origin, path_slug) {
  const trimmed = String(jsonText || '').trim();
  let root;
  try {
    root = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(root) ? root : root.data || root.chapters;
  if (!Array.isArray(items) || !items.length) return [];
  const chapters = [];
  for (const item of items) {
    const chapter_id = item.chapter_id ?? item.chapterId;
    const chapter_slug = item.chapter_slug ?? item.chapterSlug;
    const chapter_name = item.chapter_name ?? item.chapterName ?? '';
    const chapter_num = item.chapter_num ?? item.chapterNum;
    if (chapter_id == null || !chapter_slug) continue;
    const chapter_url = `${origin}/truyen-tranh/${path_slug}/${chapter_slug}/${chapter_id}`;
    const raw_title =
      chapter_name ||
      (chapter_num != null ? `Chapter ${chapter_num}` : String(chapter_slug));
    chapters.push({
      url: chapter_url,
      title: formatChapterTitle(String(raw_title).trim() || chapter_url),
    });
  }
  return chapters;
}

function collectChaptersFromHtmlAnchors($, trimmed, origin, slug_candidates) {
  const chapters = [];
  const seenChapterUrls = new Set();

  let $chapterLinks = null;
  for (const list_sel of CHAPTER_LIST_LINK_SELECTORS) {
    const $found = $(list_sel);
    if (!$found.length) continue;
    const $matching = $found.filter((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return false;
      const absoluteUrl = resolveUrl(trimmed, href);
      return chapterHrefMatchesSlugCandidates(absoluteUrl, origin, slug_candidates);
    });
    if ($matching.length) {
      $chapterLinks = $matching;
      break;
    }
  }

  if (!$chapterLinks || !$chapterLinks.length) {
    $chapterLinks = $('a[href*="/chapter-"]').filter((_, el) => {
      const $a = $(el);
      if (isChapterNavShortcutLink($a)) return false;
      const href = ($a.attr('href') || '').trim();
      if (!href) return false;
      const absoluteUrl = resolveUrl(trimmed, href);
      return chapterHrefMatchesSlugCandidates(absoluteUrl, origin, slug_candidates);
    });
  }

  $chapterLinks.each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;
    const absoluteUrl = resolveUrl(trimmed, href);
    if (!chapterHrefMatchesSlugCandidates(absoluteUrl, origin, slug_candidates)) return;
    if (seenChapterUrls.has(absoluteUrl)) return;
    seenChapterUrls.add(absoluteUrl);

    let chapterTitle = $(el).text().trim();
    if (!chapterTitle) chapterTitle = ($(el).attr('title') || '').trim();
    if (!chapterTitle) chapterTitle = absoluteUrl;

    chapters.push({
      url: absoluteUrl,
      title: formatChapterTitle(chapterTitle),
    });
  });

  return chapters;
}

/**
 * Extract ordered page image URLs from embedded JSON `"image": ["https://...", ...]`.
 */
function parseImageJsonArrayFromHtml(html) {
  const haystack = String(html || '');
  const needle = '"image"';
  let searchFrom = 0;

  while (searchFrom < haystack.length) {
    const keyPos = haystack.indexOf(needle, searchFrom);
    if (keyPos === -1) break;
    let i = keyPos + needle.length;
    while (i < haystack.length && /\s/.test(haystack[i])) i++;
    if (haystack[i] !== ':') {
      searchFrom = keyPos + 1;
      continue;
    }
    i++;
    while (i < haystack.length && /\s/.test(haystack[i])) i++;
    if (haystack[i] !== '[') {
      searchFrom = keyPos + 1;
      continue;
    }

    const arrayStart = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; i < haystack.length; i++) {
      const ch = haystack[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          const slice = haystack.slice(arrayStart, i + 1);
          try {
            const parsed = JSON.parse(slice);
            if (
              Array.isArray(parsed) &&
              parsed.length &&
              parsed.every((item) => typeof item === 'string' && /^https?:\/\//i.test(item.trim()))
            ) {
              const urls = parsed
                .map((s) => s.trim())
                .filter(
                  (u) =>
                    /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) &&
                    !/\/thumb\//i.test(u) &&
                    isValidImgSrc(u)
                );
              if (urls.length) return urls;
            }
          } catch {
            /* try next occurrence */
          }
          break;
        }
      }
    }
    searchFrom = keyPos + 1;
  }
  return [];
}

function parseChapterImagesFromHtmlNetTruyenStyle(html, chapterUrl) {
  const trimmedHtml = String(html || '');
  const $ = cheerio.load(trimmedHtml);

  // NetTruyenAR: JSON-LD "image" is often a short preview; full chapter uses .page-chapter img (data-src / lozad).
  const priorityDomSelectors = ['div.page-chapter img', '.page-chapter img'];
  for (const sel of priorityDomSelectors) {
    const collectedDomUrls = [];
    $(sel).each((_, el) => {
      const $el = $(el);
      let src =
        getImageSrcFromEl($el) ||
        ($el.attr('data-sv1') || '').trim() ||
        ($el.attr('data-sv2') || '').trim() ||
        ($el.attr('data-original') || '').trim();
      if (!src) return;
      src = resolveUrl(chapterUrl, src);
      if (src && isValidImgSrc(src)) collectedDomUrls.push(src);
    });
    if (collectedDomUrls.length) {
      const seen_urls = new Set();
      const deduped_urls = [];
      for (const u of collectedDomUrls) {
        if (seen_urls.has(u)) continue;
        seen_urls.add(u);
        deduped_urls.push(u);
      }
      return deduped_urls;
    }
  }

  const fromJson = parseImageJsonArrayFromHtml(trimmedHtml);
  if (fromJson.length) return fromJson;

  const jsArrMatch =
    /(?:var\s+)?(?:lstImages|listImages|imageList|arrImages)\s*=\s*(\[[\s\S]*?\])/i.exec(trimmedHtml);
  if (jsArrMatch) {
    try {
      const arr = JSON.parse(jsArrMatch[1]);
      const urls = [];
      for (const item of arr) {
        const src =
          typeof item === 'string' ? item.trim() : String(item?.url || item?.src || '').trim();
        if (src && /^https?:\/\//i.test(src) && isValidImgSrc(src)) urls.push(src);
      }
      if (urls.length) return urls;
    } catch {
      /* fall through */
    }
  }

  const urls = [];
  const selectors = [
    '#chapter-content img',
    '.reading-content img',
    '.chapter-content img',
    '#content img',
    '.vung_doc img',
    'article img',
  ];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      let src =
        getImageSrcFromEl($el) ||
        ($el.attr('data-sv1') || '').trim() ||
        ($el.attr('data-sv2') || '').trim() ||
        ($el.attr('data-original') || '').trim();
      if (!src) return;
      src = resolveUrl(chapterUrl, src);
      if (src && isValidImgSrc(src)) urls.push(src);
    });
    if (urls.length) break;
  }
  return urls;
}

function parseNetTruyenArListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $('a[href*="?page="], a[href*="&page="]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = /[?&]page=(\d+)/i.exec(href);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
  });
  return maxPage;
}

function parseNetTruyenArListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $('a[href*="/truyen-tranh/"]').each((_, el) => {
    if (items.length >= 30) return false;
    const $a = $(el);
    const href = String($a.attr('href') || '').trim();
    if (!href || href.includes('/chapter-')) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    if (seenUrls.has(mangaUrl)) return;
    seenUrls.add(mangaUrl);

    const title =
      String($a.attr('title') || '').trim() ||
      $a.text().trim().replace(/\s+/g, ' ');
    if (!title) return;

    let coverUrl = '';
    const $img = $a.find('img').first();
    if ($img.length) {
      // Mirror mobile _imgSrc: try attrs in priority order, only accept http URLs.
      // src is last — nettruyen puts a placeholder gif there while the real URL is in data-src/data-sv1.
      let raw = '';
      for (const attr of ['data-src', 'data-sv1', 'data-sv2', 'data-original', 'src']) {
        const v = ($img.attr(attr) || '').trim();
        if (v.startsWith('http')) { raw = v; break; }
      }
      if (raw) coverUrl = raw;
    }

    let latestChapterLabel = '';
    let ancestor = $a.parent()[0];
    for (let i = 0; i < 5 && ancestor; i++) {
      const $ancestor = $(ancestor);
      const $chLink = $ancestor.find('a[href*="/chapter-"]').first();
      if ($chLink.length) {
        latestChapterLabel = $chLink.text().trim().replace(/\s+/g, ' ');
        break;
      }
      ancestor = $ancestor.parent()[0];
    }

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

class NetTruyenArService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'nettruyenar',
      selectors: UNUSED_SELECTORS,
      imageReferer: NETTRUYENAR_IMAGE_REFERER,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const slug = extractMangaSlug(trimmed);
    if (!slug) return { ok: false, error: 'Không đọc được slug từ URL.' };

    const slug_candidates = buildChapterPathSlugCandidates(slug);
    const origin = getMangaOrigin(trimmed);
    const userCookie = this._effectiveUserCookie();
    let fetched;
    try {
      fetched = await fetchHtml(trimmed, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: `${origin}/`,
        ...(userCookie ? { cookie: userCookie } : {}),
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    let title = $('h1').first().text().trim();
    if (!title) {
      title = ($('meta[property="og:title"]').attr('content') || '').trim().replace(/\s*[-–|].*$/, '');
    }
    title = title.replace(/\s*[-–|].*$/, '').trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    let coverUrl = '';
    const coverSelectors = [
      '.detail-info img.image-thumb',
      '.detail-info .col-image img',
      '.book_avatar img',
      '.manga-info-pic img',
      'figure.cover img',
    ];
    for (const sel of coverSelectors) {
      const $img = $(sel).first();
      if ($img.length) {
        const src = getImageSrcFromEl($img) || ($img.attr('data-src') || '').trim();
        if (src && !/^data:/i.test(src)) {
          coverUrl = resolveUrl(trimmed, src);
          break;
        }
      }
    }
    if (!coverUrl) {
      coverUrl = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (coverUrl) coverUrl = resolveUrl(trimmed, coverUrl);
    }

    let chapters = [];
    const comic_list_params = extractComicListApiParamsFromHtml(fetched.html);
    if (comic_list_params) {
      const chapter_list_url = `${origin}/Comic/Services/ComicService.asmx/ChapterList?slug=${encodeURIComponent(
        comic_list_params.apiSlug
      )}&comicId=${encodeURIComponent(comic_list_params.comicId)}`;
      try {
        const api_fetched = await fetchHtml(chapter_list_url, {
          userAgent: options.userAgent || USER_AGENT_JSOUP,
          referer: trimmed,
          accept: 'application/json, text/plain, */*',
          ...(userCookie ? { cookie: userCookie } : {}),
        });
        if (api_fetched.ok && api_fetched.html) {
          chapters = parseChapterListApiJson(api_fetched.html, origin, comic_list_params.apiSlug);
        }
      } catch {
        /* fall back to DOM */
      }
    }

    if (!chapters.length) {
      chapters = collectChaptersFromHtmlAnchors($, trimmed, origin, slug_candidates);
    }

    chapters.reverse();

    let description = '';
    const $desc = $('.detail-content .shortened').first();
    if ($desc.length) {
      const text = $desc.text().trim().replace(/\s+/g, ' ');
      const cut = text.search(/\s+FAQ\s+(chi tiết|:)/i);
      description = (cut > 0 ? text.slice(0, cut) : text).trim().slice(0, 1000);
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description,
        mangaUrl: trimmed,
        mangaId: slug,
        siteId: 'nettruyenar',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const origin = getMangaOrigin(chapterUrl);
    const userCookie = this._effectiveUserCookie();
    const derived_manga_referer = deriveMangaRefererFromChapterUrl(chapterUrl);
    const request_referer = (
      derived_manga_referer ||
      (referer && String(referer).trim()) ||
      `${origin}/`
    ).trim();
    let fetched;
    try {
      fetched = await fetchHtml(chapterUrl, {
        referer: request_referer,
        userAgent: USER_AGENT_JSOUP,
        ...(userCookie ? { cookie: userCookie } : {}),
      });
    } catch (err) {
      throw new Error(String(err?.message || err));
    }

    if (!fetched.ok) {
      throw new Error(fetched.error || 'Không tải được trang chương.');
    }

    const rawUrls = parseChapterImagesFromHtmlNetTruyenStyle(fetched.html, chapterUrl);
    if (!rawUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return rawUrls.map((imageUrl) => ({
      imageUrl,
      ext: getFileExt(imageUrl) || 'jpg',
    }));
  }

  async fetchLatestUpdates(options = {}) {
    const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
    const searchQuery = String(rawSearch || '').trim();
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const ua = options.userAgent || USER_AGENT_JSOUP;

    let listingUrl;
    if (searchQuery) {
      listingUrl =
        page > 1
          ? `${DOMAIN}tim-truyen?keyword=${encodeURIComponent(searchQuery)}&page=${page}`
          : `${DOMAIN}tim-truyen?keyword=${encodeURIComponent(searchQuery)}`;
    } else {
      listingUrl = page > 1 ? `${DOMAIN}?page=${page}` : DOMAIN;
    }

    let fetched;
    try {
      fetched = await fetchHtml(listingUrl, {
        userAgent: ua,
        referer: DOMAIN,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được danh sách NetTruyenAR.' };
    }

    const items = parseNetTruyenArListingHtml(fetched.html, listingUrl);
    const totalPages = Math.max(1, parseNetTruyenArListingMaxPage(fetched.html));

    return {
      ok: true,
      siteId: 'nettruyenar',
      page,
      totalPages,
      items,
    };
  }
}

const service = new NetTruyenArService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchChapterImages: (chapterUrl, referer) => service.fetchChapterImages(chapterUrl, referer),
  fetchLatestUpdates: (options) => service.fetchLatestUpdates(options),
};
