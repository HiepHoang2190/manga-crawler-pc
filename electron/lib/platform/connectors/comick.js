const service = require('./services/comickService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Comick';
const COMICK_IMAGE_REFERER = 'https://comick.live/';

function isComickCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('comick') || h.includes('comicknew.pictures');
}

module.exports = {
  id: 'comick',
  label: LABEL,
  domain: 'https://comick.live/',
  extraDomains: ['https://comick.io/', 'https://comick.fun/', 'https://comick.dev/'],
  icon: getIconPath('comick'),
  imageReferer: COMICK_IMAGE_REFERER,
  isImageCdnHost: isComickCdnHost,
  supportsApiFetch: true,

  load(url, options = {}) {
    const lang = String(options?.comickLanguage || 'en').toLowerCase();
    return service.load(url, lang);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
