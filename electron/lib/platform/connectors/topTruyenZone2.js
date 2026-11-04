/**
 * TopTruyenZone2 connector — toptruyenzone2.com
 */
const service = require('./services/topTruyenZone2Service');
const { TOPTRUYENZONE2_IMAGE_REFERER, isTopTruyenZone2ImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TopTruyenZone2';

module.exports = {
  id: 'toptruyenzone2',
  label: LABEL,
  domain: 'https://www.toptruyenzone13.com/',
  hostIncludes: ['toptruyenzone'],
  icon: getIconPath('toptruyenzone2'),
  imageReferer: TOPTRUYENZONE2_IMAGE_REFERER,
  isImageCdnHost: isTopTruyenZone2ImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,

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
