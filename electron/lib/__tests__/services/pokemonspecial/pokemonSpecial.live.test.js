/**
 * Live network tests for PokemonSpecial connector
 */
const service = require('../../../platform/connectors/services/pokemonSpecialService');

describe('PokemonSpecial Connector - Live', () => {
  describe('load()', () => {
    it('should load manga from home page', async () => {
      const result = await service.load('https://www.pokemonspecial.com/');

      expect(result.ok).toBe(true);
      expect(result.manga).toBeDefined();
      expect(result.manga.title).toBe('Pokémon Đặc Biệt');
      expect(result.chapters).toBeDefined();
      expect(result.chapters.length).toBeGreaterThan(0);
    }, 60000);

    it('should load manga from label page (SWSH)', async () => {
      const result = await service.load('https://www.pokemonspecial.com/search/label/swsh');

      expect(result.ok).toBe(true);
      expect(result.manga).toBeDefined();
      expect(result.manga.title).toContain('Sword Shield');
      expect(result.chapters).toBeDefined();
      expect(result.chapters.length).toBeGreaterThan(0);
    }, 30000);

    it('should load manga from label page (SV)', async () => {
      const result = await service.load('https://www.pokemonspecial.com/search/label/sv');

      expect(result.ok).toBe(true);
      expect(result.manga).toBeDefined();
      expect(result.manga.title).toContain('Scarlet Violet');
      expect(result.chapters).toBeDefined();
      expect(result.chapters.length).toBeGreaterThan(0);
    }, 30000);
  });
});
