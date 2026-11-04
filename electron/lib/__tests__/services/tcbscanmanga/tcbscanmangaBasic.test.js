/**
 * Basic tests for TCB Scan Manga connector & service
 */
const cheerio = require('cheerio');
const { describe, it, expect } = require('@jest/globals');
const tcbscanmangaService = require('../../../platform/connectors/services/tcbscanmangaService');
const connectors = require('../../../platform/connectors');
const {
  TCBSCANMANGA_IMAGE_REFERER,
  isTcbscanmangaImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('TcbscanmangaService Basic', () => {
  it('exports service and parsing functions', () => {
    expect(tcbscanmangaService.service.siteId).toBe('tcbscanmanga');
    expect(tcbscanmangaService.service.domain).toBe('https://tcbscanmanga.com/');
    expect(typeof tcbscanmangaService.load).toBe('function');
    expect(typeof tcbscanmangaService.fetchLatestUpdates).toBe('function');
    expect(typeof tcbscanmangaService.downloadChapter).toBe('function');
    expect(typeof tcbscanmangaService.fetchChapterImages).toBe('function');
    expect(typeof tcbscanmangaService.extractMangaSlug).toBe('function');
    expect(typeof tcbscanmangaService.cleanMangaTitle).toBe('function');
    expect(typeof tcbscanmangaService.parseChapterNumber).toBe('function');
    expect(typeof tcbscanmangaService.parseChaptersFromApiHtml).toBe('function');
    expect(typeof tcbscanmangaService.parseChaptersFromHtml).toBe('function');
    expect(typeof tcbscanmangaService.parseMangaMetadata).toBe('function');
    expect(typeof tcbscanmangaService.parseMangaCards).toBe('function');
    expect(typeof tcbscanmangaService.parseReaderImages).toBe('function');
  });

  it('extracts manga slug correctly', () => {
    expect(
      tcbscanmangaService.extractMangaSlug(
        'https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-'
      )
    ).toBe('futago-matomete-kanojo-ni-shinai-');

    expect(
      tcbscanmangaService.extractMangaSlug(
        'https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-/chapter-23.1'
      )
    ).toBe('futago-matomete-kanojo-ni-shinai-');

    expect(
      tcbscanmangaService.extractMangaSlug('/manga/futago-matomete-kanojo-ni-shinai-/')
    ).toBe('futago-matomete-kanojo-ni-shinai-');

    expect(
      tcbscanmangaService.extractMangaSlug('https://tcbscanmanga.com/manga')
    ).toBe('');

    expect(
      tcbscanmangaService.extractMangaSlug('https://tcbscanmanga.com/search')
    ).toBe('');
  });

  it('cleans manga title from suffixes', () => {
    expect(
      tcbscanmangaService.cleanMangaTitle(
        'Futago Matomete Kanojo ni Shinai? | TCB Scan'
      )
    ).toBe('Futago Matomete Kanojo ni Shinai?');

    expect(
      tcbscanmangaService.cleanMangaTitle('One Piece – TCB Scan')
    ).toBe('One Piece');

    expect(
      tcbscanmangaService.cleanMangaTitle('Jujutsu Kaisen')
    ).toBe('Jujutsu Kaisen');
  });

  it('parses chapter numbers accurately', () => {
    expect(tcbscanmangaService.parseChapterNumber('Chapter 23.1')).toBe(23.1);
    expect(tcbscanmangaService.parseChapterNumber('Chapter 1')).toBe(1);
    expect(tcbscanmangaService.parseChapterNumber('Ch. 19.5')).toBe(19.5);
    expect(tcbscanmangaService.parseChapterNumber('Oneshot')).toBe(0);
  });

  it('parses chapters from webapi HTML select', () => {
    const apiHtml = `
      <label>
        <select class="selectpicker single-chapter-select" name="chapter_list">
          <option class="short" value="chapter-23.1" data-redirect="https://tcbscanmanga.com/manga/test-manga/chapter-23.1">
            Chapter 23.1
          </option>
          <option class="short" value="chapter-22" data-redirect="https://tcbscanmanga.com/manga/test-manga/chapter-22">
            Chapter 22
          </option>
          <option class="short" value="chapter-1" data-redirect="https://tcbscanmanga.com/manga/test-manga/chapter-1">
            Chapter 1
          </option>
        </select>
      </label>
    `;

    const chapters = tcbscanmangaService.parseChaptersFromApiHtml(
      apiHtml,
      'https://tcbscanmanga.com/manga/test-manga'
    );

    expect(chapters).toHaveLength(3);
    // Ascending order check (Chapter 1, 22, 23.1)
    expect(chapters[0].title).toBe('Chapter 1');
    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[0].url).toBe('https://tcbscanmanga.com/manga/test-manga/chapter-1');

    expect(chapters[2].title).toBe('Chapter 23.1');
    expect(chapters[2].chapterNumber).toBe(23.1);
  });

  it('parses chapters list from DOM fallback HTML', () => {
    const html = `
      <div class="listing-chapters_wrap">
        <ul class="main version-chap">
          <li class="wp-manga-chapter">
            <a href="https://tcbscanmanga.com/manga/test-manga/chapter-2">Chapter 2</a>
          </li>
          <li class="wp-manga-chapter">
            <a href="https://tcbscanmanga.com/manga/test-manga/chapter-1">Chapter 1</a>
          </li>
        </ul>
      </div>
    `;

    const chapters = tcbscanmangaService.parseChaptersFromHtml(
      html,
      'https://tcbscanmanga.com/manga/test-manga'
    );

    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('Chapter 1');
    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[1].title).toBe('Chapter 2');
    expect(chapters[1].chapterNumber).toBe(2);
  });

  it('parses and filters chapter reader images', () => {
    const html = `
      <div class="reading-content">
        <img id="image-0" src="https://scans.lastation.us/manga/futago/0023.1-001.png" class="wp-manga-chapter-img" alt="Page 1">
        <img id="image-1" data-src="https://scans.lastation.us/manga/futago/0023.1-002.png" class="wp-manga-chapter-img" alt="Page 2">
        <!-- Ad image to filter -->
        <img src="https://movementssubscriptionobjection.com/ad.jpg" class="banner-ad">
        <img id="image-2" src="https://scans.lastation.us/manga/futago/0023.1-003.png" class="wp-manga-chapter-img" alt="Page 3">
      </div>
    `;

    const images = tcbscanmangaService.parseReaderImages(
      html,
      'https://tcbscanmanga.com/manga/futago/chapter-23.1'
    );

    expect(images).toHaveLength(3);
    expect(images[0]).toBe('https://scans.lastation.us/manga/futago/0023.1-001.png');
    expect(images[1]).toBe('https://scans.lastation.us/manga/futago/0023.1-002.png');
    expect(images[2]).toBe('https://scans.lastation.us/manga/futago/0023.1-003.png');
  });

  it('parses manga cards for latest updates and search', () => {
    const html = `
      <div class="page-listing-item">
        <div class="page-item-detail manga">
          <div class="item-thumb">
            <a href="https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-">
              <img src="https://temp.compsci88.com/cover/fallback/01JF.jpg" alt="Futago">
            </a>
          </div>
          <div class="item-summary">
            <div class="post-title font-title">
              <h3 class="h5">
                <a href="https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-">Futago Matomete Kanojo ni Shinai?</a>
              </h3>
            </div>
            <div class="list-chapter">
              <div class="chapter-item">
                <span class="chapter font-meta">
                  <a href="https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-/chapter-23.1">Chapter 23.1</a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const { items, hasNextPage } = tcbscanmangaService.parseMangaCards(
      html,
      'https://tcbscanmanga.com/'
    );

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Futago Matomete Kanojo ni Shinai?');
    expect(items[0].mangaUrl).toBe('https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-');
    expect(items[0].url).toBe('https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-');
    expect(items[0].coverUrl).toBe('https://temp.compsci88.com/cover/fallback/01JF.jpg');
    expect(items[0].latestChapterLabel).toBe('Chapter 23.1');
    expect(items[0].latestChapter).toBe('Chapter 23.1');
    expect(hasNextPage).toBe(false);
  });

  it('is registered in connector registry', () => {
    const connector = connectors.get('tcbscanmanga');
    expect(connector).toBeDefined();
    expect(connector.id).toBe('tcbscanmanga');
    expect(connector.label).toBe('TCB Scan');
    expect(connector.domain).toBe('https://tcbscanmanga.com/');
    expect(connector.supportsLatestUpdates).toBe(true);

    const detected = connectors.detectSiteIdFromUrl(
      'https://tcbscanmanga.com/manga/futago-matomete-kanojo-ni-shinai-'
    );
    expect(detected).toBe('tcbscanmanga');
  });

  it('configures referer and CDN host detection correctly', () => {
    expect(isTcbscanmangaImageCdnHost('scans.lastation.us')).toBe(true);
    expect(isTcbscanmangaImageCdnHost('official.lowee.us')).toBe(true);
    expect(isTcbscanmangaImageCdnHost('temp.compsci88.com')).toBe(true);
    expect(isTcbscanmangaImageCdnHost('tcbscanmanga.com')).toBe(true);
    expect(isTcbscanmangaImageCdnHost('othercdn.com')).toBe(false);

    expect(
      getImageRefererForUrl('https://official.lowee.us/manga/Monster-8/0020-001.png')
    ).toBe(TCBSCANMANGA_IMAGE_REFERER);
  });
});
