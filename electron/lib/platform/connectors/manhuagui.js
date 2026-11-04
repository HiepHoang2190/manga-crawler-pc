/**
 * ManhuaGui connector — tw.manhuagui.com / www.manhuagui.com
 * Trang truyện tranh Trung/Đài Loan.
 */
const service = require('./services/manhuaguiService');
const { getIconPath } = require('./iconPath');

const LABEL = 'ManhuaGui';
const MANHUAGUI_IMAGE_REFERER = 'https://tw.manhuagui.com/';

module.exports = {
  id: 'manhuagui',
  label: LABEL,
  domain: 'https://tw.manhuagui.com/',
  extraDomains: ['https://www.manhuagui.com/'],
  icon: getIconPath('manhuagui'),
  imageReferer: MANHUAGUI_IMAGE_REFERER,
  isImageCdnHost(hostname) {
    const h = String(hostname).toLowerCase();
    return h.endsWith('.mhgui.com') || h.includes('mhgui') || h.endsWith('.hamreus.com') || h.includes('hamreus');
  },
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
