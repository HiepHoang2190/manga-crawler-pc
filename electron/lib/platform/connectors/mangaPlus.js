const service = require('./services/mangaPlusService');
const { fetchManga, API_BASE } = require('./services/mangaPlusApiClient');
const { MANGAPLUS_IMAGE_REFERER, isMangaPlusImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'MangaPlus';
/** Known title used only for connectivity check against the protobuf API. */
const HEALTH_CHECK_TITLE_URL = 'https://mangaplus.shueisha.co.jp/titles/1000001';

module.exports = {
  id: 'mangaplus',
  label: LABEL,
  domain: 'https://mangaplus.shueisha.co.jp/',
  icon: getIconPath('mangaplus'),
  imageReferer: MANGAPLUS_IMAGE_REFERER,
  isImageCdnHost: isMangaPlusImageCdnHost,
  supportsApiFetch: true,

  /**
   * Hit title_detailV3 protobuf API (not the HTML homepage).
   * Homepage can be 200 while ?format=json / API failures still break load.
   */
  async testConnection() {
    const result = await fetchManga(HEALTH_CHECK_TITLE_URL);
    if (result.ok && result.manga && result.manga.title) {
      return { ok: true };
    }
    return {
      ok: false,
      error: result.error || `Không gọi được API ${API_BASE}/title_detailV3`,
    };
  },

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
