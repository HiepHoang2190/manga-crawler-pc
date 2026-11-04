/**
 * Sang Chảnh Team connector — sangchanhteam.com
 */
const service = require('./services/sangchanhteamService');
const {
  SANGCHANHTEAM_IMAGE_REFERER,
  isSangchanhteamImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Sang Chảnh Team';

module.exports = {
  id: 'sangchanhteam',
  label: LABEL,
  domain: 'https://sangchanhteam.com/',
  extraDomains: [],
  hostIncludes: ['sangchanhteam.com', 'sangchanhteam'],
  icon: getIconPath('sangchanhteam'),
  imageReferer: SANGCHANHTEAM_IMAGE_REFERER,
  isImageCdnHost: isSangchanhteamImageCdnHost,
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
