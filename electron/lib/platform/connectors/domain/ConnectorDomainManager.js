/**
 * Centralized Dynamic Domain Manager for Connectors.
 * Tracks active domains, resolves relative URLs, handles automatic redirect updates,
 * and performs numeric domain probing when sites rotate numbers.
 */

const logger = require('../../../shared/logger');

function normalizeDomain(domain) {
  if (!domain) return '';
  let d = String(domain).trim();
  if (!d.startsWith('http://') && !d.startsWith('https://')) {
    d = `https://${d}`;
  }
  if (!d.endsWith('/')) {
    d = `${d}/`;
  }
  return d;
}

class ConnectorDomainManager {
  constructor() {
    this._activeDomains = new Map();
    this._patterns = new Map();
  }

  /**
   * Get active domain for a site, fallback to provided fallback or connector default.
   * @param {string} siteId
   * @param {string} [fallbackDomain]
   * @returns {string} Fully qualified domain ending with /
   */
  getDomain(siteId, fallbackDomain = '') {
    const key = String(siteId).toLowerCase();
    if (this._activeDomains.has(key)) {
      return this._activeDomains.get(key);
    }
    return normalizeDomain(fallbackDomain);
  }

  /**
   * Set/update active domain for a site.
   * @param {string} siteId
   * @param {string} newDomain
   */
  setDomain(siteId, newDomain) {
    if (!siteId || !newDomain) return;
    const key = String(siteId).toLowerCase();
    const normalized = normalizeDomain(newDomain);
    const old = this._activeDomains.get(key);
    if (old !== normalized) {
      this._activeDomains.set(key, normalized);
      logger.info(`[ConnectorDomainManager] Cập nhật domain cho ${siteId}: ${old || '(default)'} -> ${normalized}`);
    }
  }

  /**
   * Resolve a relative path or return an absolute URL against active domain.
   * @param {string} siteId
   * @param {string} pathOrUrl
   * @param {string} [fallbackDomain]
   * @returns {string}
   */
  resolveUrl(siteId, pathOrUrl, fallbackDomain = '') {
    if (!pathOrUrl) return '';
    const trimmed = String(pathOrUrl).trim();
    if (!trimmed.startsWith('/')) return trimmed;
    const base = this.getDomain(siteId, fallbackDomain);
    if (!base) return trimmed;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${trimmed}`;
  }

  /**
   * Register a numeric pattern for a site (e.g. /^(https?:\/\/(?:www\.)?luottruyen)(\d+)(\.com\/?)$/i).
   * @param {string} siteId
   * @param {RegExp} pattern
   */
  registerPattern(siteId, pattern) {
    if (!siteId || !(pattern instanceof RegExp)) return;
    this._patterns.set(String(siteId).toLowerCase(), pattern);
  }

  /**
   * Probe candidate domains ($N+1, $N+2) when a domain encounters network/DNS failure.
   * @param {string} siteId
   * @param {string} currentDomain
   * @param {Function} [fetcher] Optional custom fetcher for testing: async (url) => ({ ok, status })
   * @returns {Promise<string | null>} The new working domain or null if probing failed
   */
  async probeNewDomain(siteId, currentDomain, fetcher = null) {
    const key = String(siteId).toLowerCase();
    const pattern = this._patterns.get(key);
    if (!pattern) return null;

    const domainToTest = currentDomain || this.getDomain(key);
    const match = pattern.exec(domainToTest);
    if (!match || match.length < 4) return null;

    const prefix = match[1];
    const currentNum = parseInt(match[2], 10);
    const suffix = match[3];
    if (isNaN(currentNum)) return null;

    const candidates = [currentNum + 1, currentNum + 2];

    const probeFn = fetcher || (async (probeUrl) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(probeUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });

    for (const num of candidates) {
      const candidateUrl = normalizeDomain(`${prefix}${num}${suffix}`);
      try {
        const res = await probeFn(candidateUrl);
        if (res && res.ok) {
          logger.info(`[ConnectorDomainManager] Dò thành công domain mới cho ${siteId}: ${candidateUrl}`);
          this.setDomain(key, candidateUrl);
          return candidateUrl;
        }
      } catch (err) {
        logger.debug(`[ConnectorDomainManager] Thử domain ${candidateUrl} thất bại: ${err?.message || err}`);
      }
    }

    return null;
  }
}

const connectorDomainManager = new ConnectorDomainManager();

// Register known default patterns for frequent rebranders
connectorDomainManager.registerPattern('luottruyen', /^(https?:\/\/(?:www\.)?luottruyen)(\d+)(\.com\/?)$/i);
connectorDomainManager.registerPattern('toptruyenzone2', /^(https?:\/\/(?:www\.)?toptruyenzone)(\d+)(\.com\/?)$/i);
connectorDomainManager.registerPattern('comicvn', /^(https?:\/\/(?:www\.)?comicvn)(\d+)(\.net\/?)$/i);
connectorDomainManager.registerPattern('nettruyenviet', /^(https?:\/\/(?:www\.)?nettruyenviet)(\d+)(\.com\/?)$/i);
connectorDomainManager.registerPattern('manhwatv', /^(https?:\/\/(?:www\.)?manhwatv)(\d+)(\.com\/?)$/i);
connectorDomainManager.registerPattern('zettruyen', /^(https?:\/\/(?:www\.)?zettruyen)(\d+)(\.com\/?)$/i);

module.exports = {
  ConnectorDomainManager,
  connectorDomainManager,
};
