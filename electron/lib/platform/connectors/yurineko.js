const service = require('./services/yurinekoService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Yurineko';

module.exports = {
  id: 'yurineko',
  label: LABEL,
  domain: 'https://yurinekoz.com/',
  hostIncludes: ['yurineko'],
  extraDomains: [],
  icon: getIconPath('yurineko'),
  imageReferer: 'https://yurinekoz.com/',
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
