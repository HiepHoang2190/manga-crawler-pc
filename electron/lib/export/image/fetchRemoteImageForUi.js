/**
 * Tải ảnh remote trong main process (Referer + cookie Comix / GTT) → data URL cho <img> renderer.
 * CDN static.comix.to trả 403 nếu chỉ có Referer; cần cookie session từ comixService.
 * GocTruyenTranh (db.goctruyentranh / gtt-bk): cookie session sau fetch trang (gocTruyenTranhService).
 * Đường dẫn file cục bộ (tuyệt đối hoặc file://) cũng đọc tại đây (bìa offline).
 */
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { getImageRefererForUrl } = require('../../download/connector/connectorReferer');
const { USER_AGENT } = require('../../download/connector/htmlConnectorUtils');

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function resolveLocalImagePathForDataUrl(u) {
  const s = String(u || '').trim();
  if (!s) return null;
  if (/^file:\/\//i.test(s)) {
    try {
      return fileURLToPath(s);
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(s)) {
    return path.resolve(s);
  }
  return null;
}

function readLocalImageFileAsDataUrl(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size <= 0) return null;
    const buf = fs.readFileSync(absPath);
    if (!buf.length) return null;
    const ext = path.extname(absPath).toLowerCase();
    const ct = EXT_TO_MIME[ext] || 'image/jpeg';
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function fetchRemoteImageAsDataUrl(urlString) {
  const u = String(urlString || '').trim();
  const localPath = resolveLocalImagePathForDataUrl(u);
  if (localPath) {
    return readLocalImageFileAsDataUrl(localPath);
  }
  if (!/^https?:\/\//i.test(u)) return null;
  const ref = getImageRefererForUrl(u);
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
  };
  if (ref) headers.Referer = ref;

  let host = '';
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('comix.to')) {
    try {
      const comix = require('../../platform/connectors/services/comixService');
      if (typeof comix.getComixImageFetchHeaders === 'function') {
        const extra = comix.getComixImageFetchHeaders();
        if (extra) Object.assign(headers, extra);
      }
    } catch {
      /* */
    }
  }

  if (host.includes('dtv-ebook.com.vn')) {
    try {
      const dtvebook = require('../../platform/connectors/services/dtveBookService');
      if (typeof dtvebook.getDtvEbookImageFetchHeaders === 'function') {
        const extra = dtvebook.getDtvEbookImageFetchHeaders();
        if (extra) Object.assign(headers, extra);
      }
    } catch {
      /* */
    }
  }

  if (
    host.includes('goctruyentranh') ||
    host.includes('gtt-bk') ||
    host.includes('gttbk')
  ) {
    try {
      const gtt = require('../../platform/connectors/services/gocTruyenTranhService');
      if (typeof gtt.getImageFetchHeadersForRemoteUi === 'function') {
        const extra = gtt.getImageFetchHeadersForRemoteUi();
        if (extra) Object.assign(headers, extra);
      }
    } catch {
      /* */
    }
  }

  const res = await fetch(u, { headers });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  const ct = res.headers.get('content-type') || 'image/jpeg';
  return `data:${ct};base64,${buf.toString('base64')}`;
}

module.exports = { fetchRemoteImageAsDataUrl };
