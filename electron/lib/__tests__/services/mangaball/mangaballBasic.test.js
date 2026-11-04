/**
 * MangaBall chapter listing — site dropped __NEXT_DATA__ for a PHP + AJAX API.
 * Live shape: POST /api/v1/chapter/chapter-listing-by-title-id/
 */
const { describe, test, expect } = require('@jest/globals');
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');
const mangaballService = require('../../../platform/connectors/services/mangaballService');
const mangaballConnector = require('../../../platform/connectors/mangaball');

const FORGOTTEN_FIELD_URL =
  'https://mangaball.net/title-detail/the-forgotten-field-69f31c3c97caae53bbb3b0c3/';

const LISTING_PAYLOAD = {
  code: 200,
  TOTAL_CHAPTERS: 2,
  TOTAL_TRANSLATIONS: 3,
  ALL_LANGUAGES: ['en', 'id'],
  ALL_CHAPTERS: [
    {
      number: 'Ch. 33',
      number_float: 33,
      title: 'Chapter 33',
      translations: [
        {
          id: 'ch33en',
          name: 'Chapter 33',
          language: 'en',
          languageName: 'English',
          group: { name: 'Swampert' },
          pages: 10,
          url: 'http://mangaball.net/chapter-detail/ch33en/',
          volume: 0,
        },
        {
          id: 'ch33id',
          name: 'Chapter 33',
          language: 'id',
          languageName: 'Indonesian',
          group: { name: 'Lugia' },
          pages: 47,
          url: 'http://mangaball.net/chapter-detail/ch33id/',
          volume: 0,
        },
      ],
    },
    {
      number: 'Ch. 0',
      number_float: 0,
      title: 'Ch. 0',
      translations: [
        {
          id: 'ch0en',
          name: 'Ch. 0',
          language: 'en',
          languageName: 'English',
          group: { name: 'Entei' },
          pages: 1,
          url: 'http://mangaball.net/chapter-detail/ch0en/',
          volume: 0,
        },
      ],
    },
  ],
};

describe('MangaBall connector basics', () => {
  test('detects title-detail URLs', () => {
    expect(detectSiteIdFromUrl(FORGOTTEN_FIELD_URL)).toBe('mangaball');
    expect(detectSiteIdFromUrl('https://mangaball.net/chapter-detail/abc/')).toBe('mangaball');
    expect(
      detectSiteIdFromUrl('https://mangaball.com/title-detail/685167fe702284f83417c06b'),
    ).toBe('mangaball');
    expect(
      detectSiteIdFromUrl('https://mangaball.com/chapter-detail/6abbd7215b9cf3439b7a8562'),
    ).toBe('mangaball');
  });

  test('is registered', () => {
    const connector = get('mangaball');
    expect(connector).not.toBeNull();
    expect(connector.id).toBe('mangaball');
    expect(mangaballConnector.id).toBe('mangaball');
  });

  test('requires a saved user cookie for Cloudflare protection', () => {
    expect(mangaballConnector.requiresCookie).toBe(true);
    expect(get('mangaball').requiresCookie).toBe(true);
  });
});

describe('MangaBall listing API parsers', () => {
  test('extracts title id from title-detail URL', () => {
    const title_info = mangaballService.extractTitleInfo(FORGOTTEN_FIELD_URL);
    expect(title_info).toEqual({
      fullSlug: 'the-forgotten-field-69f31c3c97caae53bbb3b0c3',
      titleId: '69f31c3c97caae53bbb3b0c3',
    });

    const new_url_info = mangaballService.extractTitleInfo(
      'https://mangaball.com/title-detail/685167fe702284f83417c06b',
    );
    expect(new_url_info).toEqual({
      fullSlug: '685167fe702284f83417c06b',
      titleId: '685167fe702284f83417c06b',
    });

    const prefix_id_url_info = mangaballService.extractTitleInfo(
      'https://mangaball.com/title-detail/68515f32702284f83417a32a-maiko-san-chi-no-makanai-san',
    );
    expect(prefix_id_url_info).toEqual({
      fullSlug: '68515f32702284f83417a32a-maiko-san-chi-no-makanai-san',
      titleId: '68515f32702284f83417a32a',
    });

    const prefix_id_trailing_slash = mangaballService.extractTitleInfo(
      'https://mangaball.com/title-detail/68515f32702284f83417a32a-maiko-san-chi-no-makanai-san/',
    );
    expect(prefix_id_trailing_slash).toEqual({
      fullSlug: '68515f32702284f83417a32a-maiko-san-chi-no-makanai-san',
      titleId: '68515f32702284f83417a32a',
    });
  });

  test('extracts CSRF token from PHP page meta (no __NEXT_DATA__)', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta name="csrf-token" content="abc123csrf">
      <title>The Forgotten Field</title>
    </head><body>0 Chapters with 0 Translations</body></html>`;
    expect(mangaballService.extractCsrfToken(html)).toBe('abc123csrf');
    expect(mangaballService.extractCsrfToken('<html></html>')).toBe('');
  });

  test('parses every English translation from listing API ALL_CHAPTERS', () => {
    const chapters = mangaballService.parseListingApiChapters(LISTING_PAYLOAD, 'en');
    expect(chapters).toHaveLength(2);
    expect(chapters.map((ch) => ch.url)).toEqual([
      'https://mangaball.net/chapter-detail/ch33en/',
      'https://mangaball.net/chapter-detail/ch0en/',
    ]);
    expect(chapters[0].title).toMatch(/33/);
    expect(chapters[1].title).toMatch(/0/);
  });

  test('keeps Vietnamese translations when lang is vi', () => {
    const payload = {
      code: 200,
      ALL_CHAPTERS: [
        {
          number: 'Ch. 1',
          number_float: 1,
          title: 'Chapter 1',
          translations: [
            {
              id: 'ch1vi',
              name: 'Chương 1',
              language: 'vi',
              languageName: 'Vietnamese',
              group: { name: 'GroupA' },
              url: 'http://mangaball.net/chapter-detail/ch1vi/',
              volume: 0,
            },
            {
              id: 'ch1en',
              name: 'Chapter 1',
              language: 'en',
              languageName: 'English',
              group: { name: 'GroupB' },
              url: 'http://mangaball.net/chapter-detail/ch1en/',
              volume: 0,
            },
          ],
        },
      ],
    };
    const chapters = mangaballService.parseListingApiChapters(payload, 'vi');
    expect(chapters).toHaveLength(1);
    expect(chapters[0].url).toBe('https://mangaball.net/chapter-detail/ch1vi/');
  });

  test('does not treat French as English', () => {
    const chapters = mangaballService.parseListingApiChapters(
      {
        code: 200,
        ALL_CHAPTERS: [
          {
            number: 'Ch. 1',
            translations: [
              {
                id: 'ch1fr',
                name: 'Chapitre 1',
                language: 'fr',
                languageName: 'French',
                url: 'http://mangaball.net/chapter-detail/ch1fr/',
              },
            ],
          },
        ],
      },
      'en',
    );
    expect(chapters).toEqual([]);
  });

  test('parses V2 API data payload format (mangaball.com Next.js)', () => {
    const v2Payload = {
      status: 'success',
      data: [
        {
          id: '6abbd7215b9cf3439b7a8562',
          title_id: '685167fe702284f83417c06b',
          lang: 'vi',
          name: 'Chương 88.2',
          number: 88.2,
          volume: 0,
          group_name: 'Rayquaza',
        },
        {
          id: '6a95a369f95f93a6d7792c4e',
          title_id: '685167fe702284f83417c06b',
          lang: 'en',
          name: 'Chapter 84',
          number: 84,
          volume: 0,
          group_name: 'Rhydon',
        },
      ],
    };

    const viChapters = mangaballService.parseListingApiChapters(v2Payload, 'vi');
    expect(viChapters).toHaveLength(1);
    expect(viChapters[0].url).toBe('https://mangaball.com/chapter-detail/6abbd7215b9cf3439b7a8562/');
    expect(viChapters[0].title).toContain('Chương 88.2');

    const enChapters = mangaballService.parseListingApiChapters(v2Payload, 'en');
    expect(enChapters).toHaveLength(1);
    expect(enChapters[0].url).toBe('https://mangaball.com/chapter-detail/6a95a369f95f93a6d7792c4e/');
    expect(enChapters[0].title).toContain('Chapter 84');
  });

  test('returns empty list when listing API has no chapters', () => {
    expect(mangaballService.parseListingApiChapters({ code: 200, ALL_CHAPTERS: [] }, 'en')).toEqual(
      [],
    );
    expect(mangaballService.parseListingApiChapters({ code: 403 }, 'en')).toEqual([]);
    expect(mangaballService.parseListingApiChapters(null, 'en')).toEqual([]);
  });
});
