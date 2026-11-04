const service = require('./services/batcaveService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Batcave';

module.exports = {
  id: 'batcave',
  label: LABEL,
  domain: 'https://batcave.biz/',
  extraDomains: [],
  hostIncludes: ['batcave'],
  icon: getIconPath('batcave'),
  imageReferer: 'https://batcave.biz/',
  supportsApiFetch: false,
  requiresCookie: true,
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
