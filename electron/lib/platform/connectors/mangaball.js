const service = require('./services/mangaballService');
const { getIconPath } = require('./iconPath');

const LABEL = 'MangaBall';
const MANGABALL_IMAGE_REFERER = 'https://mangaball.com/';

function isMangaballCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h.includes('mangaball') ||
    h.includes('poke-black-and-white.net') ||
    h.includes('red-and-blue.net')
  );
}

module.exports = {
  id: 'mangaball',
  label: LABEL,
  domain: 'https://mangaball.com/',
  extraDomains: ['https://mangaball.net/'],
  hostIncludes: ['mangaball'],
  icon: getIconPath('mangaball'),
  imageReferer: MANGABALL_IMAGE_REFERER,
  isImageCdnHost: isMangaballCdnHost,
  supportsApiFetch: true,
  requiresCookie: true,

  load(url, options = {}) {
    const raw = String(options?.mangaballLanguage || 'en').toLowerCase();
    let lang = 'en';
    if (raw === 'vi' || raw === 'vietnamese') lang = 'vi';
    else if (raw === 'ja' || raw === 'japanese' || raw === 'jp') lang = 'ja';

    return service.load(url, lang, options.sendLog, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
