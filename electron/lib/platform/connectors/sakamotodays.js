const service = require('./services/sakamotodaysService');
const { getIconPath } = require('./iconPath');

const LABEL = 'SakamotoDaysTruyen';
const SAKAMOTODAYS_IMAGE_REFERER = 'https://sakamotodaystruyen.com/';

module.exports = {
  id: 'sakamotodays',
  label: LABEL,
  domain: 'https://sakamotodaystruyen.com/',
  icon: getIconPath('sakamotodays'),
  imageReferer: SAKAMOTODAYS_IMAGE_REFERER,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
