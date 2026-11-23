import { extractCandidateHttpUrl, shouldOfferClipboardUrl } from './clipboardUrlUtils.mjs';

describe('clipboardUrlUtils', () => {
  test('extractCandidateHttpUrl accepts valid manga URLs and rejects noise', () => {
    expect(extractCandidateHttpUrl('  https://mangadex.org/title/abc-123/my-manga  ')).toBe(
      'https://mangadex.org/title/abc-123/my-manga'
    );
    expect(extractCandidateHttpUrl('https://google.com')).toBeNull();
    expect(extractCandidateHttpUrl('https://google.com/')).toBeNull();
    expect(extractCandidateHttpUrl('not a url')).toBeNull();
    expect(extractCandidateHttpUrl('ftp://example.com/file')).toBeNull();
    expect(extractCandidateHttpUrl('https://example.com/a\nhttps://example.com/b')).toBeNull();
    expect(extractCandidateHttpUrl('')).toBeNull();
  });

  test('shouldOfferClipboardUrl respects siteId, currentSourceUrl, and dismissed set', () => {
    const dismissed = new Set(['https://site.com/manga/old']);
    expect(
      shouldOfferClipboardUrl({
        url: 'https://site.com/manga/new',
        siteId: 'mangadex',
        currentSourceUrl: 'https://site.com/manga/other',
        dismissedUrls: dismissed,
      })
    ).toBe(true);

    expect(
      shouldOfferClipboardUrl({
        url: 'https://site.com/manga/new',
        siteId: '',
        currentSourceUrl: '',
        dismissedUrls: dismissed,
      })
    ).toBe(false);

    expect(
      shouldOfferClipboardUrl({
        url: 'https://site.com/manga/old',
        siteId: 'mangadex',
        currentSourceUrl: '',
        dismissedUrls: dismissed,
      })
    ).toBe(false);

    expect(
      shouldOfferClipboardUrl({
        url: 'https://site.com/manga/same',
        siteId: 'mangadex',
        currentSourceUrl: 'https://site.com/manga/same',
        dismissedUrls: dismissed,
      })
    ).toBe(false);
  });
});
