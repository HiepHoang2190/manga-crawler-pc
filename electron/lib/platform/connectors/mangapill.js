const service = require('./services/mangapillService');
const { MANGAPILL_IMAGE_REFERER, isMangapillImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Mangapill';

module.exports = {
  id: 'mangapill',
  label: LABEL,
  domain: 'https://mangapill.com/',
  icon: getIconPath('mangapill'),
  imageReferer: MANGAPILL_IMAGE_REFERER,
  isImageCdnHost: isMangapillImageCdnHost,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
