const service = require('./services/comixService');
const { COMIX_IMAGE_REFERER, isComixImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Comix';

module.exports = {
  id: 'comix',
  label: LABEL,
  domain: 'https://comix.to/',
  requiresCookie: true,
  icon: getIconPath('comix'),
  imageReferer: COMIX_IMAGE_REFERER,
  isImageCdnHost: isComixImageCdnHost,
  supportsApiFetch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
