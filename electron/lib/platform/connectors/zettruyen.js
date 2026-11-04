/**
 * ZetTruyen connector
 * Site: https://www.zettruyen.top
 */
const service = require('./services/zettruyenService');
const { ZETTRUYEN_IMAGE_REFERER, isZettruyenImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'ZetTruyen';

module.exports = {
  id: 'zettruyen',
  label: LABEL,
  domain: 'https://www.zettruyen4.com/',
  extraDomains: ['https://www.zettruyen.ink/', 'https://www.zettruyen.top/'],
  icon: getIconPath('zettruyen'),
  imageReferer: ZETTRUYEN_IMAGE_REFERER,
  isImageCdnHost: isZettruyenImageCdnHost,
  hostIncludes: ['zettruyen'],
  supportsApiFetch: false,
  supportsLatestUpdates: true,

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
