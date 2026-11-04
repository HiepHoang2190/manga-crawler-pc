/**
 * Nhất Truyện connector — nhattruyenqq.com
 */
const service = require('./services/nhattruyenService');
const {
  NHATTRUYEN_IMAGE_REFERER,
  isNhattruyenImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Nhất Truyện';

module.exports = {
  id: 'nhattruyen',
  label: LABEL,
  domain: 'https://nhattruyenqq.com/',
  hostIncludes: ['nhattruyenqq.com', 'nhattruyen'],
  icon: getIconPath('nhattruyen'),
  imageReferer: NHATTRUYEN_IMAGE_REFERER,
  isImageCdnHost: isNhattruyenImageCdnHost,
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
