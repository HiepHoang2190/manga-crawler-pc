/**
 * Comick API Client for ApiConnectorService
 * Comick uses a hybrid approach: HTML parsing for manga info, API for chapters, HTML parsing for images
 * Supports 18 languages
 */

const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');

const SITE_DOMAIN = 'https://comick.live';
const IMG_REFERER = 'https://comick.live/';
const CHAPTERS_PER_PAGE = 60;

// Supported languages (18 total)
const SUPPORTED_LANGUAGES = [
  'en', 'vi', 'ja', 'zh', 'zh-hk', 'ko', 'es', 'es-la', 'pt', 'pt-br',
  'fr', 'de', 'it', 'ru', 'tr', 'id', 'th', 'ar'
];

function extractSlug(urlString) {
  const s = String(urlString || '').trim();
  // /comic/<slug> or /comic/<slug>/<hid>-chapter-...
  const m = s.match(/\/comic\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Get hid from chapter URL: /comic/<slug>/<hid>-chapter-<n>-<lang>
function extractChapterHid(urlString) {
  const s = String(urlString || '').trim();
  const m = s.match(/\/comic\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  const seg = m[1];
  const dashIdx = seg.indexOf('-chapter-');
  return dashIdx > 0 ? seg.slice(0, dashIdx) : seg;
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
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Extract JSON from <script id="<id>">...</script>
function extractScriptJson(html, scriptId) {
  const re = new RegExp(`<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`);
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function fetchManga(url) {
  const slug = extractSlug(url);
  if (!slug) return { ok: false, error: 'Không lấy được slug từ URL (dạng /comic/<slug>).' };

  const pageUrl = `${SITE_DOMAIN}/comic/${slug}`;
  const r = await fetchHtml(pageUrl);
  if (!r.ok) return { ok: false, error: r.error };

  const data = extractScriptJson(r.html, 'comic-data');
  if (!data) return { ok: false, error: 'Không parse được dữ liệu truyện từ trang.' };

  return {
    ok: true,
    slug,
    manga: {
      title: data.title || slug,
      coverUrl: data.default_thumbnail || '',
      mangaUrl: url,
      siteId: 'comick',
      sourceLabel: 'Comick',
    },
  };
}

async function fetchChapters(slug, lang = 'en') {
  const chapters = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const url = `${SITE_DOMAIN}/api/comics/${encodeURIComponent(slug)}/chapter-list?lang=${encodeURIComponent(lang)}&page=${page}`;
    const r = await fetchJson(url);
    if (!r.ok) break;

    const list = Array.isArray(r.data?.data) ? r.data.data : [];
    if (!list.length) break;

    if (page === 1 && r.data?.pagination?.last_page) {
      lastPage = r.data.pagination.last_page;
    }

    for (const ch of list) {
      const hid = ch.hid;
      if (!hid) continue;
      const chNum = ch.chap != null ? String(ch.chap) : '';
      const rawTitle = ch.title ? String(ch.title) : '';
      const vol = ch.vol != null ? String(ch.vol) : '';
      const groupName = Array.isArray(ch.group_name) ? ch.group_name[0] : (ch.group_name || '');

      let displayTitle = chNum ? `Chapter ${chNum}` : 'Oneshot';
      if (rawTitle) displayTitle += ` - ${rawTitle}`;
      if (vol) displayTitle += ` (Vol ${vol})`;
      if (groupName) displayTitle += ` {${groupName}}`;

      const chapterUrl = `${SITE_DOMAIN}/comic/${slug}/${hid}-chapter-${chNum || '0'}-${lang}`;
      chapters.push({ url: chapterUrl, title: formatChapterTitle(displayTitle) });
    }

    page++;
  }

  return { ok: true, chapters };
}

function getFileExt(u) {
  try {
    const p = String(u).split('?')[0];
    const e = p.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(e)) return e;
  } catch { /* */ }
  return 'webp';
}

/**
 * Comick API Client
 * Implements the interface required by ApiConnectorService
 */
class ComickApiClient {
  constructor() {
    this.defaultLanguage = 'en';
  }

  /**
   * Load manga information and chapters
   * @param {string} url - Manga URL
   * @param {object} options - Options including language
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    
    // Extract language from options (supports connector wrapper language selection)
    let language = options.comickLanguage || options.language || this.defaultLanguage;
    language = String(language).toLowerCase();
    
    // Validate language
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      language = this.defaultLanguage;
    }
    
    const m = await fetchManga(trimmed);
    if (!m.ok) return m;
    const ch = await fetchChapters(m.slug, language);
    return {
      ok: true,
      manga: { ...m.manga, comickLanguage: language },
      chapters: ch.chapters || [],
    };
  }

  /**
   * Fetch chapter images by parsing HTML
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const r = await fetchHtml(chapterUrl);
    if (!r.ok) {
      throw new Error(`Không tải được trang chương: ${r.error}`);
    }

    const data = extractScriptJson(r.html, 'sv-data');
    if (!data) {
      throw new Error('Không parse được dữ liệu chương từ trang.');
    }

    const images = data?.chapter?.images;
    if (!Array.isArray(images) || !images.length) {
      throw new Error('Không có ảnh trong chương.');
    }

    const urls = images.map(img => (typeof img === 'string' ? img : img?.url)).filter(Boolean);
    
    return urls.map(imageUrl => {
      const ext = getFileExt(imageUrl);
      return { imageUrl, ext };
    });
  }
}

module.exports = {
  ComickApiClient,
  SITE_DOMAIN,
  IMG_REFERER,
  SUPPORTED_LANGUAGES,
  extractSlug,
  extractChapterHid,
  fetchManga,
  fetchChapters,
};
