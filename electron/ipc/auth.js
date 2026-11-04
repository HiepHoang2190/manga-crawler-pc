const { app, ipcMain, shell } = require('electron');
const googleAuth = require('../lib/auth/googleAuthService');
const supabaseGuestCredits = require('../lib/auth/supabaseGuestCredits');

function registerAuthIpc(ipc_context) {
  ipcMain.handle('auth:getSession', async () =>
    googleAuth.getSessionEnriched(app.getPath('userData'))
  );

  ipcMain.handle('auth:loginGoogle', async () => {
    return googleAuth.loginWithGoogle(shell, {
      userDataPath: app.getPath('userData'),
      clearOAuth: false,
    });
  });

  ipcMain.handle('auth:logout', () => googleAuth.logout(app.getPath('userData')));

  ipcMain.handle('trial:ensureFreeUserCreditsByEmail', async (_event, payload) => {
    const session = await googleAuth.getSessionEnriched(app.getPath('userData'));
    return supabaseGuestCredits.ensureFreeUserCreditsByEmail({
      email: session?.email || payload?.email,
      userType: session?.userType,
      entitlements: session?.entitlements,
      isAdmin: session?.isAdmin,
      impliedSupabaseFree: session?.impliedSupabaseFree,
      accessToken: session?.accessToken,
    });
  });

  ipcMain.handle('trial:consumeFreeUserDownloadCredit', async (_event, payload) => {
    const session = await googleAuth.getSessionEnriched(app.getPath('userData'));
    return supabaseGuestCredits.consumeFreeUserDownloadCredit({
      email: session?.email || payload?.email,
      userType: session?.userType,
      entitlements: session?.entitlements,
      isAdmin: session?.isAdmin,
      impliedSupabaseFree: session?.impliedSupabaseFree,
      accessToken: session?.accessToken,
      mangaUrl: payload?.mangaUrl,
      chapterUrl: payload?.chapterUrl,
    });
  });
}

module.exports = { registerAuthIpc };
