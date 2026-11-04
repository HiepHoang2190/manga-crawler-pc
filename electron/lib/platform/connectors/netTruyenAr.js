/**
 * NetTruyenAR connector — nettruyenar.com
 */
const service = require('./services/netTruyenArService');
const { NETTRUYENAR_IMAGE_REFERER, isNetTruyenArImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'NetTruyenAR';

module.exports = {
  id: 'nettruyenar',
  label: LABEL,
  domain: 'https://nettruyenar.com/',
  hostIncludes: ['nettruyenar.com'],
  icon: getIconPath('nettruyenar'),
  imageReferer: NETTRUYENAR_IMAGE_REFERER,
  isImageCdnHost: isNetTruyenArImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options);
  },
};
