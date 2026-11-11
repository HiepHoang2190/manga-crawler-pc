'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Build a pdfjs "factory URL" (cMapUrl / standardFontDataUrl / wasmUrl / iccUrl)
 * from a filesystem directory.
 *
 * pdfjs-dist v5 validates these values in `getFactoryUrlProp()` with a strict
 * `value.endsWith('/')` check, and — in Node.js — loads the asset files with
 * `fs.readFile(`${url}${filename}`)` (NodeBinaryDataFactory). That means the
 * only string form that both passes validation AND actually loads is a
 * filesystem path written with forward slashes and a trailing '/':
 *
 *   ✅ 'C:/Users/.../node_modules/pdfjs-dist/cmaps/'
 *   ❌ 'C:\\Users\\...\\node_modules\\pdfjs-dist\\cmaps\\'  → throws
 *        `Invalid factory url: "..." must include trailing slash.`
 *        (this is what path.join / path.resolve / path.normalize produce on
 *        Windows, and what pdf-to-png-converter@3.18.0 passes to pdfjs)
 *   ❌ 'file:///C:/Users/.../cmaps/' (pathToFileURL().href) → passes the
 *        trailing-slash check, but fs.readFile() then treats the file:// URL
 *        string as a literal path and fails with ENOENT as soon as a PDF
 *        actually needs a CMap / standard font / wasm asset.
 *
 * @param {string} dirPath absolute (or relative) directory path, either separator style
 * @returns {string} same path with '/' separators and a guaranteed trailing '/'
 */
function toPdfjsFactoryUrl(dirPath) {
  const raw = String(dirPath || '');
  if (!raw) return raw;
  const withTrailingSlash = raw.endsWith('/') || raw.endsWith('\\') ? raw : `${raw}/`;
  return withTrailingSlash.replace(/\\/g, '/');
}

/**
 * Directory of a bundled pdfjs-dist asset folder (cmaps, standard_fonts, ...),
 * resolved from the *installed location of pdfjs-dist itself*.
 *
 * Never resolve these as `./node_modules/pdfjs-dist/...` against
 * `process.cwd()`: an Electron app's working directory is wherever the user /
 * shortcut launched it from, not the app folder, so a cwd-relative path points
 * at a directory that usually does not contain pdfjs-dist at all.
 *
 * @param {string} name asset folder name inside the pdfjs-dist package
 * @returns {string} absolute filesystem path of that folder
 */
function pdfjsAssetDir(name) {
  const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return path.join(packageRoot, name);
}

/**
 * DocumentInitParameters fragment with correct factory URLs for every bundled
 * pdfjs-dist asset folder this app can need. Spread it into getDocument({...}).
 * Folders that are not present in the installed pdfjs-dist build are omitted
 * (pdfjs then behaves exactly as if the parameter had not been passed).
 *
 * @returns {{ cMapUrl?: string, cMapPacked: true, standardFontDataUrl?: string, wasmUrl?: string, iccUrl?: string }}
 */
function getPdfjsFactoryParams() {
  const params = { cMapPacked: true };
  const folders = {
    cMapUrl: 'cmaps',
    standardFontDataUrl: 'standard_fonts',
    wasmUrl: 'wasm',
    iccUrl: 'iccs',
  };
  for (const [param, folder] of Object.entries(folders)) {
    try {
      const dir = pdfjsAssetDir(folder);
      if (fs.existsSync(dir)) {
        params[param] = toPdfjsFactoryUrl(dir);
      }
    } catch {
      // pdfjs-dist not resolvable from here — leave the param unset.
    }
  }
  return params;
}

module.exports = {
  toPdfjsFactoryUrl,
  pdfjsAssetDir,
  getPdfjsFactoryParams,
};
