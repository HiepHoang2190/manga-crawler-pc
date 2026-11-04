/**
 * TCB Scan Manga connector — tcbscanmanga.com
 */
const service = require('./services/tcbscanmangaService');
const {
  TCBSCANMANGA_IMAGE_REFERER,
  isTcbscanmangaImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TCB Scan';

module.exports = {
  id: 'tcbscanmanga',
  label: LABEL,
  domain: 'https://tcbscanmanga.com/',
  extraDomains: [],
  hostIncludes: ['tcbscanmanga.com', 'tcbscanmanga'],
  icon: getIconPath('tcbscanmanga'),
  imageReferer: TCBSCANMANGA_IMAGE_REFERER,
  isImageCdnHost: isTcbscanmangaImageCdnHost,
  supportsApiFetch: false,
  supportsLatestUpdates: true,
  supportsLatestUpdatesSearch: true,

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },

  fetchChapterImages(chapterUrl, referer) {
    return service.fetchChapterImages(chapterUrl, referer);
  },

  fetchLatestUpdates(options) {
    return service.fetchLatestUpdates(options || {});
  },
};

