/**
 * Sao lưu tự động (Electron): tối đa mỗi 24h; chỉ ghi file khi dữ liệu thay đổi so với lần ghi trước.
 * File: userData/manga-clawer-auto-backup.json (ghi đè).
 */
import { buildBackupPayload, BACKUP_SECTION_IDS } from './userDataBackup';

export const AUTO_BACKUP_INTERVAL_MS = 86_400_000;

const LS_LAST_WRITTEN_AT = 'mangaAutoBackupLastWrittenAt';
const LS_LAST_CONTENT_HASH = 'mangaAutoBackupContentHash';

/** Gọi sau khi nhập backup thủ công — tránh chặn sao lưu tự động trong 24h dù dữ liệu đã đổi hẳn. */
export function clearAutoBackupScheduleMeta() {
  try {
    localStorage.removeItem(LS_LAST_WRITTEN_AT);
    localStorage.removeItem(LS_LAST_CONTENT_HASH);
  } catch {
    /* ignore */
  }
}

/** Bỏ exportedAt để so sánh ổn định. */
export function fingerprintBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const { exportedAt: _e, ...rest } = payload;
  return JSON.stringify(rest);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Chạy một lần kiểm tra: đủ 24h kể từ lần ghi + fingerprint khác lần trước → ghi đè file.
 */
export async function maybeRunAutoBackup() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api?.writeAutoBackupFile) return;

  const now = Date.now();
  const lastAt = Number(localStorage.getItem(LS_LAST_WRITTEN_AT)) || 0;
  const lastHash = localStorage.getItem(LS_LAST_CONTENT_HASH) || '';

  if (lastAt > 0 && now - lastAt < AUTO_BACKUP_INTERVAL_MS) return;

  const payload = await buildBackupPayload(BACKUP_SECTION_IDS);
  const fp = await sha256Hex(fingerprintBackupPayload(payload));
  if (lastHash && fp === lastHash) return;

  const text = JSON.stringify(
    {
      ...payload,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
  const r = await api.writeAutoBackupFile(text);
  if (!r?.ok) return;
  try {
    localStorage.setItem(LS_LAST_WRITTEN_AT, String(now));
    localStorage.setItem(LS_LAST_CONTENT_HASH, fp);
  } catch {
    /* quota */
  }
}

/**
 * Lên lịch: chạy lần đầu sau vài giây (khi state/localStorage đã ổn định), sau đó mỗi 24h.
 * @returns {() => void} hủy interval + timeout
 */
export function scheduleAutoBackup() {
  const run = () => void maybeRunAutoBackup();
  const t0 = window.setTimeout(run, 12_000);
  const id = window.setInterval(run, AUTO_BACKUP_INTERVAL_MS);
  return () => {
    window.clearTimeout(t0);
    window.clearInterval(id);
  };
}
