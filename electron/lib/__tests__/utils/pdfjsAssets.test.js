'use strict';

/**
 * Regression tests for the Windows "Invalid factory url" crash:
 * pdfjs-dist v5 rejects cMapUrl / standardFontDataUrl / wasmUrl / iccUrl
 * values that do not end with '/' verbatim, so the Windows path separator
 * '\' produced by path.join/resolve/normalize must never reach pdfjs.
 * (Was: pdf-to-png-converter passing "C:\...\pdfjs-dist\cmaps\".)
 */

const path = require('path');
const { toPdfjsFactoryUrl, getPdfjsFactoryParams } = require('../../shared/pdfjsAssets');

describe('toPdfjsFactoryUrl', () => {
  test('converts a Windows backslash path to a forward-slash factory URL', () => {
    expect(
      toPdfjsFactoryUrl('C:\\Users\\USERD030\\AppData\\Local\\Programs\\Manga Crawler\\node_modules\\pdfjs-dist\\cmaps\\')
    ).toBe('C:/Users/USERD030/AppData/Local/Programs/Manga Crawler/node_modules/pdfjs-dist/cmaps/');
  });

  test('adds the trailing slash when it is missing (either separator)', () => {
    expect(toPdfjsFactoryUrl('C:\\app\\node_modules\\pdfjs-dist\\standard_fonts')).toBe(
      'C:/app/node_modules/pdfjs-dist/standard_fonts/'
    );
    expect(toPdfjsFactoryUrl('/home/user/app/node_modules/pdfjs-dist/cmaps')).toBe(
      '/home/user/app/node_modules/pdfjs-dist/cmaps/'
    );
  });

  test('leaves an already-valid POSIX factory URL unchanged', () => {
    expect(toPdfjsFactoryUrl('/opt/app/node_modules/pdfjs-dist/wasm/')).toBe(
      '/opt/app/node_modules/pdfjs-dist/wasm/'
    );
  });

  test('every produced value passes the pdfjs v5 check (endsWith "/")', () => {
    const inputs = [
      'C:\\a\\cmaps\\',
      'C:\\a\\cmaps',
      'D:\\x y\\standard_fonts\\',
      '/posix/cmaps',
      '/posix/cmaps/',
    ];
    for (const input of inputs) {
      const out = toPdfjsFactoryUrl(input);
      expect(out.endsWith('/')).toBe(true);
      expect(out.includes('\\')).toBe(false);
    }
  });
});

describe('getPdfjsFactoryParams', () => {
  test('returns forward-slash URLs that end with "/" and exist on disk', () => {
    const fs = require('fs');
    const params = getPdfjsFactoryParams();
    expect(params.cMapPacked).toBe(true);
    expect(typeof params.cMapUrl).toBe('string');
    expect(typeof params.standardFontDataUrl).toBe('string');
    for (const key of ['cMapUrl', 'standardFontDataUrl', 'wasmUrl', 'iccUrl']) {
      if (params[key] === undefined) continue;
      expect(params[key].endsWith('/')).toBe(true);
      expect(params[key].includes('\\')).toBe(false);
      // Resolved from the installed pdfjs-dist, not from process.cwd():
      // the directory must really exist wherever this test runs.
      const asFsPath = params[key].split('/').join(path.sep);
      expect(fs.existsSync(asFsPath)).toBe(true);
    }
  });
});
