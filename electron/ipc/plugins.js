const { ipcMain } = require('electron');
const connectors = require('../lib/platform/connectors');

function registerPluginsIpc(ipc_context) {
  // ── JS Plugin Management ───────────────────────────────────────────
  const JsPluginManager = require('../lib/plugins/JsPluginManager');

  ipcMain.handle('plugin:list', () => {
    return JsPluginManager.getInstalledPlugins();
  });

  ipcMain.handle('plugin:importFromFile', async () => {
    return JsPluginManager.importFromFile();
  });

  ipcMain.handle('plugin:importFromUrl', async (_event, { url }) => {
    return JsPluginManager.importFromUrl(url);
  });

  ipcMain.handle('plugin:confirmReplacement', async (_event, { pluginId }) => {
    return JsPluginManager.confirmPendingReplacement(pluginId);
  });

  ipcMain.handle('plugin:enable', async (_event, { pluginId }) => {
    await JsPluginManager.enablePlugin(pluginId);
    return { ok: true };
  });

  ipcMain.handle('plugin:disable', async (_event, { pluginId }) => {
    await JsPluginManager.disablePlugin(pluginId);
    return { ok: true };
  });

  ipcMain.handle('plugin:delete', async (_event, { pluginId }) => {
    await JsPluginManager.deletePlugin(pluginId);
    return { ok: true };
  });

  ipcMain.handle('plugin:update', async (_event, { pluginId, source, sourceUrl }) => {
    return JsPluginManager.updatePlugin(pluginId, source, sourceUrl);
  });

  ipcMain.handle('plugin:exportAll', async () => {
    try {
      const zipPath = await JsPluginManager.exportAllPlugins();
      return { ok: true, zipPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:restoreFromBackup', async (_event, { zipPath }) => {
    try {
      const errors = await JsPluginManager.restoreFromBackup(zipPath);
      return { ok: true, errors };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Plugin Auto-Generator ──────────────────────────────────────────
  const PluginAutoGenerator = require('../lib/plugins/PluginAutoGenerator');
  const PluginCodeGenerator = require('../lib/plugins/PluginCodeGenerator');

  ipcMain.handle('plugin:analyzeMangaPage', async (event, payload = {}) => {
    const runId = typeof payload?.runId === 'string' ? payload.runId : null;
    return PluginAutoGenerator.analyzeMangaPage(payload?.url, {
      cookie: payload?.cookie,
      skipLatestProbe: Boolean(payload?.skipLatestProbe),
      onProgress: (ev) => {
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('plugin:analyzeProgress', { runId, ...ev });
        }
      },
    });
  });

  ipcMain.handle('plugin:analyzeChapterPage', async (event, payload = {}) => {
    const runId = typeof payload?.runId === 'string' ? payload.runId : null;
    return PluginAutoGenerator.analyzeChapterPage(payload?.chapterUrl, payload?.baseUrl, {
      cookie: payload?.cookie,
      onProgress: (ev) => {
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('plugin:analyzeProgress', { runId, ...ev });
        }
      },
    });
  });

  ipcMain.handle('plugin:getSource', async (_event, { pluginId }) => {
    try {
      const source = await JsPluginManager.getPluginSource(pluginId);
      return { ok: true, source };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:generateSource', async (_event, payload = {}) => {
    try {
      const source = PluginCodeGenerator.generate({
        siteInfo: payload?.siteInfo,
        detected: payload?.detected,
        includeLatestUpdates: payload?.includeLatestUpdates !== false,
      });
      return { ok: true, source };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:testGeneratedSource', async (_event, payload = {}) => {
    try {
      return await PluginAutoGenerator.testGeneratedPlugin({
        source: payload?.source,
        mangaUrl: payload?.mangaUrl,
        chapterUrl: payload?.chapterUrl,
        testLatest: payload?.testLatest !== false,
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:generateAndInstall', async (_event, payload = {}) => {
    try {
      const source =
        payload?.customSource ||
        PluginCodeGenerator.generate({
          siteInfo: payload?.siteInfo,
          detected: payload?.detected,
          includeLatestUpdates: payload?.includeLatestUpdates !== false,
        });

      // Validate generated code
      const PluginValidator = require('../lib/plugins/PluginValidator');
      const validator = new PluginValidator();
      const validation = validator.validate(source);

      if (!validation.isValid) {
        return { ok: false, error: `Validation failed: ${validation.errorMessage}` };
      }

      // Import the generated plugin
      const result = await JsPluginManager._importSource(source);
      if (result.success) {
        return { ok: true, metadata: result.metadata, source };
      } else if (result.requiresConfirmation) {
        if (payload?.confirmOverwrite === false) {
          return {
            ok: false,
            requiresConfirmation: true,
            existingMetadata: result.metadata,
            source,
          };
        }
        // Plugin with same ID exists — confirmed replacement
        const confirmResult = await JsPluginManager.confirmPendingReplacement(result.metadata.id);
        return { ok: confirmResult.success, metadata: result.metadata, source, wasReplacement: true };
      } else {
        return { ok: false, error: result.errorMessage };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Initialize plugin manager with connector registry
  JsPluginManager.initialize(connectors).catch(err => {
    console.error('[Main] Failed to initialize plugin manager:', err);
  });
}

module.exports = { registerPluginsIpc };
