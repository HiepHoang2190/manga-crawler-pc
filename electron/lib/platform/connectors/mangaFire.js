const service = require('./services/mangaFireService');
const { getIconPath } = require('./iconPath');

const LABEL = 'MangaFire';
const MANGAFIRE_IMAGE_REFERER = 'https://mangafire.to/';

function isMangaFireCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('mangafire') || h.includes('mfcdn');
}

module.exports = {
  id: 'mangafire',
  label: LABEL,
  domain: 'https://mangafire.to/',
  icon: getIconPath('mangafire'),
  imageReferer: MANGAFIRE_IMAGE_REFERER,
  isImageCdnHost: isMangaFireCdnHost,
  supportsApiFetch: true,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
