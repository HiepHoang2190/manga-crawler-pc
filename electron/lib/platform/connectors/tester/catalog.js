const SKIP_DOWNLOAD_IDS = new Set(['dtvebook']);
const FIRST_CHAPTER_IDS = new Set(['comicdays', 'manhwatv']);

const TEST_URLS = {
  antbyw: '/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651',
  baozimh: '/comic/silingfashiwojishitianzai-mantudezhuyuanzhuheiniaoshe_rjogsq',
  batcave: '/34138-new-titans-2026.html',
  fanfox: '/manga/one_piece/',
  bluelake: '/truyen-tranh/ngoi-sao-am-thuc-michelin-star',
  chapvn: '/forums/128/',
  comicdays: '/episode/13932016480029480667',
  comick: '/comic/00-lan-ke-qi-yuan',
  comix: '/title/9058-frozen-wolf-fire-dragon',
  cuutruyen: '/mangas/1775',
  dilib: '/sat-thu-ve-vuon-sakamoto-days-7085.html',
  dtvebook: '/than-dong-kiem-si_26874.html#google_vignette',
  goctruyentranh: '/truyen/onepunch-man',
  hangtruyen: '/truyen-tranh/xuyen-thanh-tieu-muoi-cua-dai-lao-giau-mat',
  mutualheights: '/truyen-tranh/keijo',
  kingofshojo: '/manga/i-got-engaged-to-the-blind-duke/',
  luottruyen: '/truyen-tranh/dac-vu-song-sinh-16719',
  luutrucuawibu: 'https://luutrucuawibu.blogspot.com/2026/01/one-punch-man-web-comic.html',
  mangaball: '/title-detail/07c972f1-794b-4910-a996-19d591539411-6a4c7bb43f8c60610ae5c672/',
  mangadex: '/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger?tab=chapters',
  mangafire: '/title/5xmm0-morino-san-darugaramu',
  mangapill: '/chapters/1694-10158000/higanjima-saigo-no-47-hiai-chapter-158',
  mangaplus: '/titles/1000001',
  mangavn: '/t15202-sekirei',
  manhuagui: '/comic/7580/',
  manhwatv: '/truyen-tranh/snvtnovel-nguoi-bao-tro-cua-nh.html',
  minotruyen: '/b/manga/books/8703',
  moetruyen: '/manga/41-dau-bep-tru-danh',
  truyenmoe: '/manga/1550-our-guild-s-idol',
  nettruyenar: '/truyen-tranh/bach-luyen-thanh-than-1099',
  nettruyengg: '/truyen-tranh/ma-thu-sieu-than',
  nettruyenviet: '/truyen-tranh/dai-phung-da-canh-nhan',
  otakusic: '/chi-tiet/mua-he-bi-nuot-chung-boi-bong-toi',
  pokemonspecial: '/p/home.html',
  rawkuma: '/manga/bouken-ka-ni-narou-skill-board-de-dungeon-kouryaku/',
  sakamotodays: '/',
  suicaodex: '/manga/1gxujbvdyj/hinamatsuri',
  toptruyenzone2: '/truyen-tranh/hoan-quan-hoi-quy-troc-phong-truy-nguyet/18649',
  truyentranhphapbi: '/search/label/Ng%E1%BB%99%20Kh%C3%B4ng',
  truyentuoitho: '/manga/duong-dan-den-khung-thanh/',
  truyenqq: '/truyen-tranh/nguoi-trung-doc-dac-cung-di-lam-22232',
  truyenqqvn: '/cuong-gia-den-tu-trai-tam-than',
  tuthienbao: '/forum/forumdisplay.php?f=209',
  vietmessenger: '/comics/',
  vivicomic: '/truyen-tranh/hoang-nu-cosplay-nonfan',
  webtoons: '/en/action/the-bad-son/list?title_no=6653',
  xbato: '/manga/runaway-in-the-present',
  yurineko: '/manga/cam-bay-thang-nu',
  zettruyen: '/truyen-tranh/the-fable-bi-mat-thu-ba',
  comicvn: '/than-binh-sang-th-686a3f7b9d18db3d374fb7b3.html',
  truyengg: '/truyen-tranh/maou-no-ore-ga-dorei-elf-wo-yome-ni-shitanda-ga-dou-medereba-ii-4617',
  baotangtruyen: '/nguyen-tac-cua-serim',
  nhattruyen: '/truyen-tranh/pham-nhan-be-con-cua-dinh-thu-mua-dong',
  asurascans: '/comics/solo-swordmaster-11fe7da3',
  flamecomics: '/series/2',
  kenhsinhvien: '/',
  sangchanhteam: '/truyen/het-nhu-han-quang-gap-nang-gat/',
  tcbscanmanga: '/manga/futago-matomete-kanojo-ni-shinai-',
};

function buildCatalog() {
  const catalog_map = {};
  for (const [site_id, test_url] of Object.entries(TEST_URLS)) {
    const catalog_entry = { testUrl: test_url };
    if (SKIP_DOWNLOAD_IDS.has(site_id)) {
      catalog_entry.skipSteps = ['download'];
    }
    if (FIRST_CHAPTER_IDS.has(site_id)) {
      catalog_entry.chapterPicker = 'first';
    }
    if (site_id === 'comix') {
      catalog_entry.timeouts = { chapters: 300000, download: 180000 };
    }
    if (site_id === 'mangafire') {
      catalog_entry.timeouts = { chapters: 60000, download: 60000 };
    }
    catalog_map[site_id] = catalog_entry;
  }
  return catalog_map;
}

const CATALOG = buildCatalog();

function getCatalogEntry(siteId) {
  if (!siteId) return null;
  return CATALOG[String(siteId).toLowerCase()] || null;
}

function listCatalogEntries() {
  return Object.keys(CATALOG).map((site_id) => ({
    siteId: site_id,
    ...CATALOG[site_id],
  }));
}

function resolveTestUrl(siteId, currentDomain) {
  const catalog_entry = getCatalogEntry(siteId);
  if (!catalog_entry || !catalog_entry.testUrl) return '';
  const raw_url = catalog_entry.testUrl;
  if (!raw_url.startsWith('/')) return raw_url;
  if (!currentDomain) return raw_url;
  let base_url = String(currentDomain).trim();
  if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
    base_url = `https://${base_url}`;
  }
  while (base_url.endsWith('/')) {
    base_url = base_url.slice(0, -1);
  }
  return `${base_url}${raw_url}`;
}

module.exports = {
  getCatalogEntry,
  listCatalogEntries,
  resolveTestUrl,
};
