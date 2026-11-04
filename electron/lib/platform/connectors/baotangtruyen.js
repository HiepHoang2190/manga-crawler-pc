/**
 * Bảo Tàng Truyện connector — baotangtruyen.net
 */
const service = require('./services/baotangtruyenService');
const {
  BAOTANGTRUYEN_IMAGE_REFERER,
  isBaotangtruyenImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Bảo Tàng Truyện';

module.exports = {
  id: 'baotangtruyen',
  label: LABEL,
  domain: 'https://baotangtruyen.net/',
  hostIncludes: ['baotangtruyen.net', 'baotangtruyen'],
  icon: getIconPath('baotangtruyen'),
  imageReferer: BAOTANGTRUYEN_IMAGE_REFERER,
  isImageCdnHost: isBaotangtruyenImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};
