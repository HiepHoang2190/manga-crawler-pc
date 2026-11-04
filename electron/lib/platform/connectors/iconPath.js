/**
 * Helper để resolve icon path cho connector.
 * Ưu tiên dùng local icon trong public/data/site-icons/
 * Tất cả icon được tải từ Google Favicon API (format PNG, 64x64)
 */

const ICON_MAP = {
  cuutruyen: 'cuutruyen.png',
  truyenqq: 'truyenqq.png',
  truyenqqvn: 'truyenqqvn.png',
  mangadex: 'mangadex.png',
  comix: 'comix.png',
  antbyw: 'antbyw.png',
  baozimh: 'baozimh.png',
  mangaplus: 'mangaplus.png',
  comicdays: 'comicdays.png',
  minotruyen: 'minotruyen.png',
  otakusic: 'otakusic.png',
  goctruyentranh: 'goctruyentranh.png',
  comicvn: 'comicvn.png',
  moetruyen: 'moetruyen.png',
  truyenmoe: 'moetruyen.png',
  truyentranhphapbi: 'truyentranhphapbi.png',
  dtvebook: 'dtvebook.png',
  manhuagui: 'manhuagui.png',
  nettruyenviet: 'nettruyenviet.png',
  nettruyenar: 'nettruyenviet.png',
  luottruyen: 'luottruyen.png',
  comick: 'comick.png',
  dilib: 'dilib.png',
  luutrucuawibu: 'luutrucuawibu.png',
  sakamotodays: 'sakamotodays.png',
  pokemonspecial: 'pokemonspecial.png',
  chapvn: 'chapvn.png',
  mangaball: 'mangaball.png',
  mangafire: 'mangafire.png',
  truyentuoitho: 'truyentuoitho.png',
  tuthienbao: 'tuthienbao.png',
  kenhsinhvien: 'kenhsinhvien.png',
  mangavn: 'mangavn.png',
  manhwatv: 'manhwatv.png',
  rawkuma: 'rawkuma.png',
  zettruyen: 'zettruyen.png',
  bluelake: 'bluelake.png',
  toptruyenzone2: 'toptruyenzone2.png',
  mutualheights: 'mutualheights.png',
  webtoons: 'webtoons.png',
  mangapill: 'mangapill.png',
  suicaodex: 'suicaodex.png',
  xbato: 'xbato.png',
  hangtruyen: 'hangtruyen.png',
  vivicomic: 'vivicomic.png',
  vietmessenger: 'vietmessenger.png',
  nettruyengg: 'nettruyengg.png',
  yurineko: 'yurineko.png',
  kingofshojo: 'kingofshojo.png',
  batcave: 'batcave.png',
  fanfox: 'fanfox.png',
  truyengg: 'truyengg.png',
  baotangtruyen: 'baotangtruyen.png',
  nhattruyen: 'nhattruyen.png',
  asurascans: 'asurascans.png',
  flamecomics: 'flamecomics.png',
  sangchanhteam: 'sangchanhteam.png',
  tcbscanmanga: 'tcbscanmanga.png',
};

/**
 * Trả về local path cho icon của connector.
 * @param {string} connectorId - ID của connector
 * @returns {string} - Path tương đối từ public/ (vd: 'data/site-icons/cuutruyen.png')
 */
function getIconPath(connectorId) {
  const filename = ICON_MAP[connectorId];
  if (!filename) return null;
  return `data/site-icons/${filename}`;
}

module.exports = { getIconPath };
