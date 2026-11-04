/**
 * Port của org.example.connectors.templates.CuuTruyen — API (domain chính cuutruyen.net).
 * Logic tải/ghi DB nằm ở ../services/cuuTruyenService.js (tương đương CuuTruyen.java + CuuTruyenApiClient).
 */
const service = require('./services/cuuTruyenService');
const {
  CUUTRUYEN_IMAGE_REFERER,
  isCuuTruyenImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'CuuTruyen';

module.exports = {
  id: 'cuutruyen',
  label: LABEL,
  domain: 'https://cuutruyen.net/',
  extraDomains: ['https://nettrom.com/', 'https://hetcuutruyen.net/'],
  icon: getIconPath('cuutruyen'),
  imageReferer: CUUTRUYEN_IMAGE_REFERER,
  isImageCdnHost: isCuuTruyenImageCdnHost,
  supportsApiFetch: true,
  supportsLatestUpdates: true,
  requiresVpn: true,

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
