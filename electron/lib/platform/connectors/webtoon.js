/**
 * Webtoons connector — webtoons.com
 */
const service = require('./services/webtoonService');
const { getIconPath } = require('./iconPath');
const { WEBTOONS_IMAGE_REFERER } = require('../../download/connector/connectorReferer');

const LABEL = 'Webtoons';

module.exports = {
  id: 'webtoons',
  label: LABEL,
  domain: 'https://www.webtoons.com/',
  hostIncludes: ['webtoons.com'],
  icon: getIconPath('webtoons'),
  imageReferer: WEBTOONS_IMAGE_REFERER,
  suggestsVpn: true,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};
