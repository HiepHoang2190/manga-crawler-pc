const service = require('./services/kenhSinhVienService');
const {
  KENHSINHVIEN_IMAGE_REFERER,
  isKenhSinhVienImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = service.LABEL;

module.exports = {
  id: 'kenhsinhvien',
  label: LABEL,
  domain: 'https://kenhsinhvien.vn/',
  hostIncludes: ['kenhsinhvien.vn'],
  icon: getIconPath('kenhsinhvien'),
  imageReferer: KENHSINHVIEN_IMAGE_REFERER,
  isImageCdnHost: isKenhSinhVienImageCdnHost,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
