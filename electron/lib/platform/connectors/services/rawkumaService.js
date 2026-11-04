/**
 * RawKuma Service — rawkuma.net (API-based)
 */

const { ApiConnectorService } = require('../base/ApiConnectorService');
const { RawkumaApiClient, IMG_REFERER } = require('./rawkumaApiClient');

const DOMAIN = 'https://rawkuma.net/';
const LABEL = 'RawKuma';
const SITE_ID = 'rawkuma';

class RawkumaService extends ApiConnectorService {
  constructor() {
    const apiClient = new RawkumaApiClient();
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: SITE_ID,
      apiClient,
      imageReferer: IMG_REFERER,
    });
  }
}

const instance = new RawkumaService();

module.exports = instance;
