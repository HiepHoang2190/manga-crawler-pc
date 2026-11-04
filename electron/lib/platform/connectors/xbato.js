const service = require('./services/xbatoService');
const { getIconPath } = require('./iconPath');

const LABEL = 'xBato';
const IMAGE_REFERER = 'https://xbato.co.uk/';

module.exports = {
  id: 'xbato',
  label: LABEL,
  domain: 'https://xbato.co.uk/',
  extraDomains: [
    'https://xbato.com/',
    'https://xbato.net/',
    'https://xbato.org/',
    'https://xbato.wiki/',
    'https://xbato18.com/',
  ],
  icon: getIconPath('xbato'),
  imageReferer: IMAGE_REFERER,
  requiresCookie: false,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
