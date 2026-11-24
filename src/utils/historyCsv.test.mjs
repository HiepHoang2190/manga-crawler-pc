import {
  buildErrorDetailText,
  exportErrorRowsToCsv,
  formatErrorTimeFull,
  historyRowsToCsv,
} from './historyCsv.js';

describe('historyCsv error formatting helpers', () => {
  const t = (k) => k;

  test('formatErrorTimeFull returns dash for falsy input and formatted string for ISO date', () => {
    expect(formatErrorTimeFull('')).toBe('—');
    expect(formatErrorTimeFull(null)).toBe('—');
    const out = formatErrorTimeFull('2026-11-24T10:00:00.000Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(4);
    expect(out).not.toBe('—');
  });

  test('buildErrorDetailText formats full history entry fields', () => {
    const text = buildErrorDetailText(
      {
        mangaTitle: 'Berserk',
        chapterTitle: 'Chapter 1',
        at: '2026-11-24T10:00:00.000Z',
        message: 'HTTP 403 Forbidden',
        successCount: 12,
        totalPages: 20,
        failedPageIndices: [13, 15],
        chapterUrl: 'https://example.com/ch1',
        mangaUrl: 'https://example.com/manga',
      },
      { t, chapterFolder: { mode: 'original' } }
    );

    expect(text).toContain('history.col.manga: Berserk');
    expect(text).toContain('history.col.chapter: Chapter 1');
    expect(text).toContain('history.col.time:');
    expect(text).toContain('history.bugMessage: HTTP 403 Forbidden');
    expect(text).toContain('history.pagesProgress: 12/20');
    expect(text).toContain('history.failedPages: 13, 15');
    expect(text).toContain('history.csvChapterUrl: https://example.com/ch1');
    expect(text).toContain('history.csvMangaUrl: https://example.com/manga');
  });

  test('buildErrorDetailText reads downloadError fallback and omits absent optional fields', () => {
    const text = buildErrorDetailText(
      {
        mangaTitle: 'Solo',
        chapterTitle: 'Chap 5',
        downloadError: 'Connection timeout',
        chapterUrl: 'https://example.com/ch5',
      },
      { t, chapterFolder: { mode: 'original' } }
    );

    expect(text).toContain('history.col.manga: Solo');
    expect(text).toContain('history.col.chapter: Chap 5');
    expect(text).not.toContain('history.col.time:');
    expect(text).toContain('history.bugMessage: Connection timeout');
    expect(text).not.toContain('history.pagesProgress:');
    expect(text).not.toContain('history.failedPages:');
    expect(text).toContain('history.csvChapterUrl: https://example.com/ch5');
  });

  test('historyRowsToCsv quotes commas/quotes/newlines properly', () => {
    const csv = historyRowsToCsv(
      ['Col1', 'Col2'],
      [['hello, "world"', 'line1\nline2']]
    );
    expect(csv).toBe('Col1,Col2\r\n"hello, ""world""","line1\nline2"');
  });

  test('exportErrorRowsToCsv returns false on empty input and triggers BOM CSV download on non-empty input', () => {
    expect(exportErrorRowsToCsv([], { t })).toBe(false);
    expect(exportErrorRowsToCsv(null, { t })).toBe(false);

    const origURL = globalThis.URL;
    const origDocument = globalThis.document;
    const createdAnchor = { clickCalled: false, removeCalled: false, click() { this.clickCalled = true; }, remove() { this.removeCalled = true; } };
    let capturedBlob = null;
    const revoked = [];

    globalThis.URL = {
      createObjectURL: (blob) => {
        capturedBlob = blob;
        return 'blob:mock';
      },
      revokeObjectURL: (u) => revoked.push(u),
    };
    globalThis.document = {
      createElement: () => createdAnchor,
      body: { appendChild: () => {} },
    };

    try {
      const ok = exportErrorRowsToCsv(
        [
          {
            at: '2026-11-24T10:00:00.000Z',
            mangaTitle: 'Manga A',
            chapterTitle: 'Chapter 2',
            downloadError: 'Timeout, 504',
            successCount: 5,
            totalPages: 12,
            failedPageIndices: [6, 7],
            chapterUrl: 'https://example.com/c2',
            mangaUrl: 'https://example.com/m',
          },
        ],
        { t, chapterFolder: { mode: 'original' }, filenamePrefix: 'queue-err' }
      );
      expect(ok).toBe(true);
      expect(createdAnchor.download).toMatch(/^queue-err-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(createdAnchor.clickCalled).toBe(true);
      expect(createdAnchor.removeCalled).toBe(true);
      expect(revoked).toEqual(['blob:mock']);
      expect(capturedBlob).not.toBeNull();
    } finally {
      globalThis.URL = origURL;
      globalThis.document = origDocument;
    }
  });
});
