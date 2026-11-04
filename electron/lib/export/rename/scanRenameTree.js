const fs = require('fs');
const path = require('path');

function scanRenameTree({ rootDir, sourceFiles, includeFolders = true, includeFiles = true, includeSubfolders = true, maxDepth = 4 }) {
  if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
    const entries = [];
    for (const f of sourceFiles) {
      const file_abs = path.resolve(String(f || '').trim());
      try {
        if (!fs.existsSync(file_abs)) continue;
        const stat = fs.statSync(file_abs);
        if (stat.isFile() && includeFiles) {
          const name = path.basename(file_abs);
          entries.push({
            absPath: file_abs,
            relPath: name,
            parentRel: '',
            name,
            kind: 'file',
            ext: path.extname(name),
          });
        } else if (stat.isDirectory() && includeFolders) {
          const name = path.basename(file_abs);
          entries.push({
            absPath: file_abs,
            relPath: name,
            parentRel: '',
            name,
            kind: 'folder',
            ext: '',
          });
        }
      } catch {
        // ignore inaccessible files
      }
    }
    return { ok: true, entries };
  }

  const raw_root = rootDir == null ? '' : String(rootDir).trim();
  if (!raw_root) {
    return { ok: false, error: 'Invalid root directory', entries: [] };
  }
  const root_abs = path.resolve(raw_root);
  if (!fs.existsSync(root_abs) || !fs.statSync(root_abs).isDirectory()) {
    return { ok: false, error: 'Invalid root directory', entries: [] };
  }
  const entries = [];

  function walk(current_abs, parent_rel, current_depth = 0) {
    let dirents;
    try {
      dirents = fs.readdirSync(current_abs, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const dirent of dirents) {
      if (dirent.name === '.' || dirent.name === '..') continue;
      if (dirent.name.startsWith('.__rename_tmp_')) continue;
      const child_abs = path.join(current_abs, dirent.name);
      const child_rel = parent_rel ? path.join(parent_rel, dirent.name) : dirent.name;
      if (dirent.isDirectory()) {
        if (includeFolders) {
          entries.push({
            absPath: child_abs,
            relPath: child_rel,
            parentRel: parent_rel,
            name: dirent.name,
            kind: 'folder',
            ext: '',
          });
        }
        if (includeSubfolders && current_depth < maxDepth) {
          walk(child_abs, child_rel, current_depth + 1);
        }
      } else if (dirent.isFile() && includeFiles) {
        entries.push({
          absPath: child_abs,
          relPath: child_rel,
          parentRel: parent_rel,
          name: dirent.name,
          kind: 'file',
          ext: path.extname(dirent.name),
        });
      }
    }
  }

  walk(root_abs, '');
  return { ok: true, entries };
}

module.exports = { scanRenameTree };
