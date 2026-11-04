const service = require('./services/fanfoxService');
const { FANFOX_IMAGE_REFERER, isFanfoxImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'FanFox';

module.exports = {
  id: 'fanfox',
  label: LABEL,
  domain: 'https://fanfox.net/',
  icon: getIconPath('fanfox'),
  imageReferer: FANFOX_IMAGE_REFERER,
  isImageCdnHost: isFanfoxImageCdnHost,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
