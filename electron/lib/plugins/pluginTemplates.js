/**
 * CMS template profiles and heuristics derived from active built-in connectors.
 */

const IMAGE_ATTR_PRIORITY = [
  'data-lazy-src',
  'data-original-src',
  'data-original',
  'data-src',
  'data-sv1',
  'data-sv2',
  'data-cdn',
  'data-url',
  'src',
];

const EXTRA_CHAPTER_CONTAINERS = [
  '#nt_listchapter a',
  '#chapter_list li a',
  '.works-chapter-list a',
  'div.list_chapter div.works-chapter-item a',
  '.list_chapter a',
  '.listing-chapters_wrap .wp-manga-chapter a',
  '.listing-chapters_wrap a',
  '.wp-manga-chapter a',
  '#chapterlist ul li .eph-num a',
  '#chapterlist a',
  '.list-chapter li a',
  '.list-chapter a',
  '.chapter-list a',
  '.chapters a',
  '[class*="chapter-list"] a',
  '.listchapter a',
  '.manga-chapter a',
  '[class*="listchapter"] a',
  '.reading-list a',
  '.chapter-grid a',
  'ul.chapter-list a',
];

const EXTRA_IMAGE_CONTAINERS = [
  '.reading-detail .page-chapter',
  'div.chapter_content div.page-chapter',
  '.reading-content',
  '#readerarea',
  '.page-chapter',
  '.reading-detail',
  '.chapter-content',
  '#chapter-content',
  '.chapter-images',
  '#content-chapter',
  '.box_doc',
  '[data-reader-lazy-pages]',
  '.entry-content',
  '[class*="reading"]',
  '[class*="chapter-content"]',
];

const CMS_TEMPLATES = [
  {
    id: 'nettruyen',
    label: 'NetTruyen / NhatTruyen',
    match: ($, html) =>
      $('#nt_listchapter').length > 0 ||
      $('h1.title-detail').length > 0 ||
      ($('.reading-detail').length > 0 && $('.page-chapter').length > 0) ||
      /nettruyen|nhattruyen|nt_listchapter/i.test(html || ''),
    titleSelectors: ['h1.title-detail', '.title-detail', 'h1'],
    coverSelectors: ['.detail-info .col-image img', '.col-image img', 'meta[property="og:image"]'],
    authorSelectors: ['.author p.col-xs-8', '.author .col-xs-8', 'li.author a', '.author a'],
    descriptionSelectors: ['.detail-content p', '.detail-content'],
    chapterSelectors: ['#nt_listchapter a', '.list-chapter li a', '.list-chapter a'],
    imageContainerSelectors: ['.reading-detail .page-chapter', '.reading-detail', '.box_doc'],
    imageSelectors: ['.reading-detail .page-chapter img', '.reading-detail img', '.box_doc img'],
    latestUpdates: {
      itemSelector: '.items .item',
      linkSelector: 'figcaption h3 a, h3 a, .image a',
      titleSelector: 'figcaption h3 a, h3 a',
      coverSelector: '.image img, img',
      chapterSelector: '.comic-item .chapter a, .chapter a',
      pageUrlTemplate: '{baseUrl}/?page={page}',
    },
  },
  {
    id: 'truyenqq',
    label: 'TruyenQQ',
    match: ($, _html) =>
      $('.works-chapter-list').length > 0 ||
      $('div.chapter_content div.page-chapter').length > 0 ||
      ($('.list_chapter').length > 0 && $('.book_other').length > 0),
    titleSelectors: ['.book_other h1', 'h1'],
    coverSelectors: ['.book_avatar img', 'meta[property="og:image"]'],
    authorSelectors: ['li.author p.col-xs-9', '.author a', '.story-detail-info .author'],
    descriptionSelectors: ['.story-detail-info p', '.detail-content'],
    chapterSelectors: ['.works-chapter-list a', 'div.list_chapter div.works-chapter-item a', '.list_chapter a'],
    imageContainerSelectors: ['div.chapter_content div.page-chapter', '.chapter_content'],
    imageSelectors: ['div.chapter_content div.page-chapter img', '.chapter_content img'],
    latestUpdates: {
      itemSelector: 'ul.list_grid li, .list_grid li',
      linkSelector: 'h3 a, .book_name a, a',
      titleSelector: 'h3 a, .book_name a',
      coverSelector: '.book_avatar img, img',
      chapterSelector: '.last_chapter a, .chapter a',
      pageUrlTemplate: '{baseUrl}/truyen-moi-cap-nhat/trang-{page}.html',
    },
  },
  {
    id: 'madara',
    label: 'WP-Manga (Madara)',
    match: ($, html) =>
      $('#manga-chapters-holder').length > 0 ||
      $('.wp-manga-chapter').length > 0 ||
      $('body.wp-manga-page').length > 0 ||
      $('.listing-chapters_wrap').length > 0 ||
      $('.wp-manga-chapter-img').length > 0 ||
      /wp-manga/i.test(html || ''),
    titleSelectors: ['.post-title h1', '.post-title h3', 'h1'],
    coverSelectors: ['.summary_image img', 'meta[property="og:image"]'],
    authorSelectors: ['.author-content a', '.author-content'],
    descriptionSelectors: ['.description-summary .summary__content p', '.summary__content'],
    chapterSelectors: [
      '.listing-chapters_wrap .wp-manga-chapter a',
      '.wp-manga-chapter a',
      '.listing-chapters_wrap a',
      '.version-chap a',
    ],
    imageContainerSelectors: ['.reading-content .page-break', '.reading-content', '.read-container'],
    imageSelectors: ['.reading-content img.wp-manga-chapter-img', '.reading-content img', '.read-container img'],
    latestUpdates: {
      itemSelector: '.page-item-detail, .c-tabs-item__content',
      linkSelector: '.post-title h3 a, .post-title h5 a, .item-thumb a',
      titleSelector: '.post-title h3 a, .post-title h5 a',
      coverSelector: '.item-thumb img, img',
      chapterSelector: '.list-chapter .chapter-item a, .chapter a',
      pageUrlTemplate: '{baseUrl}/page/{page}/',
    },
  },
  {
    id: 'mangastream',
    label: 'MangaStream / Themesia',
    match: ($, html) =>
      $('#chapterlist').length > 0 ||
      $('#readerarea').length > 0 ||
      $('.eph-num').length > 0 ||
      /ts_reader\.run\s*\(/i.test(html || ''),
    titleSelectors: ['h1.entry-title', '.infox h1', 'h1'],
    coverSelectors: ['.thumb img', '.thumbook .thumb img', 'meta[property="og:image"]'],
    authorSelectors: ['.fmed span', '.imptdt i', '.spe span'],
    descriptionSelectors: ['.entry-content[itemprop="description"] p', '.wd-full .entry-content p'],
    chapterSelectors: ['#chapterlist ul li .eph-num a', '#chapterlist a', '.bxcl a'],
    imageContainerSelectors: ['#readerarea', '.rdminimal'],
    imageSelectors: ['#readerarea img', '.rdminimal img'],
    latestUpdates: {
      itemSelector: '.bs .bsx, .utao .uta',
      linkSelector: '> a, .luf h4 a, a[href]',
      titleSelector: '.tt, .luf h4, a[title]',
      coverSelector: '.limit img, .imgu img, img',
      chapterSelector: '.epxs, .luf ul li a',
      pageUrlTemplate: '{baseUrl}/page/{page}/',
    },
  },
];

const FALLBACK_LATEST_PATTERNS = [
  {
    itemSelector: '.items .item',
    linkSelector: 'figcaption h3 a, h3 a, .image a, a',
    titleSelector: 'figcaption h3 a, h3 a, .title',
    coverSelector: '.image img, img',
    chapterSelector: '.comic-item .chapter a, .chapter a',
    pageUrlTemplate: '{baseUrl}/?page={page}',
  },
  {
    itemSelector: '.list_grid li, ul.list_grid li',
    linkSelector: 'h3 a, .book_name a, a',
    titleSelector: 'h3 a, .book_name a',
    coverSelector: '.book_avatar img, img',
    chapterSelector: '.last_chapter a, .chapter a',
    pageUrlTemplate: '{baseUrl}/?page={page}',
  },
  {
    itemSelector: '.page-item-detail, .c-tabs-item__content',
    linkSelector: '.post-title h3 a, .post-title h5 a, .item-thumb a',
    titleSelector: '.post-title h3 a, .post-title h5 a',
    coverSelector: '.item-thumb img, img',
    chapterSelector: '.list-chapter .chapter-item a, .chapter a',
    pageUrlTemplate: '{baseUrl}/page/{page}/',
  },
  {
    itemSelector: '.bs .bsx, .utao .uta',
    linkSelector: 'a',
    titleSelector: '.tt, .luf h4, a',
    coverSelector: '.limit img, img',
    chapterSelector: '.epxs, .luf ul li a',
    pageUrlTemplate: '{baseUrl}/page/{page}/',
  },
  {
    itemSelector: '.list-story-item, .story-item, .manga-item, .comic-item, .grid-item',
    linkSelector: 'h3 a, h2 a, .title a, a',
    titleSelector: 'h3 a, h2 a, .title a, .title',
    coverSelector: 'img',
    chapterSelector: '.chapter a, .latest-chapter a, a[href*="chap"], a[href*="chapter"]',
    pageUrlTemplate: '{baseUrl}/?page={page}',
  },
];

function detectCmsTemplate($, html) {
  for (const tpl of CMS_TEMPLATES) {
    try {
      if (tpl.match($, html)) {
        return {
          id: tpl.id,
          label: tpl.label,
          confidence: 'high',
          template: tpl,
        };
      }
    } catch {
      /* ignore matcher errors */
    }
  }
  return {
    id: 'generic',
    label: 'Generic HTML',
    confidence: 'low',
    template: null,
  };
}

/**
 * Safely parse balanced JSON passed to `ts_reader.run({...})` without eval.
 * @param {string} html
 * @returns {string[]}
 */
function extractTsReaderImages(html) {
  const src = String(html || '');
  const marker = /ts_reader\.run\s*\(\s*(\{)/i.exec(src);
  if (!marker) return [];

  const startIdx = marker.index + marker[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = startIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return [];
  try {
    const parsed = JSON.parse(src.slice(startIdx, endIdx + 1));
    const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];
    for (const s of sources) {
      if (Array.isArray(s?.images) && s.images.length > 0) {
        return s.images
          .map((u) => String(u || '').trim())
          .filter(Boolean);
      }
    }
  } catch {
    return [];
  }
  return [];
}

function extractChapterNumber(label) {
  const s = String(label || '');
  const m =
    /(?:chapter|chap|chương|chuong|ch|ep|episode)\s*[:.#-]?\s*(\d+(?:\.\d+)?)/i.exec(s) ||
    /(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Determine whether scraped chapters appear in ascending (1 -> N) or descending (N -> 1) order.
 * @param {Array<{ title?: string, url?: string }>} chapters
 * @returns {'asc'|'desc'}
 */
function detectChapterOrder(chapters) {
  if (!Array.isArray(chapters) || chapters.length < 2) return 'desc';

  const nums = [];
  for (const ch of chapters) {
    const n = extractChapterNumber(ch?.title) ?? extractChapterNumber(ch?.url);
    if (n !== null) nums.push(n);
  }
  if (nums.length < 2) return 'desc';

  let ascPairs = 0;
  let descPairs = 0;
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] > nums[i - 1]) ascPairs += 1;
    else if (nums[i] < nums[i - 1]) descPairs += 1;
  }

  if (ascPairs > descPairs) return 'asc';
  if (descPairs > ascPairs) return 'desc';
  return nums[0] <= nums[nums.length - 1] ? 'asc' : 'desc';
}

function isLikelyCloudflareOrBlocked(statusOrError, html = '') {
  const errStr = String(statusOrError || '');
  if (/\b(?:403|429|503|520|521|522|525|526)\b/.test(errStr)) return true;
  if (/cloudflare|forbidden|blocked|captcha|access denied/i.test(errStr)) return true;
  const body = String(html || '').slice(0, 4096);
  return (
    /cf-browser-verification|challenge-platform|__cf_chl_opt|cf-turnstile/i.test(body) ||
    (/Just a moment\.\.\./i.test(body) && /cloudflare/i.test(body))
  );
}

function pickAttrSrc($el) {
  for (const attr of IMAGE_ATTR_PRIORITY) {
    const val = ($el.attr(attr) || '').trim();
    if (val && !/^data:/i.test(val)) return val;
  }
  return '';
}

/**
 * Validate external HTTP/HTTPS URL and reject loopback / private / link-local SSRF targets.
 * @param {string} rawUrl
 * @returns {{ ok: boolean, parsed?: URL, error?: string }}
 */
function validatePublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, error: 'URL không hợp lệ.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Chỉ hỗ trợ URL HTTP/HTTPS.' };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return { ok: false, error: 'Host không hợp lệ.' };
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::' ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return { ok: false, error: 'Không cho phép truy cập địa chỉ nội bộ hoặc loopback.' };
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => parseInt(n, 10));
    const [a, b] = octets;
    if (
      octets.some((n) => n < 0 || n > 255) ||
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return { ok: false, error: 'Không cho phép truy cập địa chỉ IP nội bộ hoặc private.' };
    }
  }
  // Block mapped IPv4 in IPv6 like ::ffff:127.0.0.1 and numeric decimal/hex IP literals
  if (/^::ffff:/i.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return { ok: false, error: 'Địa chỉ host không được phép.' };
  }
  return { ok: true, parsed };
}

function detectLatestUpdatesFromHtml($, baseUrl, matchedTemplate) {
  const candidates = [];
  if (matchedTemplate?.latestUpdates) {
    candidates.push(matchedTemplate.latestUpdates);
  }
  candidates.push(...FALLBACK_LATEST_PATTERNS);

  for (const cfg of candidates) {
    const $cards = $(cfg.itemSelector);
    if ($cards.length < 2) continue;

    const sampleItems = [];
    const seen = new Set();
    $cards.each((_, el) => {
      if (sampleItems.length >= 20) return false;
      const $card = $(el);
      const $link = $card.find(cfg.linkSelector).first();
      const href = ($link.attr('href') || '').trim();
      if (!href) return;
      let mangaUrl;
      try {
        mangaUrl = new URL(href, baseUrl).href;
      } catch {
        return;
      }
      if (!mangaUrl || seen.has(mangaUrl)) return;
      const $titleEl = cfg.titleSelector ? $card.find(cfg.titleSelector).first() : $link;
      const trimmedTitleText = ($titleEl.text() || '').trim().replace(/\s+/g, ' ');
      const title = trimmedTitleText || ($link.attr('title') || '').trim().replace(/\s+/g, ' ');
      if (!title) return;
      seen.add(mangaUrl);

      let coverUrl = '';
      if (cfg.coverSelector) {
        const $img = $card.find(cfg.coverSelector).first();
        if ($img.length) {
          const raw = pickAttrSrc($img);
          if (raw && !/^data:/i.test(raw)) {
            try {
              coverUrl = new URL(raw, baseUrl).href;
            } catch {
              /* ignore */
            }
          }
        }
      }
      let latestChapterLabel = '';
      if (cfg.chapterSelector) {
        latestChapterLabel = $card.find(cfg.chapterSelector).first().text().trim().replace(/\s+/g, ' ');
      }
      sampleItems.push({ title, mangaUrl, coverUrl, latestChapterLabel });
    });

    if (sampleItems.length >= 2) {
      return {
        detected: true,
        itemSelector: cfg.itemSelector,
        linkSelector: cfg.linkSelector,
        titleSelector: cfg.titleSelector,
        coverSelector: cfg.coverSelector,
        chapterSelector: cfg.chapterSelector,
        pageUrlTemplate: cfg.pageUrlTemplate,
        sampleCount: sampleItems.length,
        sampleItems: sampleItems.slice(0, 5),
      };
    }
  }

  return { detected: false, sampleCount: 0, sampleItems: [] };
}

module.exports = {
  IMAGE_ATTR_PRIORITY,
  EXTRA_CHAPTER_CONTAINERS,
  EXTRA_IMAGE_CONTAINERS,
  CMS_TEMPLATES,
  detectCmsTemplate,
  extractTsReaderImages,
  detectChapterOrder,
  isLikelyCloudflareOrBlocked,
  detectLatestUpdatesFromHtml,
  pickAttrSrc,
  validatePublicHttpUrl,
};
