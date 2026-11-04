import { QUEUE_SNAPSHOT_KEY, normalizeQueueForRestore } from '../features/download';

/** Khớp queueSnapshot.js */
export { QUEUE_SNAPSHOT_KEY };

export const BACKUP_FORMAT = 'manga-clawer-backup';
export const BACKUP_FORMAT_ENCRYPTED = 'manga-clawer-backup-encrypted';
export const BACKUP_VERSION = 1;

/** Nhóm dữ liệu có thể chọn khi xuất / nhập */
export const BACKUP_SECTION_IDS = [
  'favorites',
  'history',
  'queue',
  'ui',
  'appSettings',
  'offlineLibrary',
  'electron',
];

/**
 * Khóa localStorage theo từng nhóm (đồng bộ với App.jsx, appSettings, panelUiPrefs, …).
 * `electron` không dùng localStorage — lưu trong settings.json (main process).
 */
export const BACKUP_SECTIONS = {
  favorites: {
    keys: [
      'mangaFavorites',
      'mangaFavoriteBellDismissedRemoteById',
      'mangaFavoriteBellPanelRemovedRemoteById',
      'mangaFavoriteLastNotifiedRemoteById',
    ],
  },
  history: {
    keys: ['mangaDownloadHistory'],
  },
  queue: {
    keys: [QUEUE_SNAPSHOT_KEY],
  },
  ui: {
    keys: [
      'mangaMainSidebarWidthPx',
      'mangaMainSidebarVisible',
      'mangaToolsSidebarWidthPx',
      'mangaLogFooterVisible',
      'mangaMenuHiddenIds',
      'mangaLogPanelHeightPx',
      'mangaPanelUi',
      'mangaReaderChapterSidebarWidthPx',
      'mangaReaderWebtoonSeamless',
      'mangaReaderZoom',
      'mangaReaderProgressByManga',
      'manga_packaging_col1_width_v1',
      'manga_packaging_col2_width_v1',
      'format_converter_col1_width_v1',
      'workflow_studio_left_sidebar_width_v1',
      'workflow_studio_right_sidebar_width_v1',
      'tools_studio_left_width_v1',
      'tools_studio_right_width_v1',
      'tools_studio_bottom_height_v1',
      'tools_studio_left_open_v1',
      'tools_studio_right_open_v1',
      'tools_studio_bottom_open_v1',
      'ebook_studio_left_width_v1',
      'ebook_studio_right_width_v1',
      'ebook_studio_bottom_height_v1',
      'ebook_studio_left_open_v1',
      'ebook_studio_right_open_v1',
      'ebook_studio_bottom_open_v1',
      'plugins_left_width_v1',
      'plugins_left_open_v1',
      'site_checker_left_width_v1',
      'site_checker_left_open_v1',
      'settings_left_width_v1',
      'settings_left_open_v1',
      'settings_active_tab_v1',
      'home_main_left_width_v1',
      'home_main_left_open_v1',
      'latest_updates_left_width_v1',
      'latest_updates_left_open_v1',
      'bulk_scan_left_width_v1',
      'bulk_scan_left_open_v1',
      'explore_left_width_v1',
      'explore_left_open_v1',
      'explore_subtab_v1',
    ],
  },
  appSettings: {
    keys: [
      'mangaDownloadThreads',
      'duplicateScanRecursive',
      'mangaFavoriteAutoCheckEnabled',
      'mangaFavoriteAutoCheckIntervalMin',
      'mangaFavoriteAutoDownloadEnabled',
      'mangaFavoriteAutoDownloadMode',
      'mangaFavoriteAutoDownloadWorkflowId',
      'manga-crawler-locale',
      'manga-crawler-theme',
      'manga-crawler-theme-preset',
      'manga_branding_app_name',
      'manga_branding_icon_type',
      'manga_branding_show_titlebar_icon',
      'mangaAutoCheckUpdate',
      'mangaSkippedUpdateVersion',
      'manga_upscale_model',
      'manga_upscale_scale',
      'manga_upscale_denoise',
      'manga_upscale_tile',
      'manga_upscale_gpu',
      'manga_upscale_output_dir',
      'manga_upscale_in_place',
      'manga_upscale_open_folder',
      'manga_upscale_append_params',
      'manga_upscale_skip_existing',
      'manga_upscale_last_session',
      'manga_compress_quality',
      'manga_compress_resize_enabled',
      'manga_compress_resize_percent',
      'manga_compress_output_dir',
      'manga_compress_in_place',
      'manga_compress_open_folder',
      'manga_crop_output_dir',
      'manga_crop_in_place',
      'manga_crop_open_folder',
      'manga_crop_mode',
      'manga_crop_unit',
      'manga_crop_dpi',
      'manga_image_pipeline_templates_v1',
      'manga_image_pipeline_active_template',
      'manga_image_pipeline_destination',
    ],
  },
  offlineLibrary: {
    keys: ['offlineLibraryExtraPaths_v1', 'offlineLibraryHiddenSavePaths_v1'],
  },
  electron: {
    keys: [],
    electron: true,
  },
};

function b64encode(buf) {
  let s = '';
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {string[]} sectionIds
 * @returns {Promise<object>}
 */
export async function buildBackupPayload(sectionIds) {
  const set = new Set(
    Array.isArray(sectionIds) ? sectionIds.filter((id) => BACKUP_SECTION_IDS.includes(id)) : []
  );
  const localStorageOut = {};
  for (const id of set) {
    const def = BACKUP_SECTIONS[id];
    if (!def || def.electron) continue;
    for (const key of def.keys) {
      try {
        const v = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        if (v !== null) localStorageOut[key] = v;
      } catch {
        /* ignore */
      }
    }
  }

  let electron = null;
  if (set.has('electron') && typeof window !== 'undefined') {
    const api = window.electronAPI;
    if (api?.getSavedDownloadPath && api?.getChapterFolderSettings) {
      try {
        const [dir, cf] = await Promise.all([
          api.getSavedDownloadPath(),
          api.getChapterFolderSettings(),
        ]);
        electron = {
          lastSaveDir: typeof dir === 'string' ? dir : '',
          chapterFolder: cf && typeof cf === 'object' ? cf : null,
        };
      } catch {
        electron = { lastSaveDir: '', chapterFolder: null };
      }
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sections: [...set],
    localStorage: localStorageOut,
    electron,
  };
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function parseBackupJson(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid' };
  const o = data;
  if (o.format === BACKUP_FORMAT_ENCRYPTED && typeof o.ciphertext === 'string') {
    return { ok: false, error: 'encrypted' };
  }
  if (o.format !== BACKUP_FORMAT) return { ok: false, error: 'format' };
  if (Number(o.version) !== BACKUP_VERSION) return { ok: false, error: 'version' };
  if (!o.localStorage || typeof o.localStorage !== 'object') return { ok: false, error: 'payload' };
  return { ok: true, payload: o };
}

/**
 * @param {string} jsonText
 * @param {string} password
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, error: string }>}
 */
export async function decryptBackupEnvelope(jsonText, password) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!data || data.format !== BACKUP_FORMAT_ENCRYPTED || typeof data.ciphertext !== 'string') {
    return { ok: false, error: 'format' };
  }
  const salt = b64decode(data.salt || '');
  const iv = b64decode(data.iv || '');
  const ct = b64decode(data.ciphertext);
  if (salt.length < 8 || iv.length !== 12 || !ct.length) return { ok: false, error: 'data' };

  const enc = new TextEncoder();
  const iterations = Number(data.iterations) || 210000;
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    return { ok: false, error: 'password' };
  }
  const plain = new TextDecoder().decode(plainBuf);
  let inner;
  try {
    inner = JSON.parse(plain);
  } catch {
    return { ok: false, error: 'inner' };
  }
  return parseBackupJson(inner).ok
    ? { ok: true, payload: inner }
    : { ok: false, error: 'inner' };
}

/**
 * @param {object} payload — kết quả buildBackupPayload
 * @param {string} password
 */
export async function encryptBackupPayload(payload, password) {
  const json = JSON.stringify(payload);
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json));
  return {
    format: BACKUP_FORMAT_ENCRYPTED,
    version: BACKUP_VERSION,
    exportedAt: payload.exportedAt || new Date().toISOString(),
    algo: 'AES-GCM-PBKDF2',
    iterations: 210000,
    salt: b64encode(salt),
    iv: b64encode(iv),
    ciphertext: b64encode(new Uint8Array(ct)),
  };
}

/**
 * Ghi localStorage + (tuỳ chọn) Electron settings. Gọi reload sau khi apply.
 * @param {object} payload
 */
export async function applyBackupPayload(payload) {
  const ls = payload.localStorage;
  if (ls && typeof ls === 'object') {
    for (const [key, value] of Object.entries(ls)) {
      if (typeof value !== 'string') continue;
      try {
        if (key === QUEUE_SNAPSHOT_KEY) {
          const parsed = JSON.parse(value);
          const norm = normalizeQueueForRestore(Array.isArray(parsed) ? parsed : []);
          window.localStorage.setItem(key, JSON.stringify(norm));
        } else {
          window.localStorage.setItem(key, value);
        }
      } catch {
        /* ignore từng khóa */
      }
    }
  }

  const el = payload.electron;
  if (el && typeof el === 'object' && window.electronAPI) {
    const api = window.electronAPI;
    const dir = typeof el.lastSaveDir === 'string' ? el.lastSaveDir.trim() : '';
    if (dir && api.setSavedDownloadPath) {
      await api.setSavedDownloadPath(dir);
    }
    const cf = el.chapterFolder;
    if (cf && typeof cf === 'object' && api.setChapterFolderSettings) {
      await api.setChapterFolderSettings(cf);
    }
  }
}

export function downloadBackupBlob(text, filename) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
