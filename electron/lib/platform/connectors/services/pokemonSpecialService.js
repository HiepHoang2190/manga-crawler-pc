/**
 * PokemonSpecial service — hỗ trợ pokemonspecial.com (Blogger)
 *
 * Architecture:
 *  - Site là Blogger blog — danh sách chương load động qua Blogger JSON Feeds API.
 *  - Manga được tổ chức theo label (vd: sv, rgb, gsc, etc.)
 *  - Chapter page: ảnh là Blogger Googleusercontent
 *    <img src="https://blogger.googleusercontent.com/img/b/.../s1600/01.png">
 *  - Cover: Blogger thumbnail trong thẻ <link rel="image_src"> hoặc og:image.
 *
 * Labels (series):
 *  - sv: Scarlet Violet
 *  - rgb: Red Green Blue
 *  - yel: Yellow
 *  - gsc: Gold Silver Crystal
 *  - rs: Ruby Sapphire
 *  - frlg: FireRed LeafGreen
 *  - rald: Ruby Sapphire Emerald
 *  - dp: Diamond Pearl
 *  - hgss: HeartGold SoulSilver
 *  - bw: Black White
 *  - b2w2: Black 2 White 2
 *  - xy: X Y
 *  - oras: Omega Ruby Alpha Sapphire
 *  - sm: Sun Moon
 *  - swsh: Sword Shield
 *  - pla: Pokémon Legends Arceus
 *  - pkm: Pokémon (general)
 *  - kanto: Kanto region
 */
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');

const LABEL = 'PokemonSpecial';
const DOMAIN = 'https://www.pokemonspecial.com';
const MAX_PER_REQUEST = 150;

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.9',
};

/**
 * PokemonSpecial connector service using HtmlConnectorService base class.
 * Handles Blogger JSON API for chapter fetching and Blogger image parsing.
 */
class PokemonSpecialService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'pokemonspecial',
      imageReferer: DOMAIN + '/',
      // No standard selectors since we use custom parsing
      selectors: {},
    });
  }

  /**
   * Override load method to use Blogger JSON API
   * URL can be:
   *  - A label page: https://www.pokemonspecial.com/search/label/sv
   *  - A specific chapter page (will extract label from page)
   *  - The home page (will show all chapters)
   */
  async load(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const origin = this.getOrigin(trimmed);

    // Check if URL is a label page
    const labelMatch = /\/search\/label\/([^/?#]+)/.exec(trimmed);
    if (labelMatch) {
      return this.loadByLabel(origin, labelMatch[1], trimmed);
    }

    // Try to fetch the page and extract label
    const fetched = await this.fetchHtml(trimmed);
    if (!fetched.ok) return { ok: false, error: fetched.error };

    const html = fetched.html;
    const title = this.parseTitle(html);
    const coverUrl = this.parseCoverUrl(html);

    // Try to extract label from the page
    const seriesLabel = this.parseSeriesLabel(html);
    if (seriesLabel) {
      return this.loadByLabel(origin, seriesLabel, trimmed, title, coverUrl);
    }

    // If no label found, try to load all chapters (home page)
    return this.loadAllChapters(origin, trimmed);
  }

  /**
   * Load chapters by Blogger label
   */
  async loadByLabel(origin, label, url, predefinedTitle = null, predefinedCoverUrl = null) {
    const apiResult = await this.fetchAllChapterEntries(origin, label);
    if (!apiResult.ok) {
      return { ok: false, error: `Lỗi tải danh sách chương: ${apiResult.error}` };
    }

    const seriesName = predefinedTitle || this.formatSeriesName(label);
    
    // Get arc offset for chapter numbering
    const arcOffset = this.getArcOffset(label);
    
    const chapters = this.entriesToChapters(apiResult.entries, seriesName, arcOffset);
    if (!chapters.length) {
      return { ok: false, error: 'Không tìm thấy chương nào.' };
    }

    // Always use default cover
    const defaultCoverUrl = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi4KF2_qBF9ST1f78iysKGiE5EKMc8r6K9aUGEDIX0INOpN6rDz1MAuRTxpXnZ0GWe5vhYY7uJN1aSiAyVXnaaCoN6M6oubnYR9069YzpLfiRpapUZIHBeyW6uqm22Kj4SFHNEmwo0OKnkbfiykT67e60QhFfMro_gn7bsIx2AFH3lXkUSHbSxVsKpmgd6O/s16000/000.jpg';

    return {
      ok: true,
      manga: {
        title: seriesName,
        coverUrl: predefinedCoverUrl || defaultCoverUrl,
        mangaUrl: url,
        siteId: 'pokemonspecial',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Load all chapters from the blog (home page)
   * Fetches all arcs and merges them together
   */
  async loadAllChapters(origin, url) {
    const seriesName = 'Pokémon Đặc Biệt';
    
    // Default cover from chapter 001
    const defaultCoverUrl = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi4KF2_qBF9ST1f78iysKGiE5EKMc8r6K9aUGEDIX0INOpN6rDz1MAuRTxpXnZ0GWe5vhYY7uJN1aSiAyVXnaaCoN6M6oubnYR9069YzpLfiRpapUZIHBeyW6uqm22Kj4SFHNEmwo0OKnkbfiykT67e60QhFfMro_gn7bsIx2AFH3lXkUSHbSxVsKpmgd6O/s16000/000.jpg';
    
    // List of all arcs in order with their chapter ranges
    const arcs = [
      { label: 'rgb',   start: 1,   end: 40 },    // 001-040
      { label: 'yel',   start: 41,  end: 90 },    // 041-090
      { label: 'gsc',   start: 91,  end: 180 },   // 091-180
      { label: 'rs',    start: 181, end: 267 },   // 181-267
      { label: 'frlg',  start: 268, end: 302 },   // 268-302
      { label: 'rald',  start: 303, end: 337 },   // 303-337
      { label: 'dp',    start: 338, end: 416 },   // 338-416
      { label: 'pla',   start: 417, end: 441 },   // 417-441
      { label: 'hgss',  start: 442, end: 460 },   // 442-460
      { label: 'bw',    start: 461, end: 524 },   // 461-524
      { label: 'b2w2',  start: 525, end: 548 },   // 525-548
      { label: 'xy',    start: 549, end: 595 },   // 549-595
      { label: 'oras',  start: 596, end: 617 },   // 596-617
      { label: 'sm',    start: 618, end: 654 },   // 618-654
      { label: 'swsh',  start: 655, end: 697 },   // 655-697
      { label: 'sv',    start: 698, end: 999 },   // 698+
    ];

    const allChapters = [];

    // Fetch chapters from each arc
    for (const arc of arcs) {
      const apiResult = await this.fetchAllChapterEntries(origin, arc.label);
      if (apiResult.ok && apiResult.entries.length > 0) {
        const arcChapters = this.entriesToChapters(apiResult.entries, seriesName, arc.start);
        allChapters.push(...arcChapters);
      }
    }

    if (!allChapters.length) {
      return { ok: false, error: 'Không tìm thấy chương nào.' };
    }

    // Sort by chapter number
    allChapters.sort((a, b) => a._num - b._num);

    return {
      ok: true,
      manga: {
        title: seriesName,
        coverUrl: defaultCoverUrl,
        mangaUrl: url,
        siteId: 'pokemonspecial',
        sourceLabel: LABEL,
      },
      chapters: allChapters.map(({ url, title }) => ({ url, title })),
    };
  }

  /**
   * Override fetchChapterImages to parse Blogger images
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await this.fetchHtml(chapterUrl);
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const images = this.parseChapterImages(fetched.html);
    
    // If no images found, provide helpful error message
    if (!images || images.length === 0) {
      throw new Error(
        'Không tìm thấy ảnh trong trang chương. ' +
        'Có thể chương này:\n' +
        '1. Bị ẩn hoặc yêu cầu đăng nhập\n' +
        '2. Chưa được đăng tải\n' +
        '3. Đã bị xóa bởi tác giả\n' +
        'Vui lòng thử mở chương này trên trình duyệt để kiểm tra.'
      );
    }
    
    return images;
  }

  // Utility methods

  async fetchHtml(url) {
    try {
      // Get cookie from cookieManager if available
      const cookieManager = require('../../cookies/cookieManager');
      const siteCookie = cookieManager.getEffectiveCookie('pokemonspecial');
      
      const headers = { 
        ...FETCH_HEADERS, 
        Referer: DOMAIN + '/',
        // Add more headers to mimic real browser
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      };
      
      // Add cookie if available
      if (siteCookie) {
        headers.Cookie = siteCookie;
      }
      
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      
      // Check if HTML is too short (likely blocked or empty)
      if (html.length < 500) {
        return { ok: false, error: 'Trang trả về nội dung quá ngắn. Có thể chương này bị ẩn hoặc yêu cầu đăng nhập.' };
      }
      
      return { ok: true, html };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async fetchJson(url) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,*/*',
          Referer: DOMAIN + '/',
        },
        redirect: 'follow',
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  /** Lấy origin từ URL người dùng nhập */
  getOrigin(url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return DOMAIN;
    }
  }

  /** Parse tiêu đề truyện từ <h1> hoặc <title> */
  parseTitle(html) {
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1) {
      const text = h1[1].replace(/<[^>]+>/g, '').trim();
      if (text) return text;
    }
    const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (t) return t[1].replace(/\s*[-|].*$/, '').trim();
    return '';
  }

  /** Parse cover từ <link rel="image_src"> hoặc og:image */
  parseCoverUrl(html) {
    // Blogger đặt ảnh đại diện bài viết vào <link rel="image_src">
    const imgSrc = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)
      || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i.exec(html);
    if (imgSrc) return imgSrc[1].trim();
    // Fallback: og:image
    const og =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    return og ? og[1].trim() : '';
  }

  /**
   * Parse seriesLabel từ HTML.
   * Tìm trong post-labels hoặc URL pattern
   */
  parseSeriesLabel(html) {
    // Try to find label in post-labels span
    const labelsMatch = /<span class=['"]post-labels['"][^>]*>([\s\S]*?)<\/span>/i.exec(html);
    if (labelsMatch) {
      const labelLink = /\/search\/label\/([^'"?#]+)/.exec(labelsMatch[1]);
      if (labelLink) return labelLink[1];
    }
    return '';
  }

  /**
   * Lấy toàn bộ entries từ Blogger JSON Feeds API theo label.
   * Phân trang tự động (max 150/request).
   */
  async fetchAllChapterEntries(origin, label) {
    const entries = [];
    let startIndex = 1;

    while (true) {
      let url;
      if (label) {
        url = `${origin}/feeds/posts/summary/-/${encodeURIComponent(label)}?alt=json&max-results=${MAX_PER_REQUEST}&start-index=${startIndex}`;
      } else {
        url = `${origin}/feeds/posts/summary?alt=json&max-results=${MAX_PER_REQUEST}&start-index=${startIndex}`;
      }
      
      const result = await this.fetchJson(url);
      if (!result.ok) return { ok: false, error: result.error };

      const batch = result.data?.feed?.entry || [];
      entries.push(...batch);

      if (batch.length < MAX_PER_REQUEST) break;
      startIndex += MAX_PER_REQUEST;
    }

    return { ok: true, entries };
  }

  /**
   * Format series name from label
   */
  formatSeriesName(label) {
    const labelMap = {
      'sv': 'Scarlet Violet',
      'rgb': 'Red Green Blue',
      'yel': 'Yellow',
      'gsc': 'Gold Silver Crystal',
      'rs': 'Ruby Sapphire',
      'frlg': 'FireRed LeafGreen',
      'rald': 'Ruby Sapphire Emerald',
      'dp': 'Diamond Pearl',
      'hgss': 'HeartGold SoulSilver',
      'bw': 'Black White',
      'b2w2': 'Black 2 White 2',
      'xy': 'X Y',
      'oras': 'Omega Ruby Alpha Sapphire',
      'sm': 'Sun Moon',
      'swsh': 'Sword Shield',
      'pla': 'Pokémon Legends Arceus',
      'pkm': 'Pokémon',
      'kanto': 'Kanto',
    };
    return labelMap[label.toLowerCase()] || label.toUpperCase();
  }

  /**
   * Get arc offset for chapter numbering
   */
  getArcOffset(label) {
    const offsets = {
      'rgb': 0,      // 001-040 (offset 0, chapters 1-40)
      'yel': 40,     // 041-090 (offset 40, chapters 1-50)
      'gsc': 90,     // 091-180 (offset 90, chapters 1-90)
      'rs': 180,     // 181-267 (offset 180, chapters 1-87)
      'frlg': 267,   // 268-302 (offset 267, chapters 1-35)
      'rald': 302,   // 303-337 (offset 302, chapters 1-35)
      'dp': 337,     // 338-416 (offset 337, chapters 1-79)
      'pla': 416,    // 417-441 (offset 416, chapters 1-25)
      'hgss': 441,   // 442-460 (offset 441, chapters 1-19)
      'bw': 460,     // 461-524 (offset 460, chapters 1-64)
      'b2w2': 524,   // 525-548 (offset 524, chapters 1-24)
      'xy': 548,     // 549-595 (offset 548, chapters 1-47)
      'oras': 595,   // 596-617 (offset 595, chapters 1-22)
      'sm': 617,     // 618-654 (offset 617, chapters 1-37)
      'swsh': 654,   // 655-697 (offset 654, chapters 1-43)
      'sv': 697,     // 698+ (offset 697, chapters 1-27+)
    };
    return offsets[label.toLowerCase()] || 0;
  }

  /**
   * Chuyển entries từ Blogger API thành danh sách chương.
   * Sort tăng dần theo số chương.
   * 
   * @param {Array} entries - Blogger API entries
   * @param {string} seriesName - Series name
   * @param {number} arcOffset - Offset for chapter numbering (0 for single arc, arc start for multi-arc)
   */
  entriesToChapters(entries, seriesName, arcOffset = 0) {
    const chapters = [];

    for (const entry of entries) {
      const title = String(entry?.title?.$t || '').trim();
      if (!title) continue;

      // Lấy link alternate
      const link = entry.link?.find((l) => l.rel === 'alternate')?.href || '';
      if (!link) continue;

      // Format title - remove emojis and prefixes
      let displayTitle = title;
      
      // Remove emojis and special characters
      displayTitle = displayTitle
        .replace(/[\u{1F000}-\u{1F9FF}]/gu, '') // Emoji
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc symbols and pictographs
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and map
        .replace(/[\u{1F700}-\u{1F77F}]/gu, '') // Alchemical symbols
        .replace(/[\u{1F780}-\u{1F7FF}]/gu, '') // Geometric shapes
        .replace(/[\u{1F800}-\u{1F8FF}]/gu, '') // Supplemental arrows
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental symbols
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and pictographs extended
        .replace(/🇺🇸|🇻🇳|🇯🇵/g, '')           // Flag emojis
        .trim();
      
      // Store original title before removing prefixes
      const originalTitle = displayTitle;
      
      // Remove series prefix if present
      const prefixPatterns = [
        /^\[CORO²\]\s*/i,
        /^\[CORO\]\s*/i,
        /^Scarlet Violet:\s*/i,
        /^Red Green Blue:\s*/i,
        /^Yellow:\s*/i,
        /^Gold Silver Crystal:\s*/i,
        /^Ruby Sapphire:\s*/i,
        /^FireRed LeafGreen:\s*/i,
        /^Diamond Pearl:\s*/i,
        /^HeartGold SoulSilver:\s*/i,
        /^Black White:\s*/i,
        /^Black 2 White 2:\s*/i,
        /^X Y:\s*/i,
        /^Omega Ruby Alpha Sapphire:\s*/i,
        /^Sun Moon:\s*/i,
        /^Sword Shield:\s*/i,
        /^Pokémon Legends Arceus:\s*/i,
        /^Platinum:\s*/i,
        /^Emerald:\s*/i,
      ];
      for (const pattern of prefixPatterns) {
        displayTitle = displayTitle.replace(pattern, '');
      }

      // Trích số chương để sort - try multiple patterns
      let num = 0;
      
      // First, try to extract absolute chapter number from "Chương XXX:" or "Chương XXX " pattern
      // This pattern is used in older arcs (RGB-ORAS) with absolute numbering
      const absoluteMatch = /Chương\s*(\d+)[\s:]/i.exec(displayTitle);
      if (absoluteMatch) {
        num = parseInt(absoluteMatch[1], 10);
      } else {
        // If no absolute number, try to extract relative chapter number
        // This is used in newer arcs (SWSH, SV) with relative numbering
        const numPatterns = [
          /Chapter\s*(\d+(?:[.,]\d+)?)/i,
          /Chương\s*(\d+(?:[.,]\d+)?)/i,
          /Chap\s*(\d+(?:[.,]\d+)?)/i,
          /Tập\s*\d+\s*-\s*Chương\s*(\d+)/i,
          /(\d+(?:[.,]\d+)?)\s*$/i,
        ];
        
        for (const pattern of numPatterns) {
          const match = pattern.exec(displayTitle);
          if (match) {
            const relativeNum = parseFloat(match[1].replace(',', '.').replace('_', '.'));
            // Add arc offset to get absolute chapter number
            num = arcOffset + relativeNum;
            break;
          }
        }
      }

      // Check if title only has "Chapter XXX" format (no Vietnamese or arc name)
      // If so, add arc prefix from original title
      const isSimpleChapterFormat = /^Chapter\s*\d+\s*$/i.test(displayTitle.trim());
      let finalTitle = displayTitle;
      
      if (isSimpleChapterFormat && originalTitle !== displayTitle) {
        // Extract arc name from original title
        const arcMatch = /^\[CORO²\]\s*([^:]+):/i.exec(originalTitle) ||
                        /^([^:]+):/i.exec(originalTitle);
        if (arcMatch) {
          const arcName = arcMatch[1].trim();
          finalTitle = `[${arcName}] ${displayTitle}`;
        }
      }

      // Get published date for sorting
      const published = entry.published?.$t || '';

      chapters.push({ 
        url: link, 
        title: formatChapterTitle(finalTitle), 
        _num: num,
        _published: published,
      });
    }

    // Sort tăng dần theo số chương
    chapters.sort((a, b) => {
      if (a._num !== b._num) {
        return a._num - b._num;
      }
      // If same number, sort by published date
      return a._published.localeCompare(b._published);
    });
    
    return chapters;
  }

  /**
   * Parse ảnh chương từ Blogger Googleusercontent.
   * Format: src="https://blogger.googleusercontent.com/img/b/.../s1600/01.png"
   * 
   * Supports multiple patterns:
   * 1. Standard img src
   * 2. data-src attribute (lazy loading)
   * 3. Images inside <a> tags
   */
  parseChapterImages(html) {
    const urls = [];
    const seen = new Set();

    // Pattern 1: Standard img src with blogger.googleusercontent.com
    const pattern1 = /<img[^>]+src="(https:\/\/blogger\.googleusercontent\.com\/img\/b\/[^"]+)"[^>]*>/gi;
    let m;
    while ((m = pattern1.exec(html)) !== null) {
      this.addImageUrl(m[1], urls, seen);
    }

    // Pattern 2: data-src attribute (lazy loading)
    const pattern2 = /<img[^>]+data-src="(https:\/\/blogger\.googleusercontent\.com\/img\/b\/[^"]+)"[^>]*>/gi;
    while ((m = pattern2.exec(html)) !== null) {
      this.addImageUrl(m[1], urls, seen);
    }

    // Pattern 3: Images inside <a> tags (some Blogger themes wrap images)
    const pattern3 = /<a[^>]+href="(https:\/\/blogger\.googleusercontent\.com\/img\/b\/[^"]+)"[^>]*>/gi;
    while ((m = pattern3.exec(html)) !== null) {
      this.addImageUrl(m[1], urls, seen);
    }

    // Pattern 4: Any googleusercontent.com image (broader match)
    if (urls.length === 0) {
      const pattern4 = /<img[^>]+(?:src|data-src)="(https:\/\/[^"]*googleusercontent\.com[^"]+)"[^>]*>/gi;
      while ((m = pattern4.exec(html)) !== null) {
        this.addImageUrl(m[1], urls, seen);
      }
    }

    return urls;
  }

  /**
   * Helper method to add image URL to list
   */
  addImageUrl(src, urls, seen) {
    src = src.trim();

    if (seen.has(src)) return;

    // Bỏ ảnh nhỏ (thường là icon, avatar)
    if (/\/s72-c\//.test(src)) return;
    if (/\/s120\//.test(src)) return;
    if (/\/s200\//.test(src)) return;

    // Replace size to get full size image
    src = src.replace(/\/s\d+(-c)?\//, '/s1600/');

    seen.add(src);

    // Lấy ext từ URL
    let ext = 'jpg';
    const extMatch = /\.(\w+)(?:\?|$)/.exec(src);
    if (extMatch) {
      const e = extMatch[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e)) ext = e === 'jpeg' ? 'jpg' : e;
    }

    urls.push({ imageUrl: src, ext });
  }
}

// Create service instance
const service = new PokemonSpecialService();

module.exports = {
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
