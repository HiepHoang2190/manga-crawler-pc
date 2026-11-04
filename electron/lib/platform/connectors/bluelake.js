/**
 * BlueLake connector — www.bluelakeaccelerator.com (branded: TruyenQQ)
 */
const service = require('./services/bluelakeService');
const { BLUELAKE_IMAGE_REFERER, isBluelakeImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'BlueLake';

module.exports = {
  id: 'bluelake',
  label: LABEL,
  domain: 'https://www.bluelakeaccelerator.com/',
  icon: getIconPath('bluelake'),
  imageReferer: BLUELAKE_IMAGE_REFERER,
  isImageCdnHost: isBluelakeImageCdnHost,
  supportsApiFetch: false,
  requiresVpn: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
