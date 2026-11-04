/**
 * Webtoons connector — webtoons.com
 * Listing page: static HTML (cheerio)
 * Chapter viewer: JS-rendered, uses Electron BrowserWindow
 */
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const cheerio = require('cheerio');
const { loadOrCreate } = require('../../storage/downloadDb');
const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
const {
  formatFolderName,
  formatChapterTitle,
  formatChapterFolderName,
  formatChapterPageFileName,
  isFlatChapterLayout,
  MAX_LENGTH_FOLDER_NAME,
} = require('../../../shared/mangaUtils');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('Webtoons');

const SITE_DOMAIN = 'https://www.webtoons.com';
const IMG_REFERER = 'https://www.webtoons.com/';
const LABEL = 'Webtoons';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const noop = () => {};

function getFileExt(url) {
  try {
    const p = String(url).split('?')[0];
    const e = p.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return e;
  } catch {
    /* */
  }
  return 'jpg';
}

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

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CHROME_UA,
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

function extractTitleNo(urlString) {
  try {
    const u = new URL(String(urlString).trim());
    return u.searchParams.get('title_no') || null;
  } catch {
    return null;
  }
}

function buildPageUrl(baseUrl, page) {
  try {
    const u = new URL(String(baseUrl).trim());
    u.searchParams.set('page', String(page));
    return u.toString();
  } catch {
    return `${baseUrl}&page=${page}`;
  }
}

function parseMangaMeta(html) {
  const $ = cheerio.load(html);

  let title = ($('meta[property="og:title"]').attr('content') || '').trim();
  title = title.split(' - ')[0].split(' | ')[0].trim();
  if (!title) title = $('h1.subj_info').text().trim() || $('h1').first().text().trim();

  let coverUrl = ($('meta[property="og:image"]').attr('content') || '').trim();
  if (!coverUrl) coverUrl = ($('div.detail_header img').first().attr('src') || '').trim();
  if (coverUrl.startsWith('//')) coverUrl = `https:${coverUrl}`;

  return { title, coverUrl };
}

function parseListingPage(html) {
  const $ = cheerio.load(html);
  const chapters = [];

  $('ul#_listUl li, ul.episode_cont li').each((_, el) => {
    const a = $(el).find('a[href*="viewer"]').first();
    if (!a.length) return;

    const href = a.attr('href') || '';
    const chapterUrl = href.startsWith('http') ? href : `${SITE_DOMAIN}${href}`;

    let title = $(el).find('span.subj span').first().text().trim();
    if (!title) title = $(el).find('span.ellipsis').first().text().trim();
    if (!title) title = $(el).find('span.subj').first().text().trim();
    if (!title) {
      const m = chapterUrl.match(/episode_no=(\d+)/);
      title = m ? `Episode ${m[1]}` : 'Episode';
    }

    chapters.push({ url: chapterUrl, title: formatChapterTitle(title) });
  });

  let totalPages = 1;
  $('div.paginate a, div.paging_type2 a, .pg_next').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]page=(\d+)/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > totalPages) totalPages = p;
    }
    const text = $(el).text().replace(/\s/g, '');
    const n = parseInt(text, 10);
    if (!isNaN(n) && n > totalPages) totalPages = n;
  });

  return { chapters, totalPages };
}

async function load(url, options = {}) {
  const uiLog = typeof options?.sendLog === 'function' ? options.sendLog : noop;

  const trimmed = String(url || '').trim();
  if (!trimmed) return { ok: false, error: 'URL trống.' };

  const titleNo = extractTitleNo(trimmed);
  if (!titleNo) {
    return {
      ok: false,
      error:
        'Không tìm thấy title_no trong URL. URL phải có dạng: https://www.webtoons.com/.../list?title_no=XXXX',
    };
  }

  uiLog('Đang tải thông tin truyện...', 'info');

  const firstPageUrl = buildPageUrl(trimmed, 1);
  const firstResult = await fetchHtml(firstPageUrl);
  if (!firstResult.ok) {
    return { ok: false, error: `Không tải được trang danh sách: ${firstResult.error}` };
  }

  const { title, coverUrl } = parseMangaMeta(firstResult.html);
  const { chapters: firstPageChapters, totalPages } = parseListingPage(firstResult.html);

  uiLog(`Tìm thấy ${totalPages} trang danh sách.`, 'info');

  const allChapters = [...firstPageChapters];

  if (totalPages > 1) {
    const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const limit = pLimit(3);
    const pageResults = await Promise.all(
      pageNums.map((p) =>
        limit(async () => {
          const r = await fetchHtml(buildPageUrl(trimmed, p));
          if (!r.ok) {
            logger.warn(`Không tải được trang ${p}: ${r.error}`);
            return [];
          }
          return parseListingPage(r.html).chapters;
        }),
      ),
    );
    for (const pageChaps of pageResults) {
      allChapters.push(...pageChaps);
    }
  }

  const finalTitle = title || 'Webtoon';

  if (allChapters.length === 0) {
    uiLog('Không tìm thấy chapter nào.', 'warn');
  } else {
    uiLog(`Tìm thấy ${allChapters.length} chapters.`, 'success');
  }

  return {
    ok: true,
    manga: { title: finalTitle, coverUrl, mangaUrl: trimmed, siteId: 'webtoons', sourceLabel: LABEL },
    chapters: allChapters,
  };
}

// ─── Chapter images via BrowserWindow ─────────────────────────────────────────

/**
 * Webtoons lazy-loads via data-url: <img class="_images" data-url="https://..." src="bg_transparency.png">
 * We must read data-url (not src) for the real CDN URL.
 */
const VIEWER_DIAG_JS = `(function () {
  var first = document.querySelector('#_imageList img, img[data-url]');
  return {
    title: document.title,
    hasImageList: !!document.querySelector('#_imageList'),
    imageListCount: document.querySelectorAll('#_imageList img').length,
    dataUrlCount: document.querySelectorAll('img[data-url]').length,
    firstSrc: first ? (first.src || '') : '',
    firstDataUrl: first ? (first.getAttribute('data-url') || '') : '',
    firstClass: first ? (first.className || '') : '',
  };
})()`;

const SCROLL_TO_BOTTOM_JS = `(function () {
  window.scrollTo(0, document.body.scrollHeight);
  return document.body.scrollHeight;
})()`;

const VIEWER_IMAGES_JS = `(function () {
  function getUrl(img) {
    return img.getAttribute('data-url') ||
           img.getAttribute('data-src') ||
           img.getAttribute('data-original') ||
           img.src || '';
  }
  function isValid(src) {
    if (!src || !src.startsWith('http')) return false;
    if (src.includes('bg_transparency')) return false;
    if (src.includes('data:image')) return false;
    if (src.includes('phinf.pstatic.net') || src.includes('webtoon-')) return true;
    return /\\.(jpg|jpeg|png|gif|webp)(\\?|$)/i.test(src);
  }
  var imgs = Array.from(document.querySelectorAll('#_imageList img'));
  if (imgs.length > 0) {
    var urls = imgs.map(getUrl).filter(isValid);
    if (urls.length > 0) return urls;
  }
  imgs = Array.from(document.querySelectorAll('img[data-url]'));
  if (imgs.length > 0) {
    var u2 = imgs.map(function (i) { return i.getAttribute('data-url') || ''; }).filter(isValid);
    if (u2.length > 0) return u2;
  }
  return Array.from(document.querySelectorAll('img'))
    .map(function (i) { return i.src || ''; })
    .filter(function (s) { return s && s.includes('phinf.pstatic.net') && !s.includes('bg_transparency'); });
})()`;

async function fetchChapterImages(chapterUrl) {
  const { BrowserWindow } = require('electron');
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
        partition: 'persist:webtoons',
      },
    });

    win.webContents.setUserAgent(CHROME_UA);

    await win.loadURL(chapterUrl);
    await new Promise((r) => setTimeout(r, 5000));

    // Diagnostic: log DOM state before extraction
    try {
      const diag = await win.webContents.executeJavaScript(VIEWER_DIAG_JS);
      logger.debug('Viewer DOM state', JSON.stringify(diag));
    } catch (e) {
      logger.warn('Diag JS failed', e.message);
    }

    // Scroll to trigger any remaining lazy-load
    try {
      await win.webContents.executeJavaScript(SCROLL_TO_BOTTOM_JS);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      logger.warn('Scroll JS failed', e.message);
    }

    let imageUrls = [];
    try {
      imageUrls = await win.webContents.executeJavaScript(VIEWER_IMAGES_JS);
    } catch (e) {
      logger.warn('Image extract JS failed', e.message);
    }

    win.close();
    win = null;

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return {
        ok: false,
        error:
          'Không tìm thấy ảnh trong chapter. Có thể nội dung bị giới hạn hoặc yêu cầu đăng nhập.',
      };
    }

    return { ok: true, urls: imageUrls };
  } catch (e) {
    logger.error('fetchChapterImages failed', e.message);
    if (win && !win.isDestroyed()) win.close();
    return { ok: false, error: `Lỗi: ${e.message || String(e)}` };
  }
}

// ─── Download ──────────────────────────────────────────────────────────────────

async function downloadCoverIfNeeded(coverUrl, mangaDir, log) {
  if (!coverUrl) return;
  fs.mkdirSync(mangaDir, { recursive: true });
  let ext = '.jpg';
  try {
    const p = new URL(coverUrl).pathname.split('?')[0];
    const e = path.extname(p).toLowerCase();
    if (e) ext = e;
  } catch {
    /* */
  }
  const coverPath = path.join(mangaDir, `cover${ext}`);
  if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 0) return;
  try {
    const res = await fetch(coverUrl, {
      headers: { 'User-Agent': USER_AGENT, Referer: IMG_REFERER },
    });
    if (!res.ok) {
      log('Tải cover thất bại.', 'warn');
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length) fs.writeFileSync(coverPath, buf);
  } catch {
    log('Tải cover lỗi.', 'warn');
  }
}

async function downloadImageToFile(imageUrl, filePath) {
  const res = await fetch(imageUrl, {
    headers: {
      Referer: IMG_REFERER,
      'User-Agent': CHROME_UA,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false };
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return { ok: false };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  return { ok: true };
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
  await downloadCoverIfNeeded(coverUrl, mangaDir, log);
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
    log('Chapter đã hoàn thành, bỏ qua.', 'info');
    return { ok: true, skipped: true };
  }

  log('Đang tải danh sách ảnh...', 'info');
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

  if (
    db.hasChapter(dbChapterTitle) &&
    db.record.chapters[dbChapterTitle].status !== 'completed' &&
    db.record.chapters[dbChapterTitle].expectedFileCount !== pageInfos.length
  ) {
    db.initChapter(
      dbChapterTitle,
      chapterUrl,
      pageInfos.length,
      pageInfos.map((pi) => ({ index: pi.index, fileName: pi.fileName, sourceUrl: pi.imageUrl, status: 'pending' })),
    );
  }

  if (!db.hasChapter(dbChapterTitle) || !db.hasDownloadablePages(dbChapterTitle)) {
    db.initChapter(
      dbChapterTitle,
      chapterUrl,
      pageInfos.length,
      pageInfos.map((pi) => ({ index: pi.index, fileName: pi.fileName, sourceUrl: pi.imageUrl, status: 'pending' })),
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
    if (filtered.length < pageInfos.length) {
      log(`Resuming: ${filtered.length} trang còn lại.`, 'info');
      pageInfos.splice(0, pageInfos.length, ...filtered);
    }
  }

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
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          if (typeof shouldAbort === 'function' && shouldAbort()) break;
          const dl = await downloadImageToFile(pi.imageUrl, pi.filePath);
          if (dl.ok && fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
            success = true;
            const n = Atomics.add(progress, 0, 1) + 1;
            log(` [${n}/${totalPages}] ${path.basename(pi.filePath)}`, 'info');
            report({ mangaTitle, chapterTitle, chapterUrl, current: n, total: totalPages });
            db.markPageCompleted(dbChapterTitle, pi.index, fs.statSync(pi.filePath).size);
          }
          if (!success && attempt < 3) await new Promise((r) => setTimeout(r, 500));
        }
        downloadResults.push(success);
        if (!success) {
          db.markPageFailed(dbChapterTitle, pi.index);
          failedPageIndices.push(pi.index);
          log(` FAILED: ${path.basename(pi.filePath)}`, 'error');
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
    log(`Chapter hoàn thành: ${totalPages} trang.`, 'success');
  } else {
    db.markChapterIncomplete(dbChapterTitle);
    log('Chapter chưa hoàn thành.', 'warn');
    cleanup_empty_chapter_dir();
  }

  return {
    ok: allSuccess,
    successCount: downloadResults.filter(Boolean).length,
    totalPages,
    failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
  };
}

module.exports = { SITE_DOMAIN, LABEL, load, downloadChapter };
