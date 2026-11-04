/**
 * NetTruyenViet connector — nettruyenviet*.com
 * Cloudflare-protected Vietnamese manga site.
 */
const service = require('./services/netTruyenVietService');
const { NETTRUYENVIET_IMAGE_REFERER, isNetTruyenVietImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'NetTruyenViet';

module.exports = {
  id: 'nettruyenviet',
  label: LABEL,
  domain: 'https://nettruyenviet10.com/',
  hostIncludes: ['nettruyenviet', 'nettruyen.work'],
  icon: getIconPath('nettruyenviet'),
  imageReferer: NETTRUYENVIET_IMAGE_REFERER,
  isImageCdnHost: isNetTruyenVietImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
