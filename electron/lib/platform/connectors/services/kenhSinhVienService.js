/**
 * Kênh Sinh Viên — XenForo forum (thread list under /f/..., images in OP as img.bbImage).
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getImageSrcFromEl,
  getFileExt,
  isValidImgSrc,
} = require('../../../download/connector/htmlConnectorUtils');

const SITE_DOMAIN = 'https://kenhsinhvien.vn/';
const SITE_LABEL = 'Kênh Sinh Viên';

const PLACEHOLDER_SELECTORS = {
  chapterLinks: 'a[data-tp-primary="on"]',
  title: 'h1',
  cover: '',
};

/** Normalize XenForo thread URL to canonical /t/name.id/ without /latest */
function normalizedThreadUrl(absolute_url) {
  try {
    const parsed = new URL(String(absolute_url || '').trim());
    if (!parsed.pathname.startsWith('/t/')) return '';
    let path_seg = parsed.pathname.replace(/\/+$/, '');
    path_seg = path_seg.replace(/\/latest$/i, '');
    return `${parsed.origin}${path_seg}/`;
  } catch {
    return '';
  }
}

function forumListUrl(trimmed_url) {
  try {
    const u = new URL(String(trimmed_url || '').trim());
    if (!/^\/f\//.test(u.pathname)) return '';
    let path_seg = u.pathname.replace(/\/page-\d+\/?$/i, '');
    path_seg = path_seg.replace(/\/+$/, '') || '/';
    return `${u.origin}${path_seg}/`;
  } catch {
    return '';
  }
}

function basenameFromUrl(src_string) {
  const no_query = String(src_string || '').split('?')[0];
  const segments = no_query.split('/');
  return segments.pop() || '';
}

/** Page index from XenForo bbImageWrapper title / filename suffix (..., -00.jpg) */
function bbImageSortKey(title_attr, resolved_src, dom_index) {
  const fnameCandidates = [
    String(title_attr || '').trim(),
    basenameFromUrl(resolved_src),
  ];
  for (const fnameTry of fnameCandidates) {
    if (!fnameTry) continue;
    const matchSuffix = fnameTry.match(/(\d+)\.(?:jpe?g|png|webp|gif)$/i);
    if (matchSuffix) return parseInt(matchSuffix[1], 10);
  }
  return dom_index;
}

class KenhSinhVienService extends HtmlConnectorService {
  constructor() {
    super({
      domain: SITE_DOMAIN,
      label: SITE_LABEL,
      siteId: 'kenhsinhvien',
      imageReferer: SITE_DOMAIN,
      selectors: PLACEHOLDER_SELECTORS,
    });
  }

  /**
   * Follow XenForo rel=next (and jump link) until no new primary thread links appear.
   */
  async collectThreadChaptersFromForum(trimmed_url, fetch_options) {
    const chapters_out = [];
    const seen_normalized = new Set();

    let next_page_url =
      trimmed_url.endsWith('/') || /\/page-\d+$/.test(trimmed_url)
        ? trimmed_url
        : `${trimmed_url.replace(/\/+$/, '')}/`;
    next_page_url = next_page_url.replace(/\/+$/, '') + '/';

    const visited_pages = new Set();
    let safety_pages = 0;

    while (next_page_url && safety_pages < 80) {
      safety_pages += 1;
      if (visited_pages.has(next_page_url)) break;
      visited_pages.add(next_page_url);

      const fetched_page = await fetchHtml(next_page_url, fetch_options);
      if (!fetched_page.ok) {
        if (chapters_out.length) break;
        return { ok: false, error: fetched_page.error };
      }

      const $page = cheerio.load(fetched_page.html);
      let added_on_page = 0;

      $page('a[data-tp-primary="on"]').each((_, el) => {
        const raw_href = ($page(el).attr('href') || '').trim();
        if (!raw_href || !raw_href.startsWith('/t/')) return;

        const absolute_href = resolveUrl(next_page_url, raw_href);
        const threadKey = normalizedThreadUrl(absolute_href);
        if (!threadKey || seen_normalized.has(threadKey)) return;

        seen_normalized.add(threadKey);
        added_on_page += 1;
        const link_text = String($page(el).text() || '').replace(/\s+/g, ' ').trim();
        chapters_out.push({ url: threadKey, title: link_text || threadKey });
      });

      const next_rel =
        ($page('link[rel="next"]').attr('href') || '').trim() ||
        ($page('a.pageNav-jump--next').attr('href') || '').trim();

      if (!next_rel) break;

      const resolved_next = resolveUrl(next_page_url, next_rel);
      if (!resolved_next || resolved_next === next_page_url) break;
      if (visited_pages.has(resolved_next)) break;
      // XenForo may serve duplicate listings for out-of-range /page-* (no new IDs)
      if (added_on_page === 0 && chapters_out.length > 0) break;

      next_page_url = resolved_next;
    }

    return { ok: true, chapters: chapters_out };
  }

  async loadSingleThread(trimmed_url, fetch_options) {
    const fetched_page = await fetchHtml(trimmed_url, fetch_options);
    if (!fetched_page.ok) {
      return { ok: false, error: fetched_page.error };
    }

    const $doc = cheerio.load(fetched_page.html);
    const heading_text =
      $doc('.p-title-value').first().text().trim() ||
      $doc('h1').first().text().trim() ||
      '';

    let meta_title_text = '';
    const raw_title_el = ($doc('title').first().text() || '').split('|')[0];
    meta_title_text = String(raw_title_el || '').trim();

    const manga_title = heading_text || meta_title_text;
    if (!manga_title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const thread_canonical =
      normalizedThreadUrl(trimmed_url) || trimmed_url.replace(/\/+$/, '') + '/';

    return {
      ok: true,
      manga: {
        title: manga_title,
        coverUrl: '',
        mangaUrl: thread_canonical,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters: [{ url: thread_canonical, title: manga_title }],
    };
  }

  async load(url, options = {}) {
    const trimmed_url = String(url || '').trim();
    if (!trimmed_url) {
      return { ok: false, error: 'URL trống.' };
    }

    const user_cookie = this._effectiveUserCookie();
    const fetch_options = {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: SITE_DOMAIN,
      ...(user_cookie ? { cookie: user_cookie } : {}),
    };

    const forum_base = forumListUrl(trimmed_url);
    try {
      const parsed_path = new URL(trimmed_url).pathname || '';
      if (/^\/t\//.test(parsed_path)) {
        return this.loadSingleThread(trimmed_url, fetch_options);
      }
    } catch {
      /* */
    }

    if (!forum_base) {
      return {
        ok: false,
        error: 'URL KSV không hợp lệ — cần link diễn đàn (/f/...) hoặc chủ đề (/t/...).',
      };
    }

    const fetched_heading = await fetchHtml(forum_base, fetch_options);
    if (!fetched_heading.ok) {
      return { ok: false, error: fetched_heading.error || 'Không tải được diễn đàn.' };
    }

    const $heading = cheerio.load(fetched_heading.html);
    const forum_title_raw =
      $heading('.p-title-value').first().text().trim() ||
      $heading('h1').first().text().trim() ||
      '';

    let forum_heading = forum_title_raw;
    if (!forum_heading) {
      const title_meta = ($heading('title').first().text() || '').split('|')[0];
      forum_heading = String(title_meta || '').trim();
    }
    if (!forum_heading) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const aggregated = await this.collectThreadChaptersFromForum(forum_base, fetch_options);
    if (!aggregated.ok) {
      return { ok: false, error: aggregated.error };
    }

    return {
      ok: true,
      manga: {
        title: forum_heading,
        coverUrl: '',
        mangaUrl: forum_base,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters: aggregated.chapters,
    };
  }

  async fetchChapterImages(chapter_url, referer) {
    const user_cookie = this._effectiveUserCookie();
    const fetched_page = await fetchHtml(chapter_url, {
      referer: referer || SITE_DOMAIN,
      ...(user_cookie ? { cookie: user_cookie } : {}),
    });

    if (!fetched_page.ok) {
      throw new Error(`Không tải được trang chương: ${fetched_page.error}`);
    }

    const $doc = cheerio.load(fetched_page.html);
    let $candidate_imgs = $doc('article.message--article article.message-body img.bbImage');
    if (!$candidate_imgs.length) {
      $candidate_imgs = $doc('.message--article .message-body img.bbImage');
    }
    if (!$candidate_imgs.length) {
      // Fallback: bbImage can appear without message--article in some styles
      $candidate_imgs = $doc('.bbWrapper img.bbImage');
    }

    const row_list = [];

    $candidate_imgs.each((dom_index, el) => {
      const $node = $doc(el);
      let resolved_src = getImageSrcFromEl($node);
      if (!resolved_src || /^data:/i.test(resolved_src)) return;
      if (!isValidImgSrc(resolved_src)) return;
      resolved_src = resolveUrl(chapter_url, resolved_src);

      const ext_resolved = getFileExt(resolved_src);
      if (!ext_resolved) return;

      const wrap_title =
        ($node.closest('.bbImageWrapper').attr('title') ||
          $node.closest('.bbImageWrapper').find('[title]').attr('title') ||
          '') ||
        '';

      const sort_value = bbImageSortKey(wrap_title, resolved_src, dom_index);
      row_list.push({ sort_value, dom_index, image_url: resolved_src, ext_field: ext_resolved });
    });

    row_list.sort((row_a, row_b) =>
      row_a.sort_value !== row_b.sort_value
        ? row_a.sort_value - row_b.sort_value
        : row_a.dom_index - row_b.dom_index,
    );

    return row_list.map((row_item) => ({
      imageUrl: row_item.image_url,
      ext: row_item.ext_field,
    }));
  }
}

const service = new KenhSinhVienService();

module.exports = {
  DOMAIN: SITE_DOMAIN,
  LABEL: SITE_LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) =>
    service.downloadChapter(payload, connector || SITE_LABEL),
};
