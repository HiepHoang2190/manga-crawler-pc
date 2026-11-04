/**
 * Referer khi tải ảnh — khớp Java: ConnectorServicesImp.downloadFile(..., connector.getDomain(), ...).
 * Mỗi connector dùng domain trang làm Referer (TruyenQQ.java / CuuTruyen.java setDomain).
 */
const { connectorDomainManager } = require('../../platform/connectors/domain/ConnectorDomainManager');

const TRUYENQQNO_IMAGE_REFERER = 'https://truyenqqko.com/';
const TRUYENQQVN_IMAGE_REFERER = 'https://truyenqq.com.vn/';
const TRUYENQQ_IMAGE_REFERER = TRUYENQQVN_IMAGE_REFERER;
const CUUTRUYEN_IMAGE_REFERER = 'https://cuutruyen.net/';
const MANGADEX_IMAGE_REFERER = 'https://mangadex.org/';
const COMIX_IMAGE_REFERER = 'https://comix.to/';
const ANTBYW_IMAGE_REFERER = 'https://www.antbyw.com/';
const MANGAPLUS_IMAGE_REFERER = 'https://mangaplus.shueisha.co.jp/';
const COMICDAYS_IMAGE_REFERER = 'https://comic-days.com/';
const MINOTRUYEN_IMAGE_REFERER = 'https://minotruyenv7.xyz/';
const OTAKUSIC_IMAGE_REFERER = 'https://otakusic.com/';
const GOCTRUYENTRANH_IMAGE_REFERER = 'https://goctruyentranh.com/';
const COMICVN_IMAGE_REFERER = 'https://comicvn19.net/';
const MOETRUYEN_IMAGE_REFERER = 'https://moetruyen.net/';
const TRUYENMOE_IMAGE_REFERER = 'https://truyen.moe/';
const GOOGLE_DRIVE_IMAGE_REFERER = 'https://drive.google.com/';
const DTVEBOOK_IMAGE_REFERER = 'https://dtv-ebook.com.vn/';
const MANHUAGUI_IMAGE_REFERER = 'https://tw.manhuagui.com/';
const NETTRUYENVIET_IMAGE_REFERER = 'https://nettruyenviet10.com/';
const NETTRUYENGG_IMAGE_REFERER = 'https://nettruyen.gg/';
const NETTRUYENAR_IMAGE_REFERER = 'https://nettruyenar.com/';
const LUOTTRUYEN_IMAGE_REFERER = 'https://luottruyen20.com/';
const COMICK_IMAGE_REFERER = 'https://comick.live/';
const DILIB_IMAGE_REFERER = 'https://dilib.vn/';
const SAKAMOTODAYS_IMAGE_REFERER = 'https://sakamotodaystruyen.com/';
const CHAPVN_IMAGE_REFERER = 'https://chap.vn/';
const MANGABALL_IMAGE_REFERER = 'https://mangaball.com/';
const TRUYENTUOITHO_IMAGE_REFERER = 'https://truyentuoitho.com/';
const BAOZIMH_IMAGE_REFERER = 'https://www.baozimh.com/';
const KENHSINHVIEN_IMAGE_REFERER = 'https://kenhsinhvien.vn/';
const RAWKUMA_IMAGE_REFERER = 'https://rawkuma.net/';
const ZETTRUYEN_IMAGE_REFERER = 'https://www.zettruyen4.com/';
const BLUELAKE_IMAGE_REFERER = 'https://www.bluelakeaccelerator.com/';
const TOPTRUYENZONE2_IMAGE_REFERER = 'https://www.toptruyenzone13.com/';
const MANGAFIRE_IMAGE_REFERER = 'https://mangafire.to/';
const MANGAPILL_IMAGE_REFERER = 'https://mangapill.com/';
const SUICAODEX_IMAGE_REFERER = 'https://suicaodex.com/';
const XBATO_IMAGE_REFERER = 'https://xbato.co.uk/';
const KINGOFSHOJO_IMAGE_REFERER = 'https://kingofshojo.com/';
const FANFOX_IMAGE_REFERER = 'https://fanfox.net/';
const TRUYENGG_IMAGE_REFERER = 'https://truyenggvn.com/';
const BAOTANGTRUYEN_IMAGE_REFERER = 'https://baotangtruyen.net/';
const NHATTRUYEN_IMAGE_REFERER = 'https://nhattruyenqq.com/';
const ASURASCANS_IMAGE_REFERER = 'https://asurascans.com/';
const FLAMECOMICS_IMAGE_REFERER = 'https://flamecomics.xyz/';
const SANGCHANHTEAM_IMAGE_REFERER = 'https://sangchanhteam.com/';
const TCBSCANMANGA_IMAGE_REFERER = 'https://tcbscanmanga.com/';

function isTcbscanmangaImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h === 'scans.lastation.us' ||
    h.endsWith('.lastation.us') ||
    h === 'official.lowee.us' ||
    h.endsWith('.lowee.us') ||
    h === 'temp.compsci88.com' ||
    h.endsWith('.compsci88.com') ||
    h.includes('tcbscanmanga')
  );
}

function isSangchanhteamImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('sangchanhteam');
}

function isFlamecomicsImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('flamecomics') || h.includes('flamescans');
}

function isAsurascansImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('asurascans') || h.includes('asuracomic') || h.includes('asuratoon') || h.includes('asura.gg');
}

function isNhattruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('nhattruyen') || h.includes('beercloudy.com');
}

function isBaotangtruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('baotangtruyen') || h.includes('imgchapter');
}

function isMangaFireImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  // FanFox covers live on fmcdn.mfcdn.net. MangaFire uses mfcdn2.xyz / mfcdn3.xyz.
  if (h === 'mfcdn.net' || h.endsWith('.mfcdn.net')) return false;
  return h.includes('mangafire') || h.includes('mfcdn');
}

function isMangapillImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('mangapill') || h.includes('readdetectiveconan');
}

function isSuicaoDexImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('suicaodex.com') || h.includes('suicaodex.net');
}

function isXbatoImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('merrypsycho.xyz') || h.includes('xbato.co.uk');
}

function isKingOfShojoImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('kingofshojo');
}

function isFanfoxImageCdnHost(hostname) {
  const host_name = String(hostname).toLowerCase();
  return (
    host_name === 'fanfox.net' ||
    host_name.endsWith('.fanfox.net') ||
    host_name === 'mangafox.me' ||
    host_name.endsWith('.mangafox.me') ||
    host_name === 'mfcdn.net' ||
    host_name.endsWith('.mfcdn.net')
  );
}

function isTruyenQQNoImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h === 'i.hinhhinh.com' ||
    h.endsWith('.hinhhinh.com') ||
    h === 'truyenvua.com' ||
    h.endsWith('.truyenvua.com') ||
    h.endsWith('.tintruyen.net')
  );
}

/** MutualHeights same-origin image proxy plus TruyenQQ CDN hosts. */
function isMutualheightsImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h === 'mutualheights.net' ||
    h.endsWith('.mutualheights.net') ||
    isTruyenQQNoImageCdnHost(hostname)
  );
}

function isTruyenQQVnImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h.endsWith('.cdn3t.com') ||
    h === 'cdn3t.com' ||
    h.endsWith('.cc3t.net') ||
    h === 'cc3t.net' ||
    h.endsWith('.static3t.com') ||
    h === 'static3t.com'
  );
}

function isTruyenQQImageCdnHost(hostname) {
  return isTruyenQQNoImageCdnHost(hostname) || isTruyenQQVnImageCdnHost(hostname);
}

function isCuuTruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('cuutruyen') || h.includes('hetcuutruyen') || h.includes('nettrom') || h.includes('lrclib.net') || h.includes('backblazeb2.com');
}

function isMangadexCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('mangadex') || h.endsWith('.mangadex.network') || h.includes('mangadex.org');
}

function isComixImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('comix.to') || h.includes('static.comix');
}

function isAntbywImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('antbyw');
}

function isMangaPlusImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h.includes('mangaplus') ||
    h.includes('shueisha') ||
    h.includes('jumpg-webapi') ||
    h.includes('jumpg-assets') ||
    h.includes('tokyo-cdn')
  );
}

function isComicDaysImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('comic-days') || h.includes('cloudfront') || h.includes('day-cdn');
}

function isMinotruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('minotruyen') || h.includes('cloudkk');
}

function isOtakusicImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('otakusic');
}

function isGocTruyenTranhImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h.includes('goctruyentranh') ||
    h.includes('goctruyentranhvui') ||
    h.includes('gtt-bk.pro') ||
    h.includes('gtt-bk')
  );
}

function isComicvnImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('comicvn');
}

function isTruyenMoeImageCdnHost(hostname) {
  // Covers i.truyen.moe / u.truyen.moe. CDN accepts Referer from either
  // truyen.moe or moetruyen.net (and even no Referer); prefer truyen.moe
  // so UI image fetches still work with a foreign VPN IP.
  return String(hostname).toLowerCase().includes('truyen.moe');
}

function isMoeTruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('moetruyen') && !isTruyenMoeImageCdnHost(h);
}

function isDtvEbookImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('dtv-ebook');
}

function isManhuaguiImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.endsWith('.mhgui.com') || h.includes('mhgui') || h.endsWith('.hamreus.com') || h.includes('hamreus');
}


function isComickImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('comick') || h.includes('comicknew.pictures');
}

function isDilibImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('dilib');
}

function isNetTruyenArImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('nettruyenar') || h.includes('cloud-zzz.com') || h.includes('cloud-ccc.com');
}

function isNetTruyenGgSiteHost(hostname) {
  return String(hostname).toLowerCase().includes('nettruyen.gg');
}

function isNetTruyenGgImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return isNetTruyenGgSiteHost(hostname) || h.includes('kcgsbok');
}

function isNetTruyenVietImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  if (isNetTruyenArImageCdnHost(hostname)) return false;
  return h.includes('nettruyenviet') || h.includes('nettruyen') || h.includes('kcgsbok');
}

function isLuotTruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('luottruyen') || h.includes('dichvucdn');
}

function isSakamotoDaysImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('sakamotodaystruyen');
}

function isChapVnImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('chap.vn');
}

function isMangaballImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return (
    h.includes('mangaball') ||
    h.includes('poke-black-and-white.net') ||
    h.includes('red-and-blue.net')
  );
}

function isTruyenTuoiThoImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('truyentuoitho') || h.includes('resourcehub.shop');
}

function isBaozimhImageCdnHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.includes('bzcdn.net') || h.includes('baozicdn') || h.includes('baozimh');
}

function isKenhSinhVienImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h === 'kenhsinhvien.vn' || h.endsWith('.kenhsinhvien.vn');
}

function isRawkumaChapterImageHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('kumacdn.club') || h.includes('kyut.dev');
}

function isZettruyenImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('zetimage.com') || h.includes('zettruyen');
}

function isBluelakeImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('bluelakeaccelerator');
}

function isTopTruyenZone2ImageCdnHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h === 'anhvip.xyz' || h.endsWith('.anhvip.xyz');
}

function isTruyenGgSiteHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h.includes('truyenggvn') || h.includes('truyengg');
}

function isTruyenGgImageCdnHost(hostname) {
  return isTruyenGgSiteHost(hostname) || isTruyenQQNoImageCdnHost(hostname);
}

function getDynamicReferer(siteId, defaultReferer) {
  try {
    return connectorDomainManager.getDomain(siteId, defaultReferer);
  } catch {
    return defaultReferer;
  }
}

/**
 * Trả về Referer tương ứng connector nếu URL ảnh thuộc CDN của site đó; không khớp → null.
 */
function getImageRefererForUrl(urlString) {
  let hostname = '';
  try {
    hostname = new URL(String(urlString).trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!hostname) return null;
  if (isMutualheightsImageCdnHost(hostname)) return getDynamicReferer('mutualheights', TRUYENQQNO_IMAGE_REFERER);
  if (isTruyenQQNoImageCdnHost(hostname)) return getDynamicReferer('truyenqq', TRUYENQQNO_IMAGE_REFERER);
  if (isTruyenQQVnImageCdnHost(hostname)) return getDynamicReferer('truyenqqvn', TRUYENQQVN_IMAGE_REFERER);
  if (isCuuTruyenImageCdnHost(hostname)) return getDynamicReferer('cuutruyen', CUUTRUYEN_IMAGE_REFERER);
  if (isMangadexCdnHost(hostname)) return getDynamicReferer('mangadex', MANGADEX_IMAGE_REFERER);
  if (isComixImageCdnHost(hostname)) return getDynamicReferer('comix', COMIX_IMAGE_REFERER);
  if (isAntbywImageCdnHost(hostname)) return getDynamicReferer('antbyw', ANTBYW_IMAGE_REFERER);
  if (isMangaPlusImageCdnHost(hostname)) return getDynamicReferer('mangaplus', MANGAPLUS_IMAGE_REFERER);
  if (isComicDaysImageCdnHost(hostname)) return getDynamicReferer('comicdays', COMICDAYS_IMAGE_REFERER);
  if (isMinotruyenImageCdnHost(hostname)) return getDynamicReferer('minotruyen', MINOTRUYEN_IMAGE_REFERER);
  if (isOtakusicImageCdnHost(hostname)) return getDynamicReferer('otakusic', OTAKUSIC_IMAGE_REFERER);
  if (isGocTruyenTranhImageCdnHost(hostname)) return getDynamicReferer('goctruyentranh', GOCTRUYENTRANH_IMAGE_REFERER);
  if (isComicvnImageCdnHost(hostname)) return getDynamicReferer('comicvn', COMICVN_IMAGE_REFERER);
  if (isTruyenMoeImageCdnHost(hostname)) return getDynamicReferer('truyenmoe', TRUYENMOE_IMAGE_REFERER);
  if (isMoeTruyenImageCdnHost(hostname)) return getDynamicReferer('moetruyen', MOETRUYEN_IMAGE_REFERER);
  if (isDtvEbookImageCdnHost(hostname)) return getDynamicReferer('dtvebook', DTVEBOOK_IMAGE_REFERER);
  if (isManhuaguiImageCdnHost(hostname)) return getDynamicReferer('manhuagui', MANHUAGUI_IMAGE_REFERER);
  if (isNetTruyenArImageCdnHost(hostname)) return getDynamicReferer('nettruyenar', NETTRUYENAR_IMAGE_REFERER);
  if (isNetTruyenGgSiteHost(hostname)) return getDynamicReferer('nettruyengg', NETTRUYENGG_IMAGE_REFERER);
  if (isNetTruyenVietImageCdnHost(hostname)) return getDynamicReferer('nettruyenviet', NETTRUYENVIET_IMAGE_REFERER);
  if (isLuotTruyenImageCdnHost(hostname)) return getDynamicReferer('luottruyen', LUOTTRUYEN_IMAGE_REFERER);
  if (isComickImageCdnHost(hostname)) return getDynamicReferer('comick', COMICK_IMAGE_REFERER);
  if (isDilibImageCdnHost(hostname)) return getDynamicReferer('dilib', DILIB_IMAGE_REFERER);
  if (isSakamotoDaysImageCdnHost(hostname)) return getDynamicReferer('sakamotodays', SAKAMOTODAYS_IMAGE_REFERER);
  if (isChapVnImageCdnHost(hostname)) return getDynamicReferer('chapvn', CHAPVN_IMAGE_REFERER);
  if (isMangaballImageCdnHost(hostname)) return getDynamicReferer('mangaball', MANGABALL_IMAGE_REFERER);
  if (isTruyenTuoiThoImageCdnHost(hostname)) return getDynamicReferer('truyentuoitho', TRUYENTUOITHO_IMAGE_REFERER);
  if (isBaozimhImageCdnHost(hostname)) return getDynamicReferer('baozimh', BAOZIMH_IMAGE_REFERER);
  if (isKenhSinhVienImageCdnHost(hostname)) return getDynamicReferer('kenhsinhvien', KENHSINHVIEN_IMAGE_REFERER);
  if (isRawkumaChapterImageHost(hostname)) return getDynamicReferer('rawkuma', RAWKUMA_IMAGE_REFERER);
  if (isZettruyenImageCdnHost(hostname)) return getDynamicReferer('zettruyen', ZETTRUYEN_IMAGE_REFERER);
  if (isBluelakeImageCdnHost(hostname)) return getDynamicReferer('bluelake', BLUELAKE_IMAGE_REFERER);
  if (isTopTruyenZone2ImageCdnHost(hostname)) return getDynamicReferer('toptruyenzone2', TOPTRUYENZONE2_IMAGE_REFERER);
  if (isMangaFireImageCdnHost(hostname)) return getDynamicReferer('mangafire', MANGAFIRE_IMAGE_REFERER);
  if (isMangapillImageCdnHost(hostname)) return getDynamicReferer('mangapill', MANGAPILL_IMAGE_REFERER);
  if (isSuicaoDexImageCdnHost(hostname)) return getDynamicReferer('suicaodex', SUICAODEX_IMAGE_REFERER);
  if (isXbatoImageCdnHost(hostname)) return getDynamicReferer('xbato', XBATO_IMAGE_REFERER);
  if (isKingOfShojoImageCdnHost(hostname)) return getDynamicReferer('kingofshojo', KINGOFSHOJO_IMAGE_REFERER);
  if (isFanfoxImageCdnHost(hostname)) return getDynamicReferer('fanfox', FANFOX_IMAGE_REFERER);
  if (isTruyenGgSiteHost(hostname)) return getDynamicReferer('truyengg', TRUYENGG_IMAGE_REFERER);
  if (isBaotangtruyenImageCdnHost(hostname)) return getDynamicReferer('baotangtruyen', BAOTANGTRUYEN_IMAGE_REFERER);
  if (isNhattruyenImageCdnHost(hostname)) return getDynamicReferer('nhattruyen', NHATTRUYEN_IMAGE_REFERER);
  if (isAsurascansImageCdnHost(hostname)) return getDynamicReferer('asurascans', ASURASCANS_IMAGE_REFERER);
  if (isFlamecomicsImageCdnHost(hostname)) return getDynamicReferer('flamecomics', FLAMECOMICS_IMAGE_REFERER);
  if (isSangchanhteamImageCdnHost(hostname)) return getDynamicReferer('sangchanhteam', SANGCHANHTEAM_IMAGE_REFERER);
  if (isTcbscanmangaImageCdnHost(hostname)) return getDynamicReferer('tcbscanmanga', TCBSCANMANGA_IMAGE_REFERER);
  if (hostname === 'drive.google.com' || hostname === 'docs.google.com') {
    return GOOGLE_DRIVE_IMAGE_REFERER;
  }
  return null;
}

module.exports = {
  TRUYENQQNO_IMAGE_REFERER,
  TRUYENQQVN_IMAGE_REFERER,
  TRUYENQQ_IMAGE_REFERER,
  CUUTRUYEN_IMAGE_REFERER,
  MANGADEX_IMAGE_REFERER,
  COMIX_IMAGE_REFERER,
  ANTBYW_IMAGE_REFERER,
  MANGAPLUS_IMAGE_REFERER,
  COMICDAYS_IMAGE_REFERER,
  MINOTRUYEN_IMAGE_REFERER,
  OTAKUSIC_IMAGE_REFERER,
  GOCTRUYENTRANH_IMAGE_REFERER,
  COMICVN_IMAGE_REFERER,
  MOETRUYEN_IMAGE_REFERER,
  TRUYENMOE_IMAGE_REFERER,
  GOOGLE_DRIVE_IMAGE_REFERER,
  DTVEBOOK_IMAGE_REFERER,
  MANHUAGUI_IMAGE_REFERER,
  NETTRUYENVIET_IMAGE_REFERER,
  NETTRUYENGG_IMAGE_REFERER,
  NETTRUYENAR_IMAGE_REFERER,
  LUOTTRUYEN_IMAGE_REFERER,
  COMICK_IMAGE_REFERER,
  DILIB_IMAGE_REFERER,
  SAKAMOTODAYS_IMAGE_REFERER,
  CHAPVN_IMAGE_REFERER,
  MANGABALL_IMAGE_REFERER,
  TRUYENTUOITHO_IMAGE_REFERER,
  BAOZIMH_IMAGE_REFERER,
  KENHSINHVIEN_IMAGE_REFERER,
  RAWKUMA_IMAGE_REFERER,
  ZETTRUYEN_IMAGE_REFERER,
  BLUELAKE_IMAGE_REFERER,
  TOPTRUYENZONE2_IMAGE_REFERER,
  MANGAFIRE_IMAGE_REFERER,
  SUICAODEX_IMAGE_REFERER,
  isTruyenQQNoImageCdnHost,
  isMutualheightsImageCdnHost,
  isTruyenQQVnImageCdnHost,
  isTruyenQQImageCdnHost,
  isCuuTruyenImageCdnHost,
  isMangadexCdnHost,
  isComixImageCdnHost,
  isAntbywImageCdnHost,
  isMangaPlusImageCdnHost,
  isComicDaysImageCdnHost,
  isMinotruyenImageCdnHost,
  isOtakusicImageCdnHost,
  isGocTruyenTranhImageCdnHost,
  isComicvnImageCdnHost,
  isMoeTruyenImageCdnHost,
  isTruyenMoeImageCdnHost,
  isDtvEbookImageCdnHost,
  isManhuaguiImageCdnHost,
  isNetTruyenVietImageCdnHost,
  isNetTruyenGgImageCdnHost,
  isNetTruyenArImageCdnHost,
  isLuotTruyenImageCdnHost,
  isComickImageCdnHost,
  isDilibImageCdnHost,
  isSakamotoDaysImageCdnHost,
  isChapVnImageCdnHost,
  isMangaballImageCdnHost,
  isTruyenTuoiThoImageCdnHost,
  isBaozimhImageCdnHost,
  isKenhSinhVienImageCdnHost,
  isRawkumaChapterImageHost,
  isZettruyenImageCdnHost,
  isBluelakeImageCdnHost,
  isTopTruyenZone2ImageCdnHost,
  isMangaFireImageCdnHost,
  MANGAPILL_IMAGE_REFERER,
  isMangapillImageCdnHost,
  isSuicaoDexImageCdnHost,
  XBATO_IMAGE_REFERER,
  isXbatoImageCdnHost,
  KINGOFSHOJO_IMAGE_REFERER,
  isKingOfShojoImageCdnHost,
  FANFOX_IMAGE_REFERER,
  isFanfoxImageCdnHost,
  TRUYENGG_IMAGE_REFERER,
  isTruyenGgSiteHost,
  isTruyenGgImageCdnHost,
  BAOTANGTRUYEN_IMAGE_REFERER,
  isBaotangtruyenImageCdnHost,
  NHATTRUYEN_IMAGE_REFERER,
  isNhattruyenImageCdnHost,
  ASURASCANS_IMAGE_REFERER,
  isAsurascansImageCdnHost,
  FLAMECOMICS_IMAGE_REFERER,
  isFlamecomicsImageCdnHost,
  SANGCHANHTEAM_IMAGE_REFERER,
  isSangchanhteamImageCdnHost,
  TCBSCANMANGA_IMAGE_REFERER,
  isTcbscanmangaImageCdnHost,
  getImageRefererForUrl,
};
