/**
 * Basic tests for Bảo Tàng Truyện connector & service
 */
const { describe, it, expect } = require('@jest/globals');
const baotangtruyenService = require('../../../platform/connectors/services/baotangtruyenService');
const connectors = require('../../../platform/connectors');
const {
  BAOTANGTRUYEN_IMAGE_REFERER,
  isBaotangtruyenImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('BaotangtruyenService Basic', () => {
  it('exports constants and helper functions', () => {
    expect(baotangtruyenService.DOMAIN).toBe('https://baotangtruyen.net/');
    expect(baotangtruyenService.LABEL).toBe('Bảo Tàng Truyện');
    expect(typeof baotangtruyenService.extractMangaSlug).toBe('function');
    expect(typeof baotangtruyenService.cleanMangaTitle).toBe('function');
  });

  it('extracts slug from manga and chapter URLs', () => {
    expect(
      baotangtruyenService.extractMangaSlug('https://baotangtruyen.net/one-piece'),
    ).toBe('one-piece');

    expect(
      baotangtruyenService.extractMangaSlug('https://baotangtruyen.net/nguyen-tac-cua-serim/chuong-20'),
    ).toBe('nguyen-tac-cua-serim');

    expect(
      baotangtruyenService.extractMangaSlug('/sau-khi-chia-tay-hoa-khoi-vo-dao-cua-ta-thang-toi-cap-than'),
    ).toBe('sau-khi-chia-tay-hoa-khoi-vo-dao-cua-ta-thang-toi-cap-than');

    // Reserved paths should not be treated as manga slugs
    expect(baotangtruyenService.extractMangaSlug('https://baotangtruyen.net/danh-sach/truyen-moi')).toBe('');
    expect(baotangtruyenService.extractMangaSlug('https://baotangtruyen.net/the-loai/action')).toBe('');
    expect(baotangtruyenService.extractMangaSlug('https://baotangtruyen.net/tim-kiem-nang-cao')).toBe('');
  });

  it('cleans manga title properly', () => {
    expect(
      baotangtruyenService.cleanMangaTitle('Truyện One Piece - Bảo tàng truyện'),
    ).toBe('One Piece');
    expect(
      baotangtruyenService.cleanMangaTitle('Nguyên Tắc Của Serim'),
    ).toBe('Nguyên Tắc Của Serim');
  });

  it('parses latest listing HTML', () => {
    const html = `
      <div class="comic-grid">
        <div class="comic-card">
          <span class="thumb">
            <a href="https://baotangtruyen.net/test-manga" title="Test Manga">
              <img src="/images/test.jpg" alt="Test Manga" />
            </a>
          </span>
          <div class="c-info">
            <h2><a class="c-title" href="https://baotangtruyen.net/test-manga">Test Manga Title</a></h2>
            <a class="c-chap" href="https://baotangtruyen.net/test-manga/chuong-10">Chapter 10</a>
          </div>
        </div>
      </div>
      <div class="phan-trang">
        <ul>
          <li><a href="https://baotangtruyen.net/danh-sach/truyen-moi-cap-nhat?page=1">1</a></li>
          <li><a href="https://baotangtruyen.net/danh-sach/truyen-moi-cap-nhat?page=45">45</a></li>
        </ul>
      </div>
    `;
    const items = baotangtruyenService.parseBaotangtruyenListingHtml(html, 'https://baotangtruyen.net/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Manga Title');
    expect(items[0].mangaUrl).toBe('https://baotangtruyen.net/test-manga');
    expect(items[0].coverUrl).toBe('https://baotangtruyen.net/images/test.jpg');
    expect(items[0].latestChapterLabel).toBe('Chapter 10');

    expect(baotangtruyenService.parseBaotangtruyenListingMaxPage(html)).toBe(45);
  });

  it('parses search API JSON response', () => {
    const json = {
      status: 'success',
      comics: [
        {
          id: 138,
          name: 'Nguyên Tắc Của Serim',
          slug: 'nguyen-tac-cua-serim',
          thumbnail: '/images/nguyen-tac-cua-serim.jpg',
          last_chapter: {
            id: 58549,
            name: '20',
            title: 'Chapter 20',
            slug: 'chuong-20',
          },
        },
      ],
    };
    const items = baotangtruyenService.parseBaotangtruyenSearchJson(json, 'https://baotangtruyen.net/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Nguyên Tắc Của Serim');
    expect(items[0].mangaUrl).toBe('https://baotangtruyen.net/nguyen-tac-cua-serim');
    expect(items[0].coverUrl).toBe('https://baotangtruyen.net/images/nguyen-tac-cua-serim.jpg');
    expect(items[0].latestChapterLabel).toBe('Chapter 20');
  });
});

describe('Bảo Tàng Truyện connector registry & referer', () => {
  it('is registered in connectors registry', () => {
    const connector = connectors.get('baotangtruyen');
    expect(connector).toBeTruthy();
    expect(connector.label).toBe('Bảo Tàng Truyện');
    expect(connector.domain).toBe('https://baotangtruyen.net/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
    expect(connector.icon).toBe('data/site-icons/baotangtruyen.png');
  });

  it('detects site from baotangtruyen.net URLs', () => {
    expect(
      connectors.detectSiteIdFromUrl('https://baotangtruyen.net/nguyen-tac-cua-serim'),
    ).toBe('baotangtruyen');

    expect(
      connectors.detectSiteIdFromUrl('https://baotangtruyen.net/nguyen-tac-cua-serim/chuong-20'),
    ).toBe('baotangtruyen');
  });

  it('handles referer and CDN hosts correctly', () => {
    expect(BAOTANGTRUYEN_IMAGE_REFERER).toBe('https://baotangtruyen.net/');
    expect(isBaotangtruyenImageCdnHost('baotangtruyen.net')).toBe(true);
    expect(isBaotangtruyenImageCdnHost('net.imgchapter.store')).toBe(true);
    expect(isBaotangtruyenImageCdnHost('imgchapter.store')).toBe(true);

    expect(
      getImageRefererForUrl('https://net.imgchapter.store/nguyen-tac-cua-serim/20/page_0.jpg'),
    ).toBe('https://baotangtruyen.net/');
  });
});
