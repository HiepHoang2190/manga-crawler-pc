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

  ipcMain.handle('plugin:analyzeMangaPage', async (_event, { url }) => {
    return PluginAutoGenerator.analyzeMangaPage(url);
  });

  ipcMain.handle('plugin:analyzeChapterPage', async (_event, { chapterUrl, baseUrl }) => {
    return PluginAutoGenerator.analyzeChapterPage(chapterUrl, baseUrl);
  });

  ipcMain.handle('plugin:getSource', async (_event, { pluginId }) => {
    try {
      const source = await JsPluginManager.getPluginSource(pluginId);
      return { ok: true, source };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:generateSource', async (_event, { siteInfo, detected }) => {
    try {
      const source = PluginCodeGenerator.generate({ siteInfo, detected });
      return { ok: true, source };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('plugin:generateAndInstall', async (_event, { siteInfo, detected, customSource }) => {
    try {
      const source = customSource || PluginCodeGenerator.generate({ siteInfo, detected });

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
        // Plugin with same ID exists — auto-confirm replacement
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
