/**
 * Port org.example.connectors.templates.TruyenQQ — HTML + ảnh trang chương.
 */
const service = require('./services/truyenQQService');
const {
  TRUYENQQNO_IMAGE_REFERER,
  isTruyenQQImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TruyenQQ';

module.exports = {
  id: 'truyenqq',
  label: LABEL,
  domain: 'https://truyenqqko.com/',
  extraDomains: ['https://truyenqqno.com/'],
  icon: getIconPath('truyenqq'),
  /** Java: getDomain() — Referer khi tải ảnh (connectorReferer trong ConnectorServicesImp). */
  imageReferer: TRUYENQQNO_IMAGE_REFERER,
  isImageCdnHost: isTruyenQQImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};
