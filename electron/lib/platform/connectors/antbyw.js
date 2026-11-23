const service = require('./services/antbywService');
const { ANTBYW_IMAGE_REFERER, isAntbywImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Antbyw';

module.exports = {
  id: 'antbyw',
  label: LABEL,
  domain: 'https://www.antbyw.com/',
  extraDomains: ['https://antbyw.com/'],
  icon: getIconPath('antbyw'),
  imageReferer: ANTBYW_IMAGE_REFERER,
  isImageCdnHost: isAntbywImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

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
