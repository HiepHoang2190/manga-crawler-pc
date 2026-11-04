/**
 * Unit tests for Comix API crypto helpers.
 * Token/decrypt must match the site's secure.js Io[D]/Io[O] so chapter pages resolve.
 */
const {
  signComixApiPath,
  extractComixChapterId,
  extractComixTitleSlug,
  extractComixMangaIdFromSlug,
  buildComixSignedApiUrl,
  parseComixChapterApiItems,
  buildComixChapterImageUrls,
} = require('../../../download/connector/comixCrypto');

describe('comixCrypto', () => {
  describe('extractComixChapterId', () => {
    test('extracts numeric id from chapter URL', () => {
      expect(
        extractComixChapterId(
          'https://comix.to/title/nr83-the-sword-bearing-flower/10805545-chapter-58'
        )
      ).toBe('10805545');
    });

    test('extracts id from chapter URL whose title slug is numeric', () => {
      expect(
        extractComixChapterId(
          'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105'
        )
      ).toBe('11234489');
    });

    test('returns empty string for title-only URL', () => {
      expect(extractComixChapterId('https://comix.to/title/nr83-the-sword-bearing-flower')).toBe(
        ''
      );
    });

    test('returns empty string for numeric title slug URL', () => {
      expect(
        extractComixChapterId('https://comix.to/title/9058-frozen-wolf-fire-dragon')
      ).toBe('');
    });
  });

  describe('extractComixTitleSlug / extractComixMangaIdFromSlug', () => {
    test('parses numeric title slug used by Frozen Wolf, Fire Dragon', () => {
      const title_slug = extractComixTitleSlug(
        'https://comix.to/title/9058-frozen-wolf-fire-dragon'
      );
      expect(title_slug).toBe('9058-frozen-wolf-fire-dragon');
      expect(extractComixMangaIdFromSlug(title_slug)).toBe('9058');
    });

    test('parses alphanumeric hash_id title slug', () => {
      const title_slug = extractComixTitleSlug(
        'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny'
      );
      expect(title_slug).toBe('yedvn-once-an-assassin-now-a-royal-nanny');
      expect(extractComixMangaIdFromSlug(title_slug)).toBe('yedvn');
    });
  });

  describe('buildComixSignedApiUrl', () => {
    test('signs manga chapters list with alphabetically sorted query', () => {
      const signed_url = buildComixSignedApiUrl('/manga/9058/chapters', {
        page: 1,
        limit: 20,
        'order[number]': 'desc',
      });
      const expected_token = signComixApiPath(
        '/manga/9058/chapters?limit=20&order[number]=desc&page=1'
      );
      expect(signed_url).toContain('https://comix.to/api/v1/manga/9058/chapters?');
      expect(signed_url).toContain(`_=${encodeURIComponent(expected_token)}`);
      expect(expected_token).toBe(
        'IZ-P1pUtAu3sCqSr4fkJU9awR86cHZ6BPYFf2v6CBIrxxHfwVj64ThRcR-2N-WswKGzc-zdQXA'
      );
    });
  });

  describe('parseComixChapterApiItems', () => {
    test('maps encrypted-API chapter items into href/num/group rows', () => {
      const parsed = parseComixChapterApiItems({
        status: 'ok',
        result: {
          items: [
            {
              id: 11234489,
              url: '/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
              number: 105,
              name: '',
              group: { id: 9302, name: 'Lua Comic' },
            },
          ],
          total: 105,
          page: 1,
          lastPage: 6,
        },
      });
      expect(parsed.lastPage).toBe(6);
      expect(parsed.total).toBe(105);
      expect(parsed.items).toEqual([
        {
          href: '/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
          num: '105',
          group: 'Lua Comic',
        },
      ]);
    });
  });

  describe('signComixApiPath', () => {
    test('signs /chapters/{id} like the live site', () => {
      // Captured from browser Network for chapter 10805545
      expect(signComixApiPath('/chapters/10805545')).toBe('IQ6wvJBq2kpghZR0sKZ95i-a');
    });
  });

  describe('buildComixChapterImageUrls', () => {
    test('maps pages.items + baseUrl into absolute image URLs in order', () => {
      const urls = buildComixChapterImageUrls({
        pages: {
          baseUrl: 'https://cdn.example/',
          items: [
            { width: 100, height: 200, url: 'a.webp', s: 0 },
            { width: 100, height: 200, url: 'b.webp', s: 1 },
          ],
        },
      });
      expect(urls).toEqual([
        { imageUrl: 'https://cdn.example/a.webp', ext: 'webp', scramble: false },
        { imageUrl: 'https://cdn.example/b.webp', ext: 'webp', scramble: true },
      ]);
    });

    test('accepts absolute item urls when baseUrl is empty', () => {
      const urls = buildComixChapterImageUrls({
        pages: {
          baseUrl: '',
          items: [
            {
              width: 850,
              height: 1551,
              url: 'https://80pd.wowpic2.store/i5/page1',
            },
          ],
        },
      });
      expect(urls).toHaveLength(1);
      expect(urls[0].imageUrl).toBe('https://80pd.wowpic2.store/i5/page1');
      expect(urls[0].scramble).toBe(false);
    });

    test('returns empty array when pages missing', () => {
      expect(buildComixChapterImageUrls({})).toEqual([]);
      expect(buildComixChapterImageUrls(null)).toEqual([]);
    });
  });
});

describe('comixCrypto live chapter API (network)', () => {
  test(
    'decrypts Ch.58 Sword-Bearing Flower page list',
    async () => {
      const chapterId = '10805545';
      const apiUrl = buildComixSignedApiUrl(`/chapters/${chapterId}`);
      const res = await fetch(apiUrl, {
        headers: {
          Accept: 'application/json',
          Referer: 'https://comix.to/',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) {
        // Cloudflare blocks cookie-less Node fetch; signed path is covered by unit tests.
        expect([403, 503]).toContain(res.status);
        return;
      }
      const json = await res.json();
      expect(typeof json.e).toBe('string');
      const { decryptComixEncPayload } = require('../../../download/connector/comixCrypto');
      const parsed = JSON.parse(decryptComixEncPayload(json.e));
      const result = parsed.result || parsed;
      const urls = buildComixChapterImageUrls(result);
      expect(urls.length).toBeGreaterThan(50);
      expect(urls[0].imageUrl).toMatch(/^https?:\/\//i);
    },
    30000
  );
});
