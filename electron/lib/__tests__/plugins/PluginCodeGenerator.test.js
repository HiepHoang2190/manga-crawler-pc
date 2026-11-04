const generator = require('../../plugins/PluginCodeGenerator');
const PluginValidator = require('../../plugins/PluginValidator');

describe('PluginCodeGenerator', () => {
  const validator = new PluginValidator();

  test('should generate valid plugin source code with fetchManga and fetchChapterImages', () => {
    const sampleAnalysis = {
      siteInfo: {
        id: 'test-comic',
        name: 'Test Comic',
        baseUrl: 'https://testcomic.com',
        hostname: 'testcomic.com',
        domains: ['testcomic.com', 'cdn.testcomic.com']
      },
      detected: {
        titleSelector: 'h1.title',
        coverSelector: 'meta[property="og:image"]',
        chapterSelector: 'a[href*="chapter"]',
        imageContainerSelector: '.reading-content',
        imageSelector: '.reading-content img'
      }
    };

    const source = generator.generate(sampleAnalysis);

    expect(typeof source).toBe('string');
    expect(source).toContain('fetchManga: async function(url)');
    expect(source).toContain('fetchChapterImages: async function(url)');
    expect(source).toContain('[PLUGIN DEBUG]');

    const validation = validator.validate(source);
    expect(validation.isValid).toBe(true);
    expect(validation.metadata.id).toBe('test-comic');
    expect(validation.metadata.name).toBe('Test Comic');
  });

  test('should generate fallback selectors when detected selectors are null', () => {
    const sampleAnalysis = {
      siteInfo: {
        id: 'fallback-comic',
        name: 'Fallback Comic',
        baseUrl: 'https://fallback.com',
        hostname: 'fallback.com',
        domains: ['fallback.com']
      },
      detected: {
        titleSelector: null,
        coverSelector: null,
        chapterSelector: null,
        imageContainerSelector: null,
        imageSelector: null
      }
    };

    const source = generator.generate(sampleAnalysis);
    const validation = validator.validate(source);
    expect(validation.isValid).toBe(true);
  });
});
