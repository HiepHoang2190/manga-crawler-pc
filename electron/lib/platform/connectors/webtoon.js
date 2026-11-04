/**
 * Webtoons connector — webtoons.com
 */
const service = require('./services/webtoonService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Webtoons';

module.exports = {
  id: 'webtoons',
  label: LABEL,
  domain: 'https://www.webtoons.com/',
  hostIncludes: ['webtoons.com'],
  icon: getIconPath('webtoons'),
  imageReferer: 'https://www.webtoons.com/',
  suggestsVpn: true,
  supportsApiFetch: false,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
