'use strict';

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const MINIMAL_PLUGIN = `
const plugin = {
  id: 'test-delete-plugin',
  name: 'Test Delete Plugin',
  version: '1.0.0',
  author: 'test',
  description: 'test',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  async fetchManga() {
    return { ok: true, manga: { title: 'T', url: 'https://example.com/m' }, chapters: [] };
  },
  async fetchChapterImages() {
    return [];
  },
};
`;

describe('JsPluginManager delete registry', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'js-plugin-delete-'));
    jest.resetModules();
    jest.doMock('electron', () => ({
      app: { getPath: () => tmpDir },
      dialog: { showOpenDialog: jest.fn() },
    }));
  });

  afterEach(async () => {
    jest.dontMock('electron');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('deletePlugin persists denylist and skips reload from disk', async () => {
    const manager = require('../../plugins/JsPluginManager');
    await manager.initialize({});
    const pluginsDir = path.join(tmpDir, 'js_plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
    const filePath = path.join(pluginsDir, 'test-delete-plugin.js');
    await fs.writeFile(filePath, MINIMAL_PLUGIN, 'utf8');

    await manager.reloadAllPlugins();
    expect(manager.getInstalledPlugins().some((p) => p.metadata.id === 'test-delete-plugin')).toBe(true);

    await manager.deletePlugin('test-delete-plugin');
    expect(manager.getInstalledPlugins().some((p) => p.metadata.id === 'test-delete-plugin')).toBe(false);

    const registryRaw = await fs.readFile(path.join(pluginsDir, 'deleted_plugins.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.ids).toContain('test-delete-plugin');

    await fs.writeFile(filePath, MINIMAL_PLUGIN, 'utf8');
    await manager.reloadAllPlugins();
    expect(manager.getInstalledPlugins().some((p) => p.metadata.id === 'test-delete-plugin')).toBe(false);
  });

  test('re-import removes plugin id from denylist', async () => {
    const manager = require('../../plugins/JsPluginManager');
    await manager.initialize({});
    const pluginsDir = path.join(tmpDir, 'js_plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
    const filePath = path.join(pluginsDir, 'test-delete-plugin.js');
    await fs.writeFile(filePath, MINIMAL_PLUGIN, 'utf8');

    await manager.reloadAllPlugins();
    await manager.deletePlugin('test-delete-plugin');

    const result = await manager._importSource(MINIMAL_PLUGIN);
    expect(result.success).toBe(true);
    expect(manager.getInstalledPlugins().some((p) => p.metadata.id === 'test-delete-plugin')).toBe(true);

    const registryRaw = await fs.readFile(path.join(pluginsDir, 'deleted_plugins.json'), 'utf8');
    const registry = JSON.parse(registryRaw);
    expect(registry.ids).not.toContain('test-delete-plugin');
  });
});
