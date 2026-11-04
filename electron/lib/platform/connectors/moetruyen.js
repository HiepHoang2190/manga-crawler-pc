const service = require('./services/moeTruyenService');
const { MOETRUYEN_IMAGE_REFERER, isMoeTruyenImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'MoeTruyen';

module.exports = {
  id: 'moetruyen',
  label: LABEL,
  domain: 'https://moetruyen.net/',
  hostIncludes: ['moetruyen.net'],
  icon: getIconPath('moetruyen'),
  imageReferer: MOETRUYEN_IMAGE_REFERER,
  isImageCdnHost: isMoeTruyenImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsBulkScan: true,

  load(url) {
    return service.load(url);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },

  fetchBulkScanListing(options) {
    return service.fetchBulkScanListing(options || {});
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
