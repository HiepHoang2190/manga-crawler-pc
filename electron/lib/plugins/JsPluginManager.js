/**
 * JsPluginManager - Manages JavaScript-based manga plugins
 * 
 * Handles plugin lifecycle: import, validation, storage, enable/disable, and registry integration.
 * 
 * Features:
 * - Import plugins from file or URL
 * - Validate plugin structure and metadata
 * - Enable/disable plugins (multiple can be enabled; same-URL overlap uses first matching plugin)
 * - Auto-disable after consecutive errors
 * - Export/import plugin backups
 * - Track usage statistics
 */

const fs = require('fs').promises;
const path = require('path');
const { app, dialog } = require('electron');
const https = require('https');
const AdmZip = require('adm-zip');
const logger = require('../shared/logger');
const PluginValidator = require('./PluginValidator');
const JsPluginConnector = require('./JsPluginConnector');

class JsPluginManager {
  constructor() {
    this._plugins = new Map(); // pluginId -> JsPluginInfo
    this._connectors = new Map(); // pluginId -> JsPluginConnector
    this._pendingReplacements = new Map(); // pluginId -> { source, sourceUrl }
    this._registry = null;
    this._initialized = false;
    this._autoDisableThreshold = 5;
    this._pluginsDirName = 'js_plugins';
    this._pluginMetaSuffix = '.plugin-meta.json';
    /** Persisted denylist — prevents bundled / orphan plugins from reappearing after delete. */
    this._deletedRegistryFileName = 'deleted_plugins.json';
    this._deletedPluginIds = new Set();
  }

  async _loadDeletedPluginRegistry(pluginsDir) {
    try {
      const raw = await fs.readFile(path.join(pluginsDir, this._deletedRegistryFileName), 'utf8');
      const parsed = JSON.parse(raw);
      const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
      this._deletedPluginIds = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
    } catch {
      this._deletedPluginIds = new Set();
    }
  }

  async _persistDeletedPluginRegistry(pluginsDir) {
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
      const payload = {
        updatedAt: new Date().toISOString(),
        ids: [...this._deletedPluginIds].sort(),
      };
      await fs.writeFile(
        path.join(pluginsDir, this._deletedRegistryFileName),
        JSON.stringify(payload, null, 2),
        'utf8',
      );
    } catch (e) {
      logger.warn('[JsPluginManager] Failed to persist deleted plugin registry:', e);
    }
  }

  _isPluginDeleted(pluginId) {
    const id = String(pluginId || '').trim();
    return id ? this._deletedPluginIds.has(id) : false;
  }

  async _markPluginDeleted(pluginId) {
    const id = String(pluginId || '').trim();
    if (!id) return;
    this._deletedPluginIds.add(id);
    const pluginsDir = await this._getPluginsDirectory();
    await this._persistDeletedPluginRegistry(pluginsDir);
  }

  async _unmarkPluginDeleted(pluginId) {
    const id = String(pluginId || '').trim();
    if (!id || !this._deletedPluginIds.has(id)) return;
    this._deletedPluginIds.delete(id);
    const pluginsDir = await this._getPluginsDirectory();
    await this._persistDeletedPluginRegistry(pluginsDir);
  }

  /** Sidecar JSON next to each `.js` — persists sourceUrl, flags, stats (parity with mobile prefs). */
  _pluginSidecarPath(pluginsDir, pluginId) {
    return path.join(pluginsDir, `${pluginId}${this._pluginMetaSuffix}`);
  }

  _defaultStats() {
    return { loadCount: 0, errorCount: 0, averageExecutionMs: 0 };
  }

  _mergeStatsFromPersisted(raw) {
    const base = this._defaultStats();
    if (!raw || typeof raw !== 'object') return base;
    return {
      loadCount: Math.max(0, Math.floor(Number(raw.loadCount) || 0)),
      errorCount: Math.max(0, Math.floor(Number(raw.errorCount) || 0)),
      averageExecutionMs: Math.max(0, Number(raw.averageExecutionMs) || 0),
      ...(raw.lastErrorAt ? { lastErrorAt: raw.lastErrorAt } : {}),
      ...(raw.lastErrorMessage ? { lastErrorMessage: raw.lastErrorMessage } : {}),
    };
  }

  /**
   * Initialize the manager: scan plugins directory and register enabled plugins
   * @param {Object} registry - MobileConnectorRegistry instance
   */
  async initialize(registry) {
    if (this._initialized) return;
    
    this._registry = registry;
    this._initialized = true;
    
    await this._reloadPluginsFromDisk();
  }

  /**
   * Reload all plugins from disk
   */
  async reloadAllPlugins() {
    if (!this._registry) return;
    
    // Clear existing plugins and connectors
    this._plugins.clear();
    for (const connector of this._connectors.values()) {
      try {
        await connector.dispose();
      } catch (e) {
        logger.error('[JsPluginManager] Error disposing connector:', e);
      }
    }
    this._connectors.clear();
    
    await this._reloadPluginsFromDisk();
  }

  /**
   * Internal: scan plugins directory and load all plugins
   */
  async _reloadPluginsFromDisk() {
    const pluginsDir = await this._getPluginsDirectory();
    
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
    } catch (e) {
      logger.error('[JsPluginManager] Failed to create plugins directory:', e);
      return;
    }

    await this._loadDeletedPluginRegistry(pluginsDir);

    let files;
    try {
      files = await fs.readdir(pluginsDir);
    } catch (e) {
      logger.error('[JsPluginManager] Failed to read plugins directory:', e);
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      
      const filePath = path.join(pluginsDir, file);
      try {
        await this._loadPluginFromFile(filePath);
      } catch (e) {
        logger.error(`[JsPluginManager] Failed to load ${filePath}:`, e);
      }
    }
  }

  /**
   * Import plugin from file picker
   * @returns {Promise<Object>} Import result
   */
  async importFromFile() {
    const result = await dialog.showOpenDialog({
      title: 'Import Plugin',
      filters: [
        { name: 'JavaScript Plugin', extensions: ['js'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, errorMessage: 'No file selected.' };
    }

    const filePath = result.filePaths[0];
    const source = await fs.readFile(filePath, 'utf8');
    return this._importSource(source);
  }

  /**
   * Import plugin from URL (HTTPS only)
   * @param {string} url - Plugin URL
   * @returns {Promise<Object>} Import result
   */
  async importFromUrl(url) {
    const trimmedUrl = this._resolveRawUrl(url.trim());
    
    if (!trimmedUrl.startsWith('https://')) {
      return {
        success: false,
        errorMessage: 'Chỉ hỗ trợ URL HTTPS. Ví dụ: https://gist.githubusercontent.com/.../raw'
      };
    }

    try {
      const source = await this._downloadFile(trimmedUrl);
      
      // Check if it's HTML instead of JS
      if (source.trim().startsWith('<')) {
        return {
          success: false,
          errorMessage: 'URL trả về trang HTML thay vì file JS.\nDùng URL raw, ví dụ:\n• Gist: gist.githubusercontent.com/.../raw\n• GitHub: raw.githubusercontent.com/...'
        };
      }

      // Quick sanity check
      if (!source.includes('plugin')) {
        return {
          success: false,
          errorMessage: 'Nội dung tải về không phải file JS plugin hợp lệ.\nFile phải chứa object "plugin" ở cấp cao nhất.'
        };
      }

      return this._importSource(source, trimmedUrl);
    } catch (e) {
      return {
        success: false,
        errorMessage: `Lỗi khi tải plugin: ${e.message}`
      };
    }
  }

  /**
   * Download file from HTTPS URL
   */
  _downloadFile(url) {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'Accept': 'application/javascript, text/javascript, text/plain, */*',
          'User-Agent': 'MangaCrawlerApp/1.0'
        }
      }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: Không tải được file plugin.`));
          return;
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          reject(new Error('URL trả về trang HTML thay vì file JS.'));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  /**
   * Convert common hosting URLs to raw equivalents
   */
  _resolveRawUrl(url) {
    // GitHub Gist page → raw
    if (url.includes('gist.github.com/') && !url.includes('gist.githubusercontent.com')) {
      const raw = url.replace('gist.github.com/', 'gist.githubusercontent.com/');
      if (!raw.includes('/raw')) {
        return raw.endsWith('/') ? `${raw}raw` : `${raw}/raw`;
      }
      return raw;
    }

    // GitHub repo blob → raw
    if (url.includes('github.com/') && url.includes('/blob/') && !url.includes('raw.githubusercontent.com')) {
      return url
        .replace('github.com/', 'raw.githubusercontent.com/')
        .replace('/blob/', '/');
    }

    return url;
  }

  /**
   * Validate and import plugin source
   */
  async _importSource(source, sourceUrl = null) {
    const validator = new PluginValidator();
    const validation = validator.validate(source);
    
    if (!validation.isValid) {
      return {
        success: false,
        errorMessage: validation.errorMessage || 'Validation failed.'
      };
    }

    const metadata = validation.metadata;

    // Check for duplicate ID
    if (this._plugins.has(metadata.id)) {
      this._pendingReplacements.set(metadata.id, { source, sourceUrl });
      return {
        success: false,
        requiresConfirmation: true,
        metadata
      };
    }

    // Store and register
    await this._storeAndRegister(source, metadata, sourceUrl, false);
    return {
      success: true,
      metadata
    };
  }

  /**
   * Confirm pending replacement
   */
  async confirmPendingReplacement(pluginId) {
    const pending = this._pendingReplacements.get(pluginId);
    if (!pending) {
      return {
        success: false,
        errorMessage: 'Không tìm thấy plugin chờ thay thế. Vui lòng import lại file.'
      };
    }

    const result = await this.updatePlugin(pluginId, pending.source, pending.sourceUrl);
    this._pendingReplacements.delete(pluginId);
    return result;
  }

  /**
   * Enable plugin (other plugins stay as-is — multiple plugins may be enabled together)
   */
  async enablePlugin(pluginId) {
    const info = this._plugins.get(pluginId);
    if (!info) return;

    const updated = {
      ...info,
      isEnabled: true,
      autoDisabled: false,
      errorCount: 0
    };
    this._plugins.set(pluginId, updated);
    await this._persistInfo(updated);

    // Create connector and register
    await this._createAndRegisterConnector(pluginId, updated);
    
    logger.info(`[JsPluginManager] Enabled plugin: ${pluginId}`);
  }

  /**
   * Disable plugin
   */
  async disablePlugin(pluginId, autoDisabled = false) {
    const info = this._plugins.get(pluginId);
    if (!info) return;

    const updated = {
      ...info,
      isEnabled: false,
      autoDisabled
    };
    this._plugins.set(pluginId, updated);
    await this._persistInfo(updated);

    // Unregister and dispose (registry may omit hooks in older builds)
    if (this._registry && typeof this._registry.unregisterJsPlugin === 'function') {
      this._registry.unregisterJsPlugin(pluginId);
    }
    
    const connector = this._connectors.get(pluginId);
    if (connector) {
      try {
        await connector.dispose();
        this._connectors.delete(pluginId);
        logger.info(`[JsPluginManager] Successfully disposed plugin: ${pluginId}`);
        
        // Add delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        logger.error(`[JsPluginManager] Error disposing plugin ${pluginId}:`, e);
      }
    }
  }

  /**
   * Delete plugin
   */
  async deletePlugin(pluginId) {
    const id = String(pluginId || '').trim();
    if (!id) return;

    this._pendingReplacements.delete(id);
    await this.disablePlugin(id);

    const info = this._plugins.get(id);
    const pluginsDir = await this._getPluginsDirectory();

    // Persist denylist first so reload/restart cannot restore bundled/orphan files.
    await this._markPluginDeleted(id);

    if (info) {
      try {
        await fs.unlink(info.filePath);
      } catch (e) {
        logger.warn(`[JsPluginManager] Failed to delete plugin file ${info.filePath}:`, e);
      }

      try {
        await fs.unlink(this._pluginSidecarPath(pluginsDir, id));
      } catch (_) {
        /* sidecar may be missing */
      }

      this._plugins.delete(id);
    } else {
      // Orphan on disk (e.g. partial delete) — remove by convention if present.
      try {
        await fs.unlink(path.join(pluginsDir, `${id}.js`));
      } catch (_) {
        /* ignore */
      }
      try {
        await fs.unlink(this._pluginSidecarPath(pluginsDir, id));
      } catch (_) {
        /* ignore */
      }
    }

    this._connectors.delete(id);
    logger.info(`[JsPluginManager] Deleted plugin: ${id}`);
  }

  /**
   * Update plugin with new source
   */
  async updatePlugin(pluginId, newSource, sourceUrl = null) {
    const validator = new PluginValidator();
    const validation = validator.validate(newSource);
    
    if (!validation.isValid) {
      return {
        success: false,
        errorMessage: validation.errorMessage || 'Validation failed.'
      };
    }

    const metadata = validation.metadata;
    
    // Preserve sourceUrl from old plugin if not provided
    const oldInfo = this._plugins.get(pluginId);
    const finalSourceUrl = sourceUrl || (oldInfo ? oldInfo.sourceUrl : null);

    // Disable old connector
    await this.disablePlugin(pluginId);

    // Store and register new version
    await this._storeAndRegister(newSource, metadata, finalSourceUrl, true);
    return {
      success: true,
      metadata,
      wasReplacement: true
    };
  }

  /**
   * Record successful plugin execution
   */
  async recordSuccess(pluginId, executionMs) {
    const info = this._plugins.get(pluginId);
    if (!info) return;

    const oldStats = info.stats || { loadCount: 0, errorCount: 0, averageExecutionMs: 0 };
    const newLoadCount = oldStats.loadCount + 1;
    const newAvg = newLoadCount === 1
      ? executionMs
      : (oldStats.averageExecutionMs * (newLoadCount - 1) + executionMs) / newLoadCount;

    const updated = {
      ...info,
      errorCount: 0,
      lastUsedAt: new Date().toISOString(),
      stats: {
        ...oldStats,
        loadCount: newLoadCount,
        averageExecutionMs: newAvg
      }
    };
    this._plugins.set(pluginId, updated);
    await this._persistInfo(updated);
  }

  /**
   * Record failed plugin execution (auto-disable after threshold)
   */
  async recordFailure(pluginId, errorMessage) {
    const info = this._plugins.get(pluginId);
    if (!info) return;

    const newErrorCount = (info.errorCount || 0) + 1;
    const oldStats = info.stats || { loadCount: 0, errorCount: 0, averageExecutionMs: 0 };
    
    const updated = {
      ...info,
      errorCount: newErrorCount,
      stats: {
        ...oldStats,
        errorCount: oldStats.errorCount + 1,
        lastErrorAt: new Date().toISOString(),
        lastErrorMessage: errorMessage
      }
    };
    this._plugins.set(pluginId, updated);
    await this._persistInfo(updated);

    if (newErrorCount >= this._autoDisableThreshold) {
      await this.disablePlugin(pluginId, true);
      logger.warn(`[JsPluginManager] Plugin "${info.metadata.name}" was disabled after ${newErrorCount} consecutive errors: ${errorMessage}`);
    }
  }

  /**
   * Get JS source code of an installed plugin (to view/copy/edit)
   */
  async getPluginSource(pluginId) {
    const info = this._plugins.get(pluginId);
    if (!info || !info.filePath) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    return fs.readFile(info.filePath, 'utf8');
  }

  /**
   * Export all plugins to ZIP
   */
  async exportAllPlugins() {
    const zip = new AdmZip();
    
    // Add each .js file
    for (const info of this._plugins.values()) {
      try {
        const source = await fs.readFile(info.filePath, 'utf8');
        zip.addFile(path.basename(info.filePath), Buffer.from(source, 'utf8'));
      } catch (e) {
        logger.warn(`[JsPluginManager] Failed to add ${info.filePath} to backup:`, e);
      }
    }

    // Add manifest
    const manifest = {
      exportedAt: new Date().toISOString(),
      plugins: Array.from(this._plugins.values())
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

    // Save to temp directory
    const tempDir = app.getPath('temp');
    const zipPath = path.join(tempDir, 'js_plugins_backup.zip');
    zip.writeZip(zipPath);
    
    return zipPath;
  }

  /**
   * Restore plugins from ZIP backup
   */
  async restoreFromBackup(zipPath) {
    const errors = [];
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (!entry.entryName.endsWith('.js')) continue;
      
      const source = entry.getData().toString('utf8');
      const result = await this._importSource(source);
      
      if (!result.success && !result.requiresConfirmation) {
        errors.push(`${entry.entryName}: ${result.errorMessage}`);
      }
    }
    
    return errors;
  }

  /**
   * Get all installed plugins
   */
  getInstalledPlugins() {
    return Array.from(this._plugins.values());
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId) {
    return this._plugins.get(pluginId);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginId) {
    const info = this._plugins.get(pluginId);
    return info ? info.isEnabled : false;
  }

  /**
   * Internal: load plugin from file
   */
  async _loadPluginFromFile(filePath) {
    const source = await fs.readFile(filePath, 'utf8');

    const validator = new PluginValidator();
    const validation = validator.validate(source);

    if (!validation.isValid) {
      logger.warn(`[JsPluginManager] Skipping invalid plugin ${filePath}: ${validation.errorMessage}`);
      return;
    }

    const id = validation.metadata.id;
    const pluginsDir = await this._getPluginsDirectory();
    if (this._isPluginDeleted(id)) {
      try {
        await fs.unlink(filePath);
      } catch (_) {
        /* ignore */
      }
      try {
        await fs.unlink(this._pluginSidecarPath(pluginsDir, id));
      } catch (_) {
        /* ignore */
      }
      logger.info(`[JsPluginManager] Skipping deleted plugin on disk: ${id}`);
      return;
    }

    const sidecarPath = this._pluginSidecarPath(pluginsDir, id);

    let persisted = null;
    try {
      const rawMeta = await fs.readFile(sidecarPath, 'utf8');
      persisted = JSON.parse(rawMeta);
    } catch (_) {
      /* no sidecar or invalid JSON */
    }

    if (
      persisted &&
      persisted.metadata &&
      String(persisted.metadata.id || '') !== String(id)
    ) {
      persisted = null;
    }

    const info = {
      metadata: validation.metadata,
      filePath,
      isEnabled:
        persisted && typeof persisted.isEnabled === 'boolean' ? persisted.isEnabled : true,
      installedAt:
        typeof persisted?.installedAt === 'string' && persisted.installedAt.trim()
          ? persisted.installedAt
          : new Date().toISOString(),
      sourceUrl:
        persisted && typeof persisted.sourceUrl === 'string' && persisted.sourceUrl.trim()
          ? persisted.sourceUrl.trim()
          : null,
      errorCount:
        persisted && Number.isFinite(Number(persisted.errorCount))
          ? Math.max(0, Math.floor(Number(persisted.errorCount)))
          : 0,
      autoDisabled: Boolean(persisted?.autoDisabled),
      stats: this._mergeStatsFromPersisted(persisted?.stats),
      ...(typeof persisted?.lastUsedAt === 'string' && persisted.lastUsedAt.trim()
        ? { lastUsedAt: persisted.lastUsedAt.trim() }
        : {}),
    };

    this._plugins.set(id, info);
    await this._persistInfo(info);

    if (info.isEnabled && !info.autoDisabled) {
      await this._createAndRegisterConnector(id, info);
    }
  }

  /**
   * Internal: store and register plugin
   */
  async _storeAndRegister(source, metadata, sourceUrl, wasReplacement) {
    const pluginsDir = await this._getPluginsDirectory();
    const filePath = path.join(pluginsDir, `${metadata.id}.js`);
    await fs.writeFile(filePath, source, 'utf8');

    const previous = wasReplacement ? this._plugins.get(metadata.id) : null;

    const info = {
      metadata,
      filePath,
      isEnabled: true,
      installedAt: wasReplacement && previous?.installedAt ? previous.installedAt : new Date().toISOString(),
      sourceUrl,
      errorCount: 0,
      autoDisabled: false,
      stats: { loadCount: 0, errorCount: 0, averageExecutionMs: 0 },
    };

    this._plugins.set(metadata.id, info);
    await this._unmarkPluginDeleted(metadata.id);
    await this._persistInfo(info);

    await this._createAndRegisterConnector(metadata.id, info);
  }

  /**
   * Internal: create and register connector
   */
  async _createAndRegisterConnector(pluginId, info) {
    if (!this._registry) return;

    try {
      const source = await fs.readFile(info.filePath, 'utf8');
      
      const connector = new JsPluginConnector({
        metadata: info.metadata,
        source,
        pluginId
      });

      this._connectors.set(pluginId, connector);
      if (typeof this._registry.registerJsPlugin === 'function') {
        await this._registry.registerJsPlugin(connector);
      }

      logger.info(`[JsPluginManager] Registered plugin: ${pluginId}`);
    } catch (e) {
      logger.error(`[JsPluginManager] Failed to create connector for ${pluginId}:`, e);
    }
  }

  /**
   * Persist plugin sidecar JSON (sourceUrl, enabled, stats) — mirrors mobile SharedPreferences persistence.
   */
  async _persistInfo(info) {
    try {
      const pluginsDir = await this._getPluginsDirectory();
      await fs.mkdir(pluginsDir, { recursive: true });
      const pluginId = info.metadata.id;
      const sidecarPath = this._pluginSidecarPath(pluginsDir, pluginId);
      const payload = {
        metadata: info.metadata,
        filePath: info.filePath,
        isEnabled: Boolean(info.isEnabled),
        installedAt: info.installedAt || new Date().toISOString(),
        sourceUrl: info.sourceUrl && String(info.sourceUrl).trim() ? String(info.sourceUrl).trim() : null,
        errorCount: Math.max(0, Math.floor(Number(info.errorCount) || 0)),
        autoDisabled: Boolean(info.autoDisabled),
        stats: info.stats && typeof info.stats === 'object' ? info.stats : this._defaultStats(),
        ...(info.lastUsedAt ? { lastUsedAt: info.lastUsedAt } : {}),
      };
      await fs.writeFile(sidecarPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      logger.warn('[JsPluginManager] Failed to persist plugin meta:', e);
    }
  }

  /**
   * Internal: get plugins directory
   */
  async _getPluginsDirectory() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, this._pluginsDirName);
  }
}

// Singleton instance
const instance = new JsPluginManager();

module.exports = instance;
