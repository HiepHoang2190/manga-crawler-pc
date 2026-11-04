const service = require('./services/mangaVnService');
const { getIconPath } = require('./iconPath');

const LABEL = 'MangaVN';
const MANGAVN_IMAGE_REFERER = 'https://mangavn.forumotion.net/';

module.exports = {
  id: 'mangavn',
  label: LABEL,
  domain: 'https://mangavn.forumotion.net/',
  extraDomains: ['http://www.mangavn.net/', 'https://www.mangavn.net/'],
  icon: getIconPath('mangavn'),
  imageReferer: MANGAVN_IMAGE_REFERER,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
