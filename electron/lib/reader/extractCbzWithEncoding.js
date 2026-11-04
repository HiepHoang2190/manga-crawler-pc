/**
 * extractCbzWithEncoding.js
 *
 * Replacement for extract-zip that handles non-UTF-8 entry names (e.g. CP437/CP850
 * from Windows-created ZIPs). Uses yauzl with decodeStrings:false and iconv-lite
 * to detect and decode the correct encoding.
 *
 * Strategy:
 *   1. Read raw entry name bytes from yauzl (decodeStrings: false).
 *   2. If the ZIP's general-purpose bit flag has bit 11 set → UTF-8 (spec-compliant).
 *   3. Otherwise try to decode as UTF-8; if the result is valid UTF-8 (no replacement
 *      chars), use it. Otherwise fall back to CP437 (the ZIP spec default for legacy).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const iconv = require('iconv-lite');

/**
 * Decode a raw Buffer of a ZIP entry name.
 * @param {Buffer} buf
 * @param {boolean} utf8Flag — true if bit 11 of general purpose bit flag is set
 * @returns {string}
 */
function decodeEntryName(buf, utf8Flag) {
  if (utf8Flag) {
    return buf.toString('utf8');
  }
  // Try UTF-8 first — if it round-trips cleanly, use it
  const asUtf8 = buf.toString('utf8');
  // Check for replacement character (U+FFFD) which indicates bad UTF-8 decode
  if (!asUtf8.includes('\uFFFD')) {
    return asUtf8;
  }
  // Fall back to CP437 (ZIP spec legacy encoding)
  return iconv.decode(buf, 'cp437');
}

/**
 * Extract a ZIP/CBZ file to a destination directory, correctly handling
 * non-UTF-8 entry names.
 *
 * @param {string} zipPath   — absolute path to the .cbz / .zip file
 * @param {string} destDir   — absolute path to the destination directory (must exist)
 * @param {{ onProgress?: (extracted: number, total: number) => void }} [opts]
 * @returns {Promise<void>}
 */
function extractCbzWithEncoding(zipPath, destDir, opts = {}) {
  const { onProgress } = opts;
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
      if (err) return reject(err);

      const total = zipfile.entryCount || 0;
      let extracted = 0;
      let pending = 0;
      let zipDone = false;
      let firstError = null;

      function checkDone() {
        if (zipDone && pending === 0) {
          if (firstError) reject(firstError);
          else resolve();
        }
      }

      zipfile.readEntry();

      zipfile.on('error', (e) => {
        firstError = firstError || e;
        zipfile.close();
        checkDone();
      });

      zipfile.on('entry', (entry) => {
        if (firstError) return;

        // entry.fileName is a Buffer when decodeStrings:false
        const nameBuf = entry.fileName;
        // Bit 11 of generalPurposeBitFlag = UTF-8
        const utf8Flag = Boolean(entry.generalPurposeBitFlag & 0x800);
        const entryName = decodeEntryName(nameBuf, utf8Flag);

        // Sanitize: strip leading slashes / drive letters, normalize separators
        const safeName = entryName.replace(/\\/g, '/').replace(/^(\.\.\/|\/)+/, '');
        const destPath = path.join(destDir, safeName);

        if (/\/$/.test(entryName)) {
          // Directory entry
          fs.mkdirSync(destPath, { recursive: true });
          zipfile.readEntry();
          return;
        }

        // File entry — ensure parent dir exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        pending += 1;
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            firstError = firstError || streamErr;
            pending -= 1;
            checkDone();
            zipfile.readEntry();
            return;
          }

          const writeStream = fs.createWriteStream(destPath);
          writeStream.on('error', (we) => {
            firstError = firstError || we;
            pending -= 1;
            checkDone();
          });
          writeStream.on('finish', () => {
            extracted += 1;
            if (onProgress) onProgress(extracted, total);
            pending -= 1;
            checkDone();
          });
          readStream.on('error', (re) => {
            firstError = firstError || re;
            pending -= 1;
            checkDone();
          });
          readStream.pipe(writeStream);
          zipfile.readEntry();
        });
      });

      zipfile.on('end', () => {
        zipDone = true;
        checkDone();
      });
    });
  });
}

module.exports = { extractCbzWithEncoding, decodeEntryName };
