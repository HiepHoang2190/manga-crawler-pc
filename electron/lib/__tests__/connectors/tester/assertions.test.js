const { assertConnectorTestResult } = require('../../../platform/connectors/tester/assertions');

function makeSuccessResult() {
  return {
    ok: true,
    durationMs: 10,
    steps: {
      listing: { ok: true, durationMs: 1 },
      chapters: { ok: true, durationMs: 1, chapterCount: 5 },
      download: { ok: true, durationMs: 1 },
    },
    testDetails: {
      mangaTitle: 'Hinamatsuri',
      mangaUrl: 'https://example.com/manga/1',
      coverUrl: '',
      chapterTitle: 'Ch 1',
      chapterUrl: 'https://example.com/chapter/1',
      chapterCount: 5,
    },
  };
}

describe('assertConnectorTestResult', () => {
  test('accepts a full three-step success', () => {
    expect(() => assertConnectorTestResult(makeSuccessResult(), {})).not.toThrow();
  });

  test('rejects ok false', () => {
    const failed_result = { ...makeSuccessResult(), ok: false, error: 'timeout' };
    expect(() => assertConnectorTestResult(failed_result, {})).toThrow();
  });

  test('accepts custom testConnection-only success and skips title asserts', () => {
    const custom_result = {
      ok: true,
      durationMs: 5,
      steps: { custom: { ok: true, durationMs: 5 } },
      testDetails: {},
    };
    expect(() => {
      assertConnectorTestResult(custom_result, {
        expect: { titlePattern: /must-not-run/ },
      });
    }).not.toThrow();
  });

  test('enforces titlePattern when present on three-step success', () => {
    expect(() => {
      assertConnectorTestResult(makeSuccessResult(), {
        expect: { titlePattern: /Hinamatsuri/ },
      });
    }).not.toThrow();
    expect(() => {
      assertConnectorTestResult(makeSuccessResult(), {
        expect: { titlePattern: /Nope/ },
      });
    }).toThrow();
  });

  test('enforces chapterUrlPattern and minChapters', () => {
    expect(() => {
      assertConnectorTestResult(makeSuccessResult(), {
        expect: { chapterUrlPattern: /\/chapter\//, minChapters: 3 },
      });
    }).not.toThrow();
    expect(() => {
      assertConnectorTestResult(makeSuccessResult(), {
        expect: { minChapters: 99 },
      });
    }).toThrow();
  });
});
