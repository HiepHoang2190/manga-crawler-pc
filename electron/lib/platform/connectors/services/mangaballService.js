/**
 * MangaBall connector — mangaball.net
 * Site uses JavaScript (Next.js) to render dynamic content.
 * Uses Electron BrowserWindow to render pages and extract chapters from DOM.
 */
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const cheerio = require('cheerio');
const { loadOrCreate } = require('../../storage/downloadDb');
const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
const cookieManager = require('../../cookies/cookieManager');
const { attachDeniedWindowOpenHandler } = require('../../cookies/cookieExtractor');
const {
  formatFolderName,
  formatChapterTitle,
  formatChapterFolderName,
  formatChapterPageFileName,
  isFlatChapterLayout,
  MAX_LENGTH_FOLDER_NAME,
} = require('../../../shared/mangaUtils');
const { USER_AGENT, getChromiumFetch } = require('../../../download/connector/htmlConnectorUtils');
const { isMangaballImageCdnHost } = require('../../../download/connector/connectorReferer');
const logger = require('../../../shared/logger').createLogger('MangaBall');

const SITE_DOMAIN = 'https://mangaball.com';
const IMG_REFERER = 'https://mangaball.com/';
const LABEL = 'MangaBall';
const CHAPTER_LISTING_PATH = '/api/v1/chapter/chapter-listing-by-title-id';

const noop = () => {};

/**
 * Resolve relative API/static paths to absolute URLs; drop scanlation group icons (not page images).
 * Node fetch() throws "Failed to parse URL" for paths like /storage/... without a base.
 */
function normalizeMangaballImageUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  const pathOnly = trimmed.split('?')[0].toLowerCase();
  if (
    pathOnly.includes('/storage/groups/icons/') ||
    pathOnly.includes('/groups/icons/') ||
    pathOnly.includes('/storage/flags/') ||
    pathOnly.includes('/flags/') ||
    pathOnly.includes('/images/groups/icons/') ||
    pathOnly.includes('/images/logo/')
  ) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${SITE_DOMAIN}${trimmed}`;
  }
  if (/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(trimmed) && !trimmed.includes('..')) {
    return `${SITE_DOMAIN}/${trimmed.replace(/^\/+/, '')}`;
  }
  return null;
}

function extractTitleInfo(urlString) {
  const s = String(urlString || '').trim();
  const m = s.match(/\/title-detail\/([^/?#]+)/i);
  if (!m) return null;

  const fullSlug = m[1];
  if (/^[0-9a-f]{24}$/i.test(fullSlug)) {
    return { fullSlug, titleId: fullSlug };
  }
  const parts = fullSlug.split('-');
  if (/^[0-9a-f]{24}$/i.test(parts[0])) {
    return { fullSlug, titleId: parts[0] };
  }
  const lastPart = parts[parts.length - 1];
  if (/^[0-9a-f]{24}$/i.test(lastPart)) {
    return { fullSlug, titleId: lastPart };
  }
  const anyPart = parts.find((p) => /^[0-9a-f]{24}$/i.test(p));
  if (anyPart) {
    return { fullSlug, titleId: anyPart };
  }

  return null;
}

function extractCsrfToken(html) {
  const source = String(html || '');
  const named_first = source.match(
    /name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
  );
  if (named_first) return named_first[1].trim();
  const content_first = source.match(
    /content=["']([^"']+)["']\s+name=["']csrf-token["']/i,
  );
  return content_first ? content_first[1].trim() : '';
}

function mergeCookieHeader(baseCookie, setCookieLines) {
  const cookie_map = new Map();
  const add_pair = (raw_pair) => {
    const pair = String(raw_pair || '').trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const cookie_name = pair.slice(0, eq).trim();
    const cookie_value = pair.slice(eq + 1).trim();
    if (cookie_name) cookie_map.set(cookie_name, cookie_value);
  };
  String(baseCookie || '')
    .split(';')
    .forEach((part) => add_pair(part));
  for (const line of setCookieLines || []) {
    add_pair(String(line).split(';')[0]);
  }
  return [...cookie_map.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function parseChaptersFromMangaBallV2Api(data, lang = 'en') {
  const chapters = [];
  const langMap = {
    en: ['en', 'english'],
    vi: ['vi', 'vietnamese'],
    ja: ['ja', 'japanese', 'jp'],
  };
  const targetLangs = langMap[lang] || ['en', 'english'];

  if (!Array.isArray(data)) return chapters;

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const transId = item.id || item._id || '';
    if (!transId) continue;

    const itemLang = (item.lang || item.language || '').toLowerCase().trim();
    const itemLangName = (item.languageName || item.language_name || '').toLowerCase().trim();
    const lang_base = itemLang.split(/[-_]/)[0];

    const langMatch =
      lang === 'all' ||
      targetLangs.some(
        (needle) => lang_base === needle || itemLang === needle || itemLangName === needle,
      );
    if (!langMatch) continue;

    const chNum = item.number != null ? item.number : item.chapter_number;
    const rawName = String(item.name || '').trim();
    const groupName = item.group_name || item.group?.name || '';
    const volume = item.volume != null ? String(item.volume) : '';

    let displayTitle = '';
    if (rawName) {
      displayTitle = rawName;
    } else if (chNum != null && chNum !== '') {
      displayTitle = `Chapter ${chNum}`;
    } else {
      displayTitle = 'Chapter';
    }

    if (groupName && !displayTitle.includes(`[${groupName}]`)) {
      displayTitle += ` [${groupName}]`;
    }
    if (volume && volume !== '0' && !displayTitle.includes(`Vol ${volume}`)) {
      displayTitle += ` (Vol ${volume})`;
    }

    const chapterUrl = `${SITE_DOMAIN}/chapter-detail/${transId}/`;

    chapters.push({
      url: chapterUrl,
      title: formatChapterTitle(displayTitle),
      pages: item.pages || 0,
      language: itemLangName || itemLang,
    });
  }

  return chapters;
}

function parseListingApiChapters(payload, lang = 'en') {
  if (!payload || typeof payload !== 'object') return [];
  if (payload.code != null && Number(payload.code) !== 200) return [];
  if (
    payload.status != null &&
    payload.status !== 'success' &&
    payload.status !== 200 &&
    payload.status !== true
  ) {
    return [];
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    return parseChaptersFromMangaBallV2Api(payload.data, lang);
  }

  const chapter_groups = payload.ALL_CHAPTERS;
  if (!Array.isArray(chapter_groups) || chapter_groups.length === 0) return [];
  return parseChaptersFromMangaBallApi(chapter_groups, lang);
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        Referer: SITE_DOMAIN,
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, html: await res.text() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Referer: SITE_DOMAIN,
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Find largest array in __NEXT_DATA__ where each item has translations[] (MangaBall chapter groups).
 */
function deepFindChapterGroupArray(root) {
  const candidates = [];
  function visit(node, depth) {
    if (depth > 18 || node == null) return;
    if (Array.isArray(node)) {
      if (node.length > 0) {
        const allHaveTranslations = node.every(
          (it) =>
            it &&
            typeof it === 'object' &&
            !Array.isArray(it) &&
            Array.isArray(it.translations),
        );
        if (allHaveTranslations) candidates.push(node);
      }
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const k of Object.keys(node)) visit(node[k], depth + 1);
    }
  }
  visit(root, 0);
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || [];
}

/**
 * Extract a numeric chapter/volume value from a title string for sorting.
 */
function extractChapterSortKey(title) {
  const s = String(title || '').trim();
  if (!s) return null;
  const kwMatch = s.match(
    /(?:chapter|chap|ch\.?|vol\.?)\s*[-#:]?\s*(\d+(?:\.\d+)?)/i,
  );
  if (kwMatch) return { num: parseFloat(kwMatch[1]), raw: kwMatch[0] };
  const plain = s.match(/^(\d+(?:\.\d+)?)\b/);
  if (plain) return { num: parseFloat(plain[1]), raw: plain[0] };
  return null;
}

function browserRowToChapter(row) {
  const chapterId = row.chapterId;
  let fullTitle = row.chapterTitle || '';
  if (row.groupName) fullTitle += ` [${row.groupName}]`;
  const language = row.language || '';
  if (language && language !== 'English') fullTitle += ` (${language})`;
  return {
    url: `${SITE_DOMAIN}/chapter-detail/${chapterId}/`,
    title: formatChapterTitle(fullTitle),
    pages: 0,
    language,
  };
}

function sortChaptersByNumber(chapters) {
  return [...chapters].sort((a, b) => {
    const ka = extractChapterSortKey(a.title);
    const kb = extractChapterSortKey(b.title);
    if (ka && kb) return kb.num - ka.num;
    if (ka && !kb) return -1;
    if (!ka && kb) return 1;
    return 0;
  });
}

function chapterIdFromMangaballUrl(urlString) {
  const m = String(urlString || '').match(/chapter-detail\/([^/?#]+)/i);
  return m ? m[1] : '';
}

function filterMangaballDomChaptersByLang(chapters, lang) {
  if (!chapters.length) return chapters;
  if (!chapters[0].language) return chapters;
  const langMap = {
    en: ['english'],
    vi: ['vietnamese', 'tiếng việt'],
    ja: ['japanese', '日本語'],
  };
  const targetLangs = langMap[lang] || langMap.en;
  const filtered = chapters.filter((ch) => {
    const chLang = (ch.language || '').toLowerCase().trim();
    return targetLangs.some((l) => {
      const targetLower = l.toLowerCase();
      return chLang === targetLower || chLang.startsWith(targetLower);
    });
  });
  if (filtered.length === 0) {
    logger.warn('Language filter removed all chapters; keeping unfiltered list');
    return chapters;
  }
  return filtered.map(({ language: _lang, ...rest }) => rest);
}

// ─── Browser-injected JS snippets ────────────────────────────────────────────

/**
 * Shared findGroupHeading helper — inlined into browser JS snippets.
 * Walks DOM siblings/parents to locate the nearest chapter group heading (e.g. "Ch. 9").
 */
const FIND_GROUP_HEADING_JS = `
  function findGroupHeading(el) {
    let cur = el;
    while (cur) {
      let prev = cur.previousElementSibling;
      while (prev) {
        const tag = prev.tagName;
        if (/^H[1-6]$/.test(tag)) {
          const t = prev.textContent.trim();
          if (/ch(ap(ter)?)?\.?\\s*\\d/i.test(t) || /vol\\.?\\s*\\d/i.test(t) || /^\\d+(\\.\\d+)?$/.test(t)) return t;
        }
        const bold = prev.querySelector('b, strong, [class*="chapter-num"], [class*="chapterNum"]');
        if (bold) {
          const t = bold.textContent.trim();
          if (/ch(ap(ter)?)?\.?\\s*\\d/i.test(t) || /vol\\.?\\s*\\d/i.test(t) || /^\\d+(\\.\\d+)?$/.test(t)) return t;
        }
        const directText = prev.textContent.trim();
        if (directText.length < 30 && (/ch(ap(ter)?)?\.?\\s*\\d/i.test(directText) || /vol\\.?\\s*\\d/i.test(directText))) return directText;
        prev = prev.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return '';
  }`;

/** Extract chapter rows from rendered DOM, prepending group heading (Ch. X) for consistent naming. */
const CHAPTER_ROWS_EXTRACT_JS = `(function () {
  const rows = [];
  ${FIND_GROUP_HEADING_JS}
  document.querySelectorAll('div.chapter-translation[data-chapter-id]').forEach((div) => {
    const chapterId = div.getAttribute('data-chapter-id');
    if (!chapterId) return;
    const langBadge = div.querySelector('span.badge');
    const language = langBadge ? langBadge.textContent.trim() : '';
    const chapterSpan = div.querySelector('span.group.small.text-primary');
    let chapterTitle = chapterSpan ? chapterSpan.textContent.trim() : '';
    chapterTitle = chapterTitle.replace(/^\\s*Chapter\\s*/i, 'Chapter ').trim();
    const groupSpan = div.querySelector('span.group.small.text-info');
    let groupName = '';
    if (groupSpan) {
      const textNodes = Array.from(groupSpan.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join(' ');
      groupName = textNodes || groupSpan.textContent.trim();
    }
    const heading = findGroupHeading(div);
    if (heading) {
      const stripped = chapterTitle.replace(/^(chapter|chap|ch\\.?)\\s*\\d+(\\.\\d+)?\\s*/i, '').trim();
      chapterTitle = stripped ? heading + ' ' + stripped : heading;
    }
    rows.push({ chapterId, language, chapterTitle, groupName });
  });
  return rows;
})()`;

const PAGINATION_DETECT_JS = `(function () {
  function pagRoots() {
    const roots = [];
    document.querySelectorAll('[class]').forEach((el) => {
      if (/pagination/i.test(el.getAttribute('class') || '')) roots.push(el);
    });
    return roots;
  }
  let maxPage = 1;
  let param = '';
  const allowedParam = { page: 1, p: 1, chapterpage: 1, translationpage: 1, offset: 1, skip: 1 };
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/[?&]([a-zA-Z][a-zA-Z0-9_-]*)=([0-9]+)/);
    if (!m) return;
    const key = m[1].toLowerCase();
    if (!allowedParam[key]) return;
    const pnum = parseInt(m[2], 10);
    if (pnum < 2 || pnum > 600) return;
    param = m[1];
    if (pnum > maxPage && pnum < 200) maxPage = pnum;
  });
  const roots = pagRoots();
  (roots.length ? roots : [document.body]).forEach((root) => {
    root.querySelectorAll('button, a[role="button"], a').forEach((el) => {
      const raw = el.textContent.replace(/\\s+/g, '').trim();
      if (raw === '' || raw === '...' || raw === '>' || raw === '<' || raw === '>>' || raw === '<<') return;
      const num = parseInt(raw, 10);
      if (!Number.isNaN(num) && num > maxPage && num < 200) maxPage = num;
    });
  });
  return { maxPage, param };
})()`;

const PAGINATION_HAS_NEXT_JS = `(function () {
  function pagRoots() {
    const roots = [];
    document.querySelectorAll('[class]').forEach((el) => {
      if (/pagination/i.test(el.getAttribute('class') || '')) roots.push(el);
    });
    return roots;
  }
  const rel = document.querySelector('a[rel="next"]');
  if (rel && rel.offsetParent !== null && rel.getAttribute('aria-disabled') !== 'true') return true;
  const cur = document.querySelector('[aria-current="page"]');
  if (cur) {
    let sib = cur.nextElementSibling;
    while (sib) {
      if (sib.matches && sib.matches('button, a[role="button"], a')) {
        const raw = sib.textContent.replace(/\\s+/g, '').trim();
        if (raw === '>' || raw === '›') {
          if (!sib.disabled && sib.getAttribute('aria-disabled') !== 'true') return true;
        }
        if (/^\\d+$/.test(raw) && !sib.disabled) return true;
      }
      sib = sib.nextElementSibling;
    }
  }
  const roots = pagRoots();
  for (const root of roots.length ? roots : [document.body]) {
    for (const el of root.querySelectorAll('button, a[role="button"]')) {
      const raw = el.textContent.replace(/\\s+/g, '').trim();
      if (raw !== '>' && raw !== '›') continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (el.classList.contains('disabled')) continue;
      return true;
    }
    for (const el of root.querySelectorAll('button[aria-label*="next" i]')) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const lab = (el.getAttribute('aria-label') || '').toLowerCase();
      if (lab.includes('last') || lab.includes('cuối')) continue;
      return true;
    }
  }
  return false;
})()`;

const READ_MANGA_META_JS = `(function () {
  const out = { title: '', coverUrl: '' };
  const absUrl = (u) => {
    if (!u || typeof u !== 'string') return '';
    const s = u.trim();
    if (!s) return '';
    if (/^https?:\\/\\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('/')) return window.location.origin + s;
    return s;
  };
  const pickFromObject = (obj, titleKeys, coverKeys) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of titleKeys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim().length > 2) {
        out.title = v.trim();
        break;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const sub =
          v.en || v.vi || v.ja || v.jp || Object.values(v).find((x) => typeof x === 'string');
        if (typeof sub === 'string' && sub.trim().length > 2) {
          out.title = sub.trim();
          break;
        }
      }
    }
    for (const k of coverKeys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) {
        out.coverUrl = absUrl(v.trim());
        break;
      }
    }
  };
  try {
    const el = document.querySelector('#__NEXT_DATA__');
    if (el) {
      const pp = JSON.parse(el.textContent).props?.pageProps;
      if (pp) {
        pickFromObject(pp, ['title', 'name', 'englishTitle', 'mangaTitle'], [
          'coverUrl', 'cover', 'thumbnailUrl', 'thumbnail', 'poster',
        ]);
        const nested = pp.titleDetail || pp.manga || pp.series || pp.data || pp.initialData;
        if (nested && typeof nested === 'object') {
          if (!out.title) pickFromObject(nested, ['title', 'name', 'englishTitle'], []);
          if (!out.coverUrl) pickFromObject(nested, [], ['coverUrl', 'cover', 'thumbnailUrl', 'thumbnail']);
        }
      }
    }
  } catch (e) {}
  try {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && (!out.title || out.title.length < 3)) {
      out.title = ogTitle
        .split('|')[0]
        .split(' - ')[0]
        .replace(/\\s*-\\s*MangaBall\\s*$/i, '')
        .replace(/\\s*MangaBall\\s*$/i, '')
        .trim();
    }
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage && !out.coverUrl) out.coverUrl = absUrl(ogImage);
  } catch (e) {}
  if (!out.title || out.title.length < 2) {
    const h = document.querySelector(
      'main h1, article h1, h1.text-3xl, [class*="title-detail"] h1, h1.font-bold',
    );
    if (h) {
      const txt = h.textContent
        .trim()
        .split(/\\n/)
        .map((s) => s.trim())
        .find((s) => s.length > 2);
      if (txt && !/^mangaball$/i.test(txt)) out.title = txt;
    }
  }
  return out;
})()`;

/** Click a specific page number button (or > / Next fallback) in pagination. */
const CLICK_PAGE_JS = (targetPage) => `(function () {
  const target = ${targetPage};
  function pagRoots() {
    const roots = [];
    document.querySelectorAll('[class]').forEach((el) => {
      if (/pagination/i.test(el.getAttribute('class') || '')) roots.push(el);
    });
    return roots;
  }
  const roots = pagRoots();
  const scope = roots.length ? roots : [document.body];
  for (const root of scope) {
    for (const el of root.querySelectorAll('button, a[role="button"], a')) {
      const raw = el.textContent.replace(/\\s+/g, '').trim();
      if (raw === String(target) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return 'clicked_number';
      }
    }
  }
  for (const root of scope) {
    for (const el of root.querySelectorAll('button, a[role="button"], a')) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
      if (lbl.includes('next') && !lbl.includes('last')) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return 'clicked_aria_next';
      }
      const hasSvg = el.querySelector('svg');
      const raw = el.textContent.replace(/\\s+/g, '').trim();
      if ((raw === '>' || raw === '›' || (raw === '' && hasSvg)) && !el.disabled) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return 'clicked_chevron';
      }
    }
  }
  return 'not_found';
})()`;

// ─── Core logic ──────────────────────────────────────────────────────────────

async function fetchTitlePageSession(pageUrl) {
  const user_cookie = cookieManager.getEffectiveCookie('mangaball') || '';
  const request_headers = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml',
    Referer: SITE_DOMAIN,
  };
  if (user_cookie) request_headers.Cookie = user_cookie;

  const response = await fetch(pageUrl, { headers: request_headers });
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

  const html = await response.text();
  const set_cookie_lines =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie')]
        : [];

  return {
    ok: true,
    html,
    csrfToken: extractCsrfToken(html),
    cookieHeader: mergeCookieHeader(user_cookie, set_cookie_lines),
  };
}

async function fetchChaptersFromListingApi(titleId, fullSlug, lang = 'en', uiLog = noop) {
  const page_url = `${SITE_DOMAIN}/title-detail/${fullSlug}`;
  uiLog('Đang lấy danh sách chapter từ API...', 'info');

  // 1. Direct JSON API call (mangaball.com Next.js API)
  try {
    const jsonRes = await fetch(`${SITE_DOMAIN}${CHAPTER_LISTING_PATH}`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Referer: page_url,
      },
      body: JSON.stringify({ title_id: titleId }),
    });
    if (jsonRes.ok) {
      const jsonPayload = await jsonRes.json();
      const parsed_chapters = sortChaptersByNumber(parseListingApiChapters(jsonPayload, lang));
      if (parsed_chapters.length > 0) {
        uiLog(`Tìm thấy ${parsed_chapters.length} chapters.`, 'success');
        return { ok: true, chapters: parsed_chapters, mangaMeta: {} };
      }
      if (Array.isArray(jsonPayload?.data) && jsonPayload.data.length > 0) {
        const allFallback = sortChaptersByNumber(
          parseChaptersFromMangaBallV2Api(jsonPayload.data, 'all'),
        );
        if (allFallback.length > 0) {
          uiLog(`Tìm thấy ${allFallback.length} chapters.`, 'success');
          return { ok: true, chapters: allFallback, mangaMeta: {} };
        }
      }
    }
  } catch (err) {
    logger.warn('Direct JSON listing API failed, trying session-based fetch:', err.message);
  }

  // 2. Legacy session-based form-urlencoded listing fetch
  const page_session = await fetchTitlePageSession(page_url);
  if (!page_session.ok) return { ok: false, error: page_session.error };
  if (!page_session.csrfToken) {
    return { ok: false, error: 'Không lấy được CSRF token từ trang truyện.' };
  }

  const listing_headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-CSRF-TOKEN': page_session.csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    Origin: SITE_DOMAIN,
    Referer: page_url,
  };
  if (page_session.cookieHeader) listing_headers.Cookie = page_session.cookieHeader;

  const listing_body = new URLSearchParams({
    title_id: titleId,
    userSettingsEnabled: 'false',
  }).toString();

  const listing_response = await fetch(`${SITE_DOMAIN}${CHAPTER_LISTING_PATH}`, {
    method: 'POST',
    headers: listing_headers,
    body: listing_body,
  });
  if (!listing_response.ok) {
    return { ok: false, error: `Listing API HTTP ${listing_response.status}` };
  }

  let listing_payload;
  try {
    listing_payload = await listing_response.json();
  } catch (err) {
    return { ok: false, error: `Listing API JSON: ${err.message || err}` };
  }

  const parsed_chapters = sortChaptersByNumber(parseListingApiChapters(listing_payload, lang));
  if (parsed_chapters.length > 0) {
    uiLog(`Tìm thấy ${parsed_chapters.length} chapters.`, 'success');
    return { ok: true, chapters: parsed_chapters, mangaMeta: {} };
  }
  if (
    listing_payload &&
    Number(listing_payload.code) === 200 &&
    Array.isArray(listing_payload.ALL_CHAPTERS)
  ) {
    uiLog(`Tìm thấy ${parsed_chapters.length} chapters.`, parsed_chapters.length ? 'success' : 'warn');
    return { ok: true, chapters: parsed_chapters, mangaMeta: {} };
  }
  return { ok: false, error: 'Listing API không trả về chapter.' };
}

async function fetchChaptersFromApi(titleId, fullSlug, lang = 'en', uiLog = noop, options = {}) {
  try {
    const listing_result = await fetchChaptersFromListingApi(titleId, fullSlug, lang, uiLog);
    if (listing_result.ok && listing_result.chapters && listing_result.chapters.length > 0) {
      return listing_result;
    }
    logger.warn('Listing API empty or blocked, falling back to browser window', listing_result.error);
  } catch (err) {
    logger.warn('Listing API failed, falling back to browser window', err.message);
  }

  const cookieValue =
    (options && options.cookie) ||
    cookieManager.getEffectiveCookie('mangaball') ||
    '';
  const pageUrl = `${SITE_DOMAIN}/title-detail/${fullSlug}`;

  const { BrowserWindow, app } = require('electron');
  const { isCloudflareChallengePage, BROWSER_USER_AGENT } = require('../../renderedFetch');

  const defaultPlatformUa =
    process.platform === 'darwin'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const ua = BROWSER_USER_AGENT || app?.userAgentFallback || defaultPlatformUa;

  let win = null;

  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
      },
    });

    win.webContents.setUserAgent(ua);
    attachDeniedWindowOpenHandler(win.webContents);

    if (cookieValue) {
      const cookies = cookieValue.split(';').map((c) => c.trim()).filter(Boolean);
      const ses = win.webContents.session;
      for (const cookie of cookies) {
        const eq = cookie.indexOf('=');
        if (eq > 0) {
          const name = cookie.slice(0, eq).trim();
          const value = cookie.slice(eq + 1).trim();
          if (name && value) {
            try {
              await ses.cookies.set({ url: SITE_DOMAIN, name, value });
            } catch (err) {
              logger.warn(`Failed to set cookie: ${name}`, err.message);
            }
          }
        }
      }
    }

    uiLog('Đang tải trang truyện...', 'info');
    await win.loadURL(pageUrl);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Cloudflare check
    let isChallenge = false;
    try {
      isChallenge = await isCloudflareChallengePage(win.webContents);
    } catch {
      isChallenge = false;
    }

    if (isChallenge) {
      logger.warn('Cloudflare challenge detected, waiting up to 3s...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        isChallenge = await isCloudflareChallengePage(win.webContents);
      } catch {
        isChallenge = false;
      }
      if (isChallenge) {
        win.close();
        return {
          ok: false,
          error:
            'Trang web yêu cầu xác minh Cloudflare. Vui lòng nhấn biểu tượng Cookie ở thanh bên (Sidebar) để trích xuất cookie cho MangaBall.',
        };
      }
    }

    let mangaMeta = {};
    try {
      mangaMeta = await win.webContents.executeJavaScript(READ_MANGA_META_JS);
    } catch (e) {
      logger.warn('readMangaMeta failed', e.message);
    }

    // In-page Listing API fetch
    uiLog('Đang lấy danh sách chapter từ API nội bộ...', 'info');
    let inPageChapters = [];
    try {
      const inPageResult = await win.webContents.executeJavaScript(`
        (async () => {
          try {
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            const csrfToken = csrfMeta ? csrfMeta.content : '';
            const res = await fetch('${CHAPTER_LISTING_PATH}', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-TOKEN': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: 'title_id=' + encodeURIComponent('${titleId}') + '&userSettingsEnabled=false'
            });
            if (!res.ok) return { ok: false, status: res.status };
            const json = await res.json();
            return { ok: true, data: json };
          } catch (e) {
            return { ok: false, error: String(e && e.message || e) };
          }
        })()
      `);

      if (inPageResult && inPageResult.ok && inPageResult.data) {
        inPageChapters = parseListingApiChapters(inPageResult.data, lang);
      }
    } catch (err) {
      logger.warn('In-page listing API call failed:', err.message);
    }

    if (inPageChapters.length > 0) {
      const chapters = sortChaptersByNumber(inPageChapters);
      win.close();
      uiLog(`Tìm thấy ${chapters.length} chapters.`, 'success');
      return { ok: true, chapters, mangaMeta };
    }

    // Fallback 1: __NEXT_DATA__
    let jsonChapters = [];
    try {
      const ndText = await win.webContents.executeJavaScript(
        `document.querySelector('#__NEXT_DATA__')?.textContent || ''`,
      );
      if (ndText) {
        const tree = deepFindChapterGroupArray(JSON.parse(ndText));
        if (tree.length) {
          jsonChapters = parseChaptersFromMangaBallApi(tree, lang);
        }
      }
    } catch (e) {
      logger.warn('__NEXT_DATA__ scan failed', e.message);
    }

    // Fallback 2: DOM row extraction
    let domChapters = [];
    try {
      const rows = await win.webContents.executeJavaScript(CHAPTER_ROWS_EXTRACT_JS);
      if (Array.isArray(rows)) {
        domChapters = rows.map((r) => browserRowToChapter(r));
      }
    } catch (e) {
      logger.warn('DOM rows extract failed', e.message);
    }

    const unionById = new Map();
    const mergeChapterList = (list) => {
      for (const ch of list) {
        const id = chapterIdFromMangaballUrl(ch.url);
        if (id && !unionById.has(id)) unionById.set(id, ch);
      }
    };
    mergeChapterList(domChapters);
    mergeChapterList(jsonChapters);

    let chapters = [...unionById.values()];

    // Detect pagination only if needed and we have chapters from DOM
    let pagInfo = { maxPage: 1, param: '' };
    try {
      pagInfo = await win.webContents.executeJavaScript(PAGINATION_DETECT_JS);
    } catch (e) {
      logger.warn('pagination detect failed', e.message);
    }

    let hasPagerNext = false;
    try {
      hasPagerNext = await win.webContents.executeJavaScript(PAGINATION_HAS_NEXT_JS);
    } catch (_) { /* ignore */ }

    if ((hasPagerNext || pagInfo.maxPage > 1) && domChapters.length > 0) {
      uiLog(`Đang quét thêm bằng pagination click...`, 'info');
      const clickMaxPage = Math.min(Math.max(Number(pagInfo.maxPage) || 1, 1), 50);
      for (let targetPage = 2; targetPage <= clickMaxPage; targetPage++) {
        try {
          const clicked = await win.webContents.executeJavaScript(CLICK_PAGE_JS(targetPage));
          if (clicked === 'not_found') break;
          await new Promise((r) => setTimeout(r, 2000));
        } catch (e) {
          logger.warn(`Page ${targetPage} click error`, e.message);
          break;
        }

        let rows = [];
        try {
          rows = await win.webContents.executeJavaScript(CHAPTER_ROWS_EXTRACT_JS);
        } catch (e) {
          logger.warn(`Page ${targetPage} extract error`, e.message);
        }

        for (const row of rows) {
          if (!row.chapterId || unionById.has(row.chapterId)) continue;
          unionById.set(row.chapterId, browserRowToChapter(row));
        }
      }
      chapters = [...unionById.values()];
    }

    chapters = filterMangaballDomChaptersByLang(chapters, lang);
    chapters = sortChaptersByNumber(chapters);

    win.close();

    if (chapters.length === 0) {
      uiLog('Không tìm thấy chapters.', 'warn');
      return {
        ok: false,
        error:
          'Không tìm thấy chapters. Có thể manga này chưa có bản dịch cho ngôn ngữ đã chọn hoặc chapters bị khóa. Hãy kiểm tra cookie đã lưu có đúng không.',
        mangaMeta,
      };
    }

    uiLog(`Tìm thấy ${chapters.length} chapters.`, 'success');
    return { ok: true, chapters, mangaMeta };
  } catch (e) {
    logger.error('fetchChaptersFromApi failed', e.message);
    if (win && !win.isDestroyed()) win.close();
    return { ok: false, error: `Lỗi: ${e.message || String(e)}` };
  }
}

function parseChaptersFromMangaBallApi(data, lang = 'en') {
  const chapters = [];
  const langMap = {
    en: ['en', 'english'],
    vi: ['vi', 'vietnamese'],
    ja: ['ja', 'japanese', 'jp'],
  };
  const targetLangs = langMap[lang] || ['en', 'english'];

  if (!Array.isArray(data)) return chapters;

  for (const chapterGroup of data) {
    if (!chapterGroup || typeof chapterGroup !== 'object') continue;

    const chNum = chapterGroup.number || chapterGroup.number_float || '';
    const groupTitle = chapterGroup.title || '';
    const translations = chapterGroup.translations || [];
    if (!Array.isArray(translations)) continue;

    for (const trans of translations) {
      if (!trans || typeof trans !== 'object') continue;

      const transLang = (trans.language || '').toLowerCase().trim();
      const transLangName = (trans.languageName || '').toLowerCase().trim();
      const lang_base = transLang.split(/[-_]/)[0];

      const langMatch = targetLangs.some(
        (needle) => lang_base === needle || transLangName === needle,
      );
      if (!langMatch) continue;

      const transId = trans.id || '';
      const transName = trans.name || '';
      const groupInfo = trans.group || {};
      const groupName = groupInfo.name || '';
      const pages = trans.pages || 0;
      const volume = trans.volume || '';

      let displayTitle = chNum ? `${chNum}` : 'Chapter';

      if (transName && transName !== groupTitle && transName !== 'OFFICIAL TRANSLATION') {
        displayTitle += ` - ${transName}`;
      } else if (groupTitle && groupTitle !== 'OFFICIAL TRANSLATION') {
        displayTitle += ` - ${groupTitle}`;
      }

      if (groupName) displayTitle += ` [${groupName}]`;
      if (volume && volume !== '0') displayTitle += ` (Vol ${volume})`;

      let chapterUrl = trans.url || '';
      if (!chapterUrl && transId) {
        chapterUrl = `${SITE_DOMAIN}/chapter-detail/${transId}/`;
      }

      if (chapterUrl) {
        chapterUrl = chapterUrl.replace(/^http:\/\//, 'https://');
        chapters.push({
          url: chapterUrl,
          title: formatChapterTitle(displayTitle),
          pages,
          language: transLangName,
        });
      }
    }
  }

  return chapters;
}

async function load(url, lang = 'en', uiLog = noop, options = {}) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return { ok: false, error: 'URL trống.' };

  const extracted = extractTitleInfo(trimmed);
  if (!extracted) {
    return {
      ok: false,
      error:
        'Không lấy được title ID từ URL. URL phải có dạng: https://mangaball.com/title-detail/<titleId>-<slug> hoặc <slug>-<titleId>',
    };
  }

  uiLog('Đang lấy thông tin truyện...', 'info');

  let fallbackTitle = extracted.fullSlug;
  let fallbackCover = '';
  const r = await fetchHtml(trimmed);
  if (r.ok) {
    const $ = cheerio.load(r.html);
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      const clean = ogTitle
        .replace(/\s*-\s*MangaBall\s*$/i, '')
        .replace(/^Read\s+/i, '')
        .replace(/\s+Online\s+Free$/i, '')
        .trim();
      if (clean && clean.length > 1) fallbackTitle = clean;
    }
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      fallbackCover = ogImage;
    }

    // Next.js RSC payload: check for unblocked MangaDex cover (image.cdn_mangadex)
    const rscMatches = [...r.html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
    if (rscMatches.length > 0) {
      let combinedRsc = '';
      for (const m of rscMatches) {
        try {
          combinedRsc += JSON.parse('"' + m[1] + '"');
        } catch {
          combinedRsc += m[1];
        }
      }
      const cdnMangadexMatch = combinedRsc.match(/"cdn_mangadex":\s*"([^"]+)"/);
      if (cdnMangadexMatch && cdnMangadexMatch[1] && cdnMangadexMatch[1] !== 'null') {
        fallbackCover = cdnMangadexMatch[1].replace(/\\/g, '');
      }
    }
    if (fallbackTitle === extracted.fullSlug) {
      $('h6, h1, h2').each((i, el) => {
        const t = $(el).text().trim();
        if (t && t.length > 3 && t.length < 200 && !/^mangaball$/i.test(t)) {
          fallbackTitle = t;
          return false;
        }
      });
    }
    if (fallbackTitle === extracted.fullSlug) {
      const titleText = $('title').text();
      const fromTag = titleText.split('|')[0].split('-')[0].trim();
      if (fromTag && !/^mangaball$/i.test(fromTag)) fallbackTitle = fromTag;
    }
    if (!fallbackCover) {
      $('img').each((i, el) => {
        const src = $(el).attr('src') || '';
        if (
          src &&
          (src.includes('cover') ||
            src.includes('bulbasaur') ||
            src.includes('poke-black-and-white.net'))
        ) {
          fallbackCover = src;
          return false;
        }
      });
    }
  }

  const chaptersResult = await fetchChaptersFromApi(
    extracted.titleId,
    extracted.fullSlug,
    lang,
    uiLog,
    options,
  );

  const mm = chaptersResult.mangaMeta || {};
  let title =
    mm.title && String(mm.title).trim().length > 2 ? String(mm.title).trim() : fallbackTitle;
  if (!title) title = extracted.fullSlug;

  let coverUrl = mm.coverUrl || fallbackCover;
  if (fallbackCover && fallbackCover.includes('mangadex.org')) {
    coverUrl = fallbackCover;
  }
  if (coverUrl) {
    const normalizedCover = normalizeMangaballImageUrl(coverUrl);
    if (normalizedCover) coverUrl = normalizedCover;
  }

  if (!chaptersResult.ok) {
    return {
      ok: true,
      manga: { title, coverUrl, mangaUrl: trimmed, siteId: 'mangaball', sourceLabel: LABEL },
      chapters: [],
      warning: chaptersResult.error || 'Không tìm thấy chapters.',
    };
  }

  return {
    ok: true,
    manga: { title, coverUrl, mangaUrl: trimmed, siteId: 'mangaball', sourceLabel: LABEL },
    chapters: chaptersResult.chapters,
  };
}

// ─── Download ────────────────────────────────────────────────────────────────

function resolveMangaDir(baseSaveDir, mangaTitle) {
  return path.join(baseSaveDir, formatFolderName(mangaTitle, MAX_LENGTH_FOLDER_NAME));
}

function resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat) {
  const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
  if (isFlatChapterLayout(chapterFolderFormat)) {
    return mangaDir;
  }
  return path.join(mangaDir, formatChapterFolderName(chapterTitle, chapterFolderFormat));
}

async function downloadCoverIfNeeded(coverUrl, mangaDir, log, mangaUrl = '') {
  if (!coverUrl && !mangaUrl) return;
  fs.mkdirSync(mangaDir, { recursive: true });

  const candidates = [];
  if (coverUrl) {
    const resolved = normalizeMangaballImageUrl(coverUrl);
    if (resolved) candidates.push(resolved);
  }

  // If candidate is on Cloudflare-blocked CDN (*.poke-black-and-white.net) or candidates empty,
  // try to fetch the manga title page to extract unblocked cdn_mangadex cover
  const isBlockedCdn = (u) => String(u || '').includes('poke-black-and-white.net');
  if (mangaUrl && (candidates.length === 0 || candidates.some(isBlockedCdn))) {
    try {
      const pageRes = await fetchHtml(mangaUrl);
      if (pageRes.ok && pageRes.html) {
        const rscMatches = [...pageRes.html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
        let combinedRsc = '';
        for (const m of rscMatches) {
          try {
            combinedRsc += JSON.parse('"' + m[1] + '"');
          } catch {
            combinedRsc += m[1];
          }
        }
        const cdnMatch = combinedRsc.match(/"cdn_mangadex":\s*"([^"]+)"/);
        if (cdnMatch && cdnMatch[1] && cdnMatch[1] !== 'null') {
          const mdUrl = cdnMatch[1].replace(/\\/g, '');
          if (candidates.some(isBlockedCdn)) {
            candidates.unshift(mdUrl);
          } else {
            candidates.push(mdUrl);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const fetch_fn = getChromiumFetch() || fetch;
  for (const resolvedCoverUrl of candidates) {
    let ext = '.webp';
    try {
      ext = path.extname(new URL(resolvedCoverUrl).pathname).toLowerCase() || '.webp';
    } catch {
      /* */
    }
    const coverPath = path.join(mangaDir, `cover${ext}`);
    if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 0) return;

    try {
      const res = await fetch_fn(resolvedCoverUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: resolvedCoverUrl.includes('mangadex.org') ? 'https://mangadex.org/' : IMG_REFERER,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length) {
        const head_text = buf.subarray(0, 32).toString('utf8').toLowerCase();
        if (head_text.includes('<!doctype') || head_text.includes('<html')) {
          continue; // Cloudflare HTML challenge received
        }
        fs.writeFileSync(coverPath, buf);
        log(`Đã lưu cover: ${path.basename(coverPath)}`, 'success');
        return;
      }
    } catch {
      /* continue to next candidate */
    }
  }

  log('Tải cover thất bại (máy chủ ảnh bị chặn hoặc không phản hồi).', 'warn');
}

async function downloadImageToFile(imageUrl, filePath) {
  const fetch_fn = getChromiumFetch() || fetch;
  try {
    const res = await fetch_fn(imageUrl, {
      headers: {
        Referer: IMG_REFERER,
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      redirect: 'follow',
      referrerPolicy: 'origin',
    });
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      return {
        ok: false,
        status: 429,
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : null,
      };
    }
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return { ok: false, error: 'Empty buffer' };

    const head_text = buf.subarray(0, 32).toString('utf8').toLowerCase();
    if (head_text.includes('<!doctype') || head_text.includes('<html')) {
      return { ok: false, status: 403, error: 'Cloudflare HTML challenge received instead of image' };
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buf);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getFileExt(u) {
  try {
    const p = String(u).split('?')[0];
    const e = p.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(e)) return e;
  } catch {
    /* */
  }
  return 'webp';
}

async function fetchChapterImages(chapterUrl) {
  const normalizedChapterUrl = String(chapterUrl || '').trim().replace(/\/+$/, '');
  const chIdMatch = normalizedChapterUrl.match(/chapter-detail\/([^/?#]+)/i);
  if (!chIdMatch) {
    return { ok: false, error: 'Không lấy được chapter ID từ URL.' };
  }

  const chapterId = chIdMatch[1];
  const apiEndpoint = `${SITE_DOMAIN}/api/v1/chapter/chapter-detail/${chapterId}`;
  const r = await fetchJson(apiEndpoint);

  if (r.ok && r.data) {
    const urls = extractImageUrlsFromChapterDetail(r.data);
    if (urls.length > 0) return { ok: true, urls };
  }

  const htmlResult = await fetchHtml(normalizedChapterUrl);
  let html = htmlResult.ok ? htmlResult.html : '';

  if (!html) {
    try {
      const { fetchRenderedHtml } = require('../../renderedFetch');
      if (typeof fetchRenderedHtml === 'function') {
        html = await fetchRenderedHtml(normalizedChapterUrl, { timeout: 35000, waitAfterLoad: 2000 });
      }
    } catch (err) {
      logger.warn('Rendered fetch for chapter images failed', err.message);
    }
  }

  if (!html) return { ok: false, error: htmlResult.error || 'Không tải được trang chapter.' };

  // 1. Check Next.js RSC payload in HTML for "pages" or "images" array
  const pagesArrayMatch = html.match(/(?:pages|images)\\*":\s*(\[[^\]]+\])/);
  if (pagesArrayMatch) {
    try {
      const raw = pagesArrayMatch[1].replace(/\\"/g, '"');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validUrls = parsed.map(normalizeMangaballImageUrl).filter(Boolean);
        if (validUrls.length > 0) {
          return { ok: true, urls: validUrls };
        }
      }
    } catch (e) {
      logger.warn('JSON parse error from chapter HTML pages array', e.message);
    }
  }

  // 1b. Additional check for streaming self.__next_f pushes (Next.js App Router)
  const rscMatches = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
  if (rscMatches.length > 0) {
    let combinedRsc = '';
    for (const m of rscMatches) {
      try {
        combinedRsc += JSON.parse('"' + m[1] + '"');
      } catch {
        combinedRsc += m[1];
      }
    }
    const rscArrayMatch = combinedRsc.match(/(?:pages|images)":\s*(\[[^\]]+\])/);
    if (rscArrayMatch) {
      try {
        const parsed = JSON.parse(rscArrayMatch[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validUrls = parsed.map(normalizeMangaballImageUrl).filter(Boolean);
          if (validUrls.length > 0) {
            return { ok: true, urls: validUrls };
          }
        }
      } catch (e) {
        logger.warn('JSON parse error from streaming RSC array', e.message);
      }
    }
  }

  const $ = cheerio.load(html);
  const urls = [];

  $('img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (
      src &&
      (src.includes('bulbasaur') ||
        src.includes('poke-black-and-white.net') ||
        src.includes('red-and-blue.net') ||
        src.match(/\.(jpg|jpeg|png|webp|avif)(\?|$)/i))
    ) {
      const normalizedSrc = normalizeMangaballImageUrl(src);
      if (normalizedSrc && !urls.includes(normalizedSrc)) urls.push(normalizedSrc);
    }
  });

  $('script:not([src])').each((i, el) => {
    const content = $(el).html() || '';
    const arrayMatches = content.match(/\[[\s\S]*?\]/g);
    if (arrayMatches) {
      for (const arr of arrayMatches) {
        const urlMatches = arr.match(
          /https?:\/\/[^\s"']+\.(jpg|jpeg|png|webp|avif)(\?[^\s"']*)?/gi,
        );
        if (urlMatches) {
          urlMatches.forEach((url) => {
            if (!urls.includes(url)) urls.push(url);
          });
        }
      }
    }
  });

  if (urls.length === 0) {
    return {
      ok: false,
      error: 'Không tìm thấy ảnh. Site có thể yêu cầu đăng nhập hoặc chapter bị khóa.',
    };
  }

  return { ok: true, urls };
}

function extractImageUrlsFromChapterDetail(data) {
  const urls = [];
  const possiblePaths = [
    data.images,
    data.pages,
    data.chapter?.images,
    data.chapter?.pages,
    data.data?.images,
    data.data?.pages,
  ];

  for (const images of possiblePaths) {
    if (!images) continue;
    if (Array.isArray(images)) {
      for (const item of images) {
        if (typeof item === 'string' && item.match(/\.(jpg|jpeg|png|webp|avif)(\?|$)/i)) {
          const normalizedItem = normalizeMangaballImageUrl(item);
          if (normalizedItem && !urls.includes(normalizedItem)) urls.push(normalizedItem);
        } else if (item && typeof item === 'object') {
          const url = item.url || item.src || item.image || item.link;
          const normalizedUrl = normalizeMangaballImageUrl(url);
          if (normalizedUrl && !urls.includes(normalizedUrl)) urls.push(normalizedUrl);
        }
      }
    }
    if (urls.length > 0) break;
  }

  return urls;
}

async function downloadChapter(
  {
    mangaTitle,
    mangaUrl,
    chapterUrl,
    chapterTitle,
    baseSaveDir,
    numberOfThreads = 3,
    coverUrl,
    chapterFolderFormat,
    onLog,
    onProgress,
    shouldAbort,
  },
  connector = LABEL,
) {
  const log = (msg, level = 'info') => {
    if (typeof onLog === 'function') onLog(msg, level);
  };
  const report = (payload) => {
    if (typeof onProgress === 'function') onProgress(payload);
  };

  const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
  const dbChapterTitle = formatChapterTitle(chapterTitle);
  const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);

  fs.mkdirSync(chapterDir, { recursive: true });

  const cleanup_empty_chapter_dir = () => {
    if (removeEmptyChapterDir(chapterDir)) {
      log('Removed empty chapter folder after failed download.', 'info');
    }
  };
  await downloadCoverIfNeeded(coverUrl, mangaDir, log, mangaUrl);
  if (typeof shouldAbort === 'function' && shouldAbort()) {
    cleanup_empty_chapter_dir();
    return { ok: false, aborted: true };
  }

  const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector);
  if (!db.record.mangaTitle) {
    db.record.mangaTitle = mangaTitle;
    db.record.mangaUrl = mangaUrl;
    db.record.connector = connector;
    db.save();
  }

  if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
    log('Chapter already complete, skipping.', 'info');
    return { ok: true, skipped: true };
  }

  const imgResult = await fetchChapterImages(chapterUrl);
  if (!imgResult.ok) {
    log(`Lỗi lấy ảnh: ${imgResult.error}`, 'error');
    cleanup_empty_chapter_dir();
    return { ok: false, error: imgResult.error };
  }

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    cleanup_empty_chapter_dir();
    return { ok: false, aborted: true };
  }

  const pageInfos = imgResult.urls.map((imageUrl, i) => {
    const idx = i + 1;
    const ext = getFileExt(imageUrl);
    const fileName = formatChapterPageFileName(chapterTitle, idx, ext, chapterFolderFormat);
    return { index: idx, imageUrl, filePath: path.join(chapterDir, fileName), fileName };
  });

  const existingChapter = db.hasChapter(dbChapterTitle) ? db.record.chapters[dbChapterTitle] : null;
  if (
    existingChapter &&
    existingChapter.status !== 'completed' &&
    existingChapter.expectedFileCount !== pageInfos.length
  ) {
    db.initChapter(
      dbChapterTitle,
      chapterUrl,
      pageInfos.length,
      pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: pi.imageUrl,
        status: 'pending',
      })),
    );
    log(
      `Đã làm mới danh sách trang (${existingChapter.expectedFileCount} → ${pageInfos.length}).`,
      'info',
    );
  }

  if (!db.hasChapter(dbChapterTitle) || !db.hasDownloadablePages(dbChapterTitle)) {
    db.initChapter(
      dbChapterTitle,
      chapterUrl,
      pageInfos.length,
      pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: pi.imageUrl,
        status: 'pending',
      })),
      { force: !db.hasDownloadablePages(dbChapterTitle) },
    );
  }

  if (db.hasChapter(dbChapterTitle)) {
    let missing = db.getMissingPages(dbChapterTitle, chapterDir);
    if (missing.length === 0 && db.hasDownloadablePages(dbChapterTitle)) {
      db.markChapterCompleted(dbChapterTitle);
      if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
        return { ok: true, skipped: true };
      }
      db.markChapterIncomplete(dbChapterTitle);
    }
    missing = db.getMissingPages(dbChapterTitle, chapterDir);
    const missingSet = new Set(missing.map((p) => p.index));
    const filtered = pageInfos.filter((pi) => missingSet.has(pi.index));
    if (filtered.length === 0) {
      db.markChapterIncomplete(dbChapterTitle);
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'Không có trang hợp lệ để tải.', successCount: 0, totalPages: 0 };
    }
    log(`Resuming: ${filtered.length} pages.`, 'info');
    pageInfos.splice(0, pageInfos.length, ...filtered);
  }

  const isCdn = pageInfos.some((pi) => isMangaballImageCdnHost(pi.imageUrl));
  // Limit concurrency to 1 thread for MangaBall CDN to prevent Cloudflare Error 1015 (Rate limit)
  const threads = isCdn ? 1 : Math.max(1, Math.min(Number(numberOfThreads) || 2, 3));
  const limit = pLimit(threads);
  const totalPages = pageInfos.length;
  const downloadResults = [];
  const failedPageIndices = [];
  const progress = new Int32Array(new SharedArrayBuffer(4));
  let rateLimitHit = false;
  let rateLimitWaitSec = null;
  let cfBlocked = false;
  let cfBlockedHost = '';

  report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: totalPages });

  await Promise.all(
    pageInfos.map((pi) =>
      limit(async () => {
        if (rateLimitHit || cfBlocked) {
          downloadResults.push(false);
          failedPageIndices.push(pi.index);
          return;
        }
        if (typeof shouldAbort === 'function' && shouldAbort()) {
          downloadResults.push(false);
          return;
        }

        // Polite delay for MangaBall CDN to avoid triggering Cloudflare rate limiter
        if (isCdn) {
          await new Promise((r) => setTimeout(r, 350));
        }

        let success = false;
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          if (rateLimitHit || cfBlocked) break;
          if (typeof shouldAbort === 'function' && shouldAbort()) break;

          const dl = await downloadImageToFile(pi.imageUrl, pi.filePath);
          if (dl.ok && fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
            success = true;
            const n = Atomics.add(progress, 0, 1) + 1;
            log(` [${n}/${totalPages}] ${path.basename(pi.filePath)}`, 'info');
            report({ mangaTitle, chapterTitle, chapterUrl, current: n, total: totalPages });
            db.markPageCompleted(dbChapterTitle, pi.index, fs.statSync(pi.filePath).size);
          } else if (dl.status === 429) {
            rateLimitHit = true;
            rateLimitWaitSec = dl.retryAfter;
            const waitMsg = dl.retryAfter ? ` (chờ ${dl.retryAfter}s)` : '';
            log(`[MangaBall] CDN chặn IP do giới hạn tần suất (Cloudflare 429 - Error 1015)${waitMsg}. Vui lòng đổi IP/VPN.`, 'error');
            break;
          } else if (dl.status === 403 || String(dl.error || '').includes('Cloudflare')) {
            cfBlocked = true;
            try {
              cfBlockedHost = new URL(pi.imageUrl).hostname;
            } catch {
              cfBlockedHost = 'CDN';
            }
            log(`[MangaBall] Máy chủ ảnh CDN (${cfBlockedHost}) bị Cloudflare chặn IP (403 Forbidden). Vui lòng bật VPN (như 1.1.1.1 / WARP) để tiếp tục tải.`, 'error');
            break;
          }

          if (!success && !rateLimitHit && !cfBlocked && attempt < 3) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
        downloadResults.push(success);
        if (!success) {
          db.markPageFailed(dbChapterTitle, pi.index);
          failedPageIndices.push(pi.index);
          if (!cfBlocked) {
            log(` FAILED: ${path.basename(pi.filePath)}`, 'error');
          }
        }
      }),
    ),
  );

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    db.markChapterIncomplete(dbChapterTitle);
    cleanup_empty_chapter_dir();
    return { ok: false, aborted: true };
  }

  const allSuccess = downloadResults.length > 0 && downloadResults.every(Boolean);
  if (allSuccess) {
    db.markChapterCompleted(dbChapterTitle);
    log(`Chapter done: ${totalPages} pages.`, 'success');
  } else {
    db.markChapterIncomplete(dbChapterTitle);
    if (rateLimitHit) {
      log('Dừng tải chương vì bị giới hạn tần suất Cloudflare (429).', 'warn');
    } else if (cfBlocked) {
      log(`Dừng tải chương vì máy chủ ảnh (${cfBlockedHost}) bị Cloudflare chặn IP (403 Forbidden).`, 'warn');
    } else {
      log('Chapter incomplete.', 'warn');
    }
    cleanup_empty_chapter_dir();
  }

  return {
    ok: allSuccess,
    successCount: downloadResults.filter(Boolean).length,
    totalPages,
    failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
    error: rateLimitHit
      ? `Bị giới hạn tốc độ bởi CDN MangaBall (Cloudflare 429 - Error 1015)${rateLimitWaitSec ? `. Vui lòng đổi IP/VPN hoặc đợi ${rateLimitWaitSec}s.` : '. Vui lòng đổi IP/VPN.'}`
      : cfBlocked
        ? `Máy chủ ảnh MangaBall (${cfBlockedHost}) bị Cloudflare chặn IP (403 Forbidden). Vui lòng bật VPN (như 1.1.1.1 / WARP) trước khi tải.`
        : undefined,
  };
}

module.exports = {
  SITE_DOMAIN,
  LABEL,
  load,
  downloadChapter,
  extractTitleInfo,
  extractCsrfToken,
  parseListingApiChapters,
  fetchChapterImages,
};
