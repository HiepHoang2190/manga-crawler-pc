/**
 * RawKuma connector — API-based manga site
 */
const service = require('./services/rawkumaService');
const { IMG_REFERER } = require('./services/rawkumaApiClient');
const { getIconPath } = require('./iconPath');

const LABEL = 'RawKuma';

module.exports = {
  id: 'rawkuma',
  label: LABEL,
  domain: 'https://rawkuma.net/',
  icon: getIconPath('rawkuma'),
  imageReferer: IMG_REFERER,
  supportsApiFetch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
