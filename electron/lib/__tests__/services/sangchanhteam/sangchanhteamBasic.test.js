/**
 * Basic tests for Sang Chảnh Team connector & service
 */
const cheerio = require('cheerio');
const { describe, it, expect } = require('@jest/globals');
const sangchanhteamService = require('../../../platform/connectors/services/sangchanhteamService');
const connectors = require('../../../platform/connectors');
const {
  SANGCHANHTEAM_IMAGE_REFERER,
  isSangchanhteamImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('SangchanhteamService Basic', () => {
  it('exports service and parsing functions', () => {
    expect(sangchanhteamService.service.siteId).toBe('sangchanhteam');
    expect(sangchanhteamService.service.domain).toBe('https://sangchanhteam.com/');
    expect(typeof sangchanhteamService.load).toBe('function');
    expect(typeof sangchanhteamService.fetchLatestUpdates).toBe('function');
    expect(typeof sangchanhteamService.downloadChapter).toBe('function');
    expect(typeof sangchanhteamService.extractMangaSlug).toBe('function');
    expect(typeof sangchanhteamService.cleanMangaTitle).toBe('function');
    expect(typeof sangchanhteamService.parseChapterNumber).toBe('function');
    expect(typeof sangchanhteamService.parseChaptersFromHtml).toBe('function');
    expect(typeof sangchanhteamService.parseMangaMetadata).toBe('function');
    expect(typeof sangchanhteamService.parseMangaCards).toBe('function');
    expect(typeof sangchanhteamService.parseImagesFromHtml).toBe('function');
  });

  it('extracts manga slug correctly', () => {
    expect(
      sangchanhteamService.extractMangaSlug(
        'https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/'
      )
    ).toBe('het-nhu-han-quang-gap-nang-gat');

    expect(
      sangchanhteamService.extractMangaSlug(
        'https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/chap-181/'
      )
    ).toBe('het-nhu-han-quang-gap-nang-gat');

    expect(
      sangchanhteamService.extractMangaSlug('/truyen/het-nhu-han-quang-gap-nang-gat/')
    ).toBe('het-nhu-han-quang-gap-nang-gat');

    expect(
      sangchanhteamService.extractMangaSlug('https://sangchanhteam.com/moi-cap-nhat/')
    ).toBe('');
  });

  it('cleans manga title from suffixes', () => {
    expect(
      sangchanhteamService.cleanMangaTitle(
        'Hệt Như Hàn Quang Gặp Nắng Gắt [Tới 181] – Sang Chảnh Team'
      )
    ).toBe('Hệt Như Hàn Quang Gặp Nắng Gắt');

    expect(
      sangchanhteamService.cleanMangaTitle('Ta Là Tà Đế [Tới 200]')
    ).toBe('Ta Là Tà Đế');
  });

  it('parses chapter numbers accurately', () => {
    expect(sangchanhteamService.parseChapterNumber('Chap 181')).toBe(181);
    expect(sangchanhteamService.parseChapterNumber('Chapter 12.5')).toBe(12.5);
    expect(sangchanhteamService.parseChapterNumber('Chương 1: Mở Đầu')).toBe(1);
    expect(sangchanhteamService.parseChapterNumber('Oneshot')).toBe(0);
  });

  it('parses chapters list from HTML', () => {
    const html = `
      <div class="reading-buttons">
        <a href="https://sangchanhteam.com/truyen/test-story/chap-0/" class="uk-button uk-button-primary">Đọc</a>
      </div>
      <div class="chapter-list">
        <div class="chapter-item">
          <a href="https://sangchanhteam.com/truyen/test-story/chap-1/" class="uk-link-toggle">
            <h3>Test Story – Chap 1</h3>
          </a>
          <span class="uk-text-muted">01/01/2026</span>
        </div>
        <div class="chapter-item">
          <a href="https://sangchanhteam.com/truyen/test-story/chap-2/" class="uk-link-toggle">
            <h3>Test Story – Chap 2</h3>
          </a>
          <span class="uk-text-muted">02/01/2026</span>
        </div>
      </div>
    `;
    const $ = cheerio.load(html);
    const chapters = sangchanhteamService.parseChaptersFromHtml(
      $,
      'https://sangchanhteam.com/truyen/test-story/'
    );

    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('Chap 1');
    expect(chapters[0].url).toBe('https://sangchanhteam.com/truyen/test-story/chap-1/');
    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[1].title).toBe('Chap 2');
    expect(chapters[1].chapterNumber).toBe(2);
  });

  it('parses and sorts chapter reader images filtering ads', () => {
    const html = `
      <article class="uk-article image-based">
        <img src="https://cdn.sangchanhteam.com/De-Dau-Trang.webp" data-imc-order="0" alt="ad" />
        <img src="/placeholder.jpg" data-original-src="https://cdn.sangchanhteam.com/images/page-2.jpg" data-imc-order="2" />
        <img src="https://cdn.sangchanhteam.com/images/page-1.jpg" data-imc-order="1" />
        <img src="https://cdn.sangchanhteam.com/images/LOGO-team.png" data-imc-order="3" />
      </article>
    `;
    const $ = cheerio.load(html);
    const images = sangchanhteamService.parseImagesFromHtml(
      $,
      'https://sangchanhteam.com/truyen/test-story/chap-1/'
    );

    expect(images).toHaveLength(2);
    expect(images[0].imageUrl).toBe('https://cdn.sangchanhteam.com/images/page-1.jpg');
    expect(images[0].ext).toBe('jpg');
    expect(images[1].imageUrl).toBe('https://cdn.sangchanhteam.com/images/page-2.jpg');
    expect(images[1].ext).toBe('jpg');
  });

  it('parses manga cards for latest updates and search', () => {
    const html = `
      <div class="uk-card uk-card-default">
        <div class="uk-card-media-top">
          <a href="https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/">
            <img src="https://cdn.sangchanhteam.com/covers/cover.jpg" alt="Hệt Như Hàn Quang" />
          </a>
        </div>
        <div class="uk-card-body">
          <h3 class="uk-card-title">
            <a href="https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/">
              Hệt Như Hàn Quang Gặp Nắng Gắt [Tới 181] – Sang Chảnh Team
            </a>
          </h3>
          <ul class="uk-list">
            <li>
              <a href="https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/chap-181/">
                Chap 181
              </a>
            </li>
          </ul>
        </div>
      </div>
    `;
    const $ = cheerio.load(html);
    const cards = sangchanhteamService.parseMangaCards($, 'https://sangchanhteam.com/');

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Hệt Như Hàn Quang Gặp Nắng Gắt');
    expect(cards[0].mangaUrl).toBe('https://sangchanhteam.com/truyen/het-nhu-han-quang-gap-nang-gat/');
    expect(cards[0].coverUrl).toBe('https://cdn.sangchanhteam.com/covers/cover.jpg');
    expect(cards[0].latestChapterLabel).toBe('Chap 181');
  });

  it('is registered in connector registry', () => {
    const connector = connectors.get('sangchanhteam');
    expect(connector).toBeDefined();
    expect(connector.id).toBe('sangchanhteam');
    expect(connector.label).toBe('Sang Chảnh Team');
    expect(connector.domain).toBe('https://sangchanhteam.com/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
  });

  it('configures referer and CDN host detection correctly', () => {
    expect(SANGCHANHTEAM_IMAGE_REFERER).toBe('https://sangchanhteam.com/');
    expect(isSangchanhteamImageCdnHost('cdn.sangchanhteam.com')).toBe(true);
    expect(isSangchanhteamImageCdnHost('sangchanhteam.com')).toBe(true);
    expect(isSangchanhteamImageCdnHost('google.com')).toBe(false);

    expect(getImageRefererForUrl('https://cdn.sangchanhteam.com/manga/page-1.jpg')).toBe(
      'https://sangchanhteam.com/'
    );
  });
});
