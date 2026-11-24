/**
 * PluginAutoGenerator - Heuristic + template-driven HTML analyzer and sandbox tester
 *
 * Uses active connector patterns (fetchHtml + Chromium TLS fallback, CMS fingerprinting,
 * Madara AJAX chapters, ts_reader.run JSON extraction, nav-shortcut filtering, smart order)
 * to auto-generate and live-test JS plugins.
 */

const cheerio = require('cheerio');
const logger = require('../shared/logger');
const {
  fetchHtml,
  resolveUrl,
  isValidImgSrc,
} = require('../download/connector/htmlConnectorUtils');
const { isNavShortcutChapter } = require('../shared/mangaUtils');
const PluginValidator = require('./PluginValidator');
const JsPluginConnector = require('./JsPluginConnector');
const {
  IMAGE_ATTR_PRIORITY,
  EXTRA_CHAPTER_CONTAINERS,
  EXTRA_IMAGE_CONTAINERS,
  detectCmsTemplate,
  extractTsReaderImages,
  detectChapterOrder,
  isLikelyCloudflareOrBlocked,
  detectLatestUpdatesFromHtml,
  pickAttrSrc,
  validatePublicHttpUrl,
} = require('./pluginTemplates');
const {
  extractEmbeddedStateJson,
  findChapterArrayInJson,
  findImageArrayInJson,
  detectHtmlChapterPagination,
  inferApiUrlTemplate,
  inferChapterApiUrlTemplate,
} = require('./spaJsonAnalyzer');
const { sniffPageWithBrowser } = require('./spaBrowserSniffer');

class PluginAutoGenerator {
  _emitProgress(options, payload) {
    if (typeof options?.onProgress !== 'function') return;
    try {
      options.onProgress({
        timestamp: Date.now(),
        ...payload,
      });
    } catch {
      /* never let progress listener throw break analysis */
    }
  }

  /**
   * Fetch HTML with automatic Chromium network fallback when blocked (403/503/Cloudflare).
   */
  async _fetchPageHtml(url, options = {}) {
    const urlCheck = validatePublicHttpUrl(url);
    if (!urlCheck.ok) {
      return { ok: false, error: urlCheck.error, usedChromiumFallback: false };
    }
    const fetcher = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;
    const baseOpts = {
      method: options.method || 'GET',
      ...(options.referer ? { referer: options.referer } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body != null ? { body: options.body } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
    };

    const firstRes = await fetcher(url, { ...baseOpts, preferChromiumNet: false });
    if (firstRes?.ok && !isLikelyCloudflareOrBlocked('', firstRes.html)) {
      return { ok: true, html: String(firstRes.html || ''), finalUrl: firstRes.finalUrl || url, usedChromiumFallback: false };
    }

    if (isLikelyCloudflareOrBlocked(firstRes?.error, firstRes?.html)) {
      const retryRes = await fetcher(url, { ...baseOpts, preferChromiumNet: true });
      if (retryRes?.ok && !isLikelyCloudflareOrBlocked('', retryRes.html)) {
        return {
          ok: true,
          html: String(retryRes.html || ''),
          finalUrl: retryRes.finalUrl || url,
          usedChromiumFallback: true,
        };
      }
      return {
        ok: false,
        error: retryRes?.error || firstRes?.error || 'Trang bị chặn hoặc yêu cầu xác thực.',
        usedChromiumFallback: true,
      };
    }

    return {
      ok: false,
      error: firstRes?.error || 'Không tải được trang.',
      usedChromiumFallback: false,
    };
  }

  /**
   * Analyze a manga page URL and detect its CMS template, selectors, and optional Latest Updates.
   * @param {string} url - Manga page URL
   * @param {object} [options]
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeMangaPage(url, options = {}) {
    const urlCheck = validatePublicHttpUrl(url);
    if (!urlCheck.ok) {
      return { ok: false, error: urlCheck.error };
    }
    const parsedUrl = urlCheck.parsed;

    const origin = parsedUrl.origin;
    const hostname = parsedUrl.hostname;

    this._emitProgress(options, {
      step: 'fetch_manga',
      status: 'running',
      progress: 8,
      detail: hostname,
    });

    const fetched = await this._fetchPageHtml(url, {
      referer: origin,
      cookie: options.cookie,
      fetchHtmlImpl: options.fetchHtmlImpl,
    });
    if (!fetched.ok) {
      this._emitProgress(options, {
        step: 'fetch_manga',
        status: 'error',
        progress: 15,
        detail: fetched.error,
      });
      return { ok: false, error: `Không tải được trang: ${fetched.error}` };
    }

    this._emitProgress(options, {
      step: 'fetch_manga',
      status: 'done',
      progress: 18,
      meta: { usedChromiumFallback: Boolean(fetched.usedChromiumFallback) },
    });

    const html = fetched.html;
    let $ = cheerio.load(html);
    let usedChromiumFallback = fetched.usedChromiumFallback;

    this._emitProgress(options, {
      step: 'cms_metadata',
      status: 'running',
      progress: 22,
    });

    const templateMatch = detectCmsTemplate($, html);
    const tpl = templateMatch.template;

    let titleInfo = this._detectTitle($, tpl);
    let coverInfo = this._detectCover($, url, tpl);
    let authorInfo = this._detectAuthor($, tpl);
    let descInfo = this._detectDescription($, tpl);

    this._emitProgress(options, {
      step: 'cms_metadata',
      status: 'done',
      progress: 30,
      detail: templateMatch.label,
      meta: {
        templateId: templateMatch.id,
        hasTitle: Boolean(titleInfo.title),
        hasCover: Boolean(coverInfo.coverUrl),
      },
    });

    this._emitProgress(options, {
      step: 'tier1_chapters',
      status: 'running',
      progress: 34,
    });

    let chapterDetection = this._detectChapters($, url, tpl);
    let madaraAjaxChapters = false;
    let chapterPagination = detectHtmlChapterPagination($, url);
    let chapterStrategy = chapterDetection.chapters.length > 0
      ? (chapterPagination.detected ? 'html-paginated' : 'html')
      : 'html';
    let embeddedChapterConfig = null;
    let chapterApi = null;
    let browserSnifferUsed = false;
    let spaRenderWarning = false;

    // Madara AJAX chapter fallback when initial DOM container has no chapters
    if (templateMatch.id === 'madara' && chapterDetection.chapters.length === 0) {
      const cleanPathUrl = `${origin}${parsedUrl.pathname.replace(/\/+$/, '')}/ajax/chapters/`;
      const ajaxRes = await this._fetchPageHtml(cleanPathUrl, {
        method: 'POST',
        referer: url,
        cookie: options.cookie,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        fetchHtmlImpl: options.fetchHtmlImpl,
      });
      if (ajaxRes.usedChromiumFallback) usedChromiumFallback = true;
      if (ajaxRes.ok && ajaxRes.html) {
        const $ajax = cheerio.load(ajaxRes.html);
        const ajaxChapters = this._detectChapters($ajax, url, tpl);
        if (ajaxChapters.chapters.length > 0) {
          chapterDetection = ajaxChapters;
          madaraAjaxChapters = true;
        }
      }
    }

    if (chapterDetection.chapters.length > 0) {
      this._emitProgress(options, {
        step: 'tier1_chapters',
        status: 'done',
        progress: 48,
        meta: {
          count: chapterDetection.chapters.length,
          paginated: Boolean(chapterPagination.detected),
          maxPages: chapterPagination.maxPagesDetected || 1,
          madaraAjaxChapters,
        },
      });
    } else {
      this._emitProgress(options, {
        step: 'tier1_chapters',
        status: 'warn',
        progress: 44,
        meta: { count: 0 },
      });
    }

    // Tier 2: Embedded SSR JSON (__NEXT_DATA__, __NUXT__, script[type="application/json"])
    if (chapterDetection.chapters.length === 0) {
      this._emitProgress(options, {
        step: 'tier2_ssr_json',
        status: 'running',
        progress: 48,
      });
      const stateCandidates = extractEmbeddedStateJson(html);
      for (const cand of stateCandidates) {
        const jsonMatch = findChapterArrayInJson(cand.data, url);
        if (jsonMatch && jsonMatch.chapters.length > 0) {
          chapterStrategy = 'embedded-json';
          chapterDetection = { selector: cand.selector, chapters: jsonMatch.chapters };
          embeddedChapterConfig = {
            sourceType: cand.sourceType,
            selector: cand.selector,
            arrayPath: jsonMatch.arrayPath,
            titleField: jsonMatch.titleField,
            numberField: jsonMatch.numberField,
            urlField: jsonMatch.urlField,
            slugField: jsonMatch.slugField,
            idField: jsonMatch.idField,
            chapterUrlTemplate: jsonMatch.chapterUrlTemplate,
          };
          break;
        }
      }
      if (chapterDetection.chapters.length > 0) {
        this._emitProgress(options, {
          step: 'tier2_ssr_json',
          status: 'done',
          progress: 56,
          detail: embeddedChapterConfig?.sourceType || 'SSR',
          meta: {
            sourceType: embeddedChapterConfig?.sourceType || 'SSR',
            count: chapterDetection.chapters.length,
          },
        });
      } else {
        this._emitProgress(options, {
          step: 'tier2_ssr_json',
          status: 'skipped',
          progress: 54,
          meta: { count: 0 },
        });
      }
    } else {
      this._emitProgress(options, {
        step: 'tier2_ssr_json',
        status: 'skipped',
        progress: 52,
        meta: { reason: 'tier1-matched' },
      });
    }

    // Tier 3: Hidden BrowserWindow + CDP Network Sniffer for pure SPA & dynamic pagination
    const sniffer = typeof options.browserSnifferImpl === 'function' ? options.browserSnifferImpl : sniffPageWithBrowser;
    const extraApiHosts = [];
    if (chapterDetection.chapters.length === 0 && options.enableBrowserSniffer !== false) {
      this._emitProgress(options, {
        step: 'tier3_spa_sniffer',
        status: 'running',
        progress: 58,
      });
      try {
        const sniffRes = await sniffer(url, { mode: 'manga', cookie: options.cookie });
        if (sniffRes?.ok) {
          browserSnifferUsed = true;
          if (sniffRes.renderedHtml) {
            const $rendered = cheerio.load(sniffRes.renderedHtml);
            if (!titleInfo.title) titleInfo = this._detectTitle($rendered, tpl);
            if (!coverInfo.coverUrl) coverInfo = this._detectCover($rendered, url, tpl);
            if (!authorInfo.author) authorInfo = this._detectAuthor($rendered, tpl);
            if (!descInfo.description) descInfo = this._detectDescription($rendered, tpl);
            $ = $rendered;
          }

          const matchedApis = [];
          for (const apiRes of sniffRes.apiResponses || []) {
            const jsonMatch = findChapterArrayInJson(apiRes.json, url, sniffRes.renderedLinks || []);
            if (jsonMatch && jsonMatch.chapters.length > 0) {
              matchedApis.push({ apiRes, jsonMatch });
            }
          }

          if (matchedApis.length > 0) {
            const first = matchedApis[0];
            const second = matchedApis.length > 1 ? matchedApis[1] : null;
            const apiTpl = inferApiUrlTemplate(
              first.apiRes.url,
              url,
              second ? second.apiRes.url : null,
            );
            const combined = [];
            const seenUrl = new Set();
            for (const entry of matchedApis) {
              for (const ch of entry.jsonMatch.chapters) {
                if (seenUrl.has(ch.url)) continue;
                seenUrl.add(ch.url);
                combined.push(ch);
              }
            }
            chapterStrategy = 'api-json';
            chapterDetection = { selector: null, chapters: combined };
            chapterApi = {
              ...apiTpl,
              paginated: Boolean(apiTpl.paginated || first.jsonMatch.totalPages > 1),
              arrayPath: first.jsonMatch.arrayPath,
              titleField: first.jsonMatch.titleField,
              numberField: first.jsonMatch.numberField,
              urlField: first.jsonMatch.urlField,
              slugField: first.jsonMatch.slugField,
              idField: first.jsonMatch.idField,
              chapterUrlTemplate: first.jsonMatch.chapterUrlTemplate,
              totalPagesPath: first.jsonMatch.totalPagesPath,
              totalPages: first.jsonMatch.totalPages,
              nextPagePath: first.jsonMatch.nextPagePath,
            };
            try {
              const apiHost = new URL(first.apiRes.url).hostname;
              if (apiHost) extraApiHosts.push(apiHost);
            } catch {
              /* ignore */
            }
          } else if (sniffRes.renderedHtml) {
            const renderedChapters = this._detectChapters($, url, tpl);
            if (renderedChapters.chapters.length > 0) {
              chapterDetection = renderedChapters;
              chapterPagination = detectHtmlChapterPagination($, url);
              chapterStrategy = chapterPagination.detected ? 'html-paginated' : 'html';
              spaRenderWarning = true;
            }
          }
        }
      } catch {
        /* browser sniffer fallback is best-effort */
      }
      this._emitProgress(options, {
        step: 'tier3_spa_sniffer',
        status: chapterDetection.chapters.length > 0 ? 'done' : 'warn',
        progress: 68,
        detail: chapterApi?.urlTemplate || null,
        meta: {
          strategy: chapterStrategy,
          count: chapterDetection.chapters.length,
          apiUrl: chapterApi?.urlTemplate || null,
        },
      });
    } else {
      this._emitProgress(options, {
        step: 'tier3_spa_sniffer',
        status: 'skipped',
        progress: 66,
        meta: { reason: chapterDetection.chapters.length > 0 ? 'already-found' : 'disabled' },
      });
    }

    const chapterOrder = detectChapterOrder(chapterDetection.chapters);
    const domains = [...new Set([...this._extractDomains($, hostname, coverInfo.coverUrl), ...extraApiHosts])].slice(0, 12);

    // Best-effort homepage Latest Updates detection (never fails analyzeMangaPage)
    let latestUpdates = { detected: false, sampleCount: 0, sampleItems: [] };
    if (!options.skipLatestProbe) {
      this._emitProgress(options, {
        step: 'latest_updates',
        status: 'running',
        progress: 70,
        detail: origin,
      });
      try {
        const homeUrl = `${origin}/`;
        const homeFetched = await this._fetchPageHtml(homeUrl, {
          referer: origin,
          cookie: options.cookie,
          fetchHtmlImpl: options.fetchHtmlImpl,
        });
        if (homeFetched.ok && homeFetched.html) {
          const $home = cheerio.load(homeFetched.html);
          latestUpdates = detectLatestUpdatesFromHtml($home, origin, tpl);
        }
      } catch {
        /* ignore latest updates probe failure */
      }
      this._emitProgress(options, {
        step: 'latest_updates',
        status: latestUpdates.detected ? 'done' : 'skipped',
        progress: 75,
        meta: { count: latestUpdates.sampleCount || 0 },
      });
    } else {
      this._emitProgress(options, {
        step: 'latest_updates',
        status: 'skipped',
        progress: 74,
        meta: { count: 0 },
      });
    }

    const siteName = this._deriveSiteName(hostname);
    const siteId = this._deriveSiteId(hostname);

    const result = {
      ok: true,
      usedChromiumFallback,
      browserSnifferUsed,
      template: {
        id: templateMatch.id,
        label: templateMatch.label,
        confidence: templateMatch.confidence,
      },
      siteInfo: {
        id: siteId,
        name: siteName,
        baseUrl: origin,
        hostname,
        domains,
      },
      detected: {
        title: titleInfo.title || null,
        titleSelector: titleInfo.selector || 'h1',
        coverUrl: coverInfo.coverUrl || null,
        coverSelector: coverInfo.selector || 'meta[property="og:image"]',
        author: authorInfo.author || null,
        authorSelector: authorInfo.selector || null,
        description: descInfo.description || null,
        descriptionSelector: descInfo.selector || null,
        chapterCount: chapterDetection.chapters.length,
        chapterSelector: chapterDetection.selector,
        chapterStrategy,
        chapterPagination: chapterPagination?.detected ? chapterPagination : null,
        embeddedChapterConfig,
        chapterApi,
        spaRenderWarning,
        chapterOrder,
        madaraAjaxChapters,
        chapterSample: chapterDetection.chapters.slice(0, 5),
        chapterFirstUrl: chapterDetection.chapters.length > 0 ? chapterDetection.chapters[0].url : null,
        latestUpdates,
      },
      needsChapterUrl: chapterDetection.chapters.length === 0,
    };

    logger.info(
      `[PluginAutoGenerator] Analyzed ${url}: template=${templateMatch.id}, title="${titleInfo.title}", chapters=${chapterDetection.chapters.length} (${chapterOrder}), latest=${latestUpdates.sampleCount}`,
    );
    return result;
  }

  /**
   * Analyze a chapter page to detect image selectors or ts_reader.run payload.
   * @param {string} chapterUrl
   * @param {string} baseUrl
   * @param {object} [options]
   * @returns {Promise<Object>}
   */
  async analyzeChapterPage(chapterUrl, baseUrl, options = {}) {
    const chCheck = validatePublicHttpUrl(chapterUrl);
    if (!chCheck.ok) {
      return { ok: false, error: chCheck.error };
    }

    this._emitProgress(options, {
      step: 'chapter_images',
      status: 'running',
      progress: 80,
      meta: { subStage: 'fetch' },
    });

    const fetched = await this._fetchPageHtml(chapterUrl, {
      referer: baseUrl || chapterUrl,
      cookie: options.cookie,
      fetchHtmlImpl: options.fetchHtmlImpl,
    });
    if (!fetched.ok) {
      this._emitProgress(options, {
        step: 'chapter_images',
        status: 'error',
        progress: 86,
        detail: fetched.error,
      });
      return { ok: false, error: `Không tải được trang chapter: ${fetched.error}` };
    }

    const html = fetched.html;
    const $ = cheerio.load(html);
    const templateMatch = detectCmsTemplate($, html);
    const tpl = templateMatch.template;

    let imageDetection = this._detectChapterImages($, chapterUrl, tpl);
    let usesTsReader = false;
    let imageStrategy = 'html';
    let embeddedImageConfig = null;
    let imageApi = null;
    let browserSnifferUsed = false;
    let spaRenderWarning = false;

    // MangaStream / Themesia dynamic ts_reader.run fallback
    if (imageDetection.images.length < 3) {
      this._emitProgress(options, {
        step: 'chapter_images',
        status: 'running',
        progress: 84,
        meta: { subStage: 'ts-reader' },
      });
      const tsImages = extractTsReaderImages(html);
      const validTsImages = tsImages
        .map((src) => resolveUrl(chapterUrl, src))
        .filter((u) => u && this._isLikelyChapterImage(u));
      if (validTsImages.length >= 2) {
        usesTsReader = true;
        imageStrategy = 'ts-reader';
        imageDetection = {
          selector: imageDetection.selector || '#readerarea img',
          containerSelector: imageDetection.containerSelector || '#readerarea',
          images: validTsImages,
        };
      }
    }

    // Tier 2: Embedded SSR JSON (__NEXT_DATA__, __NUXT__, etc.)
    if (imageDetection.images.length < 2) {
      this._emitProgress(options, {
        step: 'chapter_images',
        status: 'running',
        progress: 86,
        meta: { subStage: 'embedded-json' },
      });
      const stateCandidates = extractEmbeddedStateJson(html);
      for (const cand of stateCandidates) {
        const imgMatch = findImageArrayInJson(cand.data, chapterUrl);
        if (imgMatch && imgMatch.images.length >= 2) {
          imageStrategy = 'embedded-json';
          embeddedImageConfig = {
            sourceType: cand.sourceType,
            selector: cand.selector,
            arrayPath: imgMatch.arrayPath,
            imageField: imgMatch.imageField,
            prefixPath: imgMatch.prefixPath,
          };
          imageDetection = {
            selector: cand.selector,
            containerSelector: null,
            images: imgMatch.images,
          };
          break;
        }
      }
    }

    // Tier 3: Hidden BrowserWindow + CDP Network Sniffer for SPA chapter pages
    const sniffer = typeof options.browserSnifferImpl === 'function' ? options.browserSnifferImpl : sniffPageWithBrowser;
    const extraDomains = [];
    if (imageDetection.images.length < 2 && options.enableBrowserSniffer !== false) {
      this._emitProgress(options, {
        step: 'chapter_images',
        status: 'running',
        progress: 89,
        meta: { subStage: 'cdp-sniffer' },
      });
      try {
        const sniffRes = await sniffer(chapterUrl, { mode: 'chapter', cookie: options.cookie });
        if (sniffRes?.ok) {
          browserSnifferUsed = true;
          for (const apiRes of sniffRes.apiResponses || []) {
            const imgMatch = findImageArrayInJson(apiRes.json, chapterUrl);
            if (imgMatch && imgMatch.images.length >= 2) {
              const apiTpl = inferChapterApiUrlTemplate(apiRes.url, chapterUrl);
              imageStrategy = 'api-json';
              imageApi = {
                ...apiTpl,
                arrayPath: imgMatch.arrayPath,
                imageField: imgMatch.imageField,
                prefixPath: imgMatch.prefixPath,
              };
              imageDetection = {
                selector: null,
                containerSelector: null,
                images: imgMatch.images,
              };
              try {
                const h = new URL(apiRes.url).hostname;
                if (h) extraDomains.push(h);
              } catch {
                /* ignore */
              }
              break;
            }
          }

          if (imageDetection.images.length < 2 && sniffRes.renderedHtml) {
            const $rendered = cheerio.load(sniffRes.renderedHtml);
            const domRes = this._detectChapterImages($rendered, chapterUrl, tpl);
            if (domRes.images.length >= 2) {
              imageDetection = domRes;
              spaRenderWarning = true;
            }
          }
        }
      } catch {
        /* ignore browser sniffer failure */
      }
    }

    for (const imgUrl of imageDetection.images) {
      try {
        const h = new URL(imgUrl).hostname;
        if (h) extraDomains.push(h);
      } catch {
        /* ignore */
      }
    }

    this._emitProgress(options, {
      step: 'chapter_images',
      status: imageDetection.images.length > 0 ? 'done' : 'warn',
      progress: 94,
      detail: imageApi?.urlTemplate || null,
      meta: {
        count: imageDetection.images.length,
        strategy: imageStrategy,
        usedChromiumFallback: Boolean(fetched.usedChromiumFallback),
        browserSnifferUsed,
      },
    });

    logger.info(
      `[PluginAutoGenerator] Analyzed chapter ${chapterUrl}: strategy=${imageStrategy}, images=${imageDetection.images.length}, tsReader=${usesTsReader}`,
    );

    return {
      ok: true,
      usedChromiumFallback: fetched.usedChromiumFallback,
      browserSnifferUsed,
      usesTsReader,
      imageStrategy,
      embeddedImageConfig,
      imageApi,
      spaRenderWarning,
      imageCount: imageDetection.images.length,
      imageSelector: imageDetection.selector,
      imageSample: imageDetection.images.slice(0, 5),
      imageContainerSelector: imageDetection.containerSelector,
      extraDomains: [...new Set(extraDomains)],
    };
  }

  /**
   * Ephemerally validate and dry-run generated plugin source inside JsPluginConnector without writing to disk.
   * @param {{ source: string, mangaUrl?: string, chapterUrl?: string, testLatest?: boolean, fetchHtmlImpl?: Function }} params
   */
  async testGeneratedPlugin({
    source,
    mangaUrl,
    chapterUrl,
    testLatest = true,
    fetchHtmlImpl = null,
  } = {}) {
    const startMs = Date.now();
    const validator = new PluginValidator();
    const validation = validator.validate(source);
    if (!validation.isValid) {
      return {
        ok: false,
        error: validation.errorMessage,
        durationMs: Date.now() - startMs,
        manga: { ok: false, error: validation.errorMessage },
        chapter: { ok: false, error: 'Chưa chạy do mã nguồn không hợp lệ' },
        latest: { supported: false, ok: false },
      };
    }

    const connector = new JsPluginConnector({
      pluginId: validation.metadata.id,
      metadata: validation.metadata,
      source,
      fetchHtmlImpl,
    });

    const out = {
      ok: false,
      durationMs: 0,
      manga: { ok: false, title: '', author: '', chapterCount: 0, error: null },
      chapter: { ok: false, imageCount: 0, sampleImages: [], error: null },
      latest: { supported: typeof connector.plugin?.fetchLatestUpdates === 'function', ok: false, itemCount: 0, error: null },
    };

    try {
      let targetChapterUrl = chapterUrl ? String(chapterUrl).trim() : '';

      if (mangaUrl && String(mangaUrl).trim()) {
        const cleanMangaUrl = String(mangaUrl).trim();
        const urlCheck = validatePublicHttpUrl(cleanMangaUrl);
        if (!urlCheck.ok) {
          out.manga.error = urlCheck.error;
        } else {
          const mRes = await connector.load(cleanMangaUrl);
          if (mRes?.ok) {
            const chapterCount = Array.isArray(mRes.chapters) ? mRes.chapters.length : 0;
            out.manga = {
              ok: chapterCount > 0,
              title: mRes.manga?.title || '',
              author: mRes.manga?.author || '',
              chapterCount,
              error: chapterCount > 0 ? null : 'Không tìm thấy chương nào (0 chương)',
            };
            if (!targetChapterUrl && chapterCount > 0) {
              targetChapterUrl = mRes.chapters[0].url || '';
            }
          } else {
            out.manga.error = mRes?.error || 'fetchManga trả về lỗi';
          }
        }
      }

      if (targetChapterUrl) {
        const chUrlCheck = validatePublicHttpUrl(targetChapterUrl);
        if (!chUrlCheck.ok) {
          out.chapter.error = chUrlCheck.error;
        } else {
          try {
            const imgs = await connector.fetchChapterImages(targetChapterUrl);
            out.chapter = {
              ok: Array.isArray(imgs) && imgs.length > 0,
              imageCount: Array.isArray(imgs) ? imgs.length : 0,
              sampleImages: Array.isArray(imgs) ? imgs.slice(0, 3).map((i) => i.imageUrl) : [],
              error: Array.isArray(imgs) && imgs.length > 0 ? null : 'Không tìm thấy ảnh trong chapter',
            };
          } catch (err) {
            out.chapter.error = String(err?.message || err);
          }
        }
      }

      if (testLatest && out.latest.supported) {
        try {
          const lRes = await connector.fetchLatestUpdates({ page: 1 });
          const count = Array.isArray(lRes?.items) ? lRes.items.length : 0;
          out.latest = {
            supported: true,
            ok: Boolean(lRes?.ok && count > 0),
            itemCount: count,
            error: lRes?.ok ? (count > 0 ? null : 'Danh sách mới cập nhật trống') : lRes?.error || 'fetchLatestUpdates lỗi',
          };
        } catch (err) {
          out.latest.error = String(err?.message || err);
        }
      }

      const mangaPassed = !mangaUrl || out.manga.ok;
      const chapterPassed = !targetChapterUrl || out.chapter.ok;
      out.ok = Boolean(mangaPassed && chapterPassed && (Boolean(mangaUrl) || Boolean(targetChapterUrl)));
      out.durationMs = Date.now() - startMs;
      return out;
    } finally {
      await connector.dispose().catch(() => {});
    }
  }

  // ── Metadata & Selector Detection ──

  _detectTitle($, tpl) {
    const candidates = [...(tpl?.titleSelectors || []), 'h1', 'h2', '.title'];
    for (const sel of [...new Set(candidates)]) {
      const text = $(sel).first().text().trim().replace(/\s+/g, ' ');
      if (text) return { title: text, selector: sel };
    }
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle?.trim()) return { title: ogTitle.trim(), selector: 'h1' };

    const titleTag = $('title').text().trim();
    if (titleTag) return { title: titleTag, selector: 'title' };

    return { title: null, selector: 'h1' };
  }

  _detectCover($, baseUrl, tpl) {
    const candidates = [...(tpl?.coverSelectors || []), 'meta[property="og:image"]', '.info img', '.manga-info img', '.comic-info img', '.detail img', '.book-info img', '[class*="info"] img'];
    for (const sel of [...new Set(candidates)]) {
      if (sel.startsWith('meta[')) {
        const og = $(sel).attr('content');
        if (og) {
          const resolved = resolveUrl(baseUrl, og);
          if (resolved) return { coverUrl: resolved, selector: sel };
        }
        continue;
      }
      const $img = $(sel).first();
      if ($img.length) {
        const raw = pickAttrSrc($img);
        if (raw && !/^data:/i.test(raw)) {
          const resolved = resolveUrl(baseUrl, raw);
          if (resolved) return { coverUrl: resolved, selector: sel };
        }
      }
    }
    return { coverUrl: null, selector: 'meta[property="og:image"]' };
  }

  _detectAuthor($, tpl) {
    const candidates = [
      ...(tpl?.authorSelectors || []),
      '.author-content a',
      '.author p.col-xs-8',
      'li.author a',
      '.author a',
      '[itemprop="author"]',
    ];
    for (const sel of [...new Set(candidates)]) {
      const text = $(sel).first().text().trim().replace(/\s+/g, ' ');
      if (text && text.length < 120 && !/tác giả|author/i.test(text)) {
        return { author: text, selector: sel };
      }
    }
    return { author: null, selector: null };
  }

  _detectDescription($, tpl) {
    const candidates = [
      ...(tpl?.descriptionSelectors || []),
      '.detail-content p',
      '.summary__content',
      '.manga-excerpt',
      '.description-summary',
      'meta[property="og:description"]',
    ];
    for (const sel of [...new Set(candidates)]) {
      const text = sel.startsWith('meta[')
        ? ($(sel).attr('content') || '').trim()
        : $(sel).first().text().trim().replace(/\s+/g, ' ');
      if (text && text.length >= 12) {
        return { description: text.slice(0, 600), selector: sel };
      }
    }
    return { description: null, selector: null };
  }

  // ── Chapter list detection ──

  _extractLinksFromSelection($, $links, baseUrl) {
    const chapters = [];
    const seen = new Set();
    $links.each((_, el) => {
      const $el = $(el);
      const href = ($el.attr('href') || '').trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      const text = $el.text().trim().replace(/\s+/g, ' ');
      if (!text || text.length >= 200) return;
      if (isNavShortcutChapter($el) || isNavShortcutChapter(text)) return;

      const fullUrl = resolveUrl(baseUrl, href);
      if (!fullUrl || seen.has(fullUrl)) return;
      seen.add(fullUrl);
      chapters.push({ title: text, url: fullUrl });
    });
    return chapters;
  }

  _detectChapters($, baseUrl, tpl) {
    const containerSelectors = [
      ...(tpl?.chapterSelectors || []),
      ...EXTRA_CHAPTER_CONTAINERS,
    ];

    for (const sel of [...new Set(containerSelectors)]) {
      const $links = $(sel);
      if ($links.length < 2) continue;
      const chapters = this._extractLinksFromSelection($, $links, baseUrl);
      if (chapters.length >= 2) {
        return { selector: sel, chapters };
      }
    }

    // Fallback: links matching common chapter URL patterns
    const chapterPatterns = [
      /chapter/i, /chap/i, /chuong/i, /\/c\d/i, /\/ch\d/i, /\/ch-/i, /episode/i, /ep-/i,
    ];
    const allMatching = [];
    const seen = new Set();

    $('a[href]').each((_, el) => {
      const $el = $(el);
      const href = ($el.attr('href') || '').trim();
      if (!chapterPatterns.some((p) => p.test(href))) return;
      const text = $el.text().trim().replace(/\s+/g, ' ');
      if (!text || text.length >= 200) return;
      if (isNavShortcutChapter($el) || isNavShortcutChapter(text)) return;

      const fullUrl = resolveUrl(baseUrl, href);
      if (!fullUrl || seen.has(fullUrl)) return;
      seen.add(fullUrl);
      allMatching.push({ title: text, url: fullUrl });
    });

    if (allMatching.length >= 2) {
      const patternKeywords = ['chapter', 'chap', 'chuong', 'episode'];
      for (const keyword of patternKeywords) {
        if (allMatching[0].url.toLowerCase().includes(keyword)) {
          return { selector: `a[href*="${keyword}"]`, chapters: allMatching };
        }
      }
      return { selector: 'a[href*="chapter"]', chapters: allMatching };
    }

    return { selector: null, chapters: [] };
  }

  // ── Chapter images detection ──

  _detectChapterImages($, chapterUrl, tpl) {
    const orderedSelectors = [
      ...(tpl?.imageSelectors || []),
      ...EXTRA_IMAGE_CONTAINERS.map((c) => `${c} img`),
    ];

    for (const imgSel of [...new Set(orderedSelectors)]) {
      const $imgs = $(imgSel);
      if ($imgs.length < 2) continue;

      const images = [];
      const seen = new Set();
      $imgs.each((_, el) => {
        const src = this._getImgSrc($(el));
        if (!src || /^data:/i.test(src)) return;
        const fullUrl = resolveUrl(chapterUrl, src);
        if (!fullUrl || seen.has(fullUrl)) return;
        if (!this._isLikelyChapterImage(fullUrl)) return;
        seen.add(fullUrl);
        images.push(fullUrl);
      });

      if (images.length >= 3 || ($imgs.length >= 2 && images.length === $imgs.length)) {
        const containerSelector = imgSel.endsWith(' img') ? imgSel.slice(0, -4).trim() : null;
        return { selector: imgSel, containerSelector, images };
      }
    }

    // Fallback: all valid images on page excluding noise/avatars/templates
    const candidates = [];
    const seen = new Set();
    $('img').each((_, el) => {
      const src = this._getImgSrc($(el));
      if (!src || /^data:/i.test(src)) return;
      const fullUrl = resolveUrl(chapterUrl, src);
      if (!fullUrl || seen.has(fullUrl)) return;
      if (!this._isLikelyChapterImage(fullUrl)) return;
      seen.add(fullUrl);
      candidates.push(fullUrl);
    });

    if (candidates.length >= 2) {
      return { selector: 'img', containerSelector: null, images: candidates };
    }

    return { selector: null, containerSelector: null, images: [] };
  }

  // ── Helpers ──

  _getImgSrc($el) {
    for (const attr of IMAGE_ATTR_PRIORITY) {
      const val = ($el.attr(attr) || '').trim();
      if (val && !/^data:/i.test(val)) return val;
    }
    return '';
  }

  _isLikelyChapterImage(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    const excludePatterns = [
      '/icon', '/logo', '/avatar', 'avatar.', '/template/', 'loading.', 'noavatar',
      'favicon', 'banner', '/ads/', '/ad/', 'advertisement', 'blogspot.com', 'bp.blogspot',
    ];
    if (excludePatterns.some((p) => lower.includes(p))) return false;
    if (isValidImgSrc(lower)) return true;

    const hasCdnHint = ['cdn', 'img', 'image', 'static', 'media', 'upload'].some((k) => lower.includes(k));
    return hasCdnHint && /\.(jpe?g|png|webp|gif|avif)|googleusercontent|ggpht|\/uploads\/|\/images?\//i.test(lower);
  }

  _extractDomains($, hostname, coverUrl) {
    const domains = new Set([hostname]);
    if (coverUrl) {
      try {
        const h = new URL(coverUrl).hostname;
        if (h) domains.add(h);
      } catch {
        /* ignore */
      }
    }
    $('img').each((_, el) => {
      const src = this._getImgSrc($(el));
      if (!src) return;
      try {
        const resolved = resolveUrl(`https://${hostname}/`, src);
        const h = new URL(resolved).hostname;
        if (h && h !== hostname) domains.add(h);
      } catch {
        /* ignore */
      }
    });
    return [...domains].slice(0, 10);
  }

  _deriveSiteName(hostname) {
    const name = hostname.replace(/^www\./, '').split('.')[0] || hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  _deriveSiteId(hostname) {
    const name = hostname.replace(/^www\./, '').split('.')[0] || 'unknown';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

module.exports = new PluginAutoGenerator();
