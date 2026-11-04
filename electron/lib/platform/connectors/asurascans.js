/**
 * Asura Scans connector — asurascans.com
 */
const service = require('./services/asurascansService');
const {
  ASURASCANS_IMAGE_REFERER,
  isAsurascansImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Asura Scans';

module.exports = {
  id: 'asurascans',
  label: LABEL,
  domain: 'https://asurascans.com/',
  extraDomains: ['https://asuracomic.net/', 'https://asuratoon.com/'],
  hostIncludes: ['asurascans.com', 'asurascans', 'asuracomic.net', 'asuracomic', 'asuratoon'],
  icon: getIconPath('asurascans'),
  imageReferer: ASURASCANS_IMAGE_REFERER,
  isImageCdnHost: isAsurascansImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};
