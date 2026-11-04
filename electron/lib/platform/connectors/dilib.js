const service = require('./services/diliberService');
const { DILIB_IMAGE_REFERER } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Dilib';

module.exports = {
  id: 'dilib',
  label: LABEL,
  domain: 'https://dilib.vn/',
  icon: getIconPath('dilib'),
  imageReferer: DILIB_IMAGE_REFERER,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};