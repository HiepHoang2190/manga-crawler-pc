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
  hostIncludes: ['nettruyen.gg'],
  icon: getIconPath('nettruyengg'),
  imageReferer: NETTRUYENGG_IMAGE_REFERER,
  isImageCdnHost: isNetTruyenGgImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
