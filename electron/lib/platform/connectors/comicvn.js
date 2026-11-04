const service = require('./services/comicvnService');
const { COMICVN_IMAGE_REFERER, isComicvnImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'ComicVN';

module.exports = {
  id: 'comicvn',
  label: LABEL,
  requiresCookie: true,
  hasLockedChapters: true,
  domain: 'https://comicvn19.net/',
  hostIncludes: ['comicvn'],
  icon: getIconPath('comicvn'),
  imageReferer: COMICVN_IMAGE_REFERER,
  isImageCdnHost: isComicvnImageCdnHost,
  supportsApiFetch: true,
  supportsBulkScan: true,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchMoiNhatListing(options) {
    return service.fetchMoiNhatListing(options);
  },
};
