/**
 * SuicaoDex Service using ApiConnectorService
 */

const { ApiConnectorService } = require('../base/ApiConnectorService');
const { SuicaoDexApiClient } = require('./suicaodexApiClient');

const DOMAIN = 'https://suicaodex.com/';
const LABEL = 'SuicaoDex';

class SuicaoDexService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'suicaodex',
      apiClient: new SuicaoDexApiClient(),
      imageReferer: DOMAIN,
    });
  }

  getReferer(payload) {
    return payload.chapterUrl || DOMAIN;
  }

  getImageHeaders(referer) {
    return {
      Referer: referer,
      'User-Agent': this.getUserAgent(),
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      Origin: 'https://suicaodex.com',
    };
  }

  async load(url, language = 'vi') {
    const validLanguages = ['vi', 'en'];
    const normalizedLang = String(language || 'vi').toLowerCase();
    const lang = validLanguages.includes(normalizedLang) ? normalizedLang : 'vi';

    return super.load(url, { mangadexLanguage: lang });
  }
}

const service = new SuicaoDexService();

function load(url, language = 'vi') {
  return service.load(url, language);
}

function downloadChapter(payload, connector = LABEL) {
  return service.downloadChapter(payload, connector);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  service,
  SuicaoDexService,
};
