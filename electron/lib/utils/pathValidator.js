const fs = require('fs');
const path = require('path');

/**
 * Validate a directory path for reading / writing / creating chapters.
 *
 * @param {string} dirPath
 * @returns {{
 *   ok: boolean,
 *   exists: boolean,
 *   writable: boolean,
 *   canCreate: boolean,
 *   reason?: 'empty' | 'not_directory' | 'unmounted' | 'no_write_permission' | 'not_found',
 *   error?: string
 * }}
 */
function validateDirectory(dirPath) {
  const trimmed = typeof dirPath === 'string' ? dirPath.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      exists: false,
      writable: false,
      canCreate: false,
      reason: 'empty',
      error: 'Đường dẫn thư mục trống.',
    };
  }

  // 1. Check unmounted macOS volume (/Volumes/<volName>)
  const volMatch = /^\/Volumes\/([^/]+)/.exec(trimmed);
  if (volMatch) {
    const volumeRoot = `/Volumes/${volMatch[1]}`;
    if (!fs.existsSync(volumeRoot)) {
      return {
        ok: false,
        exists: false,
        writable: false,
        canCreate: false,
        reason: 'unmounted',
        error: `Ổ đĩa ngoài "${volumeRoot}" chưa được kết nối hoặc đã bị ngắt kết nối.`,
      };
    }
  }

  // 2. Check unmounted Windows drive letter (e.g. D:\, E:\)
  if (process.platform === 'win32' || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
    const rootDrive = trimmed.slice(0, 3);
    if (!fs.existsSync(rootDrive)) {
      return {
        ok: false,
        exists: false,
        writable: false,
        canCreate: false,
        reason: 'unmounted',
        error: `Ổ đĩa "${rootDrive}" không tồn tại hoặc đã bị ngắt kết nối.`,
      };
    }
  }

  // 3. Path already exists on disk
  if (fs.existsSync(trimmed)) {
    try {
      const stat = fs.statSync(trimmed);
      if (!stat.isDirectory()) {
        return {
          ok: false,
          exists: true,
          writable: false,
          canCreate: false,
          reason: 'not_directory',
          error: `Đường dẫn "${trimmed}" là file chứ không phải thư mục.`,
        };
      }
    } catch (e) {
      return {
        ok: false,
        exists: true,
        writable: false,
        canCreate: false,
        reason: 'no_write_permission',
        error: `Không thể truy cập thư mục: ${e?.message || e}`,
      };
    }

    try {
      fs.accessSync(trimmed, fs.constants.W_OK);
      return {
        ok: true,
        exists: true,
        writable: true,
        canCreate: true,
      };
    } catch {
      return {
        ok: false,
        exists: true,
        writable: false,
        canCreate: false,
        reason: 'no_write_permission',
        error: `Không có quyền ghi vào thư mục: "${trimmed}".`,
      };
    }
  }

  // 4. Path does not exist - find nearest existing ancestor
  let ancestor = path.dirname(trimmed);
  let prevAncestor = trimmed;

  while (ancestor && ancestor !== prevAncestor && !fs.existsSync(ancestor)) {
    prevAncestor = ancestor;
    ancestor = path.dirname(ancestor);
  }

  if (!ancestor || !fs.existsSync(ancestor)) {
    return {
      ok: false,
      exists: false,
      writable: false,
      canCreate: false,
      reason: 'not_found',
      error: `Không tìm thấy thư mục cha để tạo thư mục mới cho đường dẫn: "${trimmed}".`,
    };
  }

  // Check if ancestor is directory and writable
  try {
    const ancestorStat = fs.statSync(ancestor);
    if (!ancestorStat.isDirectory()) {
      return {
        ok: false,
        exists: false,
        writable: false,
        canCreate: false,
        reason: 'not_directory',
        error: `Đường dẫn cha "${ancestor}" không phải là thư mục.`,
      };
    }
    fs.accessSync(ancestor, fs.constants.W_OK);
    return {
      ok: true,
      exists: false,
      writable: false,
      canCreate: true,
    };
  } catch {
    return {
      ok: false,
      exists: false,
      writable: false,
      canCreate: false,
      reason: 'no_write_permission',
      error: `Không có quyền tạo thư mục mới trong "${ancestor}".`,
    };
  }
}

module.exports = {
  validateDirectory,
};

