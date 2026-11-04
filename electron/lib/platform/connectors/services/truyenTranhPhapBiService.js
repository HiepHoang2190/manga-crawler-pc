/**
 * Truyện Tranh Pháp Bỉ — truyentranhphapbi.com (Blogger: một post = một tập, ảnh trong .full-size-no-scale).
 * Migrated to use HtmlConnectorService base class.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  isValidImgSrc,
  getFileExt,
  getImageSrcFromEl,
  collectChapterImages,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://www.truyentranhphapbi.com/';
const LABEL = 'TruyenTranhPhapBi';

/**
 * TruyenTranhPhapBi service extending HtmlConnectorService.
 * Handles Blogger-based manga site with special URL patterns:
 * - /search/label/... → label pages (multiple posts)
 * - /p/muc-luc-*.html → index pages (static table of contents)
 * - Regular post URLs → single chapters
 */
class TruyenTranhPhapBiService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'truyentranhphapbi',
      imageReferer: DOMAIN,
      // No standard selectors since this site has custom parsing logic
      selectors: {
        chapterLinks: '', // Not used - custom parsing
        title: '', // Not used - custom parsing
        cover: '', // Not used - custom parsing
      },
    });
  }

  /**
   * Check if URL is a label page (/search/label/...)
   */
  isLabelUrl(url) {
    return /\/search\/label\//i.test(url);
  }

  /**
   * Check if URL is an index page (/p/...html)
   */
  isIndexPageUrl(url) {
    return /\/p\/[^/?#]+\.html/i.test(url);
  }

  /**
   * Parse post title from HTML
   */
  parsePostTitle(html) {
    const $ = cheerio.load(html);
    let t = $('h3.post-title.entry-title').first().text().trim();
    if (!t) {
      t = ($('meta[property="og:title"]').attr('content') || '').trim();
    }
    t = t.replace(/\s*\|\s*Truyện Tranh Pháp Bỉ\s*$/i, '').trim();
    return t;
  }

  /**
   * Parse cover URL from HTML
   */
  parseCoverUrl(html, pageUrl) {
    const $ = cheerio.load(html);
    const og = ($('meta[property="og:image"]').attr('content') || '').trim();
    if (og) return resolveUrl(pageUrl, og);
    const $img = $('.post-body.entry-content div.separator').first().find('img').first();
    if ($img.length) {
      const raw = getImageSrcFromEl($img);
      return raw ? resolveUrl(pageUrl, raw) : '';
    }
    return '';
  }

  /**
   * Parse label page (list of posts)
   */
  parseLabelPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts = [];

    $('.post-outer, article.post').each((_, el) => {
      const $el = $(el);
      // Title
      const titleEl = $el.find('h3.post-title a, .post-title a').first();
      const title = titleEl.text().trim();
      const url = (titleEl.attr('href') || '').trim();
      if (!title || !url) return;
      // Cover: get first image in post snippet
      const imgSrc = getImageSrcFromEl($el.find('img').first());
      const coverUrl = imgSrc ? resolveUrl(pageUrl, imgSrc) : '';
      posts.push({ title, url, coverUrl });
    });

    // "Older Posts" link
    let olderPostsUrl = null;
    $('a.blog-pager-older-link, #blog-pager-older-link').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (href) olderPostsUrl = href;
    });

    return { posts, olderPostsUrl };
  }

  /**
   * Fetch all posts from label URL (with pagination)
   */
  async fetchLabelList(labelUrl) {
    const allPosts = [];
    let nextUrl = labelUrl;
    const visited = new Set();
    let lastError = null;

    while (nextUrl && !visited.has(nextUrl)) {
      visited.add(nextUrl);
      const fetched = await fetchHtml(nextUrl, { userAgent: USER_AGENT_JSOUP, referer: DOMAIN });
      if (!fetched.ok) {
        lastError = fetched.error;
        break;
      }

      const { posts, olderPostsUrl } = this.parseLabelPage(fetched.html, nextUrl);
      allPosts.push(...posts);
      nextUrl = olderPostsUrl;
    }

    if (allPosts.length === 0 && lastError) {
      return { ok: false, error: lastError, posts: [] };
    }
    return { ok: true, posts: allPosts };
  }

  /**
   * Parse index page (static table of contents)
   */
  parseIndexPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts = [];
    const seen = new Set();

    // Page title
    let title = $('h3.post-title, h1.post-title').first().text().trim();
    if (!title) {
      title = ($('meta[property="og:title"]').attr('content') || '').trim();
      title = title.replace(/\s*\|\s*Truyện Tranh Pháp Bỉ\s*$/i, '').trim();
    }

    // Cover
    const coverUrl = ($('meta[property="og:image"]').attr('content') || '').trim();

    // Post links in post-body
    $('.post-body.entry-content a[href*="truyentranhphapbi.com/20"]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      const text = $(el).text().trim();
      if (!href || !text || seen.has(href)) return;
      seen.add(href);
      posts.push({ title: text, url: href });
    });

    return { title, coverUrl, posts };
  }

  /**
   * Override load method to handle different URL types
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    // Index page (/p/muc-luc-*.html)
    if (this.isIndexPageUrl(trimmed)) {
      const fetched = await fetchHtml(trimmed, { userAgent: USER_AGENT_JSOUP, referer: DOMAIN });
      if (!fetched.ok) {
        return { ok: false, error: fetched.error || 'Không tải được trang mục lục.' };
      }
      const { title, coverUrl, posts } = this.parseIndexPage(fetched.html, trimmed);
      if (!posts.length) {
        return { ok: false, error: 'Không tìm thấy bài viết nào trong trang mục lục.' };
      }
      return {
        ok: true,
        manga: {
          title: title || 'Mục lục',
          coverUrl,
          mangaUrl: trimmed,
          mangaId: '',
          siteId: this.config.siteId,
          sourceLabel: this.config.label,
        },
        chapters: posts.map((p) => ({ url: p.url, title: p.title })),
      };
    }

    // Label page (/search/label/...)
    if (this.isLabelUrl(trimmed)) {
      const labelResult = await this.fetchLabelList(trimmed);
      if (!labelResult.ok) {
        return { ok: false, error: labelResult.error };
      }
      const posts = labelResult.posts;
      if (!posts.length) {
        return { ok: false, error: 'Không tìm thấy bài viết nào trong label này.' };
      }
      // Extract label name from URL
      const labelMatch = trimmed.match(/\/search\/label\/([^/?#]+)/i);
      const labelName = labelMatch ? decodeURIComponent(labelMatch[1]) : 'Spirou';
      // Fetch cover from first post
      let coverUrl = '';
      if (posts[0]?.url) {
        const firstFetch = await fetchHtml(posts[0].url, { userAgent: USER_AGENT_JSOUP, referer: DOMAIN });
        if (firstFetch.ok) {
          coverUrl = this.parseCoverUrl(firstFetch.html, posts[0].url);
        }
      }
      return {
        ok: true,
        manga: {
          title: labelName,
          coverUrl,
          mangaUrl: trimmed,
          mangaId: '',
          siteId: this.config.siteId,
          sourceLabel: this.config.label,
        },
        chapters: posts.map((p) => ({ url: p.url, title: p.title })),
      };
    }

    // Regular post URL
    const fetched = await fetchHtml(trimmed, { userAgent: USER_AGENT_JSOUP, referer: DOMAIN });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang.' };
    }
    const title = this.parsePostTitle(fetched.html);
    if (!title) {
      return { ok: false, error: 'Không đọc được tiêu đề bài viết.' };
    }
    const coverUrl = this.parseCoverUrl(fetched.html, trimmed);
    const chapters = [{ url: trimmed, title }];
    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters,
    };
  }

  /**
   * Custom image collection for TruyenTranhPhapBi.
   * Handles multiple image extraction strategies for Blogger posts.
   */
  collectPhapBiImages(html, pageUrl) {
    const $ = cheerio.load(html);
    const out = [];
    const seen = new Set();

    function pushUrl(raw) {
      let src = String(raw || '').trim();
      if (!src) return;
      if (!/^https?:\/\//i.test(src)) {
        src = resolveUrl(pageUrl, src);
      }
      if (!src || !isValidImgSrc(src)) return;
      const ext = getFileExt(src);
      if (!ext) return;
      if (seen.has(src)) return;
      seen.add(src);
      out.push({ imageUrl: src, ext });
    }

    // Strategy 1: Full-size links in .full-size-no-scale
    $('.post-body .full-size-no-scale a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href) || href.includes('googleusercontent.com/')) pushUrl(href);
    });

    if (out.length > 1) return out;

    // Strategy 2: Google User Content links/images after "more" anchor
    let $scope = $('.post-body.entry-content').first();
    const $more = $scope.find('a[name="more"]').first();
    if ($more.length) {
      $scope = $more.nextAll();
    }
    $scope.find('div.separator > a[href*="googleusercontent"]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href) || href.includes('googleusercontent.com/')) pushUrl(href);
    });
    // Some posts embed full-size images directly in separator divs (no anchor wrapper)
    $scope.find('div.separator > img[src*="googleusercontent"]').each((_, el) => {
      const raw_src = ($(el).attr('src') || '').trim();
      if (!raw_src) return;
      const full_src = raw_src.replace(/\/[sw]\d+(?:-rw)?\//, '/s0/');
      pushUrl(full_src);
    });

    // Only return if found more than 1 image (1 image might be just thumbnail)
    if (out.length > 1) return out;

    // Strategy 3: Blogger lightbox pattern - upgrade to full resolution
    const lightboxOut = [];
    const lightboxSeen = new Set();
    function pushLightbox(raw) {
      let src = String(raw || '').trim();
      if (!src) return;
      // Upgrade size to s0 for full resolution
      src = src.replace(/\/[sw]\d+(?:-rw)?\//, '/s0/');
      if (!/^https?:\/\//i.test(src)) src = resolveUrl(pageUrl, src);
      if (!src || !isValidImgSrc(src)) return;
      const ext = getFileExt(src);
      if (!ext) return;
      if (lightboxSeen.has(src)) return;
      lightboxSeen.add(src);
      lightboxOut.push({ imageUrl: src, ext });
    }
    const $postScope = $('.post-body.entry-content').first();
    $postScope.find('div.separator img[src*="googleusercontent"]').each((_, el) => {
      pushLightbox($(el).attr('src'));
    });
    if (lightboxOut.length > 1) return lightboxOut;

    // If strategy 2 found images (even just 1), return them
    if (out.length) return out;

    // Strategy 4: General separator links
    const $post = $('.post-body.entry-content').first();
    $post.find('div.separator a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href) || href.includes('googleusercontent.com/')) pushUrl(href);
    });

    if (out.length > 1) return out;

    // Strategy 5: All images in post body
    const $imgs = $('.post-body.entry-content img');
    $imgs.each((_, el) => {
      const raw = getImageSrcFromEl($(el));
      pushUrl(raw);
    });

    // Fallback to default collection if nothing found
    return out.length ? out : collectChapterImages(html, pageUrl);
  }

  /**
   * Override fetchChapterImages to use custom image collection
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    return this.collectPhapBiImages(fetched.html, chapterUrl);
  }
}

// Create service instance
const service = new TruyenTranhPhapBiService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};