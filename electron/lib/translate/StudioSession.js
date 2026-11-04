/**
 * StudioSession — Quản lý đa dự án & phiên làm việc Manga Studio.
 *
 * Cho phép quản lý nhiều Dự án (Projects), chuyển đổi qua lại giữa các dự án,
 * lưu & khôi phục trạng thái từng dự án (pages, layers, dữ liệu dịch) vào đĩa
 * mà không bao giờ bị mất tiến trình.
 *
 * Kiến trúc Content-Addressed Blob Storage chuẩn Koharu:
 * - projects/
 *   - projects.json: Danh mục tất cả dự án (id, name, pageCount, coverThumb, createdAt, updatedAt, activeProjectId)
 *   - <projectId>/
 *     - session.json: Metadata + pages array (chỉ giữ reference blob://<hash>)
 *     - blobs/: Lưu các file nhị phân sạch (cleanDataUrl, originalDataUrl, v.v.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('../shared/logger');

// Thư mục lưu session gốc
function getSessionDir() {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'manga-studio-session');
  }
  const os = require('os');
  const baseDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'manga-crawler')
    : path.join(os.homedir(), 'Library/Application Support/manga-crawler');
  return path.join(baseDir, 'manga-studio-session');
}

function getProjectsDir() {
  return path.join(getSessionDir(), 'projects');
}

function getProjectsIndexFile() {
  return path.join(getProjectsDir(), 'projects.json');
}

function getProjectDir(projectId) {
  return path.join(getProjectsDir(), projectId || 'default');
}

function getProjectSessionFile(projectId) {
  return path.join(getProjectDir(projectId), 'session.json');
}

function getProjectBlobsDir(projectId) {
  return path.join(getProjectDir(projectId), 'blobs');
}

// Backward compatibility helper
function getSessionFilePath() {
  const index = readProjectsIndex();
  return getProjectSessionFile(index.activeProjectId);
}

function getBlobsDir() {
  const index = readProjectsIndex();
  return getProjectBlobsDir(index.activeProjectId);
}

/**
 * Tính SHA-256 hash cho content string.
 * @param {string} content
 * @returns {string} hex hash
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Trích xuất blob data từ dataUrl, lưu vào blobs/ folder, trả về blob reference.
 * @param {string} dataUrl - data:image/...;base64,...
 * @param {string} blobsDir
 * @returns {string|null} blob://<hash> reference hoặc null nếu không hợp lệ
 */
function storeBlobFromDataUrl(dataUrl, blobsDir) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  try {
    const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) return null;

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    const hash = hashContent(base64Data);

    const blobPath = path.join(blobsDir, `${hash}.bin`);
    if (!fs.existsSync(blobPath)) {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(blobPath, buffer);
    }

    const metaPath = path.join(blobsDir, `${hash}.meta`);
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, JSON.stringify({ mime: mimeType }), 'utf-8');
    }

    return `blob://${hash}`;
  } catch (err) {
    logger.warn('[StudioSession] storeBlobFromDataUrl error:', err.message);
    return null;
  }
}

/**
 * Resolve blob reference → dataUrl.
 * @param {string} ref - blob://<hash>
 * @param {string} blobsDir
 * @returns {string|null} data:image/...;base64,...
 */
function resolveBlobRef(ref, blobsDir) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('blob://')) return ref || null;

  try {
    const hash = ref.replace('blob://', '');
    const blobPath = path.join(blobsDir, `${hash}.bin`);
    if (!fs.existsSync(blobPath)) {
      logger.warn(`[StudioSession] Blob not found: ${hash}`);
      return null;
    }

    const buffer = fs.readFileSync(blobPath);
    let mime = 'image/png';
    const metaPath = path.join(blobsDir, `${hash}.meta`);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (meta.mime) mime = meta.mime;
      } catch (_) {}
    }

    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    logger.warn('[StudioSession] resolveBlobRef error:', err.message);
    return null;
  }
}

const BLOB_FIELDS = ['cleanDataUrl', 'originalDataUrl', 'translatedImageDataUrl', 'dataUrl'];

/**
 * Đọc hoặc khởi tạo projects.json index.
 * Tự động migrate nếu người dùng có session.json cũ.
 */
function readProjectsIndex() {
  const indexFile = getProjectsIndexFile();
  if (fs.existsSync(indexFile)) {
    try {
      const raw = fs.readFileSync(indexFile, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.projects) && data.projects.length > 0) {
        if (!data.activeProjectId || !data.projects.some((p) => p.id === data.activeProjectId)) {
          data.activeProjectId = data.projects[0].id;
        }
        return data;
      }
    } catch (_) {}
  }

  // Khởi tạo hoặc migrate từ legacy session
  const legacySessionFile = path.join(getSessionDir(), 'session.json');
  const defaultProjId = 'default';
  const defaultDir = getProjectDir(defaultProjId);
  const defaultBlobsDir = getProjectBlobsDir(defaultProjId);
  if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
  if (!fs.existsSync(defaultBlobsDir)) fs.mkdirSync(defaultBlobsDir, { recursive: true });

  let pageCount = 0;
  let coverThumb = null;
  let projName = 'Dự án mặc định';

  if (fs.existsSync(legacySessionFile)) {
    try {
      const legacyRaw = fs.readFileSync(legacySessionFile, 'utf-8');
      const legacySession = JSON.parse(legacyRaw);
      pageCount = Array.isArray(legacySession.pages) ? legacySession.pages.length : 0;
      if (legacySession.pages && legacySession.pages[0]) {
        projName = legacySession.pages[0].filename
          ? `Dự án: ${path.parse(legacySession.pages[0].filename).name}`
          : 'Dự án hiện tại';
      }
      fs.writeFileSync(getProjectSessionFile(defaultProjId), legacyRaw, 'utf-8');

      // Chép blobs cũ nếu có
      const legacyBlobsDir = path.join(getSessionDir(), 'blobs');
      if (fs.existsSync(legacyBlobsDir)) {
        const files = fs.readdirSync(legacyBlobsDir);
        for (const f of files) {
          const src = path.join(legacyBlobsDir, f);
          const dst = path.join(defaultBlobsDir, f);
          if (!fs.existsSync(dst) && fs.existsSync(src)) {
            try { fs.copyFileSync(src, dst); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  const initialIndex = {
    activeProjectId: defaultProjId,
    projects: [
      {
        id: defaultProjId,
        name: projName,
        pageCount,
        coverThumb,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  try {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(indexFile, JSON.stringify(initialIndex, null, 2), 'utf-8');
  } catch (_) {}

  return initialIndex;
}

/**
 * Ghi projects.json index an toàn.
 */
function writeProjectsIndex(indexData) {
  const indexFile = getProjectsIndexFile();
  fs.mkdirSync(getProjectsDir(), { recursive: true });
  const tmpFile = `${indexFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(indexData, null, 2), 'utf-8');
  fs.renameSync(tmpFile, indexFile);
}

/**
 * Lấy danh sách tất cả các dự án.
 * @returns {{ activeProjectId: string, projects: Array }}
 */
function listProjects() {
  const index = readProjectsIndex();
  return {
    activeProjectId: index.activeProjectId,
    projects: index.projects || [],
  };
}

/**
 * Tạo một dự án mới.
 * @param {{ name?: string }} param0
 * @returns {{ success: boolean, project: object, activeProjectId: string, projects: Array }}
 */
function createProject({ name } = {}) {
  const index = readProjectsIndex();
  const projNum = (index.projects?.length || 0) + 1;
  const projectName = (name && name.trim()) ? name.trim() : `Dự án ${projNum}`;
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const projDir = getProjectDir(projectId);
  const blobsDir = getProjectBlobsDir(projectId);
  fs.mkdirSync(projDir, { recursive: true });
  fs.mkdirSync(blobsDir, { recursive: true });

  const now = new Date().toISOString();
  const initialSession = {
    id: projectId,
    name: projectName,
    activePageIndex: 0,
    pages: [],
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(getProjectSessionFile(projectId), JSON.stringify(initialSession, null, 2), 'utf-8');

  const newProjMeta = {
    id: projectId,
    name: projectName,
    pageCount: 0,
    coverThumb: null,
    createdAt: now,
    updatedAt: now,
  };

  index.projects.unshift(newProjMeta);
  index.activeProjectId = projectId;
  writeProjectsIndex(index);

  logger.info(`[StudioSession] Created project: "${projectName}" (${projectId})`);
  return {
    success: true,
    project: newProjMeta,
    activeProjectId: projectId,
    projects: index.projects,
  };
}

/**
 * Chuyển sang một dự án khác.
 * @param {{ projectId: string }} param0
 * @returns {{ success: boolean, activeProjectId: string, project: object, session: object, projects: Array }}
 */
function switchProject({ projectId }) {
  if (!projectId) return { success: false, error: 'Thiếu projectId' };
  const index = readProjectsIndex();
  const found = index.projects.find((p) => p.id === projectId);
  if (!found) {
    return { success: false, error: 'Không tìm thấy dự án' };
  }

  index.activeProjectId = projectId;
  writeProjectsIndex(index);

  const session = loadSession(projectId);
  logger.info(`[StudioSession] Switched to project: "${found.name}" (${projectId})`);
  return {
    success: true,
    activeProjectId: projectId,
    project: found,
    session,
    projects: index.projects,
  };
}

/**
 * Đổi tên dự án.
 * @param {{ projectId: string, name: string }} param0
 */
function renameProject({ projectId, name }) {
  if (!projectId || !name || !name.trim()) return { success: false, error: 'Tên không hợp lệ' };
  const index = readProjectsIndex();
  const proj = index.projects.find((p) => p.id === projectId);
  if (!proj) return { success: false, error: 'Không tìm thấy dự án' };

  proj.name = name.trim();
  proj.updatedAt = new Date().toISOString();
  writeProjectsIndex(index);

  const sessionFile = getProjectSessionFile(projectId);
  if (fs.existsSync(sessionFile)) {
    try {
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      session.name = proj.name;
      session.updatedAt = proj.updatedAt;
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
    } catch (_) {}
  }

  logger.info(`[StudioSession] Renamed project ${projectId} -> "${proj.name}"`);
  return { success: true, project: proj, projects: index.projects };
}

/**
 * Xóa một dự án (bao gồm toàn bộ session và blobs của dự án đó).
 * @param {{ projectId: string }} param0
 */
function deleteProject({ projectId }) {
  if (!projectId) return { success: false, error: 'Thiếu projectId' };
  const index = readProjectsIndex();
  const projIndex = index.projects.findIndex((p) => p.id === projectId);
  if (projIndex === -1) return { success: false, error: 'Không tìm thấy dự án' };

  const projDir = getProjectDir(projectId);
  if (fs.existsSync(projDir)) {
    try {
      fs.rmSync(projDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn(`[StudioSession] Failed to delete project dir ${projectId}:`, e.message);
    }
  }

  index.projects.splice(projIndex, 1);

  if (index.activeProjectId === projectId) {
    if (index.projects.length > 0) {
      index.activeProjectId = index.projects[0].id;
    } else {
      const newProjId = 'default';
      const now = new Date().toISOString();
      const defaultMeta = {
        id: newProjId,
        name: 'Dự án 1',
        pageCount: 0,
        coverThumb: null,
        createdAt: now,
        updatedAt: now,
      };
      index.projects = [defaultMeta];
      index.activeProjectId = newProjId;
      const dDir = getProjectDir(newProjId);
      fs.mkdirSync(dDir, { recursive: true });
      fs.mkdirSync(getProjectBlobsDir(newProjId), { recursive: true });
      fs.writeFileSync(getProjectSessionFile(newProjId), JSON.stringify({
        id: newProjId,
        name: 'Dự án 1',
        pages: [],
        activePageIndex: 0,
        createdAt: now,
        updatedAt: now,
      }, null, 2), 'utf-8');
    }
  }

  writeProjectsIndex(index);
  logger.info(`[StudioSession] Deleted project: ${projectId}, current active: ${index.activeProjectId}`);

  const currentSession = loadSession(index.activeProjectId);
  return {
    success: true,
    activeProjectId: index.activeProjectId,
    projects: index.projects,
    session: currentSession,
  };
}

/**
 * Lưu phiên làm việc của một dự án (mặc định là active project).
 * @param {object} sessionData - { pages, activePageIndex, projectId, name }
 * @param {string} [targetProjectId]
 */
function saveSession(sessionData, targetProjectId) {
  try {
    const index = readProjectsIndex();
    const projectId = targetProjectId || sessionData?.projectId || index.activeProjectId || 'default';
    const projDir = getProjectDir(projectId);
    const blobsDir = getProjectBlobsDir(projectId);
    if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });
    if (!fs.existsSync(blobsDir)) fs.mkdirSync(blobsDir, { recursive: true });

    const { pages = [], ...metadata } = sessionData || {};

    // Serialize pages: tách blob data ra file riêng
    const serializedPages = pages.map((page, idx) => {
      const serialized = { ...page };
      for (const field of BLOB_FIELDS) {
        if (serialized[field] && typeof serialized[field] === 'string' && serialized[field].startsWith('data:')) {
          const ref = storeBlobFromDataUrl(serialized[field], blobsDir);
          if (ref) serialized[field] = ref;
        }
      }
      if (Array.isArray(serialized.layers)) {
        serialized.layers = serialized.layers.map((layer) => {
          const sl = { ...layer };
          for (const field of BLOB_FIELDS) {
            if (sl[field] && typeof sl[field] === 'string' && sl[field].startsWith('data:')) {
              const ref = storeBlobFromDataUrl(sl[field], blobsDir);
              if (ref) sl[field] = ref;
            }
          }
          return sl;
        });
      }
      return serialized;
    });

    const now = new Date().toISOString();
    const sessionObj = {
      id: projectId,
      activePageIndex: metadata.activePageIndex || 0,
      savedAt: now,
      pages: serializedPages,
      ...metadata,
    };

    const sessionFilePath = getProjectSessionFile(projectId);
    const tmpPath = `${sessionFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(sessionObj, null, 2), 'utf-8');
    fs.renameSync(tmpPath, sessionFilePath);

    // Cập nhật metadata trong projects.json
    const projMeta = index.projects.find((p) => p.id === projectId);
    if (projMeta) {
      projMeta.pageCount = pages.length;
      projMeta.updatedAt = now;
      if (sessionData.name && sessionData.name.trim()) {
        projMeta.name = sessionData.name.trim();
      }
      if (pages.length > 0 && pages[0]?.dataUrl && typeof pages[0].dataUrl === 'string') {
        projMeta.coverThumb = pages[0].dataUrl.slice(0, 5000);
      } else if (pages.length === 0) {
        projMeta.coverThumb = null;
      }
      writeProjectsIndex(index);
    }

    logger.info(`[StudioSession] Session saved for project "${projMeta?.name || projectId}": ${pages.length} pages`);
    return { success: true, pageCount: pages.length, sessionPath: sessionFilePath, projectId };
  } catch (err) {
    logger.error('[StudioSession] saveSession error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Đọc phiên làm việc của một dự án (mặc định là active project).
 * @param {string} [targetProjectId]
 */
function loadSession(targetProjectId) {
  try {
    const index = readProjectsIndex();
    const projectId = targetProjectId || index.activeProjectId || 'default';
    const sessionFilePath = getProjectSessionFile(projectId);
    const blobsDir = getProjectBlobsDir(projectId);

    const currentProject = index.projects.find((p) => p.id === projectId) || null;

    if (!fs.existsSync(sessionFilePath)) {
      return {
        success: true,
        projectId,
        project: currentProject,
        pages: [],
        activePageIndex: 0,
      };
    }

    const raw = fs.readFileSync(sessionFilePath, 'utf-8');
    const session = JSON.parse(raw);

    const restoredPages = (session.pages || []).map((page) => {
      const resolved = { ...page };
      for (const field of BLOB_FIELDS) {
        if (resolved[field] && typeof resolved[field] === 'string' && resolved[field].startsWith('blob://')) {
          resolved[field] = resolveBlobRef(resolved[field], blobsDir);
        }
      }
      if (Array.isArray(resolved.layers)) {
        resolved.layers = resolved.layers.map((layer) => {
          const rl = { ...layer };
          for (const field of BLOB_FIELDS) {
            if (rl[field] && typeof rl[field] === 'string' && rl[field].startsWith('blob://')) {
              rl[field] = resolveBlobRef(rl[field], blobsDir);
            }
          }
          return rl;
        });
      }
      return resolved;
    });

    logger.info(`[StudioSession] Session loaded for project "${currentProject?.name || projectId}": ${restoredPages.length} pages (saved at ${session.savedAt || 'unknown'})`);
    return {
      success: true,
      projectId,
      project: currentProject,
      pages: restoredPages,
      activePageIndex: session.activePageIndex || 0,
      savedAt: session.savedAt,
    };
  } catch (err) {
    logger.error('[StudioSession] loadSession error:', err.message);
    return { success: false, error: err.message, pages: [] };
  }
}

/**
 * Ghi checkpoint tức thời cho một trang vừa hoàn tất bóc tách & dịch vào session.json của dự án.
 * Giữ nguyên an toàn trên đĩa ngay cả khi ứng dụng gặp sự cố hoặc bị tắt ngang.
 * @param {string} projectId
 * @param {string} imagePath
 * @param {object} pageData
 */
function checkpointPage(projectId, imagePath, pageData) {
  try {
    const index = readProjectsIndex();
    const pid = projectId || index.activeProjectId || 'default';
    const sessionFilePath = getProjectSessionFile(pid);
    const blobsDir = getProjectBlobsDir(pid);

    if (!fs.existsSync(sessionFilePath)) return { success: false, error: 'Session not found' };

    const raw = fs.readFileSync(sessionFilePath, 'utf-8');
    const session = JSON.parse(raw);

    if (!Array.isArray(session.pages)) return { success: false, error: 'No pages in session' };

    const pageIdx = session.pages.findIndex((p) => p.imagePath === imagePath || (typeof pageData.index === 'number' && p.index === pageData.index));
    if (pageIdx === -1) return { success: false, error: 'Page not found in session' };

    const target = { ...session.pages[pageIdx] };

    // Lưu cleanDataUrl vào blob
    if (pageData.cleanDataUrl && typeof pageData.cleanDataUrl === 'string' && pageData.cleanDataUrl.startsWith('data:')) {
      const ref = storeBlobFromDataUrl(pageData.cleanDataUrl, blobsDir);
      if (ref) target.cleanDataUrl = ref;
    }

    // Chuyển đổi translations sang layers
    const rawTranslations = Array.isArray(pageData.translations) ? pageData.translations : [];
    if (rawTranslations.length > 0) {
      target.layers = rawTranslations.map((t, lIdx) => ({
        id: `layer-${target.index ?? pageIdx}-${lIdx}-${Date.now()}`,
        type: 'dialogue',
        sourceText: t.sourceText || t.originalText || t.rawText || '',
        text: t.text || t.translatedText || '',
        bbox: Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150],
        fontFamily: t.fontFamily || '"CC Wild Words", "Adobe 黑体 Std", "SVN-CCWildWords", sans-serif',
        fontSize: t.fontSize || 'auto',
        fontWeight: t.fontWeight || '700',
        fontStyle: t.fontStyle || 'normal',
        color: t.color || '#000000',
        strokeColor: t.strokeColor || '#ffffff',
        strokeWidth: typeof t.strokeWidth === 'number' ? t.strokeWidth : 1.5,
        align: t.align || 'center',
        direction: t.direction || 'auto',
        textTransform: t.textTransform || 'uppercase',
        hasBubble: t.hasBubble !== false,
        fillBackground: false,
        visible: t.visible !== false,
        opacity: t.opacity ?? 1,
        isTranslated: t.isTranslated !== false,
      }));
    }

    target.translations = pageData.translations;
    target.detections = pageData.detections;
    target.ocrResults = pageData.ocrResults;

    session.pages[pageIdx] = target;
    session.savedAt = new Date().toISOString();

    const tmpPath = `${sessionFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
    fs.renameSync(tmpPath, sessionFilePath);

    logger.info(`[StudioSession] Checkpointed page ${pageIdx} (${imagePath}) into project "${pid}"`);
    return { success: true };
  } catch (err) {
    logger.warn('[StudioSession] checkpointPage error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Ghi checkpoint tức thời cho một bước con (Detection, OCR, Translation, Inpainting) của từng trang.
 * @param {string} projectId
 * @param {string} imagePath
 * @param {object} stepPayload - { step, detections, ocrResults, translations, cleanDataUrl, pageIndex }
 */
function checkpointPageStep(projectId, imagePath, stepPayload = {}) {
  try {
    const index = readProjectsIndex();
    const pid = projectId || index.activeProjectId || 'default';
    const sessionFilePath = getProjectSessionFile(pid);
    const blobsDir = getProjectBlobsDir(pid);

    if (!fs.existsSync(sessionFilePath)) return { success: false, error: 'Session not found' };

    const raw = fs.readFileSync(sessionFilePath, 'utf-8');
    const session = JSON.parse(raw);

    if (!Array.isArray(session.pages)) return { success: false, error: 'No pages in session' };

    const pageIdx = session.pages.findIndex(
      (p) => p.imagePath === imagePath || (typeof stepPayload.pageIndex === 'number' && p.index === stepPayload.pageIndex)
    );
    if (pageIdx === -1) return { success: false, error: 'Page not found in session' };

    const target = { ...session.pages[pageIdx] };
    const { step, detections, ocrResults, translations, cleanDataUrl } = stepPayload;

    if (step === 'detect' && Array.isArray(detections)) {
      target.detections = detections;
      // Khởi tạo layers cơ bản nếu chưa có layers
      if (!Array.isArray(target.layers) || target.layers.length === 0) {
        target.layers = detections.map((d, lIdx) => ({
          id: `layer-${target.index ?? pageIdx}-${lIdx}-${Date.now()}`,
          type: 'dialogue',
          sourceText: '',
          text: '',
          bbox: Array.isArray(d.bbox) ? [...d.bbox] : [100, 100, 200, 150],
          fontFamily: '"CC Wild Words", "Adobe 黑体 Std", "SVN-CCWildWords", sans-serif',
          fontSize: 'auto',
          fontWeight: '700',
          fontStyle: 'normal',
          color: '#000000',
          strokeColor: '#ffffff',
          strokeWidth: 1.5,
          align: 'center',
          direction: 'auto',
          textTransform: 'uppercase',
          hasBubble: d.hasBubble !== false,
          fillBackground: false,
          visible: true,
          opacity: 1,
          isTranslated: null,
          hasResidualJapanese: false,
        }));
      }
    }

    if (step === 'ocr' && Array.isArray(ocrResults)) {
      target.ocrResults = ocrResults;
      const ocrMap = new Map();
      ocrResults.forEach((r, idx) => {
        ocrMap.set(idx, r.text);
        if (r.id !== undefined) ocrMap.set(r.id, r.text);
        if (r.index !== undefined) ocrMap.set(r.index, r.text);
      });

      if (Array.isArray(target.layers)) {
        target.layers = target.layers.map((l, idx) => ({
          ...l,
          sourceText: ocrMap.get(idx) ?? ocrMap.get(l.id) ?? l.sourceText ?? '',
        }));
      }
    }

    if (step === 'translate' && Array.isArray(translations)) {
      target.translations = translations;
      const transMap = new Map();
      translations.forEach((t, idx) => {
        transMap.set(idx, t);
        if (t.id !== undefined) transMap.set(t.id, t);
        if (t.index !== undefined) transMap.set(t.index, t);
      });

      if (Array.isArray(target.layers)) {
        target.layers = target.layers.map((l, idx) => {
          const t = transMap.get(idx) ?? transMap.get(l.id);
          if (!t) return l;
          const translated = t.translatedText || t.text || l.text || '';
          return {
            ...l,
            text: translated,
            translatedText: translated,
            sourceText: t.sourceText || l.sourceText || '',
            isTranslated: t.isTranslated !== false,
            hasResidualJapanese: Boolean(t.hasResidualJapanese),
          };
        });
      }
    }

    if (cleanDataUrl && typeof cleanDataUrl === 'string' && cleanDataUrl.startsWith('data:')) {
      const ref = storeBlobFromDataUrl(cleanDataUrl, blobsDir);
      if (ref) target.cleanDataUrl = ref;
    }

    session.pages[pageIdx] = target;
    session.savedAt = new Date().toISOString();

    const tmpPath = `${sessionFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
    fs.renameSync(tmpPath, sessionFilePath);

    logger.info(`[StudioSession] Checkpointed step "${step}" for page ${pageIdx} (${imagePath}) into project "${pid}"`);
    return { success: true, page: target };
  } catch (err) {
    logger.warn('[StudioSession] checkpointPageStep error:', err.message);
    return { success: false, error: err.message };
  }
}

function extractHashesFromPage(pageObj, targetSet) {
  if (!pageObj) return;
  for (const field of BLOB_FIELDS) {
    const val = pageObj[field];
    if (val && typeof val === 'string') {
      if (val.startsWith('blob://')) {
        targetSet.add(val.replace('blob://', ''));
      } else if (val.startsWith('data:')) {
        const base64Match = val.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          targetSet.add(hashContent(base64Match[1]));
        }
      }
    }
  }

  if (Array.isArray(pageObj.layers)) {
    for (const layer of pageObj.layers) {
      for (const field of BLOB_FIELDS) {
        const val = layer[field];
        if (val && typeof val === 'string') {
          if (val.startsWith('blob://')) {
            targetSet.add(val.replace('blob://', ''));
          } else if (val.startsWith('data:')) {
            const base64Match = val.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match) {
              targetSet.add(hashContent(base64Match[1]));
            }
          }
        }
      }
    }
  }
}

/**
 * Xóa blob files của một trang trong dự án.
 */
function deletePageBlobs(page, remainingPages, targetProjectId) {
  if (!page) return;
  const index = readProjectsIndex();
  const projectId = targetProjectId || index.activeProjectId || 'default';
  const blobsDir = getProjectBlobsDir(projectId);
  if (!fs.existsSync(blobsDir)) return;

  const hashesToDelete = new Set();
  extractHashesFromPage(page, hashesToDelete);
  if (hashesToDelete.size === 0) return;

  let referencedHashes = new Set();
  if (Array.isArray(remainingPages)) {
    for (const p of remainingPages) {
      extractHashesFromPage(p, referencedHashes);
    }
  } else {
    try {
      const sessionPath = getProjectSessionFile(projectId);
      if (fs.existsSync(sessionPath)) {
        const raw = fs.readFileSync(sessionPath, 'utf-8');
        const session = JSON.parse(raw);
        for (const p of (session.pages || [])) {
          const isSamePage = (page.imagePath && p.imagePath === page.imagePath) ||
                             (page.id && p.id === page.id) ||
                             (page.filename && p.filename === page.filename);
          if (isSamePage) continue;
          extractHashesFromPage(p, referencedHashes);
        }
      }
    } catch (_) {}
  }

  let deletedCount = 0;
  for (const hash of hashesToDelete) {
    if (referencedHashes.has(hash)) continue;
    const blobPath = path.join(blobsDir, `${hash}.bin`);
    const metaPath = path.join(blobsDir, `${hash}.meta`);
    try {
      if (fs.existsSync(blobPath)) { fs.unlinkSync(blobPath); deletedCount++; }
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch (e) {
      logger.warn(`[StudioSession] Failed to delete blob ${hash}:`, e.message);
    }
  }

  if (deletedCount > 0) {
    logger.info(`[StudioSession] Deleted ${deletedCount} unreferenced blobs for page in project ${projectId}`);
  }
}

/**
 * Làm rỗng tiến độ của dự án hiện tại (hoặc dự án chỉ định).
 */
function clearSession(targetProjectId) {
  try {
    const index = readProjectsIndex();
    const projectId = targetProjectId || index.activeProjectId || 'default';
    const projDir = getProjectDir(projectId);
    const blobsDir = getProjectBlobsDir(projectId);

    if (fs.existsSync(blobsDir)) {
      try {
        fs.rmSync(blobsDir, { recursive: true, force: true });
        fs.mkdirSync(blobsDir, { recursive: true });
      } catch (_) {}
    }

    const sessionFilePath = getProjectSessionFile(projectId);
    if (fs.existsSync(sessionFilePath)) {
      const now = new Date().toISOString();
      const emptySession = {
        id: projectId,
        activePageIndex: 0,
        savedAt: now,
        pages: [],
      };
      fs.writeFileSync(sessionFilePath, JSON.stringify(emptySession, null, 2), 'utf-8');
    }

    const projMeta = index.projects.find((p) => p.id === projectId);
    if (projMeta) {
      projMeta.pageCount = 0;
      projMeta.coverThumb = null;
      projMeta.updatedAt = new Date().toISOString();
      writeProjectsIndex(index);
    }

    logger.info(`[StudioSession] Cleared pages for project: ${projectId}`);
    return { success: true };
  } catch (err) {
    logger.error('[StudioSession] clearSession error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Kiểm tra có session / pages nào trong active project không.
 */
function hasSession(targetProjectId) {
  try {
    const index = readProjectsIndex();
    const projectId = targetProjectId || index.activeProjectId || 'default';
    const sessionPath = getProjectSessionFile(projectId);
    if (!fs.existsSync(sessionPath)) return { hasSession: false };

    const raw = fs.readFileSync(sessionPath, 'utf-8');
    const session = JSON.parse(raw);
    const pageCount = Array.isArray(session.pages) ? session.pages.length : 0;
    return {
      hasSession: pageCount > 0,
      pageCount,
      savedAt: session.savedAt || null,
      projectId,
    };
  } catch (_) {
    return { hasSession: false };
  }
}

/**
 * Tính tổng dung lượng thư mục session toàn bộ projects (bytes).
 */
function getDiskUsage() {
  try {
    const sessionDir = getSessionDir();
    if (!fs.existsSync(sessionDir)) return 0;
    let totalBytes = 0;
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            totalBytes += fs.statSync(fullPath).size;
          } catch (_) {}
        }
      }
    }
    walk(sessionDir);
    return totalBytes;
  } catch (_) {
    return 0;
  }
}

module.exports = {
  // Multi-Project API
  listProjects,
  createProject,
  switchProject,
  renameProject,
  deleteProject,
  // Session API
  saveSession,
  loadSession,
  checkpointPage,
  checkpointPageStep,
  deletePageBlobs,
  clearSession,
  hasSession,
  getDiskUsage,
  // Helpers
  getSessionDir,
  getProjectsDir,
  getProjectsIndexFile,
  getProjectDir,
  getProjectSessionFile,
  getProjectBlobsDir,
  getSessionFilePath,
  getBlobsDir,
  hashContent,
  BLOB_FIELDS,
};
