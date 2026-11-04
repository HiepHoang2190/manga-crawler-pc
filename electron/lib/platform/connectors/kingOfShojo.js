/**
 * KingOfShojo connector — kingofshojo.com
 */
const service = require('./services/kingOfShojoService');
const { KINGOFSHOJO_IMAGE_REFERER, isKingOfShojoImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'KingOfShojo';

module.exports = {
  id: 'kingofshojo',
  label: LABEL,
  domain: 'https://kingofshojo.com/',
  hostIncludes: ['kingofshojo.com'],
  icon: getIconPath('kingofshojo'),
  imageReferer: KINGOFSHOJO_IMAGE_REFERER,
  isImageCdnHost: isKingOfShojoImageCdnHost,
  supportsApiFetch: false,
  requiresCookie: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
