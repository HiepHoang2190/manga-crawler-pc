/**
 * ViviComic Connector
 * https://vivicomic.com/
 */
const viviComicService = require('./services/viviComicService');
const { getIconPath } = require('./iconPath');

module.exports = {
  id: 'vivicomic',
  label: viviComicService.LABEL,
  domain: viviComicService.DOMAIN,
  hostIncludes: ['vivicomic.com'],
  icon: getIconPath('vivicomic'),
  imageReferer: viviComicService.DOMAIN,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,
  load: viviComicService.load,
  downloadChapter: viviComicService.downloadChapter,
  fetchLatestUpdates(options) {
    return viviComicService.fetchLatestUpdates(options || {});
  },
};
