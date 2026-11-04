const service = require('./services/gocTruyenTranhService');
const { getIconPath } = require('./iconPath');

const LABEL = 'GocTruyenTranh';

module.exports = {
  id: 'goctruyentranh',
  label: LABEL,
  domain: 'https://goctruyentranhvui31.com/',
  extraDomains: [
    'https://goctruyentranh.org/',
    'https://goctruyentranh.net/',
    'https://goctruyentranhvui20.com/',
    'https://goctruyentranhvui21.com/',
    'https://goctruyentranhvui22.com/',
    'https://goctruyentranhvui31.com/',
  ],
  hostIncludes: ['goctruyentranh', 'goctruyentranhvui'],
  icon: getIconPath('goctruyentranh'),
  imageReferer: 'https://goctruyentranh.com/',
  supportsApiFetch: false,
  requiresCookie: true,
  hasLockedChapters: true,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
