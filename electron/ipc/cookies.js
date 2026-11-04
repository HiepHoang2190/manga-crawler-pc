const { ipcMain } = require('electron');
const cookieManager = require('../lib/platform/cookies/cookieManager');
const { openLoginPopupAndGetCookies } = require('../lib/platform/cookies/cookieExtractor');

function registerCookiesIpc(ipc_context) {
  ipcMain.handle('cookie:set', (_event, payload) => {
    const siteId = payload?.siteId;
    const cookieValue = payload?.cookieValue;
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return { ok: false, error: 'siteId phải là string không rỗng.' };
    }
    if (typeof cookieValue !== 'string') {
      return { ok: false, error: 'cookieValue phải là string.' };
    }
    return cookieManager.set(siteId.trim(), cookieValue);
  });

  ipcMain.handle('cookie:delete', (_event, payload) => {
    const siteId = payload?.siteId;
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return { ok: false, error: 'siteId phải là string không rỗng.' };
    }
    return cookieManager.delete(siteId.trim());
  });

  ipcMain.handle('cookie:getStatus', () => {
    return cookieManager.getStatus();
  });

  ipcMain.handle('cookie:setSendEnabled', (_event, payload) => {
    const siteId = payload?.siteId;
    const enabled = payload?.enabled;
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return { ok: false, error: 'siteId phải là string không rỗng.' };
    }
    if (typeof enabled !== 'boolean') {
      return { ok: false, error: 'enabled phải là boolean.' };
    }
    return cookieManager.setCookieSendEnabled(siteId.trim(), enabled);
  });

  ipcMain.handle('cookie:extractCloudflare', async (_event, { targetUrl }) => {
    try {
      const result = await openLoginPopupAndGetCookies(targetUrl);
      const cookies = Array.isArray(result) ? result : result?.cookies || [];
      const loginDetected = Array.isArray(result) ? undefined : Boolean(result?.loginDetected);
      return { ok: true, cookies, loginDetected };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

module.exports = { registerCookiesIpc };
