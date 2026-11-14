const service = require('./services/hoaphunglieunguyenService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Hỏa Phụng Liêu Nguyên';
const DOMAIN = 'https://hoaphunglieunguyen.com/';

module.exports = {
  id: 'hoaphunglieunguyen',
  label: LABEL,
  domain: DOMAIN,
  icon: getIconPath('hoaphunglieunguyen'),
  imageReferer: DOMAIN,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
