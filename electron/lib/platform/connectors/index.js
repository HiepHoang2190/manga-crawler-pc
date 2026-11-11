/**
 * Registry connector — tương đương ConnectorFactory + templates/*.java.
 * Thêm site: tạo file trong ./ (vd. mangadex.js), đăng ký vào REGISTRY.
 */
const logger = require('../../shared/logger');
const { getImageRefererForUrl } = require('../../download/connector/connectorReferer');
const { enrichDownloadChapterResult } = require('../../download/connector/downloadChapterResult');
const cuuTruyen = require('./cuuTruyen');
const truyenQQ = require('./truyenQQ');
const mangadex = require('./mangadex');
const comix = require('./comix');
const antbyw = require('./antbyw');
const mangaPlus = require('./mangaPlus');
const comicDays = require('./comicDays');
const minotruyen = require('./minotruyen');
const otakusic = require('./otakusic');
const gocTruyenTranh = require('./gocTruyenTranh');
const comicvn = require('./comicvn');
const moetruyen = require('./moetruyen');
const truyenMoe = require('./truyenMoe');
const truyenTranhPhapBi = require('./truyenTranhPhapBi');
const dtvebook = require('./dtvebook');
const manhuagui = require('./manhuagui');
const netTruyenViet = require('./netTruyenViet');
const netTruyenAr = require('./netTruyenAr');
const luotTruyen = require('./luotTruyen');
const comick = require('./comick');
const dilib = require('./dilib');
const luuTruCuaWibu = require('./luuTruCuaWibu');
const truyenqqVn = require('./truyenqqVn');
const sakamotodays = require('./sakamotodays');
const chapVn = require('./chapVn');
const mangaball = require('./mangaball');
const mangaFire = require('./mangaFire');
const truyenTuoiTho = require('./truyenTuoiTho');
const pokemonSpecial = require('./pokemonSpecial');
const tuThienBao = require('./tuThienBao');
const baozimh = require('./baozimh');
const kenhSinhVien = require('./kenhSinhVien');
const mangaVn = require('./mangaVn');
const manhwaTv = require('./manhwaTv');
const rawkuma = require('./rawkuma');
const zettruyen = require('./zettruyen');
const bluelake = require('./bluelake');
const topTruyenZone2 = require('./topTruyenZone2');
const mutualheights = require('./mutualheights');
const webtoon = require('./webtoon');
const mangapill = require('./mangapill');
const suicaodex = require('./suicaodex');
const xbato = require('./xbato');
const hangTruyen = require('./hangTruyen');
const viviComic = require('./viviComic');
const vietMessenger = require('./vietMessenger');
const netTruyenGg = require('./netTruyenGg');
const yurineko = require('./yurineko');
const kingOfShojo = require('./kingOfShojo');
const batcave = require('./batcave');
const fanfox = require('./fanfox');
const truyenGg = require('./truyenGg');
const baotangtruyen = require('./baotangtruyen');
const nhattruyen = require('./nhattruyen');
const asurascans = require('./asurascans');
const flamecomics = require('./flamecomics');
const sangchanhteam = require('./sangchanhteam');
const tcbscanmanga = require('./tcbscanmanga');
const kingdomhoiquan = require('./kingdomhoiquan');

// JS Plugin Manager
const JsPluginManager = require('../../plugins/JsPluginManager');
const { runConnectorTest } = require('./tester');

/** Connectors that remain functional (URL detection, download) but are not shown in the UI dropdown. */
const HIDDEN_CONNECTOR_IDS = new Set([
  'kenhsinhvien',
]);

const REGISTRY = {
  [cuuTruyen.id]: cuuTruyen,
  [truyenQQ.id]: truyenQQ,
  [mangadex.id]: mangadex,
  [comix.id]: comix,
  [antbyw.id]: antbyw,
  [mangaPlus.id]: mangaPlus,
  [comicDays.id]: comicDays,
  [minotruyen.id]: minotruyen,
  [otakusic.id]: otakusic,
  [gocTruyenTranh.id]: gocTruyenTranh,
  [comicvn.id]: comicvn,
  [moetruyen.id]: moetruyen,
  [truyenMoe.id]: truyenMoe,
  [truyenTranhPhapBi.id]: truyenTranhPhapBi,
  [dtvebook.id]: dtvebook,
  [manhuagui.id]: manhuagui,
  [netTruyenViet.id]: netTruyenViet,
  [netTruyenAr.id]: netTruyenAr,
  [luotTruyen.id]: luotTruyen,
  [comick.id]: comick,
  [dilib.id]: dilib,
  [luuTruCuaWibu.id]: luuTruCuaWibu,
  [truyenqqVn.id]: truyenqqVn,
  [sakamotodays.id]: sakamotodays,
  [chapVn.id]: chapVn,
  [mangaball.id]: mangaball,
  [mangaFire.id]: mangaFire,
  [truyenTuoiTho.id]: truyenTuoiTho,
  [pokemonSpecial.id]: pokemonSpecial,
  [tuThienBao.id]: tuThienBao,
  [baozimh.id]: baozimh,
  [kenhSinhVien.id]: kenhSinhVien,
  [mangaVn.id]: mangaVn,
  [manhwaTv.id]: manhwaTv,
  [rawkuma.id]: rawkuma,
  [zettruyen.id]: zettruyen,
  [bluelake.id]: bluelake,
  [topTruyenZone2.id]: topTruyenZone2,
  [mutualheights.id]: mutualheights,
  [webtoon.id]: webtoon,
  [mangapill.id]: mangapill,
  [suicaodex.id]: suicaodex,
  [xbato.id]: xbato,
  [hangTruyen.id]: hangTruyen,
  [viviComic.id]: viviComic,
  [vietMessenger.id]: vietMessenger,
  [netTruyenGg.id]: netTruyenGg,
  [yurineko.id]: yurineko,
  [kingOfShojo.id]: kingOfShojo,
  [batcave.id]: batcave,
  [fanfox.id]: fanfox,
  [truyenGg.id]: truyenGg,
  [baotangtruyen.id]: baotangtruyen,
  [nhattruyen.id]: nhattruyen,
  [asurascans.id]: asurascans,
  [flamecomics.id]: flamecomics,
  [sangchanhteam.id]: sangchanhteam,
  [tcbscanmanga.id]: tcbscanmanga,
  [kingdomhoiquan.id]: kingdomhoiquan,
};

function get(siteId) {
  if (!siteId) return null;

  // Check built-in connectors first
  const builtIn = REGISTRY[String(siteId)];
  if (builtIn) return builtIn;

  // Check JS plugins
  const plugin = JsPluginManager.getPlugin(siteId);
  if (plugin && plugin.isEnabled) {
    const connector = JsPluginManager._connectors.get(siteId);
    if (connector) return connector;
  }

  return null;
}

function listRegistryIds() {
  return Object.keys(REGISTRY);
}

function hostMatchesConnector(host, c) {
  if (Array.isArray(c.hostIncludes)) {
    const h = String(host).toLowerCase();
    for (const sub of c.hostIncludes) {
      if (h.includes(String(sub).toLowerCase())) return true;
    }
  }
  const list = [c.domain];
  if (Array.isArray(c.extraDomains)) {
    list.push(...c.extraDomains);
  }
  for (const u of list) {
    try {
      const ch = new URL(u).hostname.toLowerCase();
      if (host === ch || host.endsWith(`.${ch}`)) {
        return true;
      }
    } catch {
      /* */
    }
  }
  return false;
}

/** Tương đương ConnectorFactory.getConnector(url) + HttpUtils.isSameConnectorDomain — khớp host với domain connector. */
function detectSiteIdFromUrl(urlString) {
  let host = '';
  try {
    host = new URL(String(urlString).trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;

  // Check built-in connectors
  for (const c of Object.values(REGISTRY)) {
    if (hostMatchesConnector(host, c)) {
      return c.id;
    }
  }

  // Check JS plugins
  const plugins = JsPluginManager.getInstalledPlugins();
  for (const info of plugins) {
    if (!info.isEnabled) continue;

    const connector = JsPluginManager._connectors.get(info.metadata.id);
    if (connector && connector.supports(`https://${host}/`)) {
      return info.metadata.id;
    }
  }

  return null;
}

/**
 * Ưu tiên nhận diện từ URL (giống AppFrame khi dán link), sau đó mới dùng site đã chọn.
 */
function resolveSiteForLoad(siteId, urlString) {
  const detected = detectSiteIdFromUrl(urlString);
  if (detected) return detected;
  if (siteId && get(siteId)) return String(siteId);
  return null;
}

function resolveSiteForDownload(siteId, payload) {
  const chapterUrl = payload && payload.chapterUrl ? String(payload.chapterUrl) : '';
  const mangaUrl = payload && payload.mangaUrl ? String(payload.mangaUrl) : '';
  const fromChapter = detectSiteIdFromUrl(chapterUrl);
  if (fromChapter) return fromChapter;
  const fromManga = detectSiteIdFromUrl(mangaUrl);
  if (fromManga) return fromManga;
  if (siteId && get(siteId)) return String(siteId);
  return null;
}

/** Built-in site ids that support search in the Latest updates tab (must match renderer fallbacks). */
const LATEST_UPDATES_SEARCH_SITE_IDS = new Set([
  'moetruyen',
  'cuutruyen',
  'mangadex',
  'truyenqq',
  'minotruyen',
  'nettruyenar',
  'toptruyenzone2',
  'zettruyen',
  'yurineko',
  'batcave',
  'truyengg',
  'baotangtruyen',
  'nhattruyen',
  'asurascans',
  'flamecomics',
  'sangchanhteam',
  'tcbscanmanga',
]);

function connectorSupportsLatestUpdatesSearch(connector) {
  if (!connector || !connector.id) return false;
  if (typeof connector.supportsLatestUpdatesSearch === 'boolean') {
    return connector.supportsLatestUpdatesSearch;
  }
  return LATEST_UPDATES_SEARCH_SITE_IDS.has(String(connector.id));
}

/** Khớp mobile Home + PC tab Mới cập nhật — tối đa số trang hiển thị/phân trang. */
const LATEST_UPDATES_MAX_LISTING_PAGES = 20;

function clampLatestUpdatesListingPage(pageNum) {
  const n = Math.floor(Number(pageNum) || 1);
  return Math.min(LATEST_UPDATES_MAX_LISTING_PAGES, Math.max(1, n));
}

function clampLatestUpdatesListingTotalPages(totalPages) {
  const n = Math.floor(Number(totalPages) || 1);
  return Math.min(LATEST_UPDATES_MAX_LISTING_PAGES, Math.max(1, n));
}

function listConnectors() {
  const builtInConnectors = Object.values(REGISTRY)
    .filter((c) => !HIDDEN_CONNECTOR_IDS.has(c.id))
    .map((c) => {
      const supportsLatestUpdates =
        typeof c.fetchLatestUpdates === 'function' && c.supportsLatestUpdates !== false;
      return {
        id: c.id,
        label: c.label,
        domain: c.domain,
        icon: c.icon || null,
        imageReferer: c.imageReferer || null,
        supportsApiFetch: Boolean(c.supportsApiFetch),
        requiresCookie: Boolean(c.requiresCookie),
        requiresVpn: Boolean(c.requiresVpn),
        suggestsVpn: Boolean(c.suggestsVpn),
        hasLockedChapters: Boolean(c.hasLockedChapters),
        hostIncludes: Array.isArray(c.hostIncludes) ? [...c.hostIncludes] : [],
        supportsLatestUpdates,
        supportsLatestUpdatesSearch:
          supportsLatestUpdates && LATEST_UPDATES_SEARCH_SITE_IDS.has(c.id),
        supportsBulkScan: Boolean(c.supportsBulkScan),
        isJsPlugin: false,
      };
    });

  const builtInSiteIds = new Set(Object.keys(REGISTRY));

  // Omit JS plugins whose id collides with a built-in connector (same id → duplicate dropdown rows + broken select UI)
  const jsPlugins = JsPluginManager.getInstalledPlugins()
    .filter((info) => !builtInSiteIds.has(String(info.metadata.id || '')))
    .map((info) => {
      const connector = JsPluginManager._connectors.get(info.metadata.id);
      const pluginObj = connector && connector.plugin ? connector.plugin : null;
      const supportsLatestUpdates = Boolean(
        info.isEnabled && pluginObj && typeof pluginObj.fetchLatestUpdates === 'function',
      );
      const supportsSearch = Boolean(
        info.isEnabled && pluginObj && typeof pluginObj.searchManga === 'function',
      );
      return {
        id: info.metadata.id,
        label: info.metadata.name,
        domain: info.metadata.baseUrl,
        icon: info.metadata.icon || null,
        imageReferer: info.metadata.baseUrl,
        supportsApiFetch: false,
        requiresCookie: false,
        requiresVpn: false,
        suggestsVpn: false,
        hasLockedChapters: false,
        supportsLatestUpdates,
        supportsLatestUpdatesSearch: supportsLatestUpdates && supportsSearch,
        supportsBulkScan: false,
        isJsPlugin: true,
        isEnabled: info.isEnabled,
        autoDisabled: info.autoDisabled,
      };
    });

  return [...builtInConnectors, ...jsPlugins]
    .sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }),
    );
}

async function load(siteId, url, options = {}) {
  const resolved = resolveSiteForLoad(siteId, url);
  const c = get(resolved);
  if (!c) {
    return {
      ok: false,
      error:
        'Không nhận diện được site từ URL — chọn Site trong danh sách hoặc dán URL đúng domain (vd. nettrom.com, hetcuutruyen.net, cuutruyen.net, truyenqqko.com).',
    };
  }
  return c.load(url, options);
}

async function downloadChapter(siteId, payload) {
  const resolved = resolveSiteForDownload(siteId, payload);
  const c = get(resolved);
  if (!c) {
    return { ok: false, error: 'Unsupported site' };
  }
  const raw = await c.downloadChapter(payload);
  return enrichDownloadChapterResult(raw);
}

/**
 * @param {string} siteId
 * @param {object} [options] — forwarded to site listing (maxPages, onProgress, …)
 */
async function fetchBulkScan(siteId, options = {}) {
  const id = String(siteId || '').trim();
  const c = get(id);
  if (!c || !c.supportsBulkScan) {
    return {
      ok: false,
      siteId: id || undefined,
      pagesFetched: 0,
      totalPagesDetected: 1,
      items: [],
      error: `Bulk scan is not supported for site: ${id || '(empty)'}`,
    };
  }
  if (id === 'comicvn' && typeof c.fetchMoiNhatListing === 'function') {
    return c.fetchMoiNhatListing(options || {});
  }
  if (typeof c.fetchBulkScanListing === 'function') {
    return c.fetchBulkScanListing(options || {});
  }
  return {
    ok: false,
    siteId: id,
    pagesFetched: 0,
    totalPagesDetected: 1,
    items: [],
    error: `Bulk scan listing missing for site: ${id}`,
  };
}

/**
 * @param {string[]} siteIds
 * @param {object} [options]  forwarded to connector.fetchLatestUpdates (e.g. page, userAgent, cookie, latestUpdatesSearch for MoeTruyen)
 * @returns {Promise<{ ok: boolean, results: object[], error?: string }>}
 */
async function fetchLatestUpdates(siteIds, options = {}) {
  const ids = (Array.isArray(siteIds) ? siteIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!ids.length) {
    return { ok: false, error: 'Chưa chọn site.', results: [] };
  }
  const { getCookieForSite, ...restOpts } = options || {};
  const page = clampLatestUpdatesListingPage(restOpts.page);

  async function fetchOneSite(siteId) {
    const c = get(siteId);
    if (!c || typeof c.fetchLatestUpdates !== 'function') {
      return {
        ok: false,
        siteId,
        error: 'Site không hỗ trợ danh sách mới cập nhật.',
        items: [],
        page: 1,
        totalPages: 1,
      };
    }
    const callOpts =
      typeof getCookieForSite === 'function' && c.requiresCookie
        ? { ...restOpts, page, cookie: String(getCookieForSite(siteId) || '') }
        : { ...restOpts, page };
    try {
      const r = await c.fetchLatestUpdates(callOpts);
      if (!r || r.ok !== true) {
        return {
          ok: false,
          siteId,
          error: String(r?.error || 'Không tải được danh sách.'),
          items: [],
          page,
          totalPages: 1,
        };
      }
      return {
        ok: true,
        siteId,
        items: Array.isArray(r.items) ? r.items : [],
        page: clampLatestUpdatesListingPage(typeof r.page === 'number' ? r.page : page),
        totalPages: clampLatestUpdatesListingTotalPages(
          typeof r.totalPages === 'number' && r.totalPages >= 1 ? r.totalPages : 1,
        ),
      };
    } catch (e) {
      return {
        ok: false,
        siteId,
        error: String(e?.message || e),
        items: [],
        page,
        totalPages: 1,
      };
    }
  }

  const results = await Promise.all(ids.map((siteId) => fetchOneSite(siteId)));
  return { ok: true, results };
}

/**
 * JsPluginManager hooks — built-in REGISTRY is static; JS plugins live in JsPluginManager._connectors.
 * These must exist so disable/delete does not throw when the manager calls into the registry.
 */
function registerJsPlugin(_connector) {
  // Intentionally empty: plugin connectors are resolved via JsPluginManager + get().
}

function unregisterJsPlugin(_pluginId) {
  // Intentionally empty: disposal runs in JsPluginManager.disablePlugin / deletePlugin.
}

async function testConnector(siteId, activeDomain, onProgress) {
  return runConnectorTest(siteId, activeDomain, onProgress);
}

module.exports = {
  get,
  listRegistryIds,
  listConnectors,
  detectSiteIdFromUrl,
  resolveSiteForLoad,
  load,
  downloadChapter,
  fetchLatestUpdates,
  fetchBulkScan,
  connectorSupportsLatestUpdatesSearch,
  LATEST_UPDATES_SEARCH_SITE_IDS,
  LATEST_UPDATES_MAX_LISTING_PAGES,
  clampLatestUpdatesListingPage,
  clampLatestUpdatesListingTotalPages,
  getImageRefererForUrl,
  registerJsPlugin,
  unregisterJsPlugin,
  testConnector,
};
