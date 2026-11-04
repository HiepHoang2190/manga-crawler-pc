const fs = require('fs');
const path = require('path');

jest.mock('../../../download/connector/htmlConnectorUtils', () => {
  const actual = jest.requireActual('../../../download/connector/htmlConnectorUtils');
  return {
    ...actual,
    fetchHtml: jest.fn(),
  };
});

const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const { getImageRefererForUrl } = require('../../../download/connector/connectorReferer');
const { getCatalogEntry } = require('../../../platform/connectors/tester/catalog');
const fanfox_connector = require('../../../platform/connectors/fanfox');
const {
  unpackDeanEdwardsPacker,
  extractGuidKey,
  parseChapterFunImageUrls,
  buildChapterFunPageNumbers,
} = require('../../../platform/connectors/services/fanfoxPacker');
const { load, fetchChapterImages } = require('../../../platform/connectors/services/fanfoxService');

const GUIDKEY_SCRIPT =
  'eval(function(p,a,c,k,e,d){e=function(c){return(c<a?"":e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!\'\'.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return\'\\\\w+\'};c=1;};while(c--)if(k[c])p=p.replace(new RegExp(\'\\\\b\'+e(c)+\'\\\\b\',\'g\'),k[c]);return p;}(\'2 1=\\\'\\\'+\\\'a\\\'+\\\'a\\\'+\\\'e\\\'+\\\'5\\\'+\\\'9\\\'+\\\'0\\\'+\\\'d\\\'+\\\'0\\\'+\\\'b\\\'+\\\'8\\\'+\\\'a\\\'+\\\'e\\\'+\\\'4\\\'+\\\'3\\\'+\\\'6\\\'+\\\'6\\\';$("#7").c(1);\',15,15,\'f|guidkey|var|||||dm5_key|||||val||\'.split(\'|\'),0,{}))';

const CHAPTER_FUN_PAGE1 =
  'eval(function(p,a,c,k,e,d){e=function(c){return(c<a?"":e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!\'\'.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return\'\\\\w+\'};c=1;};while(c--)if(k[c])p=p.replace(new RegExp(\'\\\\b\'+e(c)+\'\\\\b\',\'g\'),k[c]);return p;}(\'k e(){2 f="//8.b.7/c/3/4/6.0/g";2 1=["/n.h?5=m&9=a","/l.h?5=j&9=a"];o(2 i=0;i<1.u;i++){s(i==0){1[i]="//8.b.7/c/3/4/6.0/g"+1[i];p}1[i]=f+1[i]}q 1}2 d;d=e();r=t;\',31,31,\'|pvalue|var|manga|34225|token|001|me|zjcdn|ttl|1791993600|mangafox|store||dm5imagefun|pix|compressed|jpg||bb8af3a9cef44773c54172ae73db41515cb53d42|function|m001|94599e1748314098c692a2ae6f0ea124241970b0|m000|for|continue|return|currentimageid|if|16920944|length\'.split(\'|\'),0,{}))';

const CHAPTER_FUN_PAGE2 = CHAPTER_FUN_PAGE1.replace(
  '|function|m001|94599e1748314098c692a2ae6f0ea124241970b0|m000|for|',
  '|function|m002|94599e1748314098c692a2ae6f0ea124241970b0|m001|for|',
);

const IMAGE_M000 =
  'https://zjcdn.mangafox.me/store/manga/34225/001.0/compressed/m000.jpg?token=94599e1748314098c692a2ae6f0ea124241970b0&ttl=1791993600';
const IMAGE_M001 =
  'https://zjcdn.mangafox.me/store/manga/34225/001.0/compressed/m001.jpg?token=bb8af3a9cef44773c54172ae73db41515cb53d42&ttl=1791993600';
const IMAGE_M001_FROM_PAGE2 =
  'https://zjcdn.mangafox.me/store/manga/34225/001.0/compressed/m001.jpg?token=94599e1748314098c692a2ae6f0ea124241970b0&ttl=1791993600';
const IMAGE_M002 =
  'https://zjcdn.mangafox.me/store/manga/34225/001.0/compressed/m002.jpg?token=bb8af3a9cef44773c54172ae73db41515cb53d42&ttl=1791993600';

const MANGA_HTML = `
<span class="detail-info-right-title-font">One Piece</span>
<img class="detail-info-cover-img" src="https://fmcdn.mfcdn.net/store/manga/106/cover.jpg?token=abc">
<div id="chapterlist">
  <div id="list-1">
    <a href="/manga/one_piece/c1046.5/1.html"><p class="title3">Ch.1046.5</p></a>
  </div>
  <div id="list-2">
    <a href="/manga/one_piece/vTBE/c1195/1.html"><p class="title3">Vol.TBE Ch.1195</p></a>
    <a href="/manga/one_piece/v01/c001/1.html"><p class="title3">Vol.01 Ch.001</p></a>
  </div>
</div>`;

const CHAPTER_URL = 'https://fanfox.net/manga/one_piece/v01/c001/1.html';
const CHAPTER_HTML = `
<script>
var chapterid =698723;
var imagecount=3;
${GUIDKEY_SCRIPT}
</script>`;

describe('FanFox packer', () => {
  test('unpacks the chapter guidkey script', () => {
    const unpacked_script = unpackDeanEdwardsPacker(GUIDKEY_SCRIPT);
    expect(unpacked_script).toContain('guidkey');
    expect(extractGuidKey(GUIDKEY_SCRIPT)).toBe('aae59fdfb8ae4366');
  });

  test('parses chapterfun image urls from a packed response', () => {
    expect(parseChapterFunImageUrls(CHAPTER_FUN_PAGE1)).toEqual([IMAGE_M000, IMAGE_M001]);
  });

  test('builds odd page pairs and includes the last page when the count is odd', () => {
    expect(buildChapterFunPageNumbers(1)).toEqual([1]);
    expect(buildChapterFunPageNumbers(2)).toEqual([1]);
    expect(buildChapterFunPageNumbers(3)).toEqual([1, 2]);
    expect(buildChapterFunPageNumbers(70)).toEqual(
      Array.from({ length: 35 }, (_, index) => index * 2 + 1),
    );
  });
});

describe('FanFox service', () => {
  beforeEach(() => {
    fetchHtml.mockReset();
  });

  test('loads title, cover, and both chapter lists from a manga page', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: MANGA_HTML });

    const loaded = await load('https://www.fanfox.net/manga/one_piece/');

    expect(loaded.ok).toBe(true);
    expect(loaded.manga).toMatchObject({
      title: 'One Piece',
      coverUrl: 'https://fmcdn.mfcdn.net/store/manga/106/cover.jpg?token=abc',
      mangaUrl: 'https://www.fanfox.net/manga/one_piece/',
      siteId: 'fanfox',
      sourceLabel: 'FanFox',
    });
    expect(loaded.chapters.map((chapter) => chapter.title)).toEqual([
      'Ch.1046.5',
      'Vol.TBE Ch.1195',
      'Vol.01 Ch.001',
    ]);
    expect(loaded.chapters[1].url).toBe('https://www.fanfox.net/manga/one_piece/vTBE/c1195/1.html');
  });

  test('resolves a chapter url back to the manga page before loading', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: MANGA_HTML });

    await load(CHAPTER_URL);

    expect(fetchHtml.mock.calls[0][0]).toBe('https://fanfox.net/manga/one_piece/');
  });

  test('collects unique chapter images by requesting chapterfun in pairs', async () => {
    fetchHtml.mockImplementation(async (request_url) => {
      if (String(request_url).includes('chapterfun.ashx')) {
        const page_number = new URL(request_url).searchParams.get('page');
        if (page_number === '1') return { ok: true, html: CHAPTER_FUN_PAGE1 };
        if (page_number === '2') return { ok: true, html: CHAPTER_FUN_PAGE2 };
        return { ok: false, error: `unexpected page ${page_number}` };
      }
      return { ok: true, html: CHAPTER_HTML };
    });

    const image_list = await fetchChapterImages(CHAPTER_URL, 'https://fanfox.net/');

    expect(image_list.map((image) => image.imageUrl)).toEqual([
      IMAGE_M000,
      IMAGE_M001,
      IMAGE_M002,
    ]);
    expect(image_list[0].ext).toBe('jpg');
    expect(IMAGE_M001_FROM_PAGE2).not.toBe(image_list[1].imageUrl);

    const fun_calls = fetchHtml.mock.calls
      .map((call) => call[0])
      .filter((request_url) => String(request_url).includes('chapterfun.ashx'));
    expect(fun_calls).toEqual([
      'https://fanfox.net/manga/one_piece/v01/c001/chapterfun.ashx?cid=698723&page=1&key=aae59fdfb8ae4366',
      'https://fanfox.net/manga/one_piece/v01/c001/chapterfun.ashx?cid=698723&page=2&key=aae59fdfb8ae4366',
    ]);
  });

  test('reads inline newImgs when the chapter page has no guidkey', async () => {
    const inline_html = fs.readFileSync(
      path.join(__dirname, 'fixtures/c249-newimgs.js'),
      'utf8',
    );
    fetchHtml.mockResolvedValue({ ok: true, html: inline_html });

    const image_list = await fetchChapterImages(
      'https://fanfox.net/manga/the_max_level_hero_has_returned/c249/1.html',
      'https://fanfox.net/',
    );

    expect(image_list).toHaveLength(78);
    expect(image_list[0].imageUrl).toMatch(
      /^https:\/\/zjcdn\.mangafox\.me\/store\/manga\/36273\/249\.0\/compressed\/p001\.jpg\?token=/,
    );
    expect(image_list[77].imageUrl).toMatch(/\/p057_1\.jpg\?token=/);
    expect(image_list[0].ext).toBe('jpg');
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });
});

describe('FanFox registry', () => {
  test('is listed and detects fanfox hosts', () => {
    const listed = listConnectors().find((connector) => connector.id === 'fanfox');
    expect(listed).toMatchObject({
      id: 'fanfox',
      label: 'FanFox',
      domain: 'https://fanfox.net/',
      requiresCookie: false,
      supportsApiFetch: false,
    });
    expect(listed.icon).toBe('data/site-icons/fanfox.png');
    expect(fanfox_connector.imageReferer).toBe('https://fanfox.net/');
    expect(detectSiteIdFromUrl('https://fanfox.net/manga/one_piece/')).toBe('fanfox');
    expect(detectSiteIdFromUrl('https://www.fanfox.net/manga/one_piece/c001/1.html')).toBe('fanfox');
    expect(detectSiteIdFromUrl('https://example.com/manga/one_piece/')).not.toBe('fanfox');
    expect(getImageRefererForUrl(IMAGE_M000)).toBe('https://fanfox.net/');
    expect(
      getImageRefererForUrl('https://fmcdn.mfcdn.net/store/manga/36273/cover.jpg?token=abc'),
    ).toBe('https://fanfox.net/');
    expect(getImageRefererForUrl('https://o48.mfcdn2.xyz/mf/page.jpg')).toBe(
      'https://mangafire.to/',
    );
    expect(getCatalogEntry('fanfox').testUrl).toBe('/manga/one_piece/');
  });
});
