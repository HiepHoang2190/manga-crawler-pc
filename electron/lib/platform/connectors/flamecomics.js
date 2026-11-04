/**
 * Flame Comics connector — flamecomics.xyz
 */
const service = require('./services/flamecomicsService');
const {
  FLAMECOMICS_IMAGE_REFERER,
  isFlamecomicsImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Flame Comics';

module.exports = {
  id: 'flamecomics',
  label: LABEL,
  domain: 'https://flamecomics.xyz/',
  extraDomains: ['https://flamecomics.me/'],
  hostIncludes: ['flamecomics.xyz', 'flamecomics', 'flamecomics.me', 'flamescans'],
  icon: getIconPath('flamecomics'),
  imageReferer: FLAMECOMICS_IMAGE_REFERER,
  isImageCdnHost: isFlamecomicsImageCdnHost,
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
