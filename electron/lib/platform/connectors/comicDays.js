const service = require('./services/comicDaysService');
const { COMICDAYS_IMAGE_REFERER, isComicDaysImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'ComicDays';

module.exports = {
  id: 'comicdays',
  label: LABEL,
  domain: 'https://comic-days.com/',
  icon: getIconPath('comicdays'),
  imageReferer: COMICDAYS_IMAGE_REFERER,
  isImageCdnHost: isComicDaysImageCdnHost,
  supportsApiFetch: true,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
