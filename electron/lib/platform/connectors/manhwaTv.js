/**
 * ManhwaTV connector — manhwatv6.com
 * Site truyện tranh Việt Nam, yêu cầu cookie đăng nhập để đọc chapter.
 */
const service = require('./services/manhwaTvService');
const { getIconPath } = require('./iconPath');

const LABEL = 'ManhwaTV';

module.exports = {
  id: 'manhwatv',
  label: LABEL,
  domain: 'https://manhwatv6.com/',
  hostIncludes: ['manhwatv'],
  requiresCookie: true,
  hasLockedChapters: true,
  icon: getIconPath('manhwatv'),
  imageReferer: null,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
