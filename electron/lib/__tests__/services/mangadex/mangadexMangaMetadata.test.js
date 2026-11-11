const {
  extractAuthor,
  extractAltTitles,
  extractRating,
  extractGenres,
  fetchManga,
} = require('../../../platform/connectors/services/mangadxApiClient');

describe('MangaDex Metadata Extraction', () => {
  describe('extractAuthor', () => {
    test('should extract and combine unique author and artist names', () => {
      const rels = [
        { type: 'author', attributes: { name: 'ONE' } },
        { type: 'artist', attributes: { name: 'Murata Yuusuke' } },
        { type: 'author', attributes: { name: 'ONE' } }, // duplicate
      ];
      expect(extractAuthor(rels)).toBe('ONE, Murata Yuusuke');
    });

    test('should return empty string if no author/artist', () => {
      expect(extractAuthor([])).toBe('');
      expect(extractAuthor(null)).toBe('');
    });
  });

  describe('extractAltTitles', () => {
    test('should extract unique alternative titles from altTitles array', () => {
      const alt = [
        { 'ja-ro': 'Comi-san ha Comyusho Desu.' },
        { en: "Komi Can't Communicate" },
        { vi: 'Komi Không Thể Giao Tiếp' },
        { en: "Komi Can't Communicate" }, // duplicate
      ];
      expect(extractAltTitles({ altTitles: alt })).toEqual([
        'Comi-san ha Comyusho Desu.',
        "Komi Can't Communicate",
        'Komi Không Thể Giao Tiếp',
      ]);
    });

    test('should return empty array if no altTitles', () => {
      expect(extractAltTitles({})).toEqual([]);
      expect(extractAltTitles(null)).toEqual([]);
    });
  });

  describe('extractRating', () => {
    test('should extract bayesian rating or average rating rounded to 2 decimals', () => {
      const statsData = {
        statistics: {
          'manga-123': {
            rating: {
              bayesian: 8.96726,
              average: 8.972,
            },
          },
        },
      };
      expect(extractRating(statsData, 'manga-123')).toBe(8.97);
    });

    test('should fallback to average if bayesian is missing or 0', () => {
      const statsData = {
        statistics: {
          'manga-123': {
            rating: {
              bayesian: 0,
              average: 7.543,
            },
          },
        },
      };
      expect(extractRating(statsData, 'manga-123')).toBe(7.54);
    });

    test('should return null if stats or rating is missing', () => {
      expect(extractRating(null, 'manga-123')).toBeNull();
      expect(extractRating({}, 'manga-123')).toBeNull();
    });
  });

  describe('extractGenres', () => {
    test('should extract unique tag names', () => {
      const tags = [
        { attributes: { name: { en: 'Romance' } } },
        { attributes: { name: { en: 'Comedy' } } },
        { attributes: { name: { en: 'School Life' } } },
      ];
      expect(extractGenres({ tags })).toEqual(['Romance', 'Comedy', 'School Life']);
    });

    test('should return empty array if no tags', () => {
      expect(extractGenres({})).toEqual([]);
      expect(extractGenres(null)).toEqual([]);
    });
  });
});

