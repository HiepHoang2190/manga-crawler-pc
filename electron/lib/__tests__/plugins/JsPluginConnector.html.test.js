'use strict';

const JsPluginConnector = require('../../plugins/JsPluginConnector');

describe('JsPluginConnector html bridge (cheerio)', () => {
  test('querySelector returns null when no match (like DOM)', async () => {
    const source = `
const plugin = {
  id: 'htmlt',
  name: 'HtmlT',
  version: '1',
  author: 't',
  description: 't',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  run() {
    const doc = html.parse(
      '<ul id="tq-root"><li><span>no link</span></li><li><a href="https://ex.com/truyen-tranh/z-1">Z</a></li></ul>',
    );
    const lis = doc.querySelectorAll('#tq-root > li');
    const hrefs = [];
    for (let i = 0; i < lis.length; i++) {
      const link = lis[i].querySelector('a[href*="truyen-tranh"]');
      hrefs.push(link ? link.attr('href') : null);
    }
    return hrefs;
  },
};
`;
    const connector = new JsPluginConnector({
      pluginId: 'htmlt',
      metadata: {
        id: 'htmlt',
        name: 'HtmlT',
        version: '1',
        author: 't',
        description: 't',
        baseUrl: 'https://example.com/',
        allowedDomains: ['example.com'],
      },
      source,
    });
    const hrefs = await connector._callPluginFunction('run', []);
    expect(hrefs).toEqual([null, 'https://ex.com/truyen-tranh/z-1']);
  });
});
