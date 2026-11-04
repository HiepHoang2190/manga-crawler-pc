/**
 * JsPluginConnector - Wraps a JS plugin as a connector
 * 
 * Provides the same interface as other connectors (HtmlConnectorService, ApiConnectorService)
 * but executes JavaScript plugin code in a sandboxed VM environment.
 */

const vm = require('vm');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../shared/logger');
const { BaseConnectorService } = require('../platform/connectors/base/BaseConnectorService');
const { emitPluginConsole, formatPluginConsoleArgs } = require('./pluginConsoleBridge');

class JsPluginConnector extends BaseConnectorService {
  constructor({ metadata, source, pluginId }) {
    super({
      domain: metadata.baseUrl,
      label: metadata.name,
      siteId: metadata.id,
    });
    this.id = metadata.id;
    this.label = metadata.name;
    this.domain = metadata.baseUrl;
    this.metadata = metadata;
    this.source = source;
    this.pluginId = pluginId;
    this.consecutiveErrors = 0;
    this.icon = metadata.icon || null;
    this.imageReferer = metadata.baseUrl;
    this.hostIncludes = metadata.allowedDomains;
    this.extraDomains = [];
    
    // Create sandbox with safe APIs
    this._createSandbox();
    
    // Evaluate plugin source
    this._evaluatePlugin();
  }

  /**
   * Create a safe sandbox environment for the plugin
   */
  _createSandbox() {
    this.sandbox = {
      plugin: null,
      
      // Console API — main process logger + renderer strip (Latest updates / plugin debug)
      console: {
        log: (...args) => {
          emitPluginConsole(this.pluginId, 'info', args);
          logger.info(`[Plugin:${this.pluginId}] ${formatPluginConsoleArgs(args)}`);
        },
        warn: (...args) => {
          emitPluginConsole(this.pluginId, 'warn', args);
          logger.warn(`[Plugin:${this.pluginId}] ${formatPluginConsoleArgs(args)}`);
        },
        error: (...args) => {
          emitPluginConsole(this.pluginId, 'error', args);
          logger.error(`[Plugin:${this.pluginId}] ${formatPluginConsoleArgs(args)}`);
        },
      },
      
      // HTTP API
      http: {
        get: async (url, options = {}) => {
          try {
            const response = await axios.get(url, {
              headers: options.headers || {},
              timeout: options.timeout || 30000
            });
            return {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: this._normalizeHttpBody(response.data),
            };
          } catch (e) {
            throw new Error(`HTTP GET failed: ${e.message}`);
          }
        },
        
        post: async (url, data, options = {}) => {
          try {
            const response = await axios.post(url, data, {
              headers: options.headers || {},
              timeout: options.timeout || 30000
            });
            return {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: this._normalizeHttpBody(response.data),
            };
          } catch (e) {
            throw new Error(`HTTP POST failed: ${e.message}`);
          }
        }
      },
      
      // HTML parsing API
      html: {
        parse: (htmlString) => {
          const $ = cheerio.load(htmlString);
          
          // Return a safe wrapper around cheerio
          return {
            querySelector: (selector) => {
              const elem = $(selector).first();
              return this._wrapCheerioElement(elem, $);
            },

            querySelectorAll: (selector) => {
              const elems = $(selector);
              const result = [];
              elems.each((i, el) => {
                const wrapped = this._wrapCheerioElement($(el), $);
                if (wrapped) result.push(wrapped);
              });
              return result;
            },
          };
        }
      },
      
      // JSON API — http responses often return body already parsed (object); accept that too
      json: {
        parse: (input) => {
          if (input === null || input === undefined) {
            throw new Error('json.parse: input is null or undefined');
          }
          if (typeof input === 'string') {
            return JSON.parse(input);
          }
          if (Buffer.isBuffer(input)) {
            return JSON.parse(input.toString('utf8'));
          }
          if (typeof input === 'object') {
            return input;
          }
          throw new Error(`json.parse: expected string or object, got ${typeof input}`);
        },
        stringify: (obj) => JSON.stringify(obj),
      },
      
      // Utils API
      utils: {
        resolveUrl: (base, relative) => {
          try {
            return new URL(relative, base).href;
          } catch {
            return relative;
          }
        },
        
        encodeUri: (str) => encodeURIComponent(str),
        decodeUri: (str) => decodeURIComponent(str)
      },
      
      // Storage API (stub for now)
      storage: {
        get: async (key) => null,
        set: async (key, value) => {},
        remove: async (key) => {},
        clear: async () => {}
      }
    };
    
    this.context = vm.createContext(this.sandbox);
  }

  /**
   * Axios may return HTML as string, Buffer, or ArrayBuffer — cheerio/html.parse need UTF-8 text.
   * @param {unknown} data
   * @returns {string}
   */
  _normalizeHttpBody(data) {
    if (data == null || data === '') return '';
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) {
      const view = data;
      return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
    }
    return String(data);
  }

  /**
   * Cheerio collections are empty when `length === 0`; `.first()` on empty is still an empty collection (truthy in JS).
   * Real DOM returns null from querySelector — plugins rely on that.
   */
  _cheerioSelectionMissing(elem) {
    return !elem || (typeof elem.length === 'number' && elem.length === 0);
  }

  /**
   * Wrap a cheerio element with a safe API
   * @returns {object|null}
   */
  _wrapCheerioElement(elem, $) {
    if (this._cheerioSelectionMissing(elem)) return null;
    return {
      text: () => elem.text(),
      attr: (name) => elem.attr(name),
      html: () => elem.html(),
      querySelector: (selector) => {
        const child = elem.find(selector).first();
        return this._wrapCheerioElement(child, $);
      },
      querySelectorAll: (selector) => {
        const children = elem.find(selector);
        const result = [];
        children.each((i, el) => {
          const wrapped = this._wrapCheerioElement($(el), $);
          if (wrapped) result.push(wrapped);
        });
        return result;
      },
    };
  }

  /**
   * Evaluate plugin source in the sandbox
   */
  _evaluatePlugin() {
    try {
      const script = new vm.Script(this.source);
      script.runInContext(this.context, { timeout: 5000 });

      // Top-level `const`/`let plugin` is not assigned to sandbox.plugin in vm (same as PluginValidator).
      const extractScript = new vm.Script(
        '(function(){ ' +
          'if (typeof plugin !== "undefined" && plugin !== null) return plugin; ' +
          'return null; ' +
          '})()',
      );
      const extractedPlugin = extractScript.runInContext(this.context, { timeout: 5000 });
      if (!extractedPlugin || typeof extractedPlugin !== 'object') {
        throw new Error('Plugin did not export a "plugin" object.');
      }
      this.sandbox.plugin = extractedPlugin;
      this.plugin = extractedPlugin;
    } catch (e) {
      throw new Error(`Failed to evaluate plugin: ${e.message}`);
    }
  }

  /**
   * Call a plugin function with timeout
   */
  async _callPluginFunction(funcName, args, timeout = 60000) {
    const func = this.plugin[funcName];
    if (typeof func !== 'function') {
      throw new Error(`Plugin does not implement ${funcName} function.`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Plugin function ${funcName} timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = func.apply(this.plugin, args);
        
        // Handle both sync and async functions
        if (result && typeof result.then === 'function') {
          result
            .then(value => {
              clearTimeout(timer);
              resolve(value);
            })
            .catch(err => {
              clearTimeout(timer);
              reject(err);
            });
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  /**
   * Check if this connector supports the given URL
   */
  supports(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.toLowerCase();
      
      return this.metadata.allowedDomains.some(domain => {
        const d = domain.toLowerCase();
        return host === d || host.endsWith(`.${d}`);
      });
    } catch {
      return false;
    }
  }

  /**
   * Load manga info and chapter list
   * Main entry point called by connector registry
   */
  async load(url, options = {}) {
    try {
      const result = await this._callPluginFunction('fetchManga', [url]);
      
      if (!result || typeof result !== 'object') {
        throw new Error('Plugin fetchManga must return an object.');
      }

      this.consecutiveErrors = 0;

      const coverUrl = result.coverUrl != null ? String(result.coverUrl).trim() : '';
      const author = result.author != null ? String(result.author).trim() : '';
      const rawDesc =
        result.description != null ? String(result.description).trim() : '';
      const description =
        rawDesc.length > 1000 ? rawDesc.slice(0, 1000) : rawDesc;

      return {
        ok: true,
        manga: {
          title: result.title || this.metadata.name,
          coverUrl,
          description,
          author,
          mangaUrl: url,
          mangaId: '',
          siteId: this.id,
          sourceLabel: this.label,
        },
        chapters: (result.chapters || []).map((ch, idx) => ({
          title: ch.title || `Chapter ${idx + 1}`,
          url: ch.url,
        })),
      };
    } catch (e) {
      this.consecutiveErrors++;
      logger.error(`[JsPluginConnector] Error in load for ${this.pluginId}:`, e);
      return {
        ok: false,
        error: e.message
      };
    }
  }

  /**
   * Fetch chapter images - called by BaseConnectorService.downloadChapter
   */
  async fetchChapterImages(chapterUrl, referer) {
    try {
      const imageUrls = await this._callPluginFunction('fetchChapterImages', [chapterUrl]);
      
      if (!Array.isArray(imageUrls)) {
        throw new Error('Plugin fetchChapterImages must return an array of image URLs.');
      }

      this.consecutiveErrors = 0;
      
      return imageUrls.map((url) => {
        const strUrl = String(url || '').trim();
        return {
          imageUrl: strUrl,
          ext: this._guessExt(strUrl),
        };
      });
    } catch (e) {
      this.consecutiveErrors++;
      logger.error(`[JsPluginConnector] Error in fetchChapterImages for ${this.pluginId}:`, e);
      throw e;
    }
  }

  _guessExt(url) {
    try {
      const u = new URL(url);
      const pathname = u.pathname || '';
      const m = pathname.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i);
      if (m) return m[1].toLowerCase();
    } catch (e) {}
    return 'jpg';
  }

  getReferer(payload) {
    return this.imageReferer || this.domain;
  }

  /**
   * Check if plugin supports latest updates
   */
  async supportsLatestUpdates() {
    return typeof this.plugin.fetchLatestUpdates === 'function';
  }

  /**
   * Fetch latest updates listing (same options shape as built-in connectors from main).
   */
  async fetchLatestUpdates(options = {}) {
    const opts = options != null && typeof options === 'object' ? options : {};
    const pageNum = Math.max(
      1,
      Math.floor(
        typeof options === 'number' && !Number.isNaN(options)
          ? Number(options)
          : Number(opts.page) || 1,
      ),
    );
    const searchQuery = String(opts.latestUpdatesSearch || opts.searchQuery || '').trim();
    try {
      let result;
      if (searchQuery && typeof this.plugin.searchManga === 'function') {
        result = await this._callPluginFunction('searchManga', [searchQuery, pageNum]);
      } else {
        result = await this._callPluginFunction('fetchLatestUpdates', [pageNum]);
      }
      this.consecutiveErrors = 0;
      return result;
    } catch (e) {
      this.consecutiveErrors++;
      logger.error(`[JsPluginConnector] Error in fetchLatestUpdates for ${this.pluginId}:`, e);
      return {
        ok: false,
        page: pageNum,
        totalPages: 1,
        items: [],
        error: e.message
      };
    }
  }

  /**
   * Check if plugin supports search
   */
  async supportsSearch() {
    return typeof this.plugin.searchManga === 'function';
  }

  /**
   * Search manga
   */
  async searchManga(query, page = 1) {
    try {
      const result = await this._callPluginFunction('searchManga', [query, page]);
      this.consecutiveErrors = 0;
      return result;
    } catch (e) {
      this.consecutiveErrors++;
      logger.error(`[JsPluginConnector] Error in searchManga for ${this.pluginId}:`, e);
      return {
        ok: false,
        page,
        totalPages: 1,
        items: [],
        error: e.message
      };
    }
  }

  /**
   * Dispose resources
   */
  async dispose() {
    // Clear sandbox
    this.sandbox = null;
    this.context = null;
    this.plugin = null;
    
    logger.info(`[JsPluginConnector] Disposed plugin: ${this.pluginId}`);
  }
}

module.exports = JsPluginConnector;
