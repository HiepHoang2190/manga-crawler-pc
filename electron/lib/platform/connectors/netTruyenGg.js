/**
 * NetTruyenGG connector — nettruyen.gg
 */
const service = require('./services/netTruyenGgService');
const { NETTRUYENGG_IMAGE_REFERER, isNetTruyenGgImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'NetTruyenGG';

module.exports = {
  id: 'nettruyengg',
  label: LABEL,
  domain: 'https://nettruyen.gg/',
  extraDomains: ['https://hinettruyen.com/'],
  hostIncludes: ['nettruyen.gg', 'hinettruyen.com'],
  icon: getIconPath('nettruyengg'),
  imageReferer: NETTRUYENGG_IMAGE_REFERER,
  isImageCdnHost: isNetTruyenGgImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

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
