/**
 * Pure SPA JSON, SSR state, HTML chapter pagination, and API template analyzer.
 * Zero Electron runtime dependencies — safe for fast unit tests and shared usage.
 */

const cheerio = require('cheerio');
const { isValidImgSrc } = require('../download/connector/htmlConnectorUtils');

const NEGATIVE_ARRAY_PATH_RE = /\b(genre|genres|tag|tags|category|categories|comment|comments|recommend|recommended|related|banner|banners|slider|carousel|nav|menu|footer|hot|popular|ranking|user|users|author|authors)\b/i;
const POSITIVE_CHAPTER_PATH_RE = /\b(chapter|chapters|chap|chaps|episode|episodes|ep|list|items|records|rows|results|data)\b/i;
const IMAGE_URL_HINT_RE = /\.(jpe?g|png|webp|avif|gif)(\?|$|#)|googleusercontent\.com\/|ggpht\.com\/|\/(uploads?|images?|imgs?|pages?|chapters?)\//i;
const EXCLUDED_IMG_RE = /(\/icon|\/logo|\/avatar|avatar\.|loading\.|noavatar|\/template\/|favicon|\/ads\/|\/ad\/|advertisement|blogspot\.com|bp\.blogspot)/i;

function getByPath(obj, dotPath) {
  if (!obj || typeof obj !== 'object' || !dotPath) return undefined;
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (p === '__proto__' || p === 'constructor' || p === 'prototype') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Extract embedded SSR JSON payloads (__NEXT_DATA__, application/json, strict JSON __NUXT__) without eval.
 * @param {string} html
 * @returns {Array<{ sourceType: string, selector: string, data: any }>}
 */
function extractEmbeddedStateJson(html) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const results = [];
  const seenRaw = new Set();

  const tryPush = (sourceType, selector, rawText) => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed || trimmed.length < 15 || seenRaw.has(trimmed)) return;
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        seenRaw.add(trimmed);
        results.push({ sourceType, selector, data: parsed });
      }
    } catch {
      /* ignore non-JSON script text */
    }
  };

  // 1. Next.js __NEXT_DATA__
  const nextEl = $('script#__NEXT_DATA__').first();
  if (nextEl.length) {
    tryPush('__NEXT_DATA__', 'script#__NEXT_DATA__', nextEl.html() || nextEl.text());
  }

  // 2. Other application/json scripts
  $('script[type="application/json"]').each((_, el) => {
    const id = $(el).attr('id');
    const sel = id ? `script#${id}` : 'script[type="application/json"]';
    tryPush('json-script', sel, $(el).html() || $(el).text());
  });

  // 3. Strict JSON window.__NUXT__ / __INITIAL_STATE__ assignments
  $('script:not([src])').each((_, el) => {
    const text = ($(el).html() || $(el).text() || '').trim();
    if (!text) return;
    const m = /(?:window\.)?(__NUXT__|__INITIAL_STATE__|__PRELOADED_STATE__)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
    if (m) {
      tryPush(m[1], `script:${m[1]}`, m[2]);
    }
  });

  return results;
}

function walkArrays(root, maxDepth = 8) {
  const found = [];
  const visited = new Set();

  function visit(node, curPath, depth, parentObj, parentKey) {
    if (!node || typeof node !== 'object' || depth > maxDepth) return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      if (node.length > 0) {
        found.push({ path: curPath, array: node, parentObj, parentKey });
      }
      return;
    }

    for (const key of Object.keys(node)) {
      const val = node[key];
      if (!val || typeof val !== 'object') continue;
      const nextPath = curPath ? `${curPath}.${key}` : key;
      visit(val, nextPath, depth + 1, node, key);
    }
  }

  visit(root, '', 0, null, '');
  return found;
}

function findPaginationHints(root, arrayPath) {
  const hints = { totalPagesPath: null, totalPages: null, nextPagePath: null };
  const parentPath = arrayPath.includes('.') ? arrayPath.slice(0, arrayPath.lastIndexOf('.')) : '';
  const scopes = [
    { prefix: parentPath, obj: parentPath ? getByPath(root, parentPath) : root },
    { prefix: '', obj: root },
  ];

  const totalKeys = ['totalPages', 'total_pages', 'last_page', 'lastPage', 'pageCount', 'page_count'];
  const nestedContainers = ['pagination', 'meta', 'paging', 'pageInfo'];
  const nextKeys = ['next', 'nextPage', 'next_page', 'next_page_url', 'hasNext', 'has_more'];

  for (const scope of scopes) {
    if (!scope.obj || typeof scope.obj !== 'object') continue;
    for (const tk of totalKeys) {
      const v = Number(scope.obj[tk]);
      if (Number.isFinite(v) && v >= 1 && !hints.totalPagesPath) {
        hints.totalPagesPath = scope.prefix ? `${scope.prefix}.${tk}` : tk;
        hints.totalPages = v;
      }
    }
    for (const nc of nestedContainers) {
      const sub = scope.obj[nc];
      if (sub && typeof sub === 'object') {
        for (const tk of totalKeys) {
          const v = Number(sub[tk]);
          if (Number.isFinite(v) && v >= 1 && !hints.totalPagesPath) {
            hints.totalPagesPath = scope.prefix ? `${scope.prefix}.${nc}.${tk}` : `${nc}.${tk}`;
            hints.totalPages = v;
          }
        }
      }
    }
    for (const nk of nextKeys) {
      if (scope.obj[nk] !== undefined && !hints.nextPagePath) {
        hints.nextPagePath = scope.prefix ? `${scope.prefix}.${nk}` : nk;
      }
    }
  }
  return hints;
}

function pickFirstKey(sampleKeys, candidates) {
  for (const c of candidates) {
    if (sampleKeys.includes(c)) return c;
  }
  return null;
}

function extractMangaSlugAndId(mangaUrl) {
  try {
    const parsed = new URL(mangaUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    let mangaSlug = '';
    let mangaId = '';
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const seg = segments[i];
      if (!mangaId && /^\d+$/.test(seg)) {
        mangaId = seg;
        continue;
      }
      if (!mangaSlug && !/^(manga|truyen|truyen-tranh|comic|comics|series|title|read|chapter)$/i.test(seg)) {
        mangaSlug = seg;
      }
    }
    const idTail = /-(\d+)$/.exec(mangaSlug);
    if (!mangaId && idTail) mangaId = idTail[1];
    return { origin: parsed.origin, mangaSlug, mangaId };
  } catch {
    return { origin: '', mangaSlug: '', mangaId: '' };
  }
}

function inferChapterUrlTemplateFromLinks(items, { slugField, idField }, mangaUrl, renderedLinks = []) {
  const { mangaSlug, mangaId } = extractMangaSlugAndId(mangaUrl);
  const hrefs = (Array.isArray(renderedLinks) ? renderedLinks : [])
    .map((l) => (typeof l === 'string' ? l : l?.href || ''))
    .filter(Boolean);

  for (const item of items.slice(0, 15)) {
    const slugVal = slugField && item[slugField] != null ? String(item[slugField]).trim() : '';
    const idVal = idField && item[idField] != null ? String(item[idField]).trim() : '';
    if (!slugVal && !idVal) continue;

    for (const href of hrefs) {
      try {
        const abs = new URL(href, mangaUrl).href;
        let tpl = null;
        if (slugVal && abs.includes(slugVal)) {
          tpl = abs.replace(slugVal, '{chapterSlug}');
        } else if (idVal && (abs.endsWith(`/${idVal}`) || abs.includes(`/${idVal}/`) || abs.includes(`=${idVal}`))) {
          const safeIdRe = idVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          tpl = abs.replace(new RegExp(`(?<=/|=)${safeIdRe}(?=/|$|\\?|#)`), '{chapterId}');
        }
        if (tpl) {
          if (mangaSlug && tpl.includes(`/${mangaSlug}/`)) {
            tpl = tpl.replace(`/${mangaSlug}/`, '/{mangaSlug}/');
          } else if (mangaId && tpl.includes(`/${mangaId}/`)) {
            tpl = tpl.replace(`/${mangaId}/`, '/{mangaId}/');
          }
          return tpl;
        }
      } catch {
        /* ignore invalid href */
      }
    }
  }
  return null;
}

/**
 * Score & extract the most likely chapter array inside an SSR/API JSON tree.
 */
function findChapterArrayInJson(json, mangaUrl, renderedLinks = []) {
  const candidates = walkArrays(json, 8);
  let best = null;

  for (const entry of candidates) {
    const sample = entry.array.slice(0, 20).filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (sample.length === 0 || sample.length < Math.min(entry.array.length, 2)) continue;

    const first = sample[0];
    const keys = Object.keys(first);

    const urlField = pickFirstKey(keys, ['url', 'chapterUrl', 'chapter_url', 'link', 'href', 'path', 'permalink', 'full_url', 'readUrl']);
    const slugField = pickFirstKey(keys, ['slug', 'chapter_slug', 'chapterSlug', 'seo_slug', 'hid']);
    const numberField = pickFirstKey(keys, ['chapter_number', 'chapterNumber', 'chap_num', 'chapter', 'chap', 'number', 'num', 'index', 'chapter_index']);
    const titleField = pickFirstKey(keys, ['title', 'name', 'chapter_title', 'chapterName', 'chapter_name', 'label']);
    const idField = pickFirstKey(keys, ['id', 'chapter_id', 'chapterId', '_id']);

    if (!urlField && !slugField && !numberField) continue;
    if (!urlField && !slugField && !idField) continue;

    let score = 0;
    if (POSITIVE_CHAPTER_PATH_RE.test(entry.path)) score += 30;
    if (NEGATIVE_ARRAY_PATH_RE.test(entry.path)) score -= 60;
    if (urlField) score += 25;
    if (numberField) score += 25;
    if (slugField) score += 15;
    if (titleField) score += 10;

    // Bonus if titles look like chapters ("Chapter 1", "Chap 2", "Chương 3")
    if (titleField && sample.some((it) => /\b(chap|chapter|chương|ep|episode)\b|\d+/i.test(String(it[titleField] || '')))) {
      score += 20;
    }

    // Disqualify obvious non-chapter category/genre items
    if (!numberField && !urlField && NEGATIVE_ARRAY_PATH_RE.test(entry.path)) continue;

    let chapterUrlTemplate = null;
    if (!urlField) {
      chapterUrlTemplate = inferChapterUrlTemplateFromLinks(entry.array, { slugField, idField }, mangaUrl, renderedLinks);
      if (chapterUrlTemplate) score += 30;
    }

    // Skip if we cannot resolve any URL for items (neither urlField nor inferred template)
    if (!urlField && !chapterUrlTemplate) {
      if (slugField && POSITIVE_CHAPTER_PATH_RE.test(entry.path)) {
        const { mangaSlug: fallbackSlug, mangaId: fallbackId } = extractMangaSlugAndId(mangaUrl);
        let baseTpl = String(mangaUrl || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
        if (fallbackSlug) {
          const escSlug = fallbackSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          baseTpl = baseTpl.replace(new RegExp(`/${escSlug}(?=/|$)`), '/{mangaSlug}');
        }
        if (fallbackId && fallbackId !== fallbackSlug) {
          const escId = fallbackId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          baseTpl = baseTpl.replace(new RegExp(`/${escId}(?=/|$)`), '/{mangaId}');
        }
        chapterUrlTemplate = `${baseTpl}/{chapterSlug}`;
      } else {
        continue;
      }
    }

    score += Math.min(entry.array.length, 50);

    if (!best || score > best.score) {
      best = {
        score,
        entry,
        urlField,
        slugField,
        numberField,
        titleField,
        idField,
        chapterUrlTemplate,
      };
    }
  }

  if (!best || best.score < 20) return null;

  const { mangaSlug, mangaId } = extractMangaSlugAndId(mangaUrl);
  const chapters = [];
  const seen = new Set();

  for (const item of best.entry.array) {
    if (!item || typeof item !== 'object') continue;
    let rawUrl = best.urlField && item[best.urlField] != null ? String(item[best.urlField]).trim() : '';
    if (!rawUrl && best.chapterUrlTemplate) {
      rawUrl = best.chapterUrlTemplate
        .replace(/\{mangaSlug\}/g, mangaSlug)
        .replace(/\{mangaId\}/g, mangaId)
        .replace(/\{chapterSlug\}/g, best.slugField && item[best.slugField] != null ? String(item[best.slugField]).trim() : '')
        .replace(/\{chapterId\}/g, best.idField && item[best.idField] != null ? String(item[best.idField]).trim() : '');
    }
    if (!rawUrl) continue;

    let fullUrl;
    try {
      fullUrl = new URL(rawUrl, mangaUrl).href;
    } catch {
      continue;
    }
    if (!fullUrl || seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    let title = best.titleField && item[best.titleField] != null ? String(item[best.titleField]).trim() : '';
    if (!title && best.numberField && item[best.numberField] != null) {
      title = `Chapter ${item[best.numberField]}`;
    }
    if (!title) title = `Chapter ${chapters.length + 1}`;
    chapters.push({ title, url: fullUrl });
  }

  if (chapters.length === 0) return null;

  const pagHints = findPaginationHints(json, best.entry.path);
  return {
    arrayPath: best.entry.path,
    urlField: best.urlField,
    slugField: best.slugField,
    numberField: best.numberField,
    titleField: best.titleField,
    idField: best.idField,
    chapterUrlTemplate: best.chapterUrlTemplate,
    totalPagesPath: pagHints.totalPagesPath,
    totalPages: pagHints.totalPages,
    nextPagePath: pagHints.nextPagePath,
    chapters,
  };
}

function findImagePrefix(root, arrayPath, firstRawPath) {
  if (!firstRawPath || /^https?:\/\//i.test(firstRawPath) || firstRawPath.startsWith('//')) {
    return { prefixPath: null, prefixValue: '' };
  }
  const parentPath = arrayPath.includes('.') ? arrayPath.slice(0, arrayPath.lastIndexOf('.')) : '';
  const scopes = [
    { prefix: parentPath, obj: parentPath ? getByPath(root, parentPath) : root },
    { prefix: '', obj: root },
  ];
  const prefixKeys = ['cdnHost', 'cdn', 'cdnUrl', 'cdn_url', 'baseUrl', 'base_url', 'imageBase', 'image_base', 'host', 'domain', 'prefix', 'server'];

  for (const scope of scopes) {
    if (!scope.obj || typeof scope.obj !== 'object') continue;
    for (const pk of prefixKeys) {
      const val = scope.obj[pk];
      if (typeof val === 'string' && /^https?:\/\//i.test(val.trim())) {
        return {
          prefixPath: scope.prefix ? `${scope.prefix}.${pk}` : pk,
          prefixValue: val.trim().replace(/\/+$/, ''),
        };
      }
    }
  }
  return { prefixPath: null, prefixValue: '' };
}

/**
 * Score & extract chapter image arrays inside an SSR/API JSON tree.
 */
function findImageArrayInJson(json, chapterUrl = '') {
  const candidates = walkArrays(json, 8);
  let best = null;

  for (const entry of candidates) {
    const arr = entry.array;
    if (arr.length < 2) continue;
    if (NEGATIVE_ARRAY_PATH_RE.test(entry.path)) continue;

    // Case A: Array of strings
    if (arr.every((it) => typeof it === 'string')) {
      const validCount = arr.filter((s) => !EXCLUDED_IMG_RE.test(s) && (IMAGE_URL_HINT_RE.test(s) || isValidImgSrc(s))).length;
      if (validCount < 2) continue;
      let score = validCount * 10;
      if (/page|pages|image|images|imgs|pics/i.test(entry.path)) score += 25;
      if (!best || score > best.score) {
        best = { score, entry, imageField: null };
      }
      continue;
    }

    // Case B: Array of objects
    const sample = arr.slice(0, 10).filter((it) => it && typeof it === 'object' && !Array.isArray(it));
    if (sample.length === 0) continue;
    const keys = Object.keys(sample[0]);
    const imageField = pickFirstKey(keys, [
      'imageUrl', 'image_url', 'url', 'src', 'image', 'img', 'image_path', 'imagePath',
      'path', 'file', 'original', 'link', 'cdn_url',
    ]);
    if (!imageField) continue;

    const validCount = arr.filter((it) => {
      const raw = it && typeof it === 'object' ? String(it[imageField] || '').trim() : '';
      return raw && !EXCLUDED_IMG_RE.test(raw) && (IMAGE_URL_HINT_RE.test(raw) || isValidImgSrc(raw));
    }).length;
    if (validCount < 2) continue;

    let score = validCount * 10;
    if (/page|pages|image|images|imgs|pics/i.test(entry.path)) score += 25;
    if (!best || score > best.score) {
      best = { score, entry, imageField };
    }
  }

  if (!best) return null;

  const firstRaw = best.imageField
    ? String(best.entry.array[0]?.[best.imageField] || '').trim()
    : String(best.entry.array[0] || '').trim();
  const { prefixPath, prefixValue } = findImagePrefix(json, best.entry.path, firstRaw);

  const images = [];
  const seen = new Set();
  for (const item of best.entry.array) {
    const raw = best.imageField ? String(item?.[best.imageField] || '').trim() : String(item || '').trim();
    if (!raw || EXCLUDED_IMG_RE.test(raw)) continue;
    let resolved = '';
    if (prefixValue && !/^https?:\/\//i.test(raw) && !raw.startsWith('//')) {
      resolved = `${prefixValue}${raw.startsWith('/') ? '' : '/'}${raw}`;
    } else if (chapterUrl) {
      try {
        resolved = new URL(raw, chapterUrl).href;
      } catch {
        resolved = '';
      }
    } else {
      resolved = raw.startsWith('//') ? `https:${raw}` : raw;
    }
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    images.push(resolved);
  }

  if (images.length < 2) return null;

  return {
    arrayPath: best.entry.path,
    imageField: best.imageField,
    prefixPath,
    prefixValue,
    images,
  };
}

/**
 * Detect same-manga chapter pagination in HTML (e.g., ?page=2, /page/2/, .pagination a).
 */
function detectHtmlChapterPagination($, mangaUrl) {
  let base;
  try {
    base = new URL(mangaUrl);
  } catch {
    return { detected: false };
  }

  const baseNormPath = base.pathname.replace(/\/+$/, '');
  const $links = $('.pagination a[href], .page-numbers a[href], ul[class*="pag"] a[href], div[class*="pag"] a[href], a[rel="next"][href]');
  if ($links.length === 0) return { detected: false };

  let bestTemplate = null;
  let bestSuffixTemplate = null;
  let paginationType = null;
  let maxPagesDetected = 1;

  $links.each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    let target;
    try {
      target = new URL(href, mangaUrl);
    } catch {
      return;
    }
    if (target.hostname !== base.hostname) return;

    const targetNormPath = target.pathname.replace(/\/+$/, '');

    // Pattern A: Query param pagination on same manga path (?page=2, ?p=2, ?trang=2)
    if (targetNormPath === baseNormPath) {
      for (const key of ['page', 'p', 'trang', 'paged', 'chap_page']) {
        const val = target.searchParams.get(key);
        const num = val ? parseInt(val, 10) : NaN;
        if (Number.isFinite(num) && num >= 2 && num <= 500) {
          if (num > maxPagesDetected) maxPagesDetected = num;
          if (!bestTemplate) {
            const tplUrl = new URL(target.href);
            tplUrl.searchParams.set(key, '__PAGE_TOKEN__');
            bestTemplate = tplUrl.href.replace('__PAGE_TOKEN__', '{page}');
            bestSuffixTemplate = tplUrl.search.replace('__PAGE_TOKEN__', '{page}');
            paginationType = 'query';
          }
        }
      }
      return;
    }

    // Pattern B: Path suffix pagination on same manga path (/manga/slug/page/2 or /manga/slug/trang-2)
    if (targetNormPath.startsWith(`${baseNormPath}/`)) {
      const rest = targetNormPath.slice(baseNormPath.length);
      const m = /^\/(?:page|trang|p)\/(\d+)$/i.exec(rest) || /^\/(?:trang|page)-(\d+)(?:\.html)?$/i.exec(rest);
      if (m) {
        const num = parseInt(m[1], 10);
        if (Number.isFinite(num) && num >= 2 && num <= 500) {
          if (num > maxPagesDetected) maxPagesDetected = num;
          if (!bestTemplate) {
            const suffix = `${rest.replace(m[1], '{page}')}${target.search}`;
            bestTemplate = `${target.origin}${baseNormPath}${suffix}`;
            bestSuffixTemplate = suffix;
            paginationType = 'path';
          }
        }
      }
    }
  });

  if (!bestTemplate || maxPagesDetected < 2) {
    return { detected: false };
  }

  return {
    detected: true,
    pageUrlTemplate: bestTemplate,
    runtimeSuffixTemplate: bestSuffixTemplate,
    paginationType,
    maxPagesDetected,
  };
}

function parameterizeUrlWithSource(apiUrl, sourceUrl, slugPlaceholder, idPlaceholder) {
  let out = String(apiUrl || '');
  const { mangaSlug, mangaId } = extractMangaSlugAndId(sourceUrl);
  try {
    const parsed = new URL(out);
    if (mangaSlug && parsed.pathname.includes(`/${mangaSlug}`)) {
      parsed.pathname = parsed.pathname.replace(new RegExp(`/${mangaSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), `/${slugPlaceholder}`);
    } else if (mangaId && parsed.pathname.includes(`/${mangaId}`)) {
      parsed.pathname = parsed.pathname.replace(new RegExp(`/${mangaId}(?=/|$)`), `/${idPlaceholder}`);
    } else {
      for (const [k, v] of parsed.searchParams.entries()) {
        if (mangaSlug && v === mangaSlug) parsed.searchParams.set(k, slugPlaceholder);
        else if (mangaId && v === mangaId) parsed.searchParams.set(k, idPlaceholder);
      }
    }
    out = parsed.href
      .replace(/%7B/gi, '{')
      .replace(/%7D/gi, '}');
  } catch {
    /* keep raw url */
  }
  return out;
}

/**
 * Parameterize an observed manga chapters API URL into a reusable template + pagination descriptor.
 */
function inferApiUrlTemplate(apiUrlPage1, mangaUrl, apiUrlPage2 = null) {
  let tpl = parameterizeUrlWithSource(apiUrlPage1, mangaUrl, '{mangaSlug}', '{mangaId}');
  let paginated = false;
  let paginationType = null;
  let paginationParam = null;
  let offsetStep = null;

  try {
    const u1 = new URL(apiUrlPage1);
    const u2 = apiUrlPage2 ? new URL(apiUrlPage2) : null;
    const out = new URL(tpl);

    if (u2 && u1.origin === u2.origin && u1.pathname === u2.pathname) {
      for (const key of new Set([...u1.searchParams.keys(), ...u2.searchParams.keys()])) {
        const v1 = u1.searchParams.get(key);
        const v2 = u2.searchParams.get(key);
        if (v1 === v2) continue;
        const n1 = Number(v1);
        const n2 = Number(v2);
        if (Number.isFinite(n1) && Number.isFinite(n2) && n2 > n1) {
          if (n1 === 0 && /offset|skip|start/i.test(key)) {
            paginated = true;
            paginationType = 'offset';
            paginationParam = key;
            offsetStep = n2 - n1;
            out.searchParams.set(key, '{offset}');
          } else {
            paginated = true;
            paginationType = 'page';
            paginationParam = key;
            out.searchParams.set(key, '{page}');
          }
          break;
        }
      }
    }

    if (!paginated) {
      for (const key of ['page', 'p', 'pageNumber']) {
        if (u1.searchParams.has(key)) {
          paginated = true;
          paginationType = 'page';
          paginationParam = key;
          out.searchParams.set(key, '{page}');
          break;
        }
      }
    }

    if (!paginated && u1.searchParams.has('offset')) {
      paginated = true;
      paginationType = 'offset';
      paginationParam = 'offset';
      const lim = Number(u1.searchParams.get('limit') || u1.searchParams.get('per_page') || 50);
      offsetStep = Number.isFinite(lim) && lim > 0 ? lim : 50;
      out.searchParams.set('offset', '{offset}');
    }

    tpl = out.href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
  } catch {
    /* keep raw tpl */
  }

  return {
    urlTemplate: tpl,
    paginated,
    paginationType,
    paginationParam,
    offsetStep,
  };
}

function inferChapterApiUrlTemplate(apiUrl, chapterUrl) {
  const urlTemplate = parameterizeUrlWithSource(apiUrl, chapterUrl, '{chapterSlug}', '{chapterId}');
  return { urlTemplate };
}

module.exports = {
  getByPath,
  extractEmbeddedStateJson,
  findChapterArrayInJson,
  findImageArrayInJson,
  detectHtmlChapterPagination,
  inferApiUrlTemplate,
  inferChapterApiUrlTemplate,
};
