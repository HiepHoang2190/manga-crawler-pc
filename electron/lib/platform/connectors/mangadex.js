const service = require('./services/mangadexService');
const { MANGADEX_IMAGE_REFERER, isMangadexCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Mangadex';

module.exports = {
  id: 'mangadex',
  label: LABEL,
  domain: 'https://mangadex.org/',
  icon: getIconPath('mangadex'),
  imageReferer: MANGADEX_IMAGE_REFERER,
  isImageCdnHost: isMangadexCdnHost,
  supportsApiFetch: true,

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },

  load(url, options = {}) {
    const raw = String(options?.mangadexLanguage || 'vi').toLowerCase();
    let lang = 'vi';
    if (raw === 'en') lang = 'en';
    else if (raw === 'ja') lang = 'ja';
    return service.load(url, lang);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
