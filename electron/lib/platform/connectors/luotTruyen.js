/**
 * LuotTruyen connector — luottruyen*.com / luottruyen*.vn / ...
 * Site truyện tranh Việt Nam, yêu cầu cookie đăng nhập để đọc chapter.
 * Domain được detect tự động từ URL nên không cần cập nhật khi site đổi số/TLD.
 */
const service = require('./services/luotTruyenService');
const { isLuotTruyenImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'LuotTruyen';

module.exports = {
  id: 'luottruyen',
  label: LABEL,
  domain: 'https://luottruyen20.com/', // default domain for display; actual requests use URL's domain
  hostIncludes: ['luottruyen'],
  requiresCookie: true,
  hasLockedChapters: true,
  icon: getIconPath('luottruyen'),
  // imageReferer is derived dynamically from the active session domain in the service
  imageReferer: null,
  isImageCdnHost: isLuotTruyenImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
