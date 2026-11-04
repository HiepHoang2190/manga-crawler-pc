const { ipcMain } = require('electron');
const { WorkflowEngine } = require('../lib/workflow/workflowEngine');
const { createAdapters } = require('../lib/workflow/adapters');

let workflowEngine = null;

function getWorkflowEngine(ipc_context) {
  if (!workflowEngine) {
    const adapters = createAdapters({ connectors: ipc_context?.connectors, ipc_context });
    workflowEngine = new WorkflowEngine({ adapters });
  }
  return workflowEngine;
}

function registerWorkflowIpc(ipc_context) {
  ipcMain.handle('workflow:run', async (event, { runId, graph }) => {
    try {
      const engine = getWorkflowEngine(ipc_context);
      const actualRunId = runId || `run_${Date.now()}`;

      // Run asynchronously so handle returns immediately with runId
      engine.run(actualRunId, graph, (evt) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('workflow:event', evt);
        }
      }).catch((err) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('workflow:event', {
            runId: actualRunId,
            event: 'run_error',
            error: err.message || String(err),
          });
        }
      });

      return { ok: true, runId: actualRunId };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('workflow:resume', async (event, { runId, graph, fromNodeId }) => {
    try {
      const engine = getWorkflowEngine(ipc_context);
      if (!runId || !fromNodeId) {
        return { ok: false, error: 'Thiếu runId hoặc fromNodeId' };
      }

      engine.resume(runId, graph, fromNodeId, (evt) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('workflow:event', evt);
        }
      }).catch((err) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('workflow:event', {
            runId,
            event: 'run_error',
            error: err.message || String(err),
          });
        }
      });

      return { ok: true, runId };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('workflow:stop', async (_event, { runId } = {}) => {
    try {
      const engine = getWorkflowEngine(ipc_context);
      const stopped = engine.stop(runId);
      return { ok: true, stopped };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('workflow:getRun', async (_event, { runId }) => {
    try {
      const engine = getWorkflowEngine(ipc_context);
      const run = engine.getRun(runId);
      return { ok: true, run };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('workflow:detectGoogleDrive', async () => {
    try {
      const { detectGoogleDriveLocalPath } = require('../lib/workflow/adapters');
      const detectedPath = detectGoogleDriveLocalPath();
      return { ok: true, detectedPath };
    } catch (err) {
      return { ok: false, error: err.message, detectedPath: null };
    }
  });

  ipcMain.handle('workflow:testGoogleDriveToken', async (_event, { accessToken }) => {
    try {
      const token = (accessToken || '').trim().replace(/^Bearer\s+/i, '');
      if (!token) {
        return { ok: false, error: 'Access token trống' };
      }
      const https = require('https');
      return new Promise((resolve) => {
        const req = https.request(
          'https://www.googleapis.com/drive/v3/about?fields=user',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) manga-crawler/3.0.44',
            },
            timeout: 10000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (res.statusCode >= 200 && res.statusCode < 300 && parsed.user) {
                  resolve({
                    ok: true,
                    displayName: parsed.user.displayName,
                    emailAddress: parsed.user.emailAddress,
                    photoLink: parsed.user.photoLink,
                  });
                } else {
                  const errMsg =
                    parsed.error?.message ||
                    `HTTP ${res.statusCode}: Token không hợp lệ hoặc đã hết hạn`;
                  resolve({ ok: false, error: errMsg });
                }
              } catch (e) {
                resolve({
                  ok: false,
                  error: `Phản hồi không hợp lệ từ Google API (HTTP ${res.statusCode})`,
                });
              }
            });
          }
        );
        req.on('error', (err) =>
          resolve({ ok: false, error: err.message || 'Lỗi mạng khi kết nối Google API' })
        );
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, error: 'Hết thời gian chờ phản hồi từ Google API (10s)' });
        });
        req.end();
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerWorkflowIpc };
