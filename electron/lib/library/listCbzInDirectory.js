const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

/**
 * Liệt kê mọi file .cbz trong thư mục (đệ quy).
 * @param {string} dir
 * @returns {Promise<{ ok: boolean, error?: string, files: Array<{ absolutePath: string, name: string }> }>}
 */
async function listCbzInDirectory(dir) {
  const root = path.resolve(String(dir || '').trim());
  if (!fs.existsSync(root)) {
    return { ok: false, error: 'Không tìm thấy thư mục.', files: [] };
  }
  let st;
  try {
    st = fs.statSync(root);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), files: [] };
  }
  if (!st.isDirectory()) {
    return { ok: false, error: 'Không phải thư mục.', files: [] };
  }

  const entries = await fg('**/*.cbz', {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    caseSensitiveMatch: false,
  });

  const seen = new Set();
  const files = [];
  for (const raw of entries) {
    const absolutePath = path.resolve(raw);
    if (!absolutePath.toLowerCase().endsWith('.cbz')) continue;
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);
    files.push({
      absolutePath,
      name: path.basename(absolutePath),
    });
  }

  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  return { ok: true, files };
}

module.exports = { listCbzInDirectory };
