/**
 * Basic tests for Nhất Truyện connector & service
 */
const { describe, it, expect } = require('@jest/globals');
const nhattruyenService = require('../../../platform/connectors/services/nhattruyenService');
const connectors = require('../../../platform/connectors');
const {
  NHATTRUYEN_IMAGE_REFERER,
  isNhattruyenImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('NhattruyenService Basic', () => {
  it('exports service and parsing functions', () => {
    expect(nhattruyenService.siteId).toBe('nhattruyen');
    expect(nhattruyenService.domain).toBe('https://nhattruyenqq.com/');
    expect(typeof nhattruyenService.load).toBe('function');
    expect(typeof nhattruyenService.fetchLatestUpdates).toBe('function');
    expect(typeof nhattruyenService.fetchChapterImages).toBe('function');
    expect(typeof nhattruyenService.parseNhattruyenListingHtml).toBe('function');
    expect(typeof nhattruyenService.parseNhattruyenListingMaxPage).toBe('function');
    expect(typeof nhattruyenService.parseChapterListResponse).toBe('function');
    expect(typeof nhattruyenService.parseNhattruyenChapterImagesFromHtml).toBe('function');
  });

  it('parses latest listing HTML', () => {
    const html = `
      <div class="item">
        <figure class="clearfix">
          <div class="image">
            <a title="Phạm Nhân Bé Con" href="https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con">
              <img src="/assets/images/thumb-default.jpg" data-original="https://v2.beercloudy.com/thumb/pham-nhan.jpg" alt="Phạm Nhân Bé Con" />
            </a>
          </div>
          <figcaption>
            <h3><a href="https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con">Phạm Nhân Bé Con</a></h3>
            <ul class="comic-item">
              <li class="chapter clearfix">
                <a href="https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con/chuong-106">Chapter 106</a>
              </li>
            </ul>
          </figcaption>
        </figure>
      </div>
    `;

    const items = nhattruyenService.parseNhattruyenListingHtml(html, 'https://nhattruyenqq.com/');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: 'Phạm Nhân Bé Con',
      mangaUrl: 'https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con',
      coverUrl: 'https://v2.beercloudy.com/thumb/pham-nhan.jpg',
      latestChapterLabel: 'Chapter 106',
    });
  });

  it('parses listing pagination max page', () => {
    const html = `
      <ul class="pagination">
        <li><a href="https://nhattruyenqq.com/?page=2">2</a></li>
        <li><a href="https://nhattruyenqq.com/?page=15">15</a></li>
        <li><a href="https://nhattruyenqq.com/?page=3">3</a></li>
      </ul>
    `;
    expect(nhattruyenService.parseNhattruyenListingMaxPage(html)).toBe(15);
  });

  it('parses ComicService ChapterList API JSON', () => {
    const json = JSON.stringify([
      {
        comic_id: 22807,
        chapter_id: 106,
        chapter_name: 'Chapter 106',
        chapter_num: 106,
      },
      {
        comic_id: 22807,
        chapter_id: 1,
        chapter_name: 'Chapter 1',
        chapter_num: 1,
      },
    ]);

    const chapters = nhattruyenService.parseChapterListResponse(
      json,
      'https://nhattruyenqq.com',
      'pham-nhan-be-con',
    );
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('Chapter 106');
    expect(chapters[0].url).toBe('https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con/chuong-106');
    expect(chapters[1].title).toBe('Chapter 1');
    expect(chapters[1].url).toBe('https://nhattruyenqq.com/truyen-tranh/pham-nhan-be-con/chuong-1');
  });

  it('parses chapter reading images from HTML', () => {
    const html = `
      <div class="page-chapter">
        <img class="lozad" data-src="https://v1.beercloudy.com/nettruyen/manga/106/0.jpg" data-sv1="https://v1.beercloudy.com/nettruyen/manga/106/0.jpg" src="/assets/images/thumb-default.jpg" />
        <img class="lozad" data-src="https://v1.beercloudy.com/nettruyen/manga/106/1.jpg" data-sv1="https://v1.beercloudy.com/nettruyen/manga/106/1.jpg" />
      </div>
    `;

    const images = nhattruyenService.parseNhattruyenChapterImagesFromHtml(
      html,
      'https://nhattruyenqq.com/truyen-tranh/manga/chuong-106',
    );
    expect(images).toHaveLength(2);
    expect(images[0]).toBe('https://v1.beercloudy.com/nettruyen/manga/106/0.jpg');
    expect(images[1]).toBe('https://v1.beercloudy.com/nettruyen/manga/106/1.jpg');
  });

  it('is registered in connector registry', () => {
    const connector = connectors.get('nhattruyen');
    expect(connector).toBeDefined();
    expect(connector.id).toBe('nhattruyen');
    expect(connector.label).toBe('Nhất Truyện');
    expect(connector.domain).toBe('https://nhattruyenqq.com/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
  });

  it('identifies CDN host and provides correct image referer', () => {
    expect(isNhattruyenImageCdnHost('v1.beercloudy.com')).toBe(true);
    expect(isNhattruyenImageCdnHost('nhattruyenqq.com')).toBe(true);
    expect(isNhattruyenImageCdnHost('example.com')).toBe(false);

    expect(getImageRefererForUrl('https://v1.beercloudy.com/nettruyen/img.jpg')).toBe(
      NHATTRUYEN_IMAGE_REFERER,
    );
  });
});
