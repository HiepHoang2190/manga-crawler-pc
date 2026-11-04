const service = require('./services/chapVnService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Chap.vn';
const CHAPVN_IMAGE_REFERER = 'https://chap.vn/';

module.exports = {
  id: 'chapvn',
  label: LABEL,
  domain: 'https://chap.vn/',
  icon: getIconPath('chapvn'),
  imageReferer: CHAPVN_IMAGE_REFERER,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
