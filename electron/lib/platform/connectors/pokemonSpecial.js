const service = require('./services/pokemonSpecialService');
const { getIconPath } = require('./iconPath');

const LABEL = 'PokemonSpecial';

module.exports = {
  id: 'pokemonspecial',
  label: LABEL,
  domain: 'https://www.pokemonspecial.com/',
  hostIncludes: ['pokemonspecial'],
  icon: getIconPath('pokemonspecial'),
  supportsApiFetch: false,
  requiresCookie: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,
  imageReferer: 'https://www.pokemonspecial.com/',

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};
