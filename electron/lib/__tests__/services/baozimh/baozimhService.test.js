const {
  baozimhHtmlUrlCandidates,
  BaozimhService,
} = require('../../../platform/connectors/services/baozimhService');

describe('baozimhHtmlUrlCandidates', () => {
  const SAMPLE_COMIC_URL =
    'https://www.baozimh.com/comic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq';
  const SAMPLE_CHAPTER_URL =
    'https://www.baozimh.com/comic/chapter/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq/0_0.html';

  test('generates mirror candidates for baozimh comic detail URL', () => {
    const candidates = baozimhHtmlUrlCandidates(SAMPLE_COMIC_URL);
    expect(candidates).toContain(SAMPLE_COMIC_URL);
    expect(candidates).toContain(
      'https://www.twmanga.com/comic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq',
    );
  });

  test('generates mirror candidates for baozimh chapter URL', () => {
    const candidates = baozimhHtmlUrlCandidates(SAMPLE_CHAPTER_URL);
    expect(candidates).toContain(SAMPLE_CHAPTER_URL);
    expect(candidates).toContain(
      'https://www.twmanga.com/comic/chapter/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq/0_0.html',
    );
  });

  test('orders preferred host first when specified', () => {
    const candidates = baozimhHtmlUrlCandidates(SAMPLE_COMIC_URL, 'www.twmanga.com');
    expect(candidates[0]).toBe(
      'https://www.twmanga.com/comic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq',
    );
  });
});

describe('BaozimhService mirror fallback', () => {
  let service;

  beforeEach(() => {
    service = new BaozimhService();
  });

  test('load falls back to mirror when primary host returns 403 or challenge', async () => {
    const htmlUtils = require('../../../download/connector/htmlConnectorUtils');
    const spy = jest.spyOn(htmlUtils, 'fetchHtml').mockImplementation(async (targetUrl) => {
      if (targetUrl.includes('baozimh.com')) {
        return {
          ok: false,
          error: 'HTTP 403',
          html: '{"challenge_url":"/__gatekeeper_challenge/start","error":"challenge_required"}',
        };
      }
      if (targetUrl.includes('twmanga.com')) {
        return {
          ok: true,
          html: `
            <html>
              <body>
                <h1 class="comics-detail__title">死靈法師！我即是天災</h1>
                <meta property="og:image" content="https://static-tw.baozimh.com/cover/demo.jpg" />
                <a class="comics-chapters__item" href="/user/page_direct?comic_id=demo&section_slot=0&chapter_slot=1">第1話</a>
              </body>
            </html>
          `,
        };
      }
      return { ok: false, error: 'Unknown target' };
    });

    const result = await service.load(
      'https://www.baozimh.com/comic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq',
    );

    expect(result.ok).toBe(true);
    expect(result.manga.title).toBe('死靈法師！我即是天災');
    expect(result.chapters.length).toBe(1);
    expect(service._workingHtmlHost).toBe('www.twmanga.com');

    spy.mockRestore();
  });

  test('fetchChapterImages falls back to mirror when primary host is blocked', async () => {
    const htmlUtils = require('../../../download/connector/htmlConnectorUtils');
    const spy = jest.spyOn(htmlUtils, 'fetchHtml').mockImplementation(async (targetUrl) => {
      if (targetUrl.includes('baozimh.com')) {
        return {
          ok: false,
          error: 'HTTP 403',
          html: '{"challenge_url":"/__gatekeeper_challenge/start","error":"challenge_required"}',
        };
      }
      if (targetUrl.includes('twmanga.com')) {
        return {
          ok: true,
          html: `
            <html>
              <body>
                <amp-img id="chapter-img-0-0" class="comic-contain__item"
                  src="https://s1.baozimh.com/scomic/demo/0/0-fecr/1.jpg"></amp-img>
              </body>
            </html>
          `,
        };
      }
      return { ok: false, error: 'Unknown target' };
    });

    const images = await service.fetchChapterImages(
      'https://www.baozimh.com/comic/chapter/demo/0_0.html',
      'https://www.baozimh.com/',
    );

    expect(images.length).toBe(1);
    expect(images[0].imageUrl).toBe('https://s1.baozimh.com/scomic/demo/0/0-fecr/1.jpg');

    spy.mockRestore();
  });
});
