/**
 * ManhuaGui Service - Migrated to HtmlConnectorService
 * Site: tw.manhuagui.com / www.manhuagui.com
 * 
 * Features:
 * - Packed script decoding (p,a,c,k,e,d) containing SMH.imgData({...}).preInit()
 * - LZString decompression for keys and __VIEWSTATE
 * - Multiple CDN hosts with fallback (eu/eu1/eu2/us/us1/us2/us3/i)
 * - Complex chapter list parsing with groups (單行本/單話/番外...)
 */
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml, USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const { loadOrCreate } = require('../../storage/downloadDb');
const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
const { formatChapterTitle, formatChapterPageFileName } = require('../../../shared/mangaUtils');
const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
const { downloadCoverIfNeeded, downloadImageToFile } = require('../../../download/connector/connectorDownloadUtils');
const BASE_URL = 'https://tw.manhuagui.com';
const LABEL = 'ManhuaGui';

// CDN hosts — domain thực là {host}.hamreus.com (xem getPath trong core script)
// Thứ tự: eu/eu1/eu2 (Châu Âu, weight cao nhất), us/us1/us2/us3 (Mỹ), i (fallback)
const CDN_HOSTS = ['eu', 'eu1', 'eu2', 'us', 'us1', 'us2', 'us3', 'i'];
const CDN_DOMAIN = 'hamreus.com';

// Basic selectors (not used due to complex parsing requirements)
const SELECTORS = {
  chapterLinks: 'div.chapter-list a[href]',
  title: 'h1',
  cover: 'div.book-cover img, p.hcover img',
};

// ---------------------------------------------------------------------------
// LZString decompressFromBase64 (inline — không cần package ngoài)
// ---------------------------------------------------------------------------
function lzDecompressFromBase64(input) {
  if (!input) return '';
  const keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  return _lzDecompress(input.length, 32, (idx) => keyStr.indexOf(input.charAt(idx)));
}

function _lzDecompress(length, resetValue, getNextValue) {
  const dictionary = [];
  let next;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = '';
  const result = [];
  let i, w, bits, resb, maxpower, power, c;
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (i = 0; i < 3; i++) dictionary[i] = i;

  bits = 0; maxpower = 4; power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (next = bits) {
    case 0:
      bits = 0; maxpower = 256; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 1:
      bits = 0; maxpower = 65536; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 2:
      return '';
  }

  dictionary[3] = c;
  w = c;
  result.push(c);

  while (true) {
    if (data.index > length) return '';

    bits = 0; maxpower = Math.pow(2, numBits); power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (c = bits) {
      case 0:
        bits = 0; maxpower = 256; power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        bits = 0; maxpower = 65536; power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
    }

    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else {
      if (c === dictSize) { entry = w + w.charAt(0); }
      else { return null; }
    }
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    w = entry;
  }
}

// ---------------------------------------------------------------------------
// Giải mã packed script (p,a,c,k,e,d) — dạng manhuagui
// ---------------------------------------------------------------------------
function unpackScript(packed, base, count, keysB64) {
  const a = parseInt(base, 10);
  const c = parseInt(count, 10);
  const keysStr = lzDecompressFromBase64(keysB64);
  if (!keysStr) return null;
  const k = keysStr.split('|');

  function e(n) {
    return (n < a ? '' : e(Math.floor(n / a))) +
      ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  }

  const d = {};
  let ci = c;
  while (ci--) d[e(ci)] = k[ci] || e(ci);

  let result = packed;
  ci = c;
  while (ci--) {
    if (k[ci]) result = result.replace(new RegExp('\\b' + e(ci) + '\\b', 'g'), k[ci]);
  }
  return result;
}

/**
 * Trích xuất imgData từ HTML trang chapter.
 * Trả về object { bid, bname, cid, cname, files, path, sl, len } hoặc null.
 */
function extractImgData(html) {
  // Tìm script packed: window["\x65\x76\x61\x6c"](function(p,a,c,k,e,d){...}('PACKED',BASE,COUNT,'KEYS64'['\x73\x70\x6c\x69\x63']('\x7c'),0,{}))
  // Lưu ý: trong HTML source, \x65 là 4 ký tự literal (backslash + x + 6 + 5), không phải char code
  const scriptMatch = html.match(
    /window\[["'][^"']*["']\]\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\['\\x73\\x70\\x6c\\x69\\x63'\]\('\\x7c'\),0,\{\}\)\)/
  );
  if (!scriptMatch) return null;

  const [, packed, base, count, keysB64] = scriptMatch;
  const decoded = unpackScript(packed, base, count, keysB64);
  if (!decoded) return null;

  // Trích JSON từ SMH.imgData({...})
  const jsonMatch = decoded.match(/SMH\.imgData\((\{[\s\S]*?\})\)\.preInit\(\)/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }
}

/**
 * Xây dựng URL ảnh từ imgData.
 * Format: https://{host}.hamreus.com{path}{filename}?e={sl.e}&m={sl.m}
 */
function buildImageUrl(imgData, filename, hostIndex = 0) {
  const host = CDN_HOSTS[hostIndex % CDN_HOSTS.length];
  const sl = imgData.sl || {};
  const params = sl.e && sl.m ? `?e=${sl.e}&m=${encodeURIComponent(sl.m)}` : '';
  // Path có thể chứa ký tự Unicode (vd: /ps2/d/dc_comics/robin1993/第183卷/)
  // encodeURIComponent mỗi segment để tránh lỗi
  const encodedPath = imgData.path
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(decodeURIComponent(seg)) : seg))
    .join('/');
  const encodedFile = encodeURIComponent(decodeURIComponent(filename));
  return `https://${host}.${CDN_DOMAIN}${encodedPath}${encodedFile}${params}`;
}

/**
 * ManhuaGui connector service extending HtmlConnectorService.
 * Implements complex chapter parsing and packed script decoding.
 */
class ManhuaguiService extends HtmlConnectorService {
  constructor() {
    super({
      domain: BASE_URL,
      label: LABEL,
      siteId: 'manhuagui',
      selectors: SELECTORS,
      imageReferer: `${BASE_URL}/`,
      requiresCookie: true,
    });
  }

  /**
   * Override load() for complex chapter list parsing.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched = await fetchHtml(trimmed, {
      siteId: 'manhuagui',
      requiresCookie: true,
      referer: BASE_URL + '/',
      userAgent: options.userAgent || USER_AGENT,
    });

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }
    
    const html = fetched.html;

    const $ = cheerio.load(html);

    // Tiêu đề
    let title = $('h1').first().text().trim();
    if (!title) title = $('title').first().text().trim().split('_')[0].trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Cover
    let coverUrl = '';
    const $cover = $('div.book-cover img, p.hcover img, div.thumb img').first();
    if ($cover.length) {
      const raw = ($cover.attr('src') || '').trim();
      if (raw) coverUrl = raw.startsWith('//') ? 'https:' + raw : raw;
    }

    // Lấy comic ID từ URL để lọc đúng chapter
    let comicId = '';
    try {
      const u = new URL(trimmed);
      const m = u.pathname.match(/\/comic\/(\d+)/);
      if (m) comicId = m[1];
    } catch { /* */ }

    // Chapters — parse theo từng nhóm (單行本/單話/番外...)
    // Trang dùng LZString để nén chapter list vào __VIEWSTATE hidden input.
    // Cần decode trước khi parse để lấy đủ tất cả chapter (kể cả nhóm bị ẩn).
    const chapters = [];
    const seen = new Set();

    // Decode __VIEWSTATE nếu có
    const viewStateMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
    const parseHtml = viewStateMatch ? lzDecompressFromBase64(viewStateMatch[1]) || html : html;

    // Parse chapter list từ HTML đã decode (VIEWSTATE hoặc HTML gốc)
    // Dùng cheerio để parse đúng nested HTML, tránh vấn đề regex với </div>
    const $p = cheerio.load(parseHtml);
    const groups = [];

    // Tìm tất cả h4 labels (单话, 单行本, 番外...)
    $p('h4').each((_, h4El) => {
      const label = $p(h4El).find('span').first().text().trim();
      // Tìm div.chapter-list ngay sau h4 này
      const $listDiv = $p(h4El).nextAll('div.chapter-list').first();
      if (!$listDiv.length) return;
      const links = [];
      $listDiv.find('a[href]').each((_, aEl) => {
        const href = ($p(aEl).attr('href') || '').trim();
        const title = ($p(aEl).attr('title') || $p(aEl).text()).trim();
        if (!href || href.startsWith('javascript') || !href.includes('/comic/')) return;
        links.push({ href, title });
      });
      if (links.length > 0) groups.push({ label, links });
    });

    // Fallback: không có h4 → lấy tất cả div.chapter-list
    if (groups.length === 0) {
      $p('div.chapter-list').each((_, divEl) => {
        const links = [];
        $p(divEl).find('a[href]').each((_, aEl) => {
          const href = ($p(aEl).attr('href') || '').trim();
          const title = ($p(aEl).attr('title') || $p(aEl).text()).trim();
          if (!href || href.startsWith('javascript') || !href.includes('/comic/')) return;
          links.push({ href, title });
        });
        if (links.length > 0) groups.push({ label: '', links });
      });
    }

    // Nếu có nhiều nhóm → prefix title bằng tên nhóm để phân biệt
    const multiGroup = groups.length > 1;
    for (const group of groups) {
      for (const { href, title: chTitle } of group.links) {
        const fullUrl = BASE_URL + href;
        if (seen.has(fullUrl)) continue;
        seen.add(fullUrl);
        const displayTitle = multiGroup && group.label ? `[${group.label}] ${chTitle}` : chTitle;
        chapters.push({ url: fullUrl, title: displayTitle });
      }
    }

    // Fallback: cheerio selector trên parseHtml nếu chưa có gì
    if (chapters.length === 0) {
      $p('div.chapter-list a[href]').each((_, el) => {
        const $a = $p(el);
        let href = ($a.attr('href') || '').trim();
        const chTitle = ($a.attr('title') || $a.text()).trim();
        if (!href || href.startsWith('javascript')) return;
        if (comicId && !href.includes(`/comic/${comicId}/`)) return;
        if (!href.startsWith('http')) href = BASE_URL + href;
        if (seen.has(href)) return;
        seen.add(href);
        chapters.push({ url: href, title: chTitle || href });
      });
    }

    // Fallback cuối: regex đơn giản trên parseHtml
    if (chapters.length === 0 && comicId) {
      const re = new RegExp(`href="(/comic/${comicId}/\\d+\\.html)"[^>]*title="([^"]+)"`, 'g');
      let m;
      while ((m = re.exec(parseHtml)) !== null) {
        const fullUrl = BASE_URL + m[1];
        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          chapters.push({ url: fullUrl, title: m[2] });
        }
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: comicId,
        siteId: 'manhuagui',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override fetchChapterImages() for packed script decoding and CDN URL building.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { 
      siteId: 'manhuagui',
      requiresCookie: true,
      referer: referer || `${BASE_URL}/`, 
      userAgent: USER_AGENT 
    });
    
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chapter: ${fetched.error}`);
    }

    const imgData = extractImgData(fetched.html);
    if (!imgData || !Array.isArray(imgData.files) || imgData.files.length === 0) {
      throw new Error('Không tìm thấy danh sách ảnh trong chapter (có thể bị block bản quyền).');
    }

    // Store imgData for use in custom download logic
    this._currentImgData = imgData;

    // Convert to {imageUrl, ext} format
    return imgData.files.map((filename, i) => {
      // filename có thể là "001.jpg.webp" hoặc "%E6%B3%A8%E9%87%8A.jpg.webp"
      const decoded = decodeURIComponent(filename);
      const ext = path.extname(decoded.replace(/\.webp$/, '')).toLowerCase() || '.jpg';
      const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      
      return {
        imageUrl: buildImageUrl(imgData, filename, 0), // Start with first CDN host
        ext: safe.slice(1), // Remove the dot
        filename: filename // Store original filename for CDN fallback
      };
    });
  }

  /**
   * Override downloadChapter to implement CDN host fallback logic.
   * Reuses most of the base class logic but customizes the download loop.
   */
  async downloadChapter(payload, connectorLabel) {
    const {
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
    } = payload;

    const log = (msg, level = 'info') => { if (typeof onLog === 'function') onLog(msg, level); };
    const report = (payload) => { if (typeof onProgress === 'function') onProgress(payload); };

    // Step 1: Setup paths and logging
    const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
    const dbChapterTitle = formatChapterTitle(chapterTitle);
    const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
    const referer = this.getReferer(payload);

    // Step 2: Create directories
    fs.mkdirSync(chapterDir, { recursive: true });

    const cleanup_empty_chapter_dir = () => {
      if (removeEmptyChapterDir(chapterDir)) {
        log('Removed empty chapter folder after failed download.', 'info');
      }
    };

    // Step 3: Download cover
    if (coverUrl) {
      await downloadCoverIfNeeded(coverUrl, mangaDir, referer, this.getUserAgent(), log);
    }

    // Step 4: Check abort
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 5: Load/init download database
    const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connectorLabel || this.config.label);
    if (!db.record.mangaTitle) {
      db.record.mangaTitle = mangaTitle;
      db.record.mangaUrl = mangaUrl;
      db.record.connector = connectorLabel || this.config.label;
      db.save();
    }

    // Step 6: Check if chapter already complete
    if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
      log('Chapter đã tải xong, bỏ qua.', 'info');
      return { ok: true, skipped: true };
    }

    // Step 7: Fetch chapter images
    log(`Đang tải danh sách ảnh: ${chapterUrl}`, 'info');
    let rawImageList;
    try {
      rawImageList = await this.fetchChapterImages(chapterUrl, referer);
    } catch (error) {
      cleanup_empty_chapter_dir();
      return { ok: false, error: error.message };
    }

    if (!rawImageList || rawImageList.length === 0) {
      log('Không tìm thấy ảnh trong trang chương.', 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'No images found' };
    }

    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    log(`Tìm thấy ${rawImageList.length} ảnh.`, 'info');

    // Step 8: Build page info array
    const pageInfos = rawImageList.map((item, i) => {
      const idx = i + 1;
      const fileName = formatChapterPageFileName(chapterTitle, idx, item.ext, chapterFolderFormat);
      const filePath = path.join(chapterDir, fileName);
      return {
        index: idx,
        imageUrl: item.imageUrl,
        filePath,
        fileName,
        originalFilename: item.filename // For CDN fallback
      };
    });

    const fullChapterPageCount = rawImageList.length;
    if (typeof payload.onChapterTotal === 'function') {
      payload.onChapterTotal(fullChapterPageCount);
    }

    // Step 9: Init chapter in DB if needed
    if (!db.hasChapter(dbChapterTitle) || !db.hasDownloadablePages(dbChapterTitle)) {
      const allPages = pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: pi.imageUrl,
        status: 'pending',
      }));
      db.initChapter(dbChapterTitle, chapterUrl, allPages.length, allPages, {
        force: !db.hasDownloadablePages(dbChapterTitle),
      });
    }

    // Step 10: Resume logic - filter missing pages
    if (db.hasChapter(dbChapterTitle)) {
      const missingPages = db.getMissingPages(dbChapterTitle, chapterDir);
      if (missingPages.length === 0 && db.hasDownloadablePages(dbChapterTitle)) {
        db.markChapterCompleted(dbChapterTitle);
        if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
          log('Chapter đã tải xong (đã xác minh), bỏ qua.', 'info');
          return { ok: true, skipped: true };
        }
        db.markChapterIncomplete(dbChapterTitle);
      }
      const missing_after = db.getMissingPages(dbChapterTitle, chapterDir);
      const missingIndices = new Set(missing_after.map((p) => p.index));
      const filtered = pageInfos.filter((pi) => missingIndices.has(pi.index));
      if (filtered.length === 0) {
        db.markChapterIncomplete(dbChapterTitle);
        cleanup_empty_chapter_dir();
        return { ok: false, error: 'Không có trang hợp lệ để tải.', successCount: 0, totalPages: 0 };
      }
      log(`Tiếp tục: ${filtered.length} ảnh còn thiếu.`, 'info');
      pageInfos.splice(0, pageInfos.length, ...filtered);
    }

    // Step 11: Parallel download with CDN fallback
    const threads = Math.max(1, Math.min(Number(numberOfThreads) || 3, 5));
    const limit = pLimit(threads);
    const totalPages = pageInfos.length;
    const downloadResults = [];
    const failedPageIndices = [];
    const progress = new Int32Array(new SharedArrayBuffer(4));

    report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: totalPages });

    await Promise.all(
      pageInfos.map((pi) =>
        limit(async () => {
          if (typeof shouldAbort === 'function' && shouldAbort()) {
            downloadResults.push(false);
            return;
          }

          let success = false;
          // Try different CDN hosts (ManhuaGui specific logic)
          for (let attempt = 1; attempt <= 3 && !success; attempt++) {
            if (typeof shouldAbort === 'function' && shouldAbort()) break;

            const hostIdx = attempt - 1;
            const imageUrl = buildImageUrl(this._currentImgData, pi.originalFilename, hostIdx);
            const headers = this.getImageHeaders(referer);
            
            const dl = await downloadImageToFile(imageUrl, pi.filePath, headers);

            if (dl && dl.ok && fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
              success = true;
              const n = Atomics.add(progress, 0, 1) + 1;
              log(` [${n}/${totalPages}] ${path.basename(pi.filePath)} done`, 'info');
              report({
                mangaTitle,
                chapterTitle,
                chapterUrl,
                current: n,
                total: totalPages,
              });
              db.markPageCompleted(dbChapterTitle, pi.index, fs.statSync(pi.filePath).size);
              if (typeof payload.onPageDownloaded === 'function') {
                payload.onPageDownloaded(path.basename(pi.filePath), pi.index, fullChapterPageCount);
              }
            }

            if (!success && attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          downloadResults.push(success);
          if (!success) {
            db.markPageFailed(dbChapterTitle, pi.index);
            failedPageIndices.push(pi.index);
          }

          await new Promise((r) => setTimeout(r, 100));
        })
      )
    );

    // Step 12: Check abort after download
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      db.markChapterIncomplete(dbChapterTitle);
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 13: Mark chapter status
    const allSuccess = downloadResults.length > 0 && downloadResults.every(Boolean);
    if (allSuccess) {
      db.markChapterCompleted(dbChapterTitle);
      log(`Chapter xong: ${totalPages} ảnh.`, 'success');
    } else {
      db.markChapterIncomplete(dbChapterTitle);
      log('Chapter chưa hoàn chỉnh.', 'warn');
      cleanup_empty_chapter_dir();
    }

    return {
      ok: allSuccess,
      successCount: downloadResults.filter(Boolean).length,
      totalPages,
      failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
    };
  }

  /**
   * Override getReferer() to use ManhuaGui specific referer.
   */
  getReferer() {
    return `${BASE_URL}/`;
  }

  /**
   * Override getImageHeaders() to use ManhuaGui specific headers.
   */
  getImageHeaders(referer) {
    return {
      Referer: referer || `${BASE_URL}/`,
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    };
  }
}

// Create singleton instance
const service = new ManhuaguiService();

/**
 * Load manga information from URL.
 * @param {string} url - Manga URL
 * @param {object} [options] - Load options
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 * @param {object} payload - Download configuration
 * @param {string} [connector] - Connector label override
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array, skipped?: boolean, aborted?: boolean, error?: string}>}
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  BASE_URL,
  DOMAIN: BASE_URL, // Export as DOMAIN for consistency
  LABEL,
  load,
  downloadChapter,
  // Export utility functions for testing
  extractImgData,
  buildImageUrl,
  lzDecompressFromBase64,
};