/**
 * @jest-environment node
 */
const batcaveService = require('../../platform/connectors/services/batcaveService');

// Mock electron BrowserWindow for unit tests
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
}), { virtual: true });

describe('BatcaveService', () => {
  describe('load', () => {
    it('should return error for empty URL', async () => {
      const result = await batcaveService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should return error for invalid URL', async () => {
      const result = await batcaveService.load('not-a-url');
      expect(result.ok).toBe(false);
    });
  });

  describe('DOMAIN and LABEL', () => {
    it('should have correct domain', () => {
      expect(batcaveService.DOMAIN).toBe('https://batcave.biz/');
    });

    it('should have correct label', () => {
      expect(batcaveService.LABEL).toBe('Batcave');
    });
  });

  describe('module exports', () => {
    it('should export load function', () => {
      expect(typeof batcaveService.load).toBe('function');
    });

    it('should export downloadChapter function', () => {
      expect(typeof batcaveService.downloadChapter).toBe('function');
    });
  });

  describe('isChallengePageContent', () => {
    it('should treat "Just a moment..." as challenge', () => {
      expect(
        batcaveService.isChallengePageContent('<html></html>', 'Just a moment...'),
      ).toBe(true);
    });

    it('should NOT treat cloudflareinsights beacon on a real comic page as challenge', () => {
      const comic_html = `
        <html><head><title>Immortal Hulk (2018) Comics Online Free</title>
        <script src="https://static.cloudflareinsights.com/beacon.min.js"></script>
        </head><body><h1>Immortal Hulk (2018)</h1>
        <script>window.__DATA__ = {"news_id":18570,"chapters":[]};</script>
        </body></html>`;
      expect(
        batcaveService.isChallengePageContent(
          comic_html,
          'Immortal Hulk (2018) Comics Online Free',
        ),
      ).toBe(false);
    });
  });

  describe('parseWindowDataFromHtml / chapters / images', () => {
    const comic_html = `
      <html><head><title>Immortal Hulk (2018)</title></head><body>
      <h1>Immortal Hulk (2018)</h1>
      <script>
      window.__DATA__ = {"news_id":18570,"title":"Immortal Hulk (2018)","limit":30,"chapters":[{"id":127948,"title":"Immortal Hulk (2018) Issue #50"},{"id":127898,"title":"Immortal Hulk (2018) Issue #0"}]};
      </script>
      </body></html>`;

    const reader_html = `
      <html><body>
      <script>
      window.__DATA__ = {"news_id":18570,"chapter_id":127898,"images":["https://img.batcave.biz/img/19/18570/127898/1-aaa.jpg","https://img.batcave.biz/img/19/18570/127898/2-bbb.jpg"],"chapters":[{"id":127898,"title":"Issue #0"}]};
      </script>
      </body></html>`;

    it('should parse window.__DATA__ from comic HTML', () => {
      const data = batcaveService.parseWindowDataFromHtml(comic_html);
      expect(data).toBeTruthy();
      expect(data.news_id).toBe(18570);
      expect(data.chapters).toHaveLength(2);
    });

    it('should build full /reader/ chapter URLs from __DATA__', () => {
      const data = batcaveService.parseWindowDataFromHtml(comic_html);
      const chapters = batcaveService.buildChaptersFromWindowData(data);
      expect(chapters).toHaveLength(2);
      expect(chapters[0].url).toBe('https://batcave.biz/reader/18570/127948');
      expect(chapters[1].url).toBe('https://batcave.biz/reader/18570/127898');
      expect(chapters[0].title).toContain('Issue #50');
    });

    it('should parse chapters via parseChapters (ascending after reverse)', () => {
      const chapters = batcaveService.parseChapters(
        comic_html,
        'https://batcave.biz/18570-immortal-hulk-2018.html',
      );
      expect(chapters.length).toBe(2);
      expect(chapters[0].url).toContain('/reader/18570/127898');
      expect(chapters[1].url).toContain('/reader/18570/127948');
    });

    it('should extract image URLs from reader __DATA__', () => {
      const urls = batcaveService.extractChapterImageUrls(reader_html);
      expect(urls).toEqual([
        'https://img.batcave.biz/img/19/18570/127898/1-aaa.jpg',
        'https://img.batcave.biz/img/19/18570/127898/2-bbb.jpg',
      ]);
    });

    it('should parse title from __DATA__', () => {
      expect(batcaveService.parseTitle(comic_html)).toBe('Immortal Hulk (2018)');
    });
  });

  describe('latest updates / search listing parsers', () => {
    const latest_html = `
      <ul>
        <li class="latest grid-item d-flex ai-center">
          <a href="/34335-ben-10-2026.html" class="latest__img">
            <img src="/uploads/mini/64x96/9d/cover.webp" alt="">
          </a>
          <div class="latest__desc">
            <p class="latest__title"><a href="/34335-ben-10-2026.html">Ben 10 (2026-)</a></p>
            <p class="latest__chapter"><a href="/reader/34335/269949">12.07.2026 - Ben 10 (2026-) #3</a></p>
          </div>
        </li>
      </ul>`;

    const search_html = `
      <div class="readed d-flex short">
        <a href="https://batcave.biz/6944-wonder-woman-2023.html" class="readed__img">
          <img data-src="/uploads/mini/100x150/9f/ww.webp" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Wonder Woman (2023-)">
        </a>
        <div class="readed__desc">
          <h2 class="readed__title"><a href="https://batcave.biz/6944-wonder-woman-2023.html">Wonder Woman (2023-)</a></h2>
          <div class="readed__meta-item">Last issue: Wonder Woman (2023-) #34</div>
        </div>
      </div>
      <div class="pagination"><div class="pagination__pages">
        <span>1</span>
        <a href="/search/wonder/page/2/">2</a>
        <a href="/search/wonder/page/10/">10</a>
      </div></div>`;

    it('should parse homepage latest items', () => {
      const items = batcaveService.parseLatestListingHtml(
        latest_html,
        'https://batcave.biz/',
      );
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Ben 10 (2026-)');
      expect(items[0].mangaUrl).toBe('https://batcave.biz/34335-ben-10-2026.html');
      expect(items[0].coverUrl).toContain('/uploads/mini/');
      expect(items[0].latestChapterLabel).toContain('Ben 10');
    });

    it('should parse search .readed cards and pagination', () => {
      const items = batcaveService.parseReadedListingHtml(
        search_html,
        'https://batcave.biz/search/wonder',
      );
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Wonder Woman (2023-)');
      expect(items[0].mangaUrl).toContain('6944-wonder-woman-2023.html');
      expect(items[0].coverUrl).toContain('/uploads/mini/100x150/');
      expect(items[0].latestChapterLabel).toContain('#34');
      expect(batcaveService.parseListingTotalPages(search_html)).toBe(10);
    });

    it('should build search and listing URLs', () => {
      expect(batcaveService.buildSearchListingUrl('wonder', 1)).toBe(
        'https://batcave.biz/search/wonder',
      );
      expect(batcaveService.buildSearchListingUrl('wonder', 2)).toBe(
        'https://batcave.biz/search/wonder/page/2/',
      );
      expect(batcaveService.buildLatestListingUrl(1)).toBe('https://batcave.biz/');
      expect(batcaveService.buildLatestListingUrl(3)).toBe(
        'https://batcave.biz/comix/page/3/',
      );
    });

    it('should export fetchLatestUpdates', () => {
      expect(typeof batcaveService.fetchLatestUpdates).toBe('function');
    });
  });

  describe('Cookie & Login Wall Support', () => {
    const batcaveConnector = require('../../platform/connectors/batcave');
    const cookieManager = require('../../platform/cookies/cookieManager');

    it('connector should require cookie for login support', () => {
      expect(batcaveConnector.requiresCookie).toBe(true);
    });

    it('should resolve cookie from options or cookieManager', () => {
      expect(batcaveService.resolveCookie({ cookie: 'custom_cf=123' })).toBe('custom_cf=123');

      jest.spyOn(cookieManager, 'getEffectiveCookie').mockReturnValueOnce('saved_cookie=xyz');
      expect(batcaveService.resolveCookie({})).toBe('saved_cookie=xyz');
    });

    it('should include effective cookie in getImageHeaders', () => {
      jest.spyOn(cookieManager, 'getEffectiveCookie').mockReturnValueOnce('member_id=999; pass_hash=abc');
      const headers = batcaveService.getImageHeaders('https://batcave.biz/');
      expect(headers.Cookie).toContain('member_id=999');
      expect(headers.Referer).toBe('https://batcave.biz/');
    });

    it('should identify login-required HTML content', () => {
      expect(batcaveService.isLoginRequiredHtml('<div>Please login to read this comic</div>')).toBe(true);
      expect(batcaveService.isLoginRequiredHtml('<div class="login-required">Restricted</div>')).toBe(true);
      expect(batcaveService.isLoginRequiredHtml('<div>This content is for registered users only</div>')).toBe(true);
      expect(batcaveService.isLoginRequiredHtml('<div>Truyện này yêu cầu đăng nhập</div>')).toBe(true);
      expect(batcaveService.isLoginRequiredHtml('<div>Normal comic page with issues</div>')).toBe(false);
    });
  });
});

