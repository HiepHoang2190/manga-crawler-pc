/**
 * Baozimh (包子漫畫) — Traditional Chinese webtoon host.
 */
const service = require('./services/baozimhService');
const { getIconPath } = require('./iconPath');
const { BAOZIMH_IMAGE_REFERER, isBaozimhImageCdnHost } = require('../../download/connector/connectorReferer');

const LABEL = 'Baozimh';

module.exports = {
  id: 'baozimh',
  label: LABEL,
  domain: 'https://www.baozimh.com/',
  extraDomains: ['https://baozimh.com/', 'https://www.twmanga.com/', 'https://twmanga.com/'],
  icon: getIconPath('baozimh'),
  imageReferer: BAOZIMH_IMAGE_REFERER,
  isImageCdnHost: isBaozimhImageCdnHost,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
