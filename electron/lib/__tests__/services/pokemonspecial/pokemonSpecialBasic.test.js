/**
 * Basic tests for PokemonSpecial connector
 */
const service = require('../../../platform/connectors/services/pokemonSpecialService');

describe('PokemonSpecial Connector - Basic', () => {
  describe('load()', () => {
    it('should handle invalid URL', async () => {
      const result = await service.load('');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
