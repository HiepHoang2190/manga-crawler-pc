const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('../../../shared/logger');
const cookieManager = require('../../cookies/cookieManager');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { getCatalogEntry, resolveTestUrl } = require('./catalog');

const DEFAULT_TIMEOUTS = {
  listing: 15000,
  homepage: 10000,
  chapters: 15000,
  download: 20000,
  custom: 15000,
};

function getConnector(siteId) {
  return require('../index').get(siteId);
}

function extractMangaLinksFromHtml(html, baseUrl) {
  if (!html || typeof html !== 'string') return [];
  try {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const foundUrls = new Set();
    const items = [];
    const keywords = ['/truyen-tranh/', '/truyen/', '/manga/', '/comic/', '/b/manga/', '/title/', '/series/', '/forums/'];
    const excludeKeywords = ['/the-loai', '/danh-muc', '/tim-kiem', '/filter', '/search', '/category', '/genre', '/user', '/author', '/tac-gia'];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const lower = href.toLowerCase();
      const isManga = keywords.some((kw) => lower.includes(kw));
      if (!isManga) return;
      const isExcluded = excludeKeywords.some((kw) => lower.includes(kw));
      if (isExcluded) return;

      try {
        const fullUrl = new URL(href, baseUrl).href;
        if (!foundUrls.has(fullUrl)) {
          foundUrls.add(fullUrl);
          items.push({ mangaUrl: fullUrl });
        }
      } catch {
        /* skip invalid url */
      }
    });
    return items.slice(0, 5);
  } catch {
    return [];
  }
}

function pickTestChapter(chapters, chapterPicker) {
  if (!Array.isArray(chapters) || chapters.length === 0) return null;
  if (chapterPicker === 'first') return chapters[0];
  const free_chapters = chapters.filter(
    (chapter_item) => !/\[(有料|VIP|Paid|Lock)\]/i.test(chapter_item.title || ''),
  );
  const chapter_pool = free_chapters.length > 0 ? free_chapters : chapters;
  return chapter_pool[chapter_pool.length - 1];
}

/**
 * Test a connector with custom or deep flow.
 * @param {string} siteId
 * @param {string} [activeDomain]
 * @param {(step: string, status: 'success'|'failed', durationMs: number) => void} [onProgress]
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<{ok: boolean, durationMs: number, error?: string, steps: object, aborted?: boolean}>}
 */
async function runConnectorTest(siteId, activeDomain, onProgress, abortSignal) {
  const c = getConnector(siteId);
  if (!c) {
    return { ok: false, error: `Connector "${siteId}" không tồn tại.`, steps: {} };
  }

  if (abortSignal?.aborted) {
    return { ok: false, aborted: true, durationMs: 0, steps: {} };
  }

  const cookie = c.requiresCookie ? cookieManager.getEffectiveCookie(c.id) : '';

  const totalStart = Date.now();
  const steps = {};
  const catalog_entry = getCatalogEntry(siteId) || {};
  const timeout_ms = { ...DEFAULT_TIMEOUTS, ...(catalog_entry.timeouts || {}) };

  const emitProgress = (step, status, duration) => {
    if (!abortSignal?.aborted && typeof onProgress === 'function') {
      onProgress(step, status, duration);
    }
  };

  function withTimeout(promise, ms, label) {
    if (abortSignal && abortSignal.aborted) {
      return Promise.reject(new Error('Aborted'));
    }

    let timer = null;
    let abortListener = null;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout ${ms / 1000}s (${label})`)), ms);
    });

    const promises = [promise, timeoutPromise];

    if (abortSignal) {
      const abortPromise = new Promise((_, reject) => {
        abortListener = () => reject(new Error('Aborted'));
        abortSignal.addEventListener('abort', abortListener, { once: true });
      });
      promises.push(abortPromise);
    }

    return Promise.race(promises).finally(() => {
      if (timer) clearTimeout(timer);
      if (abortSignal && abortListener) {
        abortSignal.removeEventListener('abort', abortListener);
      }
    });
  }

  function enhanceError(errMsg) {
    const isNetworkTimeout = /timeout|failed|network|connrefused/i.test(errMsg);
    const isAuthError = /403|401|cookie|permission/i.test(errMsg);
    if (isNetworkTimeout && c.requiresVpn) {
      return `${errMsg}. Gợi ý: Có thể cần bật VPN/1.1.1.1 để kết nối.`;
    }
    if (isNetworkTimeout && c.suggestsVpn) {
      return `${errMsg}. Gợi ý: Có thể cần bật VPN/1.1.1.1 (trang web có thể bị chặn bởi một số nhà mạng).`;
    }
    if (isAuthError && c.requiresCookie) {
      return `${errMsg}. Gợi ý: Cookie đã hết hạn hoặc chưa cấu hình.`;
    }
    return errMsg;
  }

  // ════════════════════════════════════════════════════════════════════
  // 0. Custom testConnection — if connector provides its own, use it
  //    and skip the 3-step deep test entirely.
  // ════════════════════════════════════════════════════════════════════
  if (typeof c.testConnection === 'function') {
    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }
    try {
      const res = await withTimeout(c.testConnection(activeDomain), timeout_ms.custom, 'testConnection');
      if (abortSignal?.aborted) {
        return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
      }
      const durationMs = Date.now() - totalStart;
      if (res && res.ok) {
        logger.info(`[TestConnector:${siteId}] Kiểm tra tuỳ chỉnh (testConnection) thành công (${durationMs}ms)`);
        emitProgress('custom', 'success', durationMs);
        return { ok: true, durationMs, steps: { custom: { ok: true, durationMs } }, testDetails: {} };
      }
      const err = enhanceError(res?.error || 'Không kiểm tra được kết nối.');
      logger.error(`[TestConnector:${siteId}] Bước [Custom/testConnection] thất bại: ${err}`, {
        siteId,
        domain: activeDomain || c.domain,
        error: res?.error || 'Không kiểm tra được kết nối.',
      });
      emitProgress('custom', 'failed', durationMs);
      return { ok: false, error: err, durationMs, steps: { custom: { ok: false, error: err, durationMs } }, testDetails: {} };
    } catch (err) {
      if (abortSignal?.aborted || err?.message === 'Aborted') {
        return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
      }
      const durationMs = Date.now() - totalStart;
      const errMsg = enhanceError(err.message || String(err));
      logger.error(`[TestConnector:${siteId}] Bước [Custom/testConnection] thất bại ngoại lệ: ${errMsg}`, {
        siteId,
        domain: activeDomain || c.domain,
        error: errMsg,
        stack: err?.stack || '',
      });
      emitProgress('custom', 'failed', durationMs);
      return { ok: false, error: errMsg, durationMs, steps: { custom: { ok: false, error: errMsg, durationMs } }, testDetails: {} };
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP ① — Listing test (fetchLatestUpdates or fetchHtml fallback)
  // ════════════════════════════════════════════════════════════════════
  let listingItems = [];
  {
    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }
    const stepStart = Date.now();
    let stepOk = false;
    let stepError = '';

    try {
      if (typeof c.fetchLatestUpdates === 'function') {
        const options = { page: 1, cookie };
        const res = await withTimeout(c.fetchLatestUpdates(options), timeout_ms.listing, 'listing');
        if (abortSignal?.aborted) {
          return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
        }
        if (res && res.ok === true) {
          stepOk = true;
          if (Array.isArray(res.items)) listingItems = res.items;
        } else {
          stepError = res?.error || 'Không tải được danh sách mới cập nhật.';
        }
      }
    } catch (err) {
      if (abortSignal?.aborted || err?.message === 'Aborted') {
        return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
      }
      stepError = err.message || String(err);
      if (err.stack) {
        logger.error(`[TestConnector:${siteId}] Lỗi ngoại lệ khi tải danh sách: ${err.message}`, {
          siteId,
          error: err.message,
          stack: err.stack,
        });
      }
    }

    if (!stepOk && !abortSignal?.aborted) {
      try {
        const domain = activeDomain || c.domain || (c.plugin?.metadata?.baseUrl);
        if (domain) {
          const res = await withTimeout(
            fetchHtml(domain, { cookie, referer: domain, timeout: timeout_ms.homepage }),
            timeout_ms.homepage,
            'homepage',
          );
          if (abortSignal?.aborted) {
            return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
          }
          if (res.ok) {
            stepOk = true;
            stepError = '';
            if (listingItems.length === 0 && res.html) {
              listingItems = extractMangaLinksFromHtml(res.html, domain);
            }
          } else {
            stepError = stepError ? `${stepError} (Fallback: ${res.error})` : res.error;
          }
        } else {
          stepError = stepError || 'Không xác định được tên miền.';
        }
      } catch (err) {
        if (abortSignal?.aborted || err?.message === 'Aborted') {
          return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
        }
        const msg = err.message || String(err);
        stepError = stepError ? `${stepError} (Fallback: ${msg})` : msg;
      }
    }

    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }

    steps.listing = {
      ok: stepOk,
      durationMs: Date.now() - stepStart,
      ...(stepError ? { error: stepError } : {}),
    };

    if (stepOk) {
      emitProgress('listing', 'success', steps.listing.durationMs);
      logger.info(`[TestConnector:${siteId}] ① Kết nối thành công (${listingItems.length} truyện trong danh sách)`);
    } else {
      emitProgress('listing', 'failed', steps.listing.durationMs);
      logger.error(`[TestConnector:${siteId}] Bước [① Kết nối/Listing] thất bại: ${stepError}`, {
        siteId,
        domain: activeDomain || c.domain,
        error: stepError,
      });
    }
  }

  if (abortSignal?.aborted) {
    return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
  }

  const defaultTestUrl = resolveTestUrl(siteId, activeDomain || c.domain) || c.testMangaUrl || '';
  const candidateUrl =
    defaultTestUrl ||
    (listingItems.length > 0 && listingItems[0].mangaUrl) ||
    activeDomain ||
    c.domain ||
    '';

  const isFallbackListing = typeof c.fetchLatestUpdates !== 'function';
  if (!steps.listing.ok && (!isFallbackListing || !defaultTestUrl)) {
    const durationMs = Date.now() - totalStart;
    return {
      ok: false,
      error: enhanceError(steps.listing.error),
      durationMs,
      steps,
      testDetails: {
        mangaTitle: '',
        mangaUrl: candidateUrl || '',
        coverUrl: '',
        chapterTitle: '',
        chapterUrl: '',
        chapterCount: 0,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP ② — Chapter fetch (load a manga → verify chapters exist)
  // ════════════════════════════════════════════════════════════════════
  let chapters = [];
  let mangaUrl = '';
  let mangaTitle = '';
  let coverUrl = '';
  {
    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }
    const stepStart = Date.now();
    let stepOk = false;
    let stepError = '';
    let chapterCount = 0;

    const candidateUrls = Array.from(new Set([
      defaultTestUrl,
      ...(listingItems.slice(0, 3).map((it) => it.mangaUrl).filter(Boolean)),
      candidateUrl,
      activeDomain,
      c.domain,
    ].filter(Boolean)));

    if (candidateUrls.length === 0) {
      stepError = 'Không có URL truyện để kiểm tra.';
    } else {
      let primaryError = '';
      let attemptIndex = 0;
      for (const url of candidateUrls.slice(0, 3)) {
        if (abortSignal?.aborted) break;
        try {
          const loadRes = await withTimeout(c.load(url, { cookie }), timeout_ms.chapters, 'chapters');
          if (abortSignal?.aborted) break;
          if (loadRes && loadRes.ok === true) {
            chapters = Array.isArray(loadRes.chapters) ? loadRes.chapters : [];
            chapterCount = chapters.length;
            mangaUrl = loadRes.manga?.mangaUrl || url;
            mangaTitle = loadRes.manga?.title || 'Test';
            coverUrl = loadRes.manga?.coverUrl || '';
            if (chapterCount > 0) {
              stepOk = true;
              stepError = '';
              break;
            } else {
              if (attemptIndex === 0) primaryError = 'Tải trang truyện thành công nhưng không có chương nào.';
            }
          } else {
            if (attemptIndex === 0) primaryError = loadRes?.error || 'Không tải được trang truyện.';
          }
        } catch (err) {
          if (abortSignal?.aborted || err?.message === 'Aborted') break;
          if (attemptIndex === 0) primaryError = err.message || String(err);
          if (err.stack) {
            logger.error(`[TestConnector:${siteId}] Lỗi ngoại lệ c.load(${url}): ${err.message}`, {
              siteId,
              mangaUrl: url,
              error: err.message,
              stack: err.stack,
            });
          }
        }
        attemptIndex++;
      }
      if (abortSignal?.aborted) {
        return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
      }
      if (!stepOk) {
        stepError = primaryError || 'Không tải được chương truyện nào.';
        mangaUrl = mangaUrl || candidateUrls[0] || '';
      }
    }

    steps.chapters = {
      ok: stepOk,
      durationMs: Date.now() - stepStart,
      chapterCount,
      mangaTitle: mangaTitle || '',
      mangaUrl: mangaUrl || candidateUrl || '',
      coverUrl: coverUrl || '',
      ...(stepError ? { error: stepError } : {}),
    };

    if (stepOk) {
      emitProgress('chapters', 'success', steps.chapters.durationMs);
      if (isFallbackListing && !steps.listing.ok) {
        steps.listing.ok = true;
        delete steps.listing.error;
        emitProgress('listing', 'success', steps.listing.durationMs);
        logger.info(`[TestConnector:${siteId}] ① (Fallback) Bỏ qua lỗi timeout/kết nối trang chủ vì phân tích truyện thành công`);
      }
      logger.info(`[TestConnector:${siteId}] ② Phân tích truyện "${mangaTitle}" thành công (${chapterCount} chương) — ${mangaUrl || candidateUrl}`);
    } else {
      emitProgress('chapters', 'failed', steps.chapters.durationMs);
      logger.error(`[TestConnector:${siteId}] Bước [② Chương/Chapters] thất bại: ${stepError}`, {
        siteId,
        mangaUrl: candidateUrl,
        error: stepError,
      });
    }
  }

  if (abortSignal?.aborted) {
    return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
  }

  if (!steps.chapters.ok) {
    const durationMs = Date.now() - totalStart;
    return {
      ok: false,
      error: enhanceError(steps.chapters.error),
      durationMs,
      steps,
      testDetails: {
        mangaTitle: mangaTitle || '',
        mangaUrl: mangaUrl || candidateUrl || '',
        coverUrl: coverUrl || '',
        chapterTitle: '',
        chapterUrl: '',
        chapterCount: chapters.length || 0,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP ③ — Image download (downloadChapter to temp dir, abort after 1 image)
  // ════════════════════════════════════════════════════════════════════
  let testChapter = null;
  {
    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }
    const stepStart = Date.now();
    let stepOk = false;
    let stepError = '';
    let fileSize = 0;

    const chapter_picker = catalog_entry.chapterPicker || 'free-last';
    testChapter = pickTestChapter(chapters, chapter_picker);
    const tmpDir = path.join(os.tmpdir(), `manga-test-${siteId}-${Date.now()}`);

    try {
      const skip_download = Array.isArray(catalog_entry.skipSteps)
        && catalog_entry.skipSteps.includes('download');
      if (skip_download) {
        stepOk = true;
        fileSize = 0;
      } else {
        let downloadedOneImage = false;

        const payload = {
          mangaTitle: mangaTitle || 'Test',
          mangaUrl: mangaUrl || '',
          chapterUrl: testChapter.url,
          chapterTitle: testChapter.title || 'Test Chapter',
          baseSaveDir: tmpDir,
          numberOfThreads: 1,
          coverUrl: '',
          onProgress: (p) => {
            if (p && p.current >= 1) {
              downloadedOneImage = true;
            }
          },
          shouldAbort: () => downloadedOneImage || Boolean(abortSignal?.aborted),
        };

        const dlRes = await withTimeout(
          c.downloadChapter(payload),
          timeout_ms.download,
          'download',
        );

        if (abortSignal?.aborted) {
          return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
        }

        if (dlRes && (dlRes.ok === true || dlRes.aborted === true)) {
          const mangaDirPath = path.join(tmpDir, mangaTitle || 'Test');
          if (fs.existsSync(mangaDirPath)) {
            const findFirstFile = (dir) => {
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                  const full = path.join(dir, e.name);
                  if (e.isFile() && !e.name.endsWith('.json')) {
                    try { fileSize = fs.statSync(full).size; } catch { /* */ }
                    return fileSize > 0;
                  }
                  if (e.isDirectory()) {
                    const found = findFirstFile(full);
                    if (found) return true;
                  }
                }
              } catch { /* */ }
              return false;
            };
            stepOk = findFirstFile(mangaDirPath);
            if (!stepOk) {
              stepError = 'Download chạy nhưng không có file ảnh nào được ghi.';
            }
          } else {
            stepOk = downloadedOneImage;
            if (!stepOk) {
              stepError = 'Download chạy nhưng không tải được ảnh nào.';
            }
          }
        } else {
          stepError = dlRes?.error || 'Download thất bại.';
        }
      }
    } catch (err) {
      if (abortSignal?.aborted || err?.message === 'Aborted') {
        return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
      }
      stepError = err.message || String(err);
      if (err.stack) {
        logger.error(`[TestConnector:${siteId}] Lỗi ngoại lệ khi tải ảnh chương "${testChapter?.title}": ${err.message}`, {
          siteId,
          chapterUrl: testChapter?.url,
          error: err.message,
          stack: err.stack,
        });
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }

    if (abortSignal?.aborted) {
      return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
    }

    steps.download = {
      ok: stepOk,
      durationMs: Date.now() - stepStart,
      mangaTitle: mangaTitle || '',
      mangaUrl: mangaUrl || candidateUrl || '',
      chapterTitle: testChapter?.title || '',
      chapterUrl: testChapter?.url || '',
      ...(fileSize > 0 ? { fileSize } : {}),
      ...(stepError ? { error: stepError } : {}),
    };

    if (stepOk) {
      emitProgress('download', 'success', steps.download.durationMs);
      if (Array.isArray(catalog_entry.skipSteps) && catalog_entry.skipSteps.includes('download')) {
        logger.info(`[TestConnector:${siteId}] ③ Bỏ qua bước tải ảnh chương "${testChapter?.title}" (DTV Ebook tải nguyên bộ qua Drive/Mediafire) — ${testChapter?.url}`);
      } else {
        logger.info(`[TestConnector:${siteId}] ③ Tải thử ảnh chương "${testChapter?.title}" thành công (${fileSize} bytes) — ${testChapter?.url}`);
      }
    } else {
      emitProgress('download', 'failed', steps.download.durationMs);
      logger.error(`[TestConnector:${siteId}] Bước [③ Tải ảnh/Download] thất bại: ${stepError}`, {
        siteId,
        mangaTitle,
        mangaUrl,
        chapterTitle: testChapter?.title,
        chapterUrl: testChapter?.url,
        error: stepError,
      });
    }
  }

  if (abortSignal?.aborted) {
    return { ok: false, aborted: true, durationMs: Date.now() - totalStart, steps };
  }

  const durationMs = Date.now() - totalStart;
  const allOk = steps.listing.ok && steps.chapters.ok && steps.download.ok;

  const testDetails = {
    mangaTitle: mangaTitle || '',
    mangaUrl: mangaUrl || candidateUrl || '',
    coverUrl: coverUrl || '',
    chapterTitle: testChapter?.title || '',
    chapterUrl: testChapter?.url || '',
    chapterCount: chapters.length || 0,
  };

  if (allOk) {
    return { ok: true, durationMs, steps, testDetails };
  }

  const firstError = steps.download.error || steps.chapters.error || steps.listing.error || 'Kiểm tra thất bại.';
  return { ok: false, error: enhanceError(firstError), durationMs, steps, testDetails };
}

module.exports = {
  runConnectorTest,
};
