/**
 * Kingdom Hội Quán Service using ApiConnectorService
 * Site: kingdomhoiquan.com
 */
const { ApiConnectorService } = require('../base/ApiConnectorService');
const kingdomHoiQuanApiClient = require('./kingdomHoiQuanApiClient');

const DOMAIN = 'https://kingdomhoiquan.com/';
const LABEL = 'Kingdom Hội Quán';
const SITE_ID = 'kingdomhoiquan';

class KingdomHoiQuanService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      apiClient: kingdomHoiQuanApiClient,
      imageReferer: DOMAIN,
    });
  }
}

const service = new KingdomHoiQuanService();

module.exports = {
  DOMAIN,
  LABEL,
  SITE_ID,
  KingdomHoiQuanService,
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
