const service = require('./services/kingdomhoiquanService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Kingdom Hội Quán';
const KINGDOMHOIQUAN_IMAGE_REFERER = 'https://kingdomhoiquan.com/';

module.exports = {
  id: 'kingdomhoiquan',
  label: LABEL,
  domain: 'https://kingdomhoiquan.com/',
  icon: getIconPath('kingdomhoiquan'),
  imageReferer: KINGDOMHOIQUAN_IMAGE_REFERER,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
