'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const fc = require('fast-check');

// We need a fresh cookieManager for each test to avoid state leakage
function freshManager() {
  const key = require.resolve('../../platform/cookies/cookieManager');
  delete require.cache[key];
  return require('../../platform/cookies/cookieManager');
}

// Valid siteIds from the connector registry
const VALID_SITE_IDS = ['otakusic', 'comicvn', 'cuutruyen', 'truyenqq', 'mangadex'];

function mockRegistry(cm) {
  cm.setRegistry({
    get: (id) => (VALID_SITE_IDS.includes(id) ? { id } : null),
    listConnectors: () =>
      VALID_SITE_IDS.map((id) => ({
        id,
        requiresCookie: id === 'otakusic' || id === 'comicvn',
      })),
  });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cookie-test-'));
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('CookieManager — unit tests', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('init() with non-existent file → empty store', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    expect(cm.get('otakusic')).toBe('');
  });

  test('init() strips leftover *_auth tokens from disk', () => {
    const filePath = path.join(tmpDir, 'site-cookies.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        comicvn: 'session=1',
        comicvn_auth: 'Bearer leftover',
      }),
      'utf8'
    );
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    expect(cm.get('comicvn')).toBe('session=1');
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(onDisk.comicvn_auth).toBeUndefined();
    expect(onDisk.comicvn).toBe('session=1');
  });

  test('init() with invalid JSON → empty store', () => {
    const filePath = path.join(tmpDir, 'site-cookies.json');
    fs.writeFileSync(filePath, '{ not valid json }', 'utf8');
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    expect(cm.get('otakusic')).toBe('');
  });

  test('set() with unknown siteId → { ok: false }', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    const result = cm.set('nonexistent-site-xyz', 'some-cookie');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('set() with empty cookieValue → equivalent to delete', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    // First set a valid cookie
    cm.set('otakusic', 'session=abc123');
    expect(cm.get('otakusic')).toBe('session=abc123');
    // Now set empty → should delete
    cm.set('otakusic', '');
    expect(cm.get('otakusic')).toBe('');
  });

  test('set() with whitespace-only cookieValue → equivalent to delete', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    cm.set('otakusic', 'session=abc123');
    cm.set('otakusic', '   ');
    expect(cm.get('otakusic')).toBe('');
  });

  test('delete() removes entry', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    cm.set('otakusic', 'session=abc123');
    cm.delete('otakusic');
    expect(cm.get('otakusic')).toBe('');
  });

  test('get() returns empty string for unknown siteId', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    expect(cm.get('unknown-site')).toBe('');
  });

  test('set() merges simple cookie pairs across newlines', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    cm.set('otakusic', 'a=b\nc=d');
    expect(cm.get('otakusic')).toBe('a=b; c=d');
  });

  test('getStatus() includes stored length and cookieSend flag per connector', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    const status = cm.getStatus();
    for (const id of VALID_SITE_IDS) {
      expect(status[id] === false || (typeof status[id] === 'number' && status[id] > 0)).toBe(true);
      expect(typeof status[id + '_cookieSend']).toBe('boolean');
    }
  });

  test('getEffectiveCookie is empty when send cookie disabled', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    expect(cm.set('otakusic', 'session=x').ok).toBe(true);
    expect(cm.getEffectiveCookie('otakusic')).toBe('session=x');
    expect(cm.setCookieSendEnabled('otakusic', false).ok).toBe(true);
    expect(cm.getEffectiveCookie('otakusic')).toBe('');
    expect(cm.get('otakusic')).toBe('session=x');
    expect(cm.setCookieSendEnabled('otakusic', true).ok).toBe(true);
    expect(cm.getEffectiveCookie('otakusic')).toBe('session=x');
  });

  test('delete() clears cookie send flag key', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    cm.set('otakusic', 'a=b');
    cm.setCookieSendEnabled('otakusic', false);
    cm.delete('otakusic');
    expect(cm.isCookieSendEnabled('otakusic')).toBe(true);
  });

  test('cookie file is written to userData dir, not project dir', () => {
    const cm = freshManager();
    cm.init(tmpDir);
    mockRegistry(cm);
    cm.set('otakusic', 'session=abc123');
    const expectedFile = path.join(tmpDir, 'site-cookies.json');
    expect(fs.existsSync(expectedFile)).toBe(true);
    // Should NOT exist in project root
    expect(fs.existsSync(path.join(__dirname, '../../site-cookies.json'))).toBe(false);
  });
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('CookieManager — property tests', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Property 1: Cookie persistence round trip
   * Validates: Requirements 1.1, 1.4
   */
  test('Property 1: Cookie persistence round trip', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SITE_IDS),
        fc.string({ minLength: 1 }).filter((s) => s.replace(/[\r\n]/g, '').trim().length > 0),
        (siteId, cookieValue) => {
          const dir = makeTempDir();
          try {
            const cm1 = freshManager();
            cm1.init(dir);
            mockRegistry(cm1);
            cm1.set(siteId, cookieValue);

            // Simulate restart: new manager reads from disk
            const cm2 = freshManager();
            cm2.init(dir);
            mockRegistry(cm2);

            const expected = cookieValue.replace(/[\r\n]/g, '').trim();
            return cm2.get(siteId) === expected;
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: Cookie update isolation
   * Validates: Requirements 1.2
   */
  test('Property 2: Cookie update isolation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SITE_IDS),
        fc.constantFrom(...VALID_SITE_IDS),
        fc.string({ minLength: 1 }).filter((s) => s.replace(/[\r\n]/g, '').trim().length > 0),
        fc.string({ minLength: 1 }).filter((s) => s.replace(/[\r\n]/g, '').trim().length > 0),
        (siteId1, siteId2, cookie1, cookie2) => {
          // Only test when siteIds are different
          if (siteId1 === siteId2) return true;

          const dir = makeTempDir();
          try {
            const cm = freshManager();
            cm.init(dir);
            mockRegistry(cm);
            cm.set(siteId1, cookie1);
            cm.set(siteId2, cookie2);

            const before = cm.get(siteId1);

            // Update siteId2 with a new value
            cm.set(siteId2, cookie2 + '_updated');

            // siteId1 should be unchanged
            return cm.get(siteId1) === before;
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Set then delete removes entry
   * Validates: Requirements 1.3
   */
  test('Property 3: Set then delete removes entry', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SITE_IDS),
        fc.string({ minLength: 1 }).filter((s) => s.replace(/[\r\n]/g, '').trim().length > 0),
        (siteId, cookieValue) => {
          const dir = makeTempDir();
          try {
            const cm = freshManager();
            cm.init(dir);
            mockRegistry(cm);
            cm.set(siteId, cookieValue);
            cm.delete(siteId);
            return cm.get(siteId) === '';
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 11: Newline stripping before storage
   * Validates: Requirements 6.4
   */
  test('Property 11: Newline stripping before storage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_SITE_IDS),
        // Generate strings that contain at least one newline and have non-empty content after stripping
        fc
          .tuple(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.constantFrom('\n', '\r', '\r\n'),
            fc.string({ minLength: 1, maxLength: 50 }),
          )
          .map(([a, nl, b]) => a + nl + b)
          .filter((s) => s.replace(/[\r\n]/g, '').trim().length > 0),
        (siteId, cookieWithNewlines) => {
          const dir = makeTempDir();
          try {
            const cm = freshManager();
            cm.init(dir);
            mockRegistry(cm);
            cm.set(siteId, cookieWithNewlines);
            const stored = cm.get(siteId);
            return !stored.includes('\n') && !stored.includes('\r');
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
