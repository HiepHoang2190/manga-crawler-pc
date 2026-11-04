const fs = require('fs');
const path = require('path');

const handlers = {};
const mockFetch = jest.fn();
const mockCreateProvider = jest.fn();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
    on: jest.fn(),
  },
  dialog: {},
  shell: {},
}));

jest.mock('../../translate/services/modelDiscoveryService', () => ({
  fetchAvailableModels: (...args) => mockFetch(...args),
}));

jest.mock('../../translate/providers/index', () => ({
  PROVIDER_INFO: {},
  createProvider: (...args) => mockCreateProvider(...args),
  formatProviderError: (err) => err?.message || String(err),
}));

describe('translate:fetchAvailableModels IPC & Preload Bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preload.js exposes translateFetchAvailableModels calling invoke(translate:fetchAvailableModels)', () => {
    const preloadPath = path.resolve(__dirname, '../../../../electron/preload.js');
    const preloadSrc = fs.readFileSync(preloadPath, 'utf8');

    expect(preloadSrc).toMatch(
      /translateFetchAvailableModels:\s*\(config\)\s*=>\s*ipcRenderer\.invoke\('translate:fetchAvailableModels',\s*config\)/
    );
  });

  test('ipc/translate.js registers translate:fetchAvailableModels and delegates to modelDiscoveryService', async () => {
    const { registerTranslateIpc } = require('../../../ipc/translate');
    registerTranslateIpc({});

    expect(handlers['translate:fetchAvailableModels']).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      success: true,
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    });

    const config = { id: 'gemini', credential: 'test-api-key' };
    const res = await handlers['translate:fetchAvailableModels']({}, config);

    expect(mockFetch).toHaveBeenCalledWith(config);
    expect(res).toEqual({
      success: true,
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    });
  });

  test('ipc/translate.js handles default empty config argument gracefully', async () => {
    const { registerTranslateIpc } = require('../../../ipc/translate');
    registerTranslateIpc({});

    mockFetch.mockResolvedValueOnce({
      success: true,
      models: [],
    });

    const res = await handlers['translate:fetchAvailableModels']({});
    expect(mockFetch).toHaveBeenCalledWith({});
    expect(res).toEqual({ success: true, models: [] });
  });

  test('translate:testProviderConnection prioritizes newly selected defaultModel over stale legacy model', async () => {
    const { registerTranslateIpc } = require('../../../ipc/translate');
    registerTranslateIpc({});

    expect(handlers['translate:testProviderConnection']).toBeDefined();

    const mockProviderInstance = {
      testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    };
    mockCreateProvider.mockReturnValueOnce(mockProviderInstance);

    const staleConfig = {
      id: 'gemini',
      type: 'gemini',
      credential: 'AQ.testKey',
      model: 'gemini-1.5-flash',       // Legacy stale model
      defaultModel: 'gemini-2.5-flash', // Newly selected model
    };

    const res = await handlers['translate:testProviderConnection']({}, staleConfig);

    expect(mockCreateProvider).toHaveBeenCalledWith(
      'gemini',
      expect.objectContaining({
        activeModel: 'gemini-2.5-flash',
        providers: {
          gemini: expect.objectContaining({
            defaultModel: 'gemini-2.5-flash',
            model: 'gemini-2.5-flash',
          }),
        },
      })
    );
    expect(res.success).toBe(true);
    expect(mockProviderInstance.testConnection).toHaveBeenCalled();
  });
});
