/**
 * VietMessenger connector — vietmessenger.com/comics
 * Site truyện tranh cổ Việt Nam, yêu cầu cookie SESSION để xem nội dung.
 */
const service = require('./services/vietMessengerService');
const { getIconPath } = require('./iconPath');

const LABEL = 'VietMessenger';

module.exports = {
  id: 'vietmessenger',
  label: LABEL,
  domain: 'https://vietmessenger.com/',
  hostIncludes: ['vietmessenger'],
  requiresCookie: true,
  icon: getIconPath('vietmessenger'),
  imageReferer: 'https://vietmessenger.com/',
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
