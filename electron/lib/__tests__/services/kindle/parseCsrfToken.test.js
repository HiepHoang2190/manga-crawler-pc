const { parseCsrfToken, parseAccountName } = require('../../../export/kindle/KindleAuthSession');

describe('parseCsrfToken', () => {
  test('extracts token from single-quoted attribute', () => {
    const html = "<input type='hidden' name='csrfToken' value='ABC-123' />";
    expect(parseCsrfToken(html)).toBe('ABC-123');
  });

  test('extracts token from double-quoted attribute', () => {
    const html = '<input name="csrfToken" value="XYZ_789" />';
    expect(parseCsrfToken(html)).toBe('XYZ_789');
  });

  test('tolerates other attributes between name and value', () => {
    const html = '<input type="hidden" name="csrfToken" class="x" value="MID-1" />';
    expect(parseCsrfToken(html)).toBe('MID-1');
  });

  test('tolerates value appearing before name', () => {
    const html = '<input value="REV-2" id="t" name="csrfToken">';
    expect(parseCsrfToken(html)).toBe('REV-2');
  });

  test('extracts token from a JS/JSON assignment form', () => {
    expect(parseCsrfToken('var config = { "csrfToken": "JS-3", other: 1 };')).toBe('JS-3');
    expect(parseCsrfToken("window.csrfToken = 'JS-4';")).toBe('JS-4');
  });

  test('returns null when absent (signed out)', () => {
    expect(parseCsrfToken('<html>please sign in</html>')).toBeNull();
    expect(parseCsrfToken('')).toBeNull();
    expect(parseCsrfToken(null)).toBeNull();
  });
});

describe('parseAccountName', () => {
  test('extracts first name from the nav-line-1 greeting (by id)', () => {
    const html =
      '<span id="nav-link-accountList-nav-line-1" class="nav-line-1">Hello, Nguyen</span>';
    expect(parseAccountName(html)).toBe('Nguyen');
  });

  test('extracts name from a generic "Hello, <name>" greeting', () => {
    const html = '<div class="greeting">Hello, Alice</div>';
    expect(parseAccountName(html)).toBe('Alice');
  });

  test('returns null for signed-out greeting', () => {
    const html =
      '<span id="nav-link-accountList-nav-line-1">Hello, sign in</span>';
    expect(parseAccountName(html)).toBeNull();
  });

  test('returns null when no greeting present', () => {
    expect(parseAccountName('<html></html>')).toBeNull();
    expect(parseAccountName('')).toBeNull();
    expect(parseAccountName(null)).toBeNull();
  });
});
