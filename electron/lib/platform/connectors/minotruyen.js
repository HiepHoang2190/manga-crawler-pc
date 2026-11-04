const service = require('./services/minotruyenService');
const { MINOTRUYEN_IMAGE_REFERER, isMinotruyenImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Minotruyen';

module.exports = {
  id: 'minotruyen',
  label: LABEL,
  domain: 'https://minotruyenv7.xyz/',
  extraDomains: ['https://minotruyenv5.xyz/'],
  icon: getIconPath('minotruyen'),
  imageReferer: MINOTRUYEN_IMAGE_REFERER,
  isImageCdnHost: isMinotruyenImageCdnHost,
  supportsApiFetch: true,
  supportsLatestUpdates: true,

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
