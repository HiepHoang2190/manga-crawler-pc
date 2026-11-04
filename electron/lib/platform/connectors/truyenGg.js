/**
 * TruyenGG connector — truyenggvn.com
 */
const service = require('./services/truyenGgService');
const { TRUYENGG_IMAGE_REFERER, isTruyenGgImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TruyenGG';

module.exports = {
  id: 'truyengg',
  label: LABEL,
  domain: 'https://truyenggvn.com/',
  hostIncludes: ['truyenggvn.com', 'truyengg.com'],
  icon: getIconPath('truyengg'),
  imageReferer: TRUYENGG_IMAGE_REFERER,
  isImageCdnHost: isTruyenGgImageCdnHost,
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
