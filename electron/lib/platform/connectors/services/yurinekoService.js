/**
 * Yurineko Service - API-based connector
 * Site: yurinekoz.com
 * Vietnamese Yuri manga site
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  getImageSrcFromEl,
  resolveUrl,
  getFileExt,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://yurinekoz.com/';
const ORIGIN_BASE = DOMAIN.replace(/\/$/, '');
const LABEL = 'Yurineko';
const LATEST_UPDATES_PATH = '';
const API_BASE = 'https://yurinekoz.com/api/v1';

const SELECTORS = {
  chapterLinks: 'a[href*="/chapter-"]',
  title: 'h1',
  cover: 'img[src*="/covers/"]',
};

/**
 * Extract manga slug from URL
 * Example: https://yurinekoz.com/manga/co-ban-bi-mat-di-giong-noi-luon-nghi-rang-cau-ay-diu-dang-that-day
 * Returns: co-ban-bi-mat-di-giong-noi-luon-nghi-rang-cau-ay-diu-dang-that-day
 */
function extractMangaSlugFromUrl(url) {
  try {
    const match = url.match(/\/manga\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isYurinekoMangaUuid(value) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    String(value || '').trim(),
  );
}

function extractMangaSlugFromHtml(html) {
  const page_html = String(html || '');
  const slug_candidates = [];
  const canonical_match =
    page_html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    page_html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (canonical_match) slug_candidates.push(canonical_match[1]);
  const og_url_matches = [
    page_html.match(/property=["']og:url["'][^>]*content=["']([^"']+)["']/i),
    page_html.match(/content=["']([^"']+)["'][^>]*property=["']og:url["']/i),
  ];
  for (const og_url_match of og_url_matches) {
    if (og_url_match) slug_candidates.push(og_url_match[1]);
  }
  for (const chapter_link_match of page_html.matchAll(/\/manga\/([^/?#"'\\]+)\/chapter-/gi)) {
    slug_candidates.push(chapter_link_match[1]);
  }
  for (const json_slug_match of page_html.matchAll(/\\?"slug\\?"\s*:\s*\\?"([^"\\]+)\\?"/gi)) {
    if (!/^chapter-/i.test(json_slug_match[1])) {
      slug_candidates.push(json_slug_match[1]);
    }
  }

  for (const raw_candidate of slug_candidates) {
    const manga_slug = extractMangaSlugFromUrl(raw_candidate) || String(raw_candidate).trim();
    if (manga_slug && !isYurinekoMangaUuid(manga_slug) && !/^chapter-/i.test(manga_slug)) {
      return manga_slug;
    }
  }
  return null;
}

/**
 * Extract manga ID from HTML
 * Looks for UUID in API calls, chapter URLs, or other sources
 */
function extractMangaIdFromHtml(html) {
  // Method 1: Look for manga ID in API calls (most reliable)
  const apiMatch = html.match(/\/api\/v1\/chapters\/([a-f0-9-]{36})/i);
  if (apiMatch) return apiMatch[1];
  
  // Method 2: Look in chapter URLs which contain manga ID
  // Format: /manga/{manga-id}/{chapter-slug}
  const chapterUrlMatch = html.match(/href="[^"]*\/manga\/[^/]+\/(chapter-[a-f0-9-]+)"/i);
  if (chapterUrlMatch) {
    // Extract UUID from chapter slug
    const uuidMatch = chapterUrlMatch[1].match(/([a-f0-9-]{36})/i);
    if (uuidMatch) return uuidMatch[1];
  }
  
  // Method 3: Look for data attributes or inline scripts with manga ID
  const dataMatch = html.match(/["']?mangaId["']?\s*:\s*["']([a-f0-9-]{36})["']/i);
  if (dataMatch) return dataMatch[1];
  
  // Method 4: Look in any UUID pattern in the HTML
  const uuidMatches = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi);
  if (uuidMatches && uuidMatches.length > 0) {
    // Return the first UUID found (most likely the manga ID)
    return uuidMatches[0];
  }
  
  return null;
}

async function fetchJsonApi(apiUrl, options = {}) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  const origin = options.origin || 'https://yurinekoz.com';
  const parsedUrl = new URL(apiUrl);
  const client = parsedUrl.protocol === 'https:' ? https : http;
  
  const requestOptions = {
    method: 'GET',
    headers: {
      'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      'Origin': origin,
      'Referer': `${origin}/`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
  };
  
  return new Promise((resolve, reject) => {
    const req = client.request(apiUrl, requestOptions, (res) => {
      const zlib = require('zlib');
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      
      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data, statusCode: res.statusCode });
        } else {
          resolve({ ok: false, error: `HTTP ${res.statusCode}`, statusCode: res.statusCode });
        }
      });
      stream.on('error', (err) => {
        console.error('[Yurineko] Stream decompression error:', err);
        resolve({ ok: false, error: err.message });
      });
    });
    req.on('error', (err) => {
      console.error('[Yurineko] fetchJsonApi request error:', err);
      resolve({ ok: false, error: err.message });
    });
    req.end();
  });
}

/**
 * Fetch chapters from API
 */
async function fetchChaptersFromApi(mangaId, mangaSlug, options = {}) {
  const chapters = [];
  let page = 1;
  const limit = 50;
  
  const origin = options.origin || ORIGIN_BASE;
  const apiBase = options.apiBase || API_BASE;
  
  try {
    while (true) {
      const apiUrl = `${apiBase}/chapters/${mangaId}?page=${page}&limit=${limit}&sort=desc`;
      console.log(`[Yurineko] Fetching: ${apiUrl}`);
      
      // Use fetch instead of fetchHtml for proper JSON handling
      const https = require('https');
      const http = require('http');
      const { URL } = require('url');
      
      const parsedUrl = new URL(apiUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent || USER_AGENT_JSOUP,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
          'Origin': origin,
          'Referer': `${origin}/`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      };
      
      const responseData = await new Promise((resolve, reject) => {
        const req = client.request(apiUrl, requestOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, data, statusCode: res.statusCode });
            } else {
              resolve({ ok: false, error: `HTTP ${res.statusCode}`, statusCode: res.statusCode });
            }
          });
        });
        req.on('error', (err) => reject(err));
        req.end();
      });
      
      if (!responseData.ok) {
        console.error(`[Yurineko] API page ${page} failed: ${responseData.error}`);
        break;
      }
      
      console.log(`[Yurineko] Response length: ${responseData.data.length} bytes`);
      
      let data;
      try {
        const parsed = JSON.parse(responseData.data);
        // API might return { data: [...] } or just [...]
        if (Array.isArray(parsed)) {
          data = parsed;
        } else if (parsed && Array.isArray(parsed.data)) {
          data = parsed.data;
        } else if (parsed && Array.isArray(parsed.chapters)) {
          data = parsed.chapters;
        } else {
          console.error('[Yurineko] Unexpected response structure:', Object.keys(parsed));
          console.error('[Yurineko] Response preview:', JSON.stringify(parsed).substring(0, 500));
          break;
        }
      } catch (e) {
        console.error('[Yurineko] JSON parse error:', e.message);
        console.error('[Yurineko] Response preview:', responseData.data.substring(0, 500));
        break;
      }
      
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`[Yurineko] No more chapters at page ${page}`);
        break;
      }
      
      for (const ch of data) {
        // Use full slug from API - it contains timestamp and is the actual chapter URL
        const slug = ch.slug || `chapter-${ch.chapterNumber}`;
        
        // Build chapter URL using manga slug (not ID)
        const chapterUrl = `${ORIGIN_BASE}/manga/${mangaSlug}/${slug}`;
        
        let title = ch.title || '';
        const chapterNumber = ch.chapterNumber || '';
        
        // Sanitize chapter title - remove problematic characters
        title = title
          .replace(/[""]/g, '"')   // Replace curly quotes
          .replace(/['']/g, "'")   // Replace curly apostrophes  
          .replace(/[?"]/g, '')    // Remove question marks and quotes
          .trim();
        
        let fullTitle = '';
        if (chapterNumber && title) {
          fullTitle = `Chương ${chapterNumber}: ${title}`;
        } else if (chapterNumber) {
          fullTitle = `Chương ${chapterNumber}`;
        } else if (title) {
          fullTitle = title;
        } else {
          fullTitle = slug;
        }
        
        chapters.push({
          url: chapterUrl,
          title: fullTitle,
        });
      }
      
      console.log(`[Yurineko] Fetched page ${page}: ${data.length} chapters`);
      
      // If we got less than limit, we've reached the end
      if (data.length < limit) break;
      
      page++;
      
      // Safety limit: max 20 pages (1000 chapters)
      if (page > 20) break;
    }
  } catch (err) {
    console.error('[Yurineko] API fetch error:', err);
  }
  
  console.log(`[Yurineko] Total chapters fetched: ${chapters.length}`);
  return chapters;
}


function parseYurinekoMangaPage(html, pageUrl) {
  const $ = cheerio.load(html);
  
  // Extract title and sanitize problematic characters
  let title = $('h1').first().text().trim() || $('title').first().text().trim() || '';
  
  // Replace various types of quotes with regular quotes, then remove them
  title = title
    .replace(/[""]/g, '"')  // Replace curly quotes with straight quotes
    .replace(/['']/g, "'")  // Replace curly apostrophes
    .replace(/"/g, '')      // Remove all quotes
    .trim();
  
  // Extract cover
  let coverUrl = '';
  const $coverImg = $('img[src*="/covers/"]').first();
  if ($coverImg.length) {
    const raw = String($coverImg.attr('src') || '').trim();
    if (raw) coverUrl = resolveUrl(pageUrl, raw);
  }
  
  // Extract manga ID from API calls in the page
  const mangaId = extractMangaIdFromHtml(html);
  
  // Prefer the human slug from canonical/og/chapter links when the URL uses a UUID.
  let mangaSlug = extractMangaSlugFromUrl(pageUrl);
  if (!mangaSlug || isYurinekoMangaUuid(mangaSlug)) {
    mangaSlug = extractMangaSlugFromHtml(html) || mangaSlug;
  }
  
  // Extract description - look in the description section
  let description = '';
  const $descParagraph = $('p').filter((_, el) => {
    const text = $(el).text().trim();
    return text.length > 50 && !text.includes('Cập nhật:');
  }).first();
  
  if ($descParagraph.length) {
    description = $descParagraph.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
  }
  
  return { title, coverUrl, mangaId, mangaSlug, description };
}

function buildYurinekoListingUrl(page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p <= 1) return `${ORIGIN_BASE}${LATEST_UPDATES_PATH}`;
  return `${ORIGIN_BASE}${LATEST_UPDATES_PATH}?page=${p}`;
}

function parseYurinekoListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  
  // Look for pagination elements
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

function parseYurinekoListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  
  // Look for manga cards/items
  const cards = $('.group').filter((_, el) => $(el).find('a:has(h3)').length > 0);
  
  if (cards.length > 0) {
    cards.each((_, el) => {
      const $el = $(el);
      
      const titleLink = $el.find('a:has(h3)').first();
      const href = String(titleLink.attr('href') || '').trim();
      if (!href) return;
      
      const mangaUrl = resolveUrl(pageUrl, href);
      const title = titleLink.find('h3').text().trim().replace(/\s+/g, ' ') || mangaUrl;
      
      let coverUrl = '';
      const imgLink = $el.find('a:has(img)').first();
      const $img = imgLink.find('img').first();
      if ($img.length) {
        const raw = getImageSrcFromEl($img);
        if (raw) coverUrl = resolveUrl(pageUrl, raw);
      }
      
      const $chLink = $el.find('a[href*="/chapter-"]').first();
      const latestChapterLabel = $chLink.text().trim().replace(/\s+/g, ' ') || '';
      
      items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
    });
    return items;
  }
  
  // Fallback to old selector in case site is reverted or different
  $('div[class*="manga"], div[class*="card"], article').each((_, el) => {
    const $el = $(el);
    const $titleLink = $el.find('a[href*="/manga/"]').first();
    const href = String($titleLink.attr('href') || '').trim();
    if (!href) return;
    
    const mangaUrl = resolveUrl(pageUrl, href);
    const title = $titleLink.text().trim().replace(/\s+/g, ' ') || mangaUrl;
    
    let coverUrl = '';
    const $img = $el.find('img').first();
    if ($img.length) {
      const raw = getImageSrcFromEl($img);
      if (raw) coverUrl = resolveUrl(pageUrl, raw);
    }
    
    const $chLink = $el.find('a[href*="/chapter-"]').first();
    const latestChapterLabel = $chLink.text().trim().replace(/\s+/g, ' ') || '';
    
    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });
  
  return items;
}

async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const ua = options.userAgent || USER_AGENT_JSOUP;

  if (search_query) {
    const origin = options.origin || ORIGIN_BASE;
    const searchUrl = `${origin}/api/v1/search/global?q=${encodeURIComponent(search_query)}`;
    
    const responseData = await fetchJsonApi(searchUrl, {
      userAgent: ua,
      origin,
    });
    
    if (!responseData.ok) {
      return { ok: false, error: responseData.error || 'Không tìm kiếm được trên Yurineko.' };
    }
    
    try {
      const data = JSON.parse(responseData.data);
      const items = (data.mangas || []).map(m => {
        const mangaUrl = `${origin}/manga/${m.slug}`;
        const coverUrl = m.image ? `https://cdn.yurinekoz.com/${m.image}` : '';
        return {
          title: m.title || '',
          mangaUrl,
          coverUrl,
          latestChapterLabel: '',
        };
      });
      return {
        ok: true,
        siteId: 'yurineko',
        page: 1,
        totalPages: 1,
        items,
      };
    } catch (e) {
      console.error('[Yurineko] JSON parse / items mapping error:', e);
      return { ok: false, error: 'Lỗi parse dữ liệu tìm kiếm.' };
    }
  }

  const listingUrl = buildYurinekoListingUrl(page);
  
  let fetched;
  try {
    fetched = await fetchHtml(listingUrl, {
      userAgent: ua,
      referer: `${ORIGIN_BASE}/`,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
  
  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Không tải được danh sách Yurineko.' };
  }
  
  const items = parseYurinekoListingHtml(fetched.html, listingUrl);
  const totalPages = Math.max(1, parseYurinekoListingMaxPage(fetched.html));
  
  return {
    ok: true,
    siteId: 'yurineko',
    page,
    totalPages,
    items,
  };
}

async function resolveYurinekoChapterUrl(chapterUrl, referer) {
  let parsed_url;
  try {
    parsed_url = new URL(chapterUrl);
  } catch {
    return chapterUrl;
  }
  const path_match = parsed_url.pathname.match(/^\/manga\/([^/]+)\/([^/]+)\/?$/);
  if (!path_match) return chapterUrl;
  const manga_segment = path_match[1];
  const chapter_segment = path_match[2];
  if (!isYurinekoMangaUuid(manga_segment)) return chapterUrl;

  const manga_page_url = `${parsed_url.origin}/manga/${manga_segment}`;
  const manga_page = await fetchHtml(manga_page_url, {
    userAgent: USER_AGENT_JSOUP,
    referer: referer || ORIGIN_BASE,
  });
  if (!manga_page.ok) {
    throw new Error(
      `Không đổi được UUID sang slug truyện: ${manga_page.error || 'HTTP error'}`,
    );
  }
  const manga_slug = extractMangaSlugFromHtml(manga_page.html);
  if (!manga_slug) {
    throw new Error(`Không tìm thấy slug truyện cho UUID ${manga_segment}`);
  }
  return `${parsed_url.origin}/manga/${manga_slug}/${chapter_segment}`;
}

async function fetchYurinekoChapterPage(chapterUrl, referer) {
  const referer_header = referer || ORIGIN_BASE;
  const html_response = await fetchHtml(chapterUrl, {
    userAgent: USER_AGENT_JSOUP,
    referer: referer_header,
  });
  if (html_response.ok) {
    return html_response.html;
  }

  let next_url_path = '/';
  try {
    next_url_path = new URL(chapterUrl).pathname;
  } catch {
    next_url_path = '/';
  }

  // Some chapter documents 500 while the Next.js RSC payload still contains imgKey + /api/img.
  const rsc_response = await fetchHtml(chapterUrl, {
    userAgent: USER_AGENT_JSOUP,
    referer: referer_header,
    accept: 'text/x-component',
    headers: {
      RSC: '1',
      'Next-Url': next_url_path,
    },
  });
  if (rsc_response.ok) {
    return rsc_response.html;
  }

  throw new Error(
    `Không tải được trang chương: ${html_response.error || rsc_response.error || 'HTTP error'}`,
  );
}

function parseYurinekoChapterImages(html, chapterUrl) {
  const imgKeyMatch = String(html || '').match(/\\?"imgKey\\?"\s*:\s*\\?"([a-f0-9]{32})\\?"/i);
  const imgKey = imgKeyMatch ? imgKeyMatch[1] : null;
  if (!imgKey) {
    throw new Error('Không tìm thấy khóa giải mã ảnh (imgKey)');
  }

  const regex = /\\?"images\\?"\s*:\s*(\[[^]*?\])/g;
  let match;
  let images = null;

  while ((match = regex.exec(html)) !== null) {
    const rawJson = match[1];
    const cleaned = rawJson
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, '&');
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].url && parsed[0].url.startsWith('/api/img')) {
        images = parsed;
        break;
      }
    } catch (e) {
      // Ignore parse errors from other JSON fragments in the page/RSC payload
    }
  }

  if (!images) {
    throw new Error('Không tìm thấy dữ liệu ảnh trong trang');
  }

  const imageList = [];
  for (const img of images) {
    if (img.url) {
      const fullUrl = resolveUrl(chapterUrl, img.url);
      const ext = getFileExt(fullUrl) || 'jpg';
      imageList.push({ imageUrl: fullUrl, ext, imgKey });
    }
  }

  if (imageList.length === 0) {
    throw new Error('Không tìm thấy URL ảnh nào');
  }

  console.log(`[Yurineko] Found ${imageList.length} images`);
  return imageList;
}

class YurinekoService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'yurineko',
      selectors: SELECTORS,
    });
  }

  getReferer(payload) {
    try {
      return new URL(payload.chapterUrl || payload.mangaUrl).origin + '/';
    } catch {
      return DOMAIN;
    }
  }
  
  async fetchChapterImages(chapterUrl, referer) {
    try {
      const resolved_chapter_url = await resolveYurinekoChapterUrl(chapterUrl, referer);
      const chapter_html = await fetchYurinekoChapterPage(resolved_chapter_url, referer);
      return parseYurinekoChapterImages(chapter_html, resolved_chapter_url);
    } catch (err) {
      console.error('[Yurineko] fetchChapterImages error:', err);
      throw err;
    }
  }
  
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}, shouldAbort) {
    const imgKey = imageInfo.imgKey;
    const finalHeaders = {
      ...headers,
      ...(imgKey ? { 'X-Ik': imgKey } : {}),
    };
    
    const fs = require('fs');
    const path = require('path');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false };
      }
      
      try {
        const res = await fetch(imageUrl, {
          headers: finalHeaders,
          redirect: 'follow',
        });
        
        if (!res.ok) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          return { ok: false, status: res.status };
        }
        
        const rawBuffer = Buffer.from(await res.arrayBuffer());
        if (!rawBuffer.length) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          return { ok: false };
        }
        
        // Decrypt image using the imgKey (XOR)
        let finalBuffer = rawBuffer;
        if (imgKey) {
          const keyBytes = [];
          for (let i = 0; i < imgKey.length; i += 2) {
            keyBytes.push(parseInt(imgKey.substring(i, i + 2), 16));
          }
          finalBuffer = Buffer.alloc(rawBuffer.length);
          for (let i = 0; i < rawBuffer.length; i++) {
            finalBuffer[i] = rawBuffer[i] ^ keyBytes[i % keyBytes.length];
          }
        }
        
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, finalBuffer);
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return { ok: true, fileSize: fs.statSync(filePath).size };
        }
      } catch (err) {
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    return { ok: false };
  }
  
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }
    
    let fetched;
    try {
      fetched = await fetchHtml(trimmed, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }
    
    const { title, coverUrl, mangaId, mangaSlug, description } = parseYurinekoMangaPage(
      fetched.html,
      trimmed,
    );
    
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }
    
    console.log('[Yurineko] Manga ID:', mangaId);
    console.log('[Yurineko] Manga Slug:', mangaSlug);
    
    // Fetch chapters from API if manga ID is available
    let chapters = [];
    if (mangaId && mangaSlug) {
      let origin;
      try {
        origin = new URL(trimmed).origin;
      } catch {
        origin = ORIGIN_BASE;
      }
      const apiBase = `${origin}/api/v1`;
      chapters = await fetchChaptersFromApi(mangaId, mangaSlug, {
        ...options,
        origin,
        apiBase,
      });
    } else {
      return {
        ok: false,
        error: 'Không tìm thấy manga ID hoặc slug. URL có thể không đúng định dạng.',
      };
    }
    
    // If API fetch failed or no chapters found
    if (chapters.length === 0) {
      return { 
        ok: false, 
        error: 'Không tải được danh sách chapter từ API. Vui lòng thử lại sau.' 
      };
    }
    
    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: trimmed,
        mangaId: mangaId || '',
        siteId: 'yurineko',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }
}

const service = new YurinekoService();

function load(url, options) {
  return service.load(url, options);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

function fetchChapterImages(chapterUrl, referer) {
  return service.fetchChapterImages(chapterUrl, referer);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchChapterImages,
  fetchLatestUpdates,
  parseYurinekoListingHtml,
  parseYurinekoListingMaxPage,
  parseYurinekoMangaPage,
  parseYurinekoChapterImages,
  buildYurinekoListingUrl,
};
