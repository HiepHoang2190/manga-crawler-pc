/**
 * MutualHeights connector — mutualheights.net.
 * Site is branded TruyenQQ but keeps the WordPress Flatsome HTML theme.
 */
const service = require('./services/mutualheightsService');
const {
  TRUYENQQNO_IMAGE_REFERER,
  isMutualheightsImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'MutualHeights';

module.exports = {
  id: 'mutualheights',
  label: LABEL,
  domain: 'https://mutualheights.net/',
  icon: getIconPath('mutualheights'),
  imageReferer: TRUYENQQNO_IMAGE_REFERER,
  isImageCdnHost: isMutualheightsImageCdnHost,
  supportsApiFetch: false,
  requiresVpn: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
