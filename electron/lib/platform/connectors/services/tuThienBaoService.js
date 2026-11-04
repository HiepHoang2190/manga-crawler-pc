/**
 * TuThienBao (tuthienbao.com) — vBulletin forum: mỗi thread là một tập, ảnh trong bài đầu (post_message_*).
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  USER_AGENT_JSOUP,
  resolveUrl,
  isValidImgSrc,
  getFileExt,
  getImageSrcFromEl,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'http://tuthienbao.com/';
const LABEL = 'TuThienBao';
const SITE_ID = 'tuthienbao';

function normalizePageUrl(url_string) {
  const trimmed = String(url_string || '').trim();
  if (!trimmed) return null;
  try {
    const parsed_url = new URL(trimmed);
    const host = parsed_url.hostname.toLowerCase();
    if (host !== 'tuthienbao.com' && !host.endsWith('.tuthienbao.com')) return null;
    parsed_url.hash = '';
    if (parsed_url.protocol === 'https:') parsed_url.protocol = 'http:';
    return parsed_url.href;
  } catch {
    return null;
  }
}

function canonicalShowthreadHref(thread_id) {
  return `${DOMAIN}forum/showthread.php?t=${thread_id}`;
}

function canonicalForumHref(forum_id) {
  return `${DOMAIN}forum/forumdisplay.php?f=${forum_id}`;
}

function decodeVbHref(href) {
  return String(href || '').trim().replace(/&amp;/g, '&');
}

function isForumAssetImageUrl(image_url) {
  const u = String(image_url || '').toLowerCase();
  if (!u) return true;
  if (u.includes('tuthienbao.com') && u.includes('/images/')) return true;
  if (u.includes('/statusicon/') || u.includes('/buttons/') || u.includes('navbits')) return true;
  return false;
}

function collectStoryImagesFromPostHtml(html, referer_base) {
  const $ = cheerio.load(html);
  const $post = $('div[id^="post_message_"]').first();
  if (!$post.length) return [];
  const out = [];
  $post.find('img').each((_, el) => {
    const $el = $(el);
    let src = getImageSrcFromEl($el);
    if (!src || /^data:/i.test(src)) return;
    if (!isValidImgSrc(src)) return;
    src = resolveUrl(referer_base, src);
    if (isForumAssetImageUrl(src)) return;
    const ext = getFileExt(src);
    if (!ext) return;
    out.push({ imageUrl: src, ext });
  });
  return out;
}

class TuThienBaoService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      selectors: {
        chapterLinks: 'a[id^="thread_title_"]',
        title: 'td.tcat span.normal',
        cover: 'meta',
      },
    });
  }

  parseForumTitle($) {
    let title = $('td.tcat span.normal').first().text().trim();
    title = title.replace(/^\s*:\s*/, '').trim();
    if (!title) {
      const doc_title = $('title').first().text().trim();
      title = doc_title.replace(/\s*-\s*๑๑.*$/i, '').trim();
    }
    return title;
  }

  extractCoverFromForum($) {
    const $first_td = $('a[id^="thread_title_"]').first().closest('td[id^="td_threadtitle_"]');
    const title_attr = ($first_td.attr('title') || '').trim();
    if (title_attr && /^https?:\/\//i.test(title_attr) && isValidImgSrc(title_attr)) {
      return title_attr;
    }
    return '';
  }

  parseForumThreads($, page_url) {
    const chapters = [];
    const seen_thread_ids = new Set();
    $('a[id^="thread_title_"]').each((_, el) => {
      const $a = $(el);
      const id_attr = ($a.attr('id') || '').trim();
      const id_match = /^thread_title_(\d+)$/.exec(id_attr);
      const thread_id_from_el = id_match ? id_match[1] : '';
      let href = decodeVbHref($a.attr('href'));
      if (!href) return;
      const full_url = resolveUrl(page_url, href);
      let thread_id = thread_id_from_el;
      try {
        const t_param = new URL(full_url).searchParams.get('t');
        if (t_param) thread_id = t_param;
      } catch {
        /* */
      }
      if (!thread_id || seen_thread_ids.has(thread_id)) return;
      seen_thread_ids.add(thread_id);
      const title = $a.text().trim() || `Thread ${thread_id}`;
      chapters.push({
        url: canonicalShowthreadHref(thread_id),
        title,
      });
    });
    return chapters;
  }

  parseNextForumPageUrl($, page_url) {
    const href = decodeVbHref($('a[rel="next"]').first().attr('href'));
    if (!href) return '';
    return resolveUrl(page_url, href);
  }

  async loadForumListing(start_url, options) {
    let next_page_url = start_url;
    const seen_pages = new Set();
    const all_chapters = [];
    let forumTitle = '';
    let coverUrl = '';
    let forum_id = '';
    try {
      forum_id = new URL(start_url).searchParams.get('f') || '';
    } catch {
      /* */
    }

    while (next_page_url) {
      if (seen_pages.has(next_page_url)) break;
      seen_pages.add(next_page_url);

      const fetched = await fetchHtml(next_page_url, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
      });
      if (!fetched.ok) {
        if (!all_chapters.length) {
          return { ok: false, error: fetched.error || 'Không tải được danh sách chủ đề.' };
        }
        break;
      }

      const $ = cheerio.load(fetched.html);
      if (!forumTitle) forumTitle = this.parseForumTitle($);
      if (!coverUrl) coverUrl = this.extractCoverFromForum($) || '';

      const page_chapters = this.parseForumThreads($, next_page_url);
      for (const ch of page_chapters) {
        if (!all_chapters.some((c) => c.url === ch.url)) all_chapters.push(ch);
      }

      next_page_url = this.parseNextForumPageUrl($, next_page_url);
    }

    if (!forumTitle) return { ok: false, error: 'Không đọc được tên chuyên mục.' };
    if (!all_chapters.length) return { ok: false, error: 'Không tìm thấy chủ đề trong chuyên mục.' };

    const mangaUrl = forum_id ? canonicalForumHref(forum_id) : start_url;

    return {
      ok: true,
      manga: {
        title: forumTitle,
        coverUrl,
        mangaUrl,
        mangaId: forum_id ? `f-${forum_id}` : '',
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters: all_chapters,
    };
  }

  async loadSingleThread(url_normalized, options) {
    const fetched = await fetchHtml(url_normalized, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang chủ đề.' };
    }
    const $ = cheerio.load(fetched.html);
    const $title_link = $('a[id^="thread_title_"]').first();
    let chapterTitle = $title_link.text().trim();
    let mangaTitle = chapterTitle;
    if (!mangaTitle) {
      mangaTitle = $('title').first().text().replace(/\s*-\s*๑๑.*$/i, '').trim();
    }
    if (!mangaTitle) return { ok: false, error: 'Không đọc được tiêu đề chủ đề.' };

    const id_attr = ($title_link.attr('id') || '').trim();
    const id_match = /^thread_title_(\d+)$/.exec(id_attr);
    let thread_id = id_match ? id_match[1] : '';
    if (!thread_id) {
      try {
        thread_id = new URL(url_normalized).searchParams.get('t') || '';
      } catch {
        /* */
      }
    }
    if (!thread_id) {
      const href = decodeVbHref($title_link.attr('href'));
      if (href) {
        try {
          thread_id = new URL(resolveUrl(url_normalized, href)).searchParams.get('t') || '';
        } catch {
          /* */
        }
      }
    }

    const chapterUrl = thread_id ? canonicalShowthreadHref(thread_id) : url_normalized;
    if (!chapterTitle) chapterTitle = mangaTitle;

    return {
      ok: true,
      manga: {
        title: mangaTitle,
        coverUrl: '',
        mangaUrl: chapterUrl,
        mangaId: thread_id ? `t-${thread_id}` : '',
        siteId: SITE_ID,
        sourceLabel: LABEL,
      },
      chapters: [{ url: chapterUrl, title: chapterTitle }],
    };
  }

  async load(url, options = {}) {
    const normalized = normalizePageUrl(url);
    if (!normalized) {
      return { ok: false, error: 'URL không hợp lệ hoặc không thuộc tuthienbao.com.' };
    }

    let pathname = '';
    try {
      pathname = new URL(normalized).pathname.toLowerCase();
    } catch {
      return { ok: false, error: 'URL không hợp lệ.' };
    }

    if (pathname.includes('forumdisplay.php')) {
      const fu = new URL(normalized);
      if (!fu.searchParams.get('f')) {
        return { ok: false, error: 'Thiếu tham số chuyên mục (f) trong URL forumdisplay.' };
      }
      return this.loadForumListing(normalized, options);
    }

    if (pathname.includes('showthread.php')) {
      return this.loadSingleThread(normalized, options);
    }

    return {
      ok: false,
      error: 'Chỉ hỗ trợ URL forumdisplay (danh sách tập) hoặc showthread (một tập).',
    };
  }

  async fetchChapterImages(chapter_url, referer) {
    const ref_base = referer && String(referer).trim() ? String(referer).trim() : DOMAIN;
    const target = normalizePageUrl(chapter_url) || String(chapter_url || '').trim();
    const fetched = await fetchHtml(target, { referer: ref_base });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }
    return collectStoryImagesFromPostHtml(fetched.html, target);
  }
}

const service = new TuThienBaoService();

function load(url, options) {
  return service.load(url, options);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
};
