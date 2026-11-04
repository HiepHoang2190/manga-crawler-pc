/**
 * Test suite for ManhwaTV connector service.
 * Tests cookie-based authentication and content parsing.
 */
const service = require('../../platform/connectors/services/manhwaTvService');
const cookieManager = require('../../platform/cookies/cookieManager');

describe('ManhwaTV Service', () => {
  describe('load()', () => {
    it('should return error for empty URL', async () => {
      const result = await service.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    it('should return error for invalid URL', async () => {
      const result = await service.load('not-a-url');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should detect manhwatv domain', () => {
      const connectors = require('../../platform/connectors/index');
      const detected = connectors.detectSiteIdFromUrl('https://manhwatv6.com/truyen-tranh/test');
      expect(detected).toBe('manhwatv');
    });
  });

  describe('connector metadata', () => {
    it('should have correct connector configuration', () => {
      const connector = require('../../platform/connectors/manhwaTv');
      expect(connector.id).toBe('manhwatv');
      expect(connector.label).toBe('ManhwaTV');
      expect(connector.requiresCookie).toBe(true);
      expect(connector.domain).toBe('https://manhwatv6.com/');
      expect(connector.hasLockedChapters).toBe(true);
    });

    it('should be registered in connector registry', () => {
      const connectors = require('../../platform/connectors/index');
      const connector = connectors.get('manhwatv');
      expect(connector).toBeDefined();
      expect(connector.id).toBe('manhwatv');
      expect(connector.hasLockedChapters).toBe(true);
    });

    it('should appear in connector list', () => {
      const connectors = require('../../platform/connectors/index');
      const list = connectors.listConnectors();
      const manhwatv = list.find(c => c.id === 'manhwatv');
      expect(manhwatv).toBeDefined();
      expect(manhwatv.requiresCookie).toBe(true);
      expect(manhwatv.hasLockedChapters).toBe(true);
    });
  });

  describe('domain detection', () => {
    it('should detect manhwatv6.com', () => {
      const connectors = require('../../platform/connectors/index');
      expect(connectors.detectSiteIdFromUrl('https://manhwatv6.com/truyen-tranh/test')).toBe('manhwatv');
    });

    it('should detect manhwatv with different numbers', () => {
      const connectors = require('../../platform/connectors/index');
      expect(connectors.detectSiteIdFromUrl('https://manhwatv5.com/truyen-tranh/test')).toBe('manhwatv');
      expect(connectors.detectSiteIdFromUrl('https://manhwatv7.com/truyen-tranh/test')).toBe('manhwatv');
    });
  });

  describe('load() without cookie', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should successfully load manga info and chapters via list_chap without cookie', async () => {
      const mangaHtml = `
<!DOCTYPE html>
<html>
<body>
  <h1>SNVT[NOVEL] Người Bảo Trợ Của Những Kẻ Phản Diện</h1>
  <div class="img"><img src="https://manhwatv6.com/uploads/minh_hoa/cover.jpg" /></div>
  <input type="hidden" name="truyen" value="611">
</body>
</html>`;

      const listChapJson = {
        ok: 1,
        list: `<div class="chapter-item"><div class="chap_name"><a href="/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh/chap-2.html"><span class="price bg_green">Free</span> Chap 2</a></div></div><div class="chapter-item"><div class="chap_name"><a href="/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh/chap-1.html"><span class="price bg_green">Free</span> Chap 1</a></div></div>`
      };

      global.fetch = jest.fn(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/process.php')) {
          expect(opts.body).toContain('action=list_chap');
          expect(opts.body).toContain('truyen=611');
          return {
            ok: true,
            status: 200,
            json: async () => listChapJson
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => mangaHtml
        };
      });

      const res = await service.load('https://manhwatv6.com/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh.html');
      expect(res.ok).toBe(true);
      expect(res.manga.title).toBe('SNVT[NOVEL] Người Bảo Trợ Của Những Kẻ Phản Diện');
      expect(res.manga.mangaId).toBe('611');
      expect(res.chapters.length).toBe(2);
      expect(res.chapters[0].title).toBe('Chap 1');
      expect(res.chapters[0].url).toBe('https://manhwatv6.com/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh/chap-1.html');
      expect(res.chapters[1].title).toBe('Chap 2');
      expect(res.chapters[1].url).toBe('https://manhwatv6.com/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh/chap-2.html');
    });
  });
});

