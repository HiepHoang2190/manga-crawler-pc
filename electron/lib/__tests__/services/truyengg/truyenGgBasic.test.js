/**
 * Basic tests for TruyenGG connector & service
 */
const { describe, it, expect } = require('@jest/globals');
const truyenGgService = require('../../../platform/connectors/services/truyenGgService');
const connectors = require('../../../platform/connectors');
const {
  TRUYENGG_IMAGE_REFERER,
  isTruyenGgSiteHost,
  isTruyenGgImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('TruyenGgService Basic', () => {
  it('exports constants', () => {
    expect(truyenGgService.DOMAIN).toBe('https://truyenggvn.com/');
    expect(truyenGgService.LABEL).toBe('TruyenGG');
    expect(truyenGgService.SITE_ID).toBe('truyengg');
  });

  it('extracts slug from manga URL', () => {
    expect(
      truyenGgService.extractSlug(
        'https://truyenggvn.com/truyen-tranh/maou-no-ore-ga-dorei-elf-wo-yome-ni-shitanda-ga-dou-medereba-ii-4617',
      ),
    ).toBe('maou-no-ore-ga-dorei-elf-wo-yome-ni-shitanda-ga-dou-medereba-ii-4617');

    expect(
      truyenGgService.extractSlug(
        '/truyen-tranh/manh-ghep-so-phan-5363.html',
      ),
    ).toBe('manh-ghep-so-phan-5363');
  });

  it('builds latest updates list URL', () => {
    expect(truyenGgService.buildLatestUpdatesListUrl('https://truyenggvn.com', 1)).toBe(
      'https://truyenggvn.com/truyen-moi-cap-nhat.html',
    );
    expect(truyenGgService.buildLatestUpdatesListUrl('https://truyenggvn.com', 3)).toBe(
      'https://truyenggvn.com/truyen-moi-cap-nhat/trang-3.html',
    );
  });

  it('parses latest listing HTML', () => {
    const html = `
      <ul class="list_grid grid">
        <li>
          <div class="book_avatar">
            <a href="/truyen-tranh/test-manga-1234">
              <img src="https://i.hinhhinh.com/ebook/190x247/test.jpg" alt="Test Manga" />
            </a>
          </div>
          <div class="book_info">
            <div class="book_name">
              <h3><a title="Test Manga Title" href="/truyen-tranh/test-manga-1234">Test Manga Title</a></h3>
            </div>
            <div class="last_chapter">
              <a href="/truyen-tranh/test-manga-1234-chap-10.html">Chapter 10</a>
            </div>
          </div>
        </li>
      </ul>
      <div class="page_redirect">
        <a href="/truyen-moi-cap-nhat/trang-1.html"><p>1</p></a>
        <a href="/truyen-moi-cap-nhat/trang-50.html"><p>50</p></a>
      </div>
    `;
    const items = truyenGgService.parseTruyenGgLatestListingHtml(html, 'https://truyenggvn.com/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Manga Title');
    expect(items[0].mangaUrl).toBe('https://truyenggvn.com/truyen-tranh/test-manga-1234');
    expect(items[0].coverUrl).toBe('https://i.hinhhinh.com/ebook/190x247/test.jpg');
    expect(items[0].latestChapterLabel).toBe('Chapter 10');

    expect(truyenGgService.parseTruyenGgLatestPagerMaxPageFromHtml(html)).toBe(50);
  });

  it('parses post search listing HTML', () => {
    const html = `
      <li>
        <a href="https://truyenggvn.com/truyen-tranh/solo-leveling-123">
          <div class="search_avatar">
            <img src="https://i.hinhhinh.com/ebook/80x105/solo.jpg" />
          </div>
          <div class="search_info">
            <p class="name">Solo Leveling</p>
            <p class="name_other">Tôi thăng cấp một mình</p>
            <p>Chương 200</p>
          </div>
        </a>
      </li>
    `;
    const items = truyenGgService.parseTruyenGgPostSearchListingHtml(html, 'https://truyenggvn.com/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Solo Leveling');
    expect(items[0].mangaUrl).toBe('https://truyenggvn.com/truyen-tranh/solo-leveling-123');
    expect(items[0].coverUrl).toBe('https://i.hinhhinh.com/ebook/80x105/solo.jpg');
    expect(items[0].latestChapterLabel).toBe('Chương 200');
  });
});

describe('TruyenGG connector registry & referer', () => {
  it('is registered in connectors registry', () => {
    const connector = connectors.get('truyengg');
    expect(connector).toBeTruthy();
    expect(connector.label).toBe('TruyenGG');
    expect(connector.domain).toBe('https://truyenggvn.com/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
    expect(connector.icon).toBe('data/site-icons/truyengg.png');
  });

  it('detects site from truyenggvn.com and truyengg.com URLs', () => {
    expect(
      connectors.detectSiteIdFromUrl(
        'https://truyenggvn.com/truyen-tranh/maou-no-ore-ga-dorei-elf-wo-yome-ni-shitanda-ga-dou-medereba-ii-4617',
      ),
    ).toBe('truyengg');

    expect(
      connectors.detectSiteIdFromUrl(
        'https://truyengg.com/truyen-tranh/test-manga-123',
      ),
    ).toBe('truyengg');
  });

  it('handles referer and CDN hosts correctly', () => {
    expect(TRUYENGG_IMAGE_REFERER).toBe('https://truyenggvn.com/');
    expect(isTruyenGgSiteHost('truyenggvn.com')).toBe(true);
    expect(isTruyenGgSiteHost('m.truyengg.com')).toBe(true);
    expect(isTruyenGgImageCdnHost('i178.truyenvua.com')).toBe(true);
    expect(isTruyenGgImageCdnHost('i.hinhhinh.com')).toBe(true);

    expect(getImageRefererForUrl('https://truyenggvn.com/media/banner.jpg')).toBe(
      'https://truyenggvn.com/',
    );
  });
});
