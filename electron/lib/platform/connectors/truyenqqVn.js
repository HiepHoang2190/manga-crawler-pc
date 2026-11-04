/**
 * TruyenQQ.com.vn — HTML connector; Cloudflare via Settings cookie (`requiresCookie` on the service).
 */
const service = require('./services/truyenqqVnService');
const {
  TRUYENQQVN_IMAGE_REFERER,
  isTruyenQQImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TruyenQQ.vn';

module.exports = {
  id: 'truyenqqvn',
  label: LABEL,
  requiresCookie: true,
  domain: 'https://truyenqq.com.vn/',
  icon: getIconPath('truyenqqvn'),
  imageReferer: TRUYENQQVN_IMAGE_REFERER,
  isImageCdnHost: isTruyenQQImageCdnHost,
  supportsApiFetch: false,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
