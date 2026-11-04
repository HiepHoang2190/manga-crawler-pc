const {
  rewriteBaozimhComicImageUrl,
  baozimhImageUrlCandidates,
  orderBaozimhImageUrlCandidates,
  parseBaozimhChapterImages,
} = require('../../../platform/connectors/services/baozimhService');
const { isBaozimhImageCdnHost } = require('../../../download/connector/connectorReferer');

const SAMPLE_PATH =
  '/scomic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe/0/0-fecr/1.jpg';

describe('Baozimh image CDN rewrite', () => {
  test('rewrites blocked bzcdn.net hosts to s1.baozimh.com', () => {
    expect(rewriteBaozimhComicImageUrl(`https://s1.bzcdn.net${SAMPLE_PATH}`)).toBe(
      `https://s1.baozimh.com${SAMPLE_PATH}`,
    );
  });

  test('rewrites blocked baozicdn.com hosts to s1.baozimh.com', () => {
    expect(rewriteBaozimhComicImageUrl(`https://s2.baozicdn.com${SAMPLE_PATH}`)).toBe(
      `https://s1.baozimh.com${SAMPLE_PATH}`,
    );
  });

  test('keeps already-reachable baozimh.com comic hosts', () => {
    const url = `https://s2.baozimh.com${SAMPLE_PATH}`;
    expect(rewriteBaozimhComicImageUrl(url)).toBe(url);
  });

  test('does not rewrite unrelated URLs', () => {
    expect(rewriteBaozimhComicImageUrl('https://static-tw.baozimh.com/static/logo.png')).toBe(
      'https://static-tw.baozimh.com/static/logo.png',
    );
  });

  test('candidates skip blocked hosts and include reachable fallbacks', () => {
    const candidates = baozimhImageUrlCandidates(`https://s1.bzcdn.net${SAMPLE_PATH}`);
    expect(candidates[0]).toBe(`https://s1.baozimh.com${SAMPLE_PATH}`);
    expect(candidates).toContain(`https://s2.baozimh.com${SAMPLE_PATH}`);
    expect(candidates.some((u) => u.includes('bzcdn.net') || u.includes('baozicdn.com'))).toBe(
      false,
    );
  });

  test('orders a remembered working host first', () => {
    const ordered = orderBaozimhImageUrlCandidates(
      `https://s1.bzcdn.net${SAMPLE_PATH}`,
      's2.baozimh.com',
    );
    expect(ordered[0]).toBe(`https://s2.baozimh.com${SAMPLE_PATH}`);
    expect(ordered).toContain(`https://s1.baozimh.com${SAMPLE_PATH}`);
  });

  test('parseChapterImages rewrites amp-img bzcdn URLs', () => {
    const html = `
      <amp-img id="chapter-img-0-0" class="comic-contain__item"
        src="https://s1.bzcdn.net${SAMPLE_PATH}"
        data-src="https://s1.bzcdn.net${SAMPLE_PATH}"></amp-img>
    `;
    const rows = parseBaozimhChapterImages(
      html,
      'https://www.baozimh.com/comic/chapter/demo/0_0.html',
    );
    expect(rows).toEqual([{ imageUrl: `https://s1.baozimh.com${SAMPLE_PATH}`, ext: 'jpg' }]);
  });
});

describe('isBaozimhImageCdnHost', () => {
  test('accepts bzcdn, baozicdn, and baozimh comic hosts', () => {
    expect(isBaozimhImageCdnHost('s1.bzcdn.net')).toBe(true);
    expect(isBaozimhImageCdnHost('s2.baozicdn.com')).toBe(true);
    expect(isBaozimhImageCdnHost('s1.baozimh.com')).toBe(true);
  });
});
