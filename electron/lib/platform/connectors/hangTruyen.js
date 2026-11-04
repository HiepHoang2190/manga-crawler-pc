const service = require('./services/hangTruyenService');
const { getIconPath } = require('./iconPath');

const LABEL = 'HangTruyen';

module.exports = {
  id: 'hangtruyen',
  label: LABEL,
  domain: 'https://www.hangtruyen.online/',
  icon: getIconPath('hangtruyen'),
  imageReferer: 'https://www.hangtruyen.online/',
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
