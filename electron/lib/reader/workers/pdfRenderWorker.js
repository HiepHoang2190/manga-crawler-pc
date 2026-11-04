'use strict';

/**
 * PDF rendering worker — runs pdfjs + @napi-rs/canvas in a worker_threads
 * thread so the Electron main process event loop stays free.
 *
 * Protocol (parentPort messages):
 *   Main → Worker:
 *     { id, type: 'openSession',  sessionId, pdfPath, scale }
 *     { id, type: 'renderPage',   sessionId, pageIndex }
 *     { id, type: 'closeSession', sessionId }
 *     { id, type: 'closeAll' }
 *
 *   Worker → Main:
 *     { id, ok: true,  numPages }                 (openSession success)
 *     { id, ok: true,  buffer: Buffer }           (renderPage success)
 *     { id, ok: true }                            (closeSession / closeAll)
 *     { id, ok: false, error: string }            (any failure)
 */

const { parentPort } = require('worker_threads');
const { pathToFileURL } = require('url');
const fs = require('fs');

/** sessionId → { pdfDoc, scale } */
const SESSIONS = new Map();

let pdfjsPromise = null;

async function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // In this worker thread pdfjs still uses fake-worker (isNodeJS=true), but
    // that's fine — the fake-worker runs inside this worker thread, not the
    // Electron main thread.
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    return mod;
  })();
  return pdfjsPromise;
}

// Serial chain: one task at a time to avoid concurrent writes to the same pdfDoc.
let chain = Promise.resolve();

parentPort.on('message', (task) => {
  chain = chain.then(() => handleTask(task)).catch(() => {});
});

async function handleTask(task) {
  const { id, type } = task;
  try {
    if (type === 'openSession') {
      await handleOpenSession(id, task);
    } else if (type === 'renderPage') {
      await handleRenderPage(id, task);
    } else if (type === 'closeSession') {
      handleCloseSession(id, task);
    } else if (type === 'closeAll') {
      handleCloseAll(id);
    } else {
      parentPort.postMessage({ id, ok: false, error: `Unknown task type: ${type}` });
    }
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
}

async function handleOpenSession(id, task) {
  const { sessionId, pdfPath, scale } = task;
  const pdfjsLib = await loadPdfjs();

  let data;
  try {
    data = await fs.promises.readFile(pdfPath);
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: String(e?.message || e) });
    return;
  }

  let pdfDoc;
  try {
    pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (
      msg.includes('password') ||
      msg.includes('encrypted') ||
      msg.includes('passwordexception') ||
      msg.includes('no password given')
    ) {
      parentPort.postMessage({ id, ok: false, error: 'PDF có mật khẩu, không đọc được.' });
      return;
    }
    parentPort.postMessage({ id, ok: false, error: String(e?.message || e) || 'Không mở được PDF.' });
    return;
  }

  const numPages = Number(pdfDoc.numPages) || 0;
  if (numPages <= 0) {
    try { await pdfDoc.destroy(); } catch { /* */ }
    parentPort.postMessage({ id, ok: false, error: 'PDF không có trang nào.' });
    return;
  }

  SESSIONS.set(sessionId, { pdfDoc, scale: Number(scale) || 1.5 });
  parentPort.postMessage({ id, ok: true, numPages });
}

async function handleRenderPage(id, task) {
  const { sessionId, pageIndex } = task;
  const session = SESSIONS.get(sessionId);
  if (!session) {
    parentPort.postMessage({ id, ok: false, error: 'Session không tồn tại trong PDF worker.' });
    return;
  }

  const { createCanvas } = require('@napi-rs/canvas');
  const page = await session.pdfDoc.getPage(pageIndex);
  try {
    const viewport = page.getViewport({ scale: session.scale });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    // canvas.encode() is async — offloads PNG compression to Rust thread pool
    // so it doesn't block even within this worker thread.
    const buffer = await canvas.encode('png');
    parentPort.postMessage({ id, ok: true, buffer });
  } finally {
    try { page.cleanup(); } catch { /* */ }
  }
}

function handleCloseSession(id, task) {
  const { sessionId } = task;
  const session = SESSIONS.get(sessionId);
  if (session) {
    try { session.pdfDoc.destroy(); } catch { /* */ }
    SESSIONS.delete(sessionId);
  }
  parentPort.postMessage({ id, ok: true });
}

function handleCloseAll(id) {
  for (const [sid, session] of SESSIONS) {
    try { session.pdfDoc.destroy(); } catch { /* */ }
    SESSIONS.delete(sid);
  }
  parentPort.postMessage({ id, ok: true });
}
