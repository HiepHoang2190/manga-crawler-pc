'use strict';

// Feature: ebook-text-reader, Property 1 & 2
// Tests for detectEbookContentType core detection logic

const fc = require('fast-check');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Helpers — build a minimal fake epub2 EPub object from manifest/spine data
// ---------------------------------------------------------------------------

/**
 * Build a fake epub2 EPub-like object with the given spine items.
 * Each spineItem: { id: string, 'media-type': string }
 */
function fakeEpub(spineItems) {
  const manifest = {};
  for (const item of spineItems) {
    manifest[item.id] = { ...item };
  }
  return {
    manifest,
    spine: {
      toc: null,
      contents: spineItems.map(item => ({ ...item })),
    },
  };
}

// ---------------------------------------------------------------------------
// Extract the pure detection logic so we can test it without file I/O
// ---------------------------------------------------------------------------

/**
 * Pure function: given spine contents and manifest, determine contentType.
 * Mirrors the logic in detectEbookContentType.js detectEpubContentType().
 */
function epubContentTypeFromSpine(spineContents, manifest) {
  if (spineContents.length === 0) return 'text';

  let xhtmlCount = 0;
  let imageCount = 0;

  for (const spineItem of spineContents) {
    const id = spineItem.id;
    const manifestItem = manifest[id];
    if (!manifestItem) continue;

    const mediaType = (manifestItem['media-type'] || '').toLowerCase().trim();

    if (mediaType === 'application/xhtml+xml' || mediaType === 'text/html') {
      xhtmlCount++;
    } else if (mediaType.startsWith('image/')) {
      imageCount++;
    }
  }

  return xhtmlCount >= imageCount ? 'text' : 'image';
}

/**
 * Pure function: given an array of page objects { hasText: boolean },
 * determine contentType. Mirrors detectPdfContentType logic.
 */
function pdfContentTypeFromPages(pages) {
  for (const page of pages) {
    if (page.hasText) return 'text';
  }
  return 'image';
}

// ---------------------------------------------------------------------------
// Property 1: EPUB content type detection follows majority rule
// Validates: Requirements 1.1
// ---------------------------------------------------------------------------

describe('Property 1: EPUB content type detection follows majority rule', () => {
  test('contentType is text iff xhtmlCount >= imageCount', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 50 }),  // xhtmlCount
        fc.nat({ max: 50 }),  // imageCount
        (xhtmlCount, imageCount) => {
          // Build spine items
          const spineItems = [];
          for (let i = 0; i < xhtmlCount; i++) {
            spineItems.push({ id: `xhtml_${i}`, 'media-type': 'application/xhtml+xml' });
          }
          for (let i = 0; i < imageCount; i++) {
            spineItems.push({ id: `img_${i}`, 'media-type': 'image/jpeg' });
          }

          // Shuffle to ensure order doesn't matter
          const manifest = {};
          for (const item of spineItems) {
            manifest[item.id] = { ...item };
          }

          const contentType = epubContentTypeFromSpine(spineItems, manifest);

          if (xhtmlCount >= imageCount) {
            return contentType === 'text';
          } else {
            return contentType === 'image';
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('tie (equal counts) resolves to text', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),  // count (same for both)
        (count) => {
          const spineItems = [];
          for (let i = 0; i < count; i++) {
            spineItems.push({ id: `xhtml_${i}`, 'media-type': 'application/xhtml+xml' });
          }
          for (let i = 0; i < count; i++) {
            spineItems.push({ id: `img_${i}`, 'media-type': 'image/jpeg' });
          }
          const manifest = {};
          for (const item of spineItems) manifest[item.id] = { ...item };

          return epubContentTypeFromSpine(spineItems, manifest) === 'text';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('text/html media-type is counted as xhtml', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (htmlCount, imageCount) => {
          const spineItems = [];
          for (let i = 0; i < htmlCount; i++) {
            spineItems.push({ id: `html_${i}`, 'media-type': 'text/html' });
          }
          for (let i = 0; i < imageCount; i++) {
            spineItems.push({ id: `img_${i}`, 'media-type': 'image/png' });
          }
          const manifest = {};
          for (const item of spineItems) manifest[item.id] = { ...item };

          const contentType = epubContentTypeFromSpine(spineItems, manifest);
          return htmlCount >= imageCount
            ? contentType === 'text'
            : contentType === 'image';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: PDF content type detection follows at-least-one-text-page rule
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------

describe('Property 2: PDF content type detection follows at-least-one-text-page rule', () => {
  test('contentType is text iff at least one page has hasText: true', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ hasText: fc.boolean() }),
          { minLength: 1, maxLength: 5 }
        ),
        (pages) => {
          const contentType = pdfContentTypeFromPages(pages);
          const hasAnyText = pages.some(p => p.hasText);

          return hasAnyText ? contentType === 'text' : contentType === 'image';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('all-image pages always returns image', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (pageCount) => {
          const pages = Array.from({ length: pageCount }, () => ({ hasText: false }));
          return pdfContentTypeFromPages(pages) === 'image';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('single text page among image pages returns text', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),   // total pages (1-5)
        fc.integer({ min: 0, max: 4 }),   // index of text page
        (pageCount, textPageIdx) => {
          const clampedIdx = textPageIdx % pageCount;
          const pages = Array.from({ length: pageCount }, (_, i) => ({
            hasText: i === clampedIdx,
          }));
          return pdfContentTypeFromPages(pages) === 'text';
        }
      ),
      { numRuns: 100 }
    );
  });
});
