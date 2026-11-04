/**
 * Unit tests for ComicVN chapter image URL parsing.
 * Covers CDN path variants and login lock-screen detection.
 */
const {
  parseComicvnImageUrls,
  isComicvnChapterLoginLocked,
} = require('../../../platform/connectors/services/comicvnService');

describe('ComicVN parseComicvnImageUrls', () => {
  test('accepts dated CDN page URLs (/cdn/YYYY/...) used by free chapters', () => {
    const html = `
      <img src="https://comicvn19.net/images/logo.png" alt="" />
      <img src='https://cdn.comicvn19.net/cdn/2021/07/25/16/1627228941_2a730d.jpg' alt='Hỏa Võ Anh Hùng - Chapter 88' />
      <img src='https://cdn.comicvn19.net/cdn/2021/07/25/16/1627228943_a5bf4d.jpg' alt='Hỏa Võ Anh Hùng - Chapter 88' />
      <img src="https://cdn.comicvn19.net/cdn/manga/2021/12/14/cover.gif" />
    `;
    const urls = parseComicvnImageUrls(html);
    expect(urls).toEqual([
      'https://cdn.comicvn19.net/cdn/2021/07/25/16/1627228941_2a730d.jpg',
      'https://cdn.comicvn19.net/cdn/2021/07/25/16/1627228943_a5bf4d.jpg',
    ]);
  });

  test('still accepts token and /chapter/ CDN URLs', () => {
    const html = `
      <img src="https://static.comicvn19.net/static?token=abc123" />
      <img src="https://cdn.comicvn19.net/chapter/foo/01.jpg" />
    `;
    expect(parseComicvnImageUrls(html)).toEqual([
      'https://static.comicvn19.net/static?token=abc123',
      'https://cdn.comicvn19.net/chapter/foo/01.jpg',
    ]);
  });

  test('ignores UI and cover assets', () => {
    const html = `
      <img src="https://comicvn19.net/images/loading.gif" />
      <img src="https://cdn.comicvn19.net/images/manga/cover.jpg" />
      <img src="https://cdn.comicvn19.net/manga/2021/04/12/cover.jpg" />
    `;
    expect(parseComicvnImageUrls(html)).toEqual([]);
  });
});

describe('ComicVN isComicvnChapterLoginLocked', () => {
  test('detects login lock screen when chapter requires đăng nhập', () => {
    const html = `
      <div class="lock-screen">
        <div class="center-lock-screen">
          <h4>Vui lòng <span class="btn-login">đăng nhập</span> để tiếp tục!</h4>
        </div>
      </div>
    `;
    expect(isComicvnChapterLoginLocked(html)).toBe(true);
  });

  test('returns false for unlocked chapter HTML', () => {
    const html = `
      <img src='https://cdn.comicvn19.net/cdn/2021/07/25/16/1627228941_2a730d.jpg' />
    `;
    expect(isComicvnChapterLoginLocked(html)).toBe(false);
  });
});
