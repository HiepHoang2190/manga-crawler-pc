const service = require('./services/suicaodexService');
const { SUICAODEX_IMAGE_REFERER, isSuicaoDexImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'SuicaoDex';

module.exports = {
  id: 'suicaodex',
  label: LABEL,
  domain: 'https://suicaodex.com/',
  extraDomains: ['https://www.suicaodex.com/', 'https://mato.suicaodex.com/'],
  icon: getIconPath('suicaodex'),
  imageReferer: SUICAODEX_IMAGE_REFERER,
  isImageCdnHost: isSuicaoDexImageCdnHost,
  supportsApiFetch: true,

  load(url, options = {}) {
    if (url && typeof url === 'string' && url.includes('/moetruyen/')) {
      const moetruyen = require('./moetruyen');
      const rewrittenUrl = url.replace(/https?:\/\/[^\/]+\/moetruyen\/manga\/(?:\d+\/)?/i, 'https://moetruyen.net/manga/');
      return moetruyen.load(rewrittenUrl, options);
    }

    const raw = String(options?.mangadexLanguage || 'vi').toLowerCase();
    let lang = 'vi';
    if (raw === 'en') lang = 'en';
    return service.load(url, lang);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
